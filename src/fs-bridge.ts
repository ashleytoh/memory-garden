/**
 * File System Access bridge between the garden and a real Claude Code
 * memory folder on disk.
 *
 * Browser support: Chromium-based browsers only. Use `isFsAccessSupported`
 * to feature-detect and fall back to the existing <input type="file"> flow.
 *
 * Permission model: the user picks the folder once via `pickMemoryDirectory`.
 * The handle is stashed in IndexedDB so we can recover it on next load — but
 * the browser still requires a fresh user-gesture grant per tab. Call
 * `ensurePermission(handle, 'readwrite')` from inside a click handler.
 *
 * On-disk schema: each `.md` file in the directory is one memory, with a
 * YAML-ish frontmatter block matching the auto-memory format:
 *
 *     ---
 *     name: My memory
 *     description: One-line summary
 *     type: user
 *     last_watered: 2026-05-14T10:30:00.000Z   # optional, set by Water
 *     importance: 3                            # optional, 1-5
 *     ---
 *
 *     {body paragraphs...}
 *
 * `MEMORY.md` is treated as an index and skipped (its bullets just point at
 * the other files we already render). Compost is a soft-delete: the file is
 * moved into a `.compost/` subdirectory with a timestamp suffix so nothing
 * is destroyed.
 */

/* ─── Ambient types for the File System Access API ────────────────
   TS 5.9's bundled lib.dom does not yet expose `showDirectoryPicker`,
   `entries()`, or the non-standard `queryPermission`/`requestPermission`
   methods. Declare the minimal surface we use here. */
type FsPermissionDescriptor = { mode?: 'read' | 'readwrite' };
type FsPermissionState = 'granted' | 'denied' | 'prompt';

declare global {
  interface FileSystemHandle {
    queryPermission(descriptor?: FsPermissionDescriptor): Promise<FsPermissionState>;
    requestPermission(descriptor?: FsPermissionDescriptor): Promise<FsPermissionState>;
  }
  interface FileSystemDirectoryHandle {
    entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  }
  interface Window {
    showDirectoryPicker(options?: { mode?: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
  }
}

export type ConnectedMemory = {
  fileName: string;
  meta: Record<string, string>;
  metaOrder: string[]; // preserve original key order on write-back
  body: string;
  lastModified: number;
};

export type ReadResult = {
  memories: ConnectedMemory[];
  errors: string[];
};

const DB_NAME = 'memory-garden';
const STORE = 'handles';
const HANDLE_KEY = 'dir';

export function isFsAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/* ─── IndexedDB persistence for the directory handle ─────────────── */

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function persistHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadPersistedHandle(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFsAccessSupported()) return null;
  try {
    const db = await openDb();
    const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return handle;
  } catch {
    return null;
  }
}

export async function clearPersistedHandle(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    /* ignore */
  }
}

/* ─── Picker + permission ────────────────────────────────────────── */

export async function pickMemoryDirectory(): Promise<FileSystemDirectoryHandle> {
  // `showDirectoryPicker` is gated behind a user gesture by the browser.
  // The `mode: 'readwrite'` here only hints — we still call
  // requestPermission below to surface the readwrite prompt.
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  const ok = await ensurePermission(handle, 'readwrite');
  if (!ok) throw new Error('Permission to read/write the memory folder was not granted.');
  return handle;
}

export async function ensurePermission(
  handle: FileSystemHandle,
  mode: 'read' | 'readwrite' = 'readwrite',
): Promise<boolean> {
  const opts = { mode };
  const status = await handle.queryPermission(opts);
  if (status === 'granted') return true;
  const next = await handle.requestPermission(opts);
  return next === 'granted';
}

/* ─── Frontmatter parser / serializer ────────────────────────────── */

const FM_FENCE = '---';

export function parseFrontmatter(text: string): { meta: Record<string, string>; order: string[]; body: string } {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== FM_FENCE) {
    return { meta: {}, order: [], body: text };
  }
  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === FM_FENCE) {
      close = i;
      break;
    }
  }
  if (close === -1) return { meta: {}, order: [], body: text };
  const meta: Record<string, string> = {};
  const order: string[] = [];
  for (let i = 1; i < close; i++) {
    const raw = lines[i];
    const m = raw.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = stripWrappingQuotes(m[2].trim());
    if (!(key in meta)) order.push(key);
    meta[key] = val;
  }
  const body = lines.slice(close + 1).join('\n').replace(/^\n+/, '');
  return { meta, order, body };
}

function stripWrappingQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

export function serializeFrontmatter(meta: Record<string, string>, order: string[], body: string): string {
  // Preserve the original key order, then append any new keys we've added.
  const seen = new Set<string>();
  const lines: string[] = [FM_FENCE];
  for (const key of order) {
    if (!(key in meta)) continue;
    lines.push(`${key}: ${quoteIfNeeded(meta[key])}`);
    seen.add(key);
  }
  for (const key of Object.keys(meta)) {
    if (seen.has(key)) continue;
    lines.push(`${key}: ${quoteIfNeeded(meta[key])}`);
  }
  lines.push(FM_FENCE, '', body.replace(/^\n+/, ''));
  return lines.join('\n');
}

function quoteIfNeeded(v: string): string {
  // Quote anything that could confuse the parser; keep simple values bare.
  if (/^[A-Za-z0-9_./:+\- ]+$/.test(v) && !/^\s|\s$/.test(v)) return v;
  return JSON.stringify(v);
}

/* ─── Reading the memory directory ───────────────────────────────── */

export async function readMemoryDir(handle: FileSystemDirectoryHandle): Promise<ReadResult> {
  const memories: ConnectedMemory[] = [];
  const errors: string[] = [];
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== 'file') continue;
    if (!/\.md$/i.test(name)) continue;
    if (name.toLowerCase() === 'memory.md') continue; // skip index
    try {
      const file = await (entry as FileSystemFileHandle).getFile();
      const text = await file.text();
      const { meta, order, body } = parseFrontmatter(text);
      memories.push({
        fileName: name,
        meta,
        metaOrder: order,
        body,
        lastModified: file.lastModified,
      });
    } catch (e) {
      errors.push(name);
    }
  }
  memories.sort((a, b) => a.fileName.localeCompare(b.fileName));
  return { memories, errors };
}

/* Fallback: when the folder doesn't follow the one-memory-per-file schema,
   check whether it contains a single MEMORY.md (or MEMORY.txt) and return
   its raw text + filename. The caller can then parse it as line-bullets
   the same way <input type="file"> does. */
export async function readMemoryIndexFile(
  handle: FileSystemDirectoryHandle,
): Promise<{ fileName: string; text: string } | null> {
  const CANDIDATES = ['MEMORY.md', 'memory.md', 'MEMORY.txt', 'memory.txt'];
  for (const name of CANDIDATES) {
    try {
      const fileHandle = await handle.getFileHandle(name);
      const file = await fileHandle.getFile();
      const text = await file.text();
      return { fileName: name, text };
    } catch {
      // ENOENT or wrong kind — try the next candidate.
    }
  }
  return null;
}

/* ─── Writing back ───────────────────────────────────────────────── */

export async function writeMemoryFile(
  handle: FileSystemDirectoryHandle,
  fileName: string,
  metaPatch: Record<string, string | null>,
): Promise<{ lastModified: number }> {
  const fileHandle = await handle.getFileHandle(fileName);
  const existing = await (await fileHandle.getFile()).text();
  const { meta, order, body } = parseFrontmatter(existing);
  for (const [k, v] of Object.entries(metaPatch)) {
    if (v === null) {
      delete meta[k];
    } else {
      if (!(k in meta)) order.push(k);
      meta[k] = v;
    }
  }
  const next = serializeFrontmatter(meta, order, body);
  const writable = await fileHandle.createWritable();
  await writable.write(next);
  await writable.close();
  const reread = await fileHandle.getFile();
  return { lastModified: reread.lastModified };
}

export async function softCompost(handle: FileSystemDirectoryHandle, fileName: string): Promise<void> {
  // Move the file into ./.compost/<timestamp>-<name> so nothing is destroyed.
  const compost = await handle.getDirectoryHandle('.compost', { create: true });
  const src = await handle.getFileHandle(fileName);
  const text = await (await src.getFile()).text();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dst = await compost.getFileHandle(`${stamp}-${fileName}`, { create: true });
  const writable = await dst.createWritable();
  await writable.write(text);
  await writable.close();
  await handle.removeEntry(fileName);
}

/* Hard delete used by the Forget action. Unlike softCompost this leaves no
   trace in the connected directory — the file is removed and nothing is
   copied to .compost/. Intentionally irreversible. */
export async function hardDeleteMemoryFile(
  handle: FileSystemDirectoryHandle,
  fileName: string,
): Promise<void> {
  await handle.removeEntry(fileName);
}
