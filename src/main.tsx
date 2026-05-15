import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Upload, Sparkles, Droplets, Archive, Search, FolderOpen, RefreshCw, Unplug, X, HelpCircle, Home, Pencil, Check, ChevronLeft, ListFilter, MoreHorizontal, Trash2 } from 'lucide-react';
import {
  type ConnectedMemory,
  clearPersistedHandle,
  ensurePermission,
  hardDeleteMemoryFile,
  isFsAccessSupported,
  loadPersistedHandle,
  pickMemoryDirectory,
  persistHandle,
  readMemoryDir,
  readMemoryIndexFile,
  softCompost,
  writeMemoryFile,
} from './fs-bridge';
import './styles.css';

/* ────────────────────────────────────────────────────────────────
   Types & data
   ────────────────────────────────────────────────────────────── */

type MemoryKind = 'preference' | 'person' | 'project' | 'goal' | 'open-loop' | 'moment' | 'identity';
type Mood = 'joy' | 'care' | 'curious' | 'stress' | 'focus' | 'neutral';
type Direction = 'up' | 'down' | 'left' | 'right';

type MemorySeed = {
  id: string;
  title: string;
  text: string;
  kind: MemoryKind;
  mood: Mood;
  source: string;
  line: number;
  importance: number;
  age: 'fresh' | 'growing' | 'old';
  watered: boolean;
  archived: boolean;
  /** Unix ms when the memory first appeared in the garden (or in the on-disk
   *  frontmatter for connected directories). Falls back to Date.now() for
   *  legacy entries lacking a `first_seen` key. */
  firstSeen: number;
  /** Unix ms of the most recent mutation (water / boost / edit / compost-toggle).
   *  Equals `firstSeen` for memories that have never been touched. */
  lastUpdated: number;
  /** Tutorial memories spawn near PLAYER_START and are cleared on first import. */
  isTutorial?: boolean;
};

type PlacedMemory = MemorySeed & { row: number; col: number };

/* Tutorial garden — shown on first launch in place of a sample memory file.
   Each line teaches one mechanic. The kind prefixes (Preference, Open loop,
   Goal, Moment) are read by classifyKind() so each tutorial step renders as
   a different sprite. The first import the user makes replaces these
   automatically via the existing isSample flow. */
const TUTORIAL_MEMORY = `# Tutorial
- Hi. This is a pixel garden for an AI assistant's memory. Walk up to me with W A S D or the arrow keys, then press Space to read.
- Preference: Each plant here is a memory your AI keeps about you. Tend it from the panel below — water it, mark it important, or compost it.
- Open loop: When you're ready, import your own MEMORY.md from the top bar. This tutorial clears and your memories appear in its place.
- Goal: The bar on the left filters by category. Hover any icon to see what's in it.
- Moment: That's the basics. Wander around, or press Esc to close any panel.
`;

/* ────────────────────────────────────────────────────────────────
   Tile grid — single source of truth for the scene
   ────────────────────────────────────────────────────────────── */

const TILE = 56;

// World is significantly larger than the visible viewport so the camera can
// pan across a roomy garden — large imports (e.g. a Codex memory.md with
// hundreds of entries) should never feel cramped.
const COLS = 56;
const ROWS = 32;
const VIEWPORT_COLS = 18;
const VIEWPORT_ROWS = 10;
const VIEWPORT_W = VIEWPORT_COLS * TILE;
const VIEWPORT_H = VIEWPORT_ROWS * TILE;
const WORLD_W = COLS * TILE;
const WORLD_H = ROWS * TILE;

// Walkability mask aligned to the painted garden-bg.png, scaled to the new
// world dimensions:
//   X = blocked  (painted as cottage / trees / pond / dock)
//   G = walkable grass
// The painting itself supplies all visual detail; this grid only drives
// collision and where memories can be planted.
const TERRAIN: ReadonlyArray<string> = [
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  'XXXXXXXXGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGXXXXXXX',
  'XXXXXXXXGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGXXXXXXX',
  'XXXXXGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGXXX',
  'XXXXXGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGXXX',
  'XXXXGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGX',
  'XXGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'XXGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'XXXXGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'XXXXXGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'XXXXXGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'XXXXXXXGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'XXXXXGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'XXXXXGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'XXXXGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'XXXXGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'XXGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
];

const DIR_VEC: Record<Direction, { dr: number; dc: number }> = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
};

// Movement uses event.code (physical key position) instead of event.key
// (layout-dependent) so AZERTY / Dvorak / etc. behave correctly. KeyW always
// means the key in the W position on QWERTY, regardless of the user's layout.
const MOVE_CODES = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
]);

const INSPECT_CODES = new Set(['Space', 'Enter', 'KeyE']);

function clampCamera(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(WORLD_W - VIEWPORT_W, x)),
    y: Math.max(0, Math.min(WORLD_H - VIEWPORT_H, y)),
  };
}

function tileAt(row: number, col: number): string | null {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return null;
  return TERRAIN[row][col];
}

function passable(row: number, col: number, placed: PlacedMemory[]): boolean {
  const t = tileAt(row, col);
  if (t === null) return false;
  if (t !== 'G') return false; // anything other than walkable grass is blocked
  if (placed.some((m) => !m.archived && m.row === row && m.col === col)) return false;
  return true;
}

/* BFS from a target tile outward (4-neighbours) up to MAX_DIST, returning the
   nearest passable tile. Used for fast-travel: the avatar lands on a passable
   tile adjacent to the chosen memory, never on the plant itself. */
function nearestPassableAdjacent(
  targetRow: number,
  targetCol: number,
  placed: PlacedMemory[],
  maxDist = 4,
): { row: number; col: number } | null {
  const DIRS = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
  ] as const;
  const visited = new Set<string>();
  const queue: Array<{ row: number; col: number; dist: number }> = [
    { row: targetRow, col: targetCol, dist: 0 },
  ];
  visited.add(`${targetRow},${targetCol}`);
  while (queue.length) {
    const node = queue.shift()!;
    if (node.dist > 0 && passable(node.row, node.col, placed)) {
      return { row: node.row, col: node.col };
    }
    if (node.dist >= maxDist) continue;
    for (const [dr, dc] of DIRS) {
      const nr = node.row + dr;
      const nc = node.col + dc;
      const key = `${nr},${nc}`;
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({ row: nr, col: nc, dist: node.dist + 1 });
    }
  }
  return null;
}

function isPlantableTile(row: number, col: number): boolean {
  return tileAt(row, col) === 'G';
}

// Spawn at the geometric center of the world so the camera opens on the
// middle of the painted garden rather than down at the bottom path.
const PLAYER_START = { row: Math.floor(ROWS / 2), col: Math.floor(COLS / 2) };

/* Tutorial spots ring the player so a first-time user immediately sees the
   guidance memories. Each requires at least one keypress to reach, so the
   user gets to practice movement before pressing Space to read. Offsets
   are relative to PLAYER_START so they always orbit the spawn point. */
const TUTORIAL_SPOTS: ReadonlyArray<{ row: number; col: number }> = [
  { row: PLAYER_START.row - 2, col: PLAYER_START.col     }, // 2 up — first hint
  { row: PLAYER_START.row,     col: PLAYER_START.col + 3 }, // 3 right
  { row: PLAYER_START.row + 2, col: PLAYER_START.col - 2 }, // down-left
  { row: PLAYER_START.row - 2, col: PLAYER_START.col + 4 }, // up-right (further)
  { row: PLAYER_START.row + 3, col: PLAYER_START.col     }, // 3 down
];

/* Garden spots — Poisson-disc-style greedy sampler.
   Goal: each plant is at least `minDist` tiles from every other plant, so
   even a big import (200+ memories) reads as a sparse, breathing scatter
   instead of a cluster.
   We sort all walkable tiles by a deterministic hash (stable across runs),
   then make multiple passes with shrinking min-distance: the first N plants
   land far apart; if the import has more memories than the strict pass
   yields, later passes relax the spacing to fit the rest.
   The whole pipeline is deterministic per (row, col), so filtering and
   searching never reshuffle existing plants. */
const GARDEN_SPOTS: ReadonlyArray<{ row: number; col: number }> = (() => {
  const all: Array<{ row: number; col: number; h: number }> = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (r === PLAYER_START.row && c === PLAYER_START.col) continue;
      if (!isPlantableTile(r, c)) continue;
      const linear = r * COLS + c;
      const h = (linear * 2654435761 ^ (linear * 1597) ^ ((r * 73 + c * 31) << 4)) >>> 0;
      all.push({ row: r, col: c, h });
    }
  }
  all.sort((a, b) => a.h - b.h);

  const chosen: Array<{ row: number; col: number }> = [];
  const cheb = (a: { row: number; col: number }, b: { row: number; col: number }) =>
    Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));

  // Multi-pass Poisson-disc: tightest spacing first, relax later.
  const passes = [5, 4, 3, 2, 1, 0]; // 0 = anything goes (overflow tail)
  const picked = new Set<string>();
  for (const minDist of passes) {
    for (const cand of all) {
      const key = `${cand.row}-${cand.col}`;
      if (picked.has(key)) continue;
      if (minDist > 0 && chosen.some((p) => cheb(p, cand) < minDist)) continue;
      chosen.push({ row: cand.row, col: cand.col });
      picked.add(key);
    }
  }
  return chosen;
})();

/* Assign each non-archived memory a unique stable spot keyed by id. When a
   memory is removed (Compost or Forget), its spot is freed for the next new
   memory rather than shifting every later plant to a new tile. Filtering /
   searching never reshuffles plants because spots are remembered, not
   re-derived from array index.

   The caller passes mutable maps (one for the garden, one for the tutorial
   ring); we keep them in a ref so assignments persist across renders. */
type SpotMap = Map<string, number>;
function layoutMemories(
  seeds: MemorySeed[],
  gardenMap: SpotMap,
  tutorialMap: SpotMap,
): PlacedMemory[] {
  const seedIds = new Set(seeds.map((m) => m.id));
  // Drop assignments for memories that are no longer present so their spots
  // are freed.
  for (const id of Array.from(gardenMap.keys())) {
    if (!seedIds.has(id)) gardenMap.delete(id);
  }
  for (const id of Array.from(tutorialMap.keys())) {
    if (!seedIds.has(id)) tutorialMap.delete(id);
  }
  const usedGarden = new Set<number>(gardenMap.values());
  const usedTutorial = new Set<number>(tutorialMap.values());
  function takeNext(used: Set<number>, max: number): number | null {
    for (let i = 0; i < max; i++) {
      if (!used.has(i)) { used.add(i); return i; }
    }
    return null;
  }
  const placed: PlacedMemory[] = [];
  for (const m of seeds) {
    if (m.archived) continue;
    const map = m.isTutorial ? tutorialMap : gardenMap;
    const used = m.isTutorial ? usedTutorial : usedGarden;
    const arr = m.isTutorial ? TUTORIAL_SPOTS : GARDEN_SPOTS;
    let idx = map.get(m.id);
    if (idx === undefined) {
      const next = takeNext(used, arr.length);
      if (next === null) continue; // overflow — no spot available
      idx = next;
      map.set(m.id, idx);
    }
    const spot = arr[idx];
    if (spot) placed.push({ ...m, ...spot });
  }
  return placed;
}

/* ────────────────────────────────────────────────────────────────
   Day/night cycle — drives sky, vignette, firefly visibility, and a
   subtle scene tint via CSS variables on :root. Consumed by .scene /
   .stage / .garden / .scene-vignette / .fireflies-layer in styles.css.
   ────────────────────────────────────────────────────────────── */

type Phase = 'dawn' | 'day' | 'dusk' | 'night';
const PHASE_ORDER: ReadonlyArray<Phase> = ['dawn', 'day', 'dusk', 'night'];
const PHASE_DURATION_MS = 45_000; // ~3 min for a full cycle.

const PHASE_STYLES: Record<
  Phase,
  {
    skyTop: string;
    skyMid: string;
    skyBottom: string;
    vignette: number;
    fireflies: number;
    tint: string; // rgba overlay multiplied on top of the scene
    label: string;
  }
> = {
  dawn: {
    skyTop: '#f5a87a',
    skyMid: '#c890a8',
    skyBottom: '#7a6a8a',
    vignette: 0.22,
    fireflies: 0.25,
    tint: 'rgba(255, 170, 110, 0.30)',
    label: 'Dawn',
  },
  day: {
    skyTop: '#7ec0d9',
    skyMid: '#a0d4c8',
    skyBottom: '#c4d090',
    vignette: 0.08,
    fireflies: 0,
    tint: 'rgba(255, 250, 230, 0.0)',
    label: 'Day',
  },
  dusk: {
    skyTop: '#d97a5a',
    skyMid: '#8a5a8a',
    skyBottom: '#3a3a6a',
    vignette: 0.40,
    fireflies: 0.7,
    tint: 'rgba(180, 80, 50, 0.45)',
    label: 'Dusk',
  },
  night: {
    skyTop: '#1a1a3a',
    skyMid: '#0e0e2a',
    skyBottom: '#080814',
    vignette: 0.55,
    fireflies: 1,
    tint: 'rgba(20, 30, 80, 0.70)',
    label: 'Night',
  },
};

function applyPhaseToRoot(phase: Phase) {
  const s = PHASE_STYLES[phase];
  const root = document.documentElement;
  root.style.setProperty('--sky-top', s.skyTop);
  root.style.setProperty('--sky-mid', s.skyMid);
  root.style.setProperty('--sky-bottom', s.skyBottom);
  root.style.setProperty('--vignette-opacity', String(s.vignette));
  root.style.setProperty('--firefly-opacity', String(s.fireflies));
  root.style.setProperty('--scene-tint', s.tint);
  root.dataset.phase = phase;
}

/* ────────────────────────────────────────────────────────────────
   Classifiers + parser (kept from prior version)
   ────────────────────────────────────────────────────────────── */

function classifyKind(text: string): MemoryKind {
  const lower = text.toLowerCase();
  if (/open loop|blocked|todo|follow up|later|pending|need to|should/.test(lower)) return 'open-loop';
  if (/preference|likes|prefers|concise|style|default/.test(lower)) return 'preference';
  if (/project|repo|github|local-brief|app|cli|build/.test(lower)) return 'project';
  if (/goal|dream|want|explore|future|plan/.test(lower)) return 'goal';
  if (/user|ashley|celine|jing yi|person|friend|family/.test(lower)) return 'person';
  if (/said|moment|remember when|after|great|amazing/.test(lower)) return 'moment';
  return 'identity';
}

function classifyMood(text: string): Mood {
  const lower = text.toLowerCase();
  if (/amazing|great|love|like|joy|cool|interesting|beautiful/.test(lower)) return 'joy';
  if (/care|meaningful|emotional|family|tender|private/.test(lower)) return 'care';
  if (/explore|maybe|curious|idea|interesting|what if/.test(lower)) return 'curious';
  if (/blocked|confused|risk|worry|issue|later|pending/.test(lower)) return 'stress';
  if (/project|build|github|code|task|focus/.test(lower)) return 'focus';
  return 'neutral';
}

function titleFrom(text: string): string {
  return text
    .replace(/^[-*]\s*/, '')
    .replace(/^(remember|preference|project|goal|moment|open loop):\s*/i, '')
    .split(/[.!?]/)[0]
    .slice(0, 68)
    .trim();
}

function parseMemoryFile(name: string, content: string): MemorySeed[] {
  const now = Date.now();
  return content
    .split(/\r?\n/)
    .map((raw, index) => ({ raw: raw.trim(), line: index + 1 }))
    .filter(({ raw }) => raw && !raw.startsWith('#') && !raw.startsWith('<!--'))
    .map(({ raw, line }, i) => {
      const text = raw.replace(/^[-*]\s*/, '').trim();
      const kind = classifyKind(text);
      const mood = classifyMood(text);
      const importance = Math.min(
        5,
        1 +
          Number(/remember|important|goal|project|open loop/i.test(text)) +
          Number(/amazing|blocked|future|preference/i.test(text)) +
          (kind === 'open-loop' ? 2 : 0),
      );
      return {
        id: `${name}:${line}:${i}`,
        title: titleFrom(text) || 'Untitled memory',
        text,
        kind,
        mood,
        source: name,
        line,
        importance,
        age: line < 3 ? 'old' : line < 6 ? 'growing' : 'fresh',
        watered: false,
        archived: false,
        firstSeen: now,
        lastUpdated: now,
      } satisfies MemorySeed;
    });
}

/* Convert one auto-memory file (frontmatter + body) into a MemorySeed.
   IDs starting with `dir:` are connected memories — action handlers use
   that prefix to route water/important/compost back to disk. */
function memoryFromConnected(c: ConnectedMemory): MemorySeed {
  const body = c.body.trim();
  const fmType = (c.meta.type || '').toLowerCase();
  const kindFromMeta: MemoryKind | null =
    fmType === 'project' ? 'project'
    : fmType === 'feedback' || fmType === 'user' ? 'preference'
    : fmType === 'reference' ? 'identity'
    : null;
  const titleSource = c.meta.name || c.meta.description || body || c.fileName.replace(/\.md$/i, '');
  const text = c.meta.description?.trim() || body.split(/\n\s*\n/)[0] || c.meta.name || '';
  const importanceRaw = parseInt(c.meta.importance || '', 10);
  const importance = Number.isFinite(importanceRaw)
    ? Math.max(1, Math.min(5, importanceRaw))
    : Math.min(5, 1 + Number(/remember|important|goal|project|open loop/i.test(text)) + (kindFromMeta === 'project' ? 1 : 0));
  const ageDays = (Date.now() - c.lastModified) / 86_400_000;
  const age: MemorySeed['age'] = ageDays > 30 ? 'old' : ageDays > 7 ? 'growing' : 'fresh';
  // Prefer disk values; fall back to the file's lastModified (closest stand-in
  // we have for a real creation timestamp), and finally to Date.now() so legacy
  // files without these keys still get sensible relative-time output.
  const now = Date.now();
  const firstSeen = parseTimestampMeta(c.meta.first_seen) ?? c.lastModified ?? now;
  const lastUpdated = parseTimestampMeta(c.meta.last_updated) ?? c.lastModified ?? firstSeen;
  return {
    id: `dir:${c.fileName}`,
    title: titleFrom(titleSource) || titleSource.slice(0, 64) || 'Untitled memory',
    text,
    kind: kindFromMeta ?? classifyKind(text || titleSource),
    mood: classifyMood(text || titleSource),
    source: c.fileName,
    line: 1,
    importance,
    age,
    watered: !!c.meta.last_watered,
    archived: false,
    firstSeen,
    lastUpdated,
  };
}

/* Lenient ISO-or-millis parser for the firstSeen/lastUpdated frontmatter keys.
   We persist them as ISO strings for human-readability, but a number is also
   accepted in case the file was hand-edited. Returns null for unparseable
   input so the caller can pick a fallback. */
function parseTimestampMeta(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Pure-number form (Unix ms).
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : null;
}

/* ─── Codex MEMORY.md parser ──────────────────────────────────────
   Codex CLI stores memory as a single file with this shape:

     # Task Group: <group title>
     scope: ...
     ## Task 1: <title>, success|partial|uncertain
     ### rollout_summary_files / ### keywords   (internal noise — skipped)
     ## User preferences           ← bullets here → preference memories
     ## Reusable knowledge         ← bullets here → identity memories
     ## Failures and how to do differently  ← bullets here → open-loop memories

   Each Task heading becomes one memory; each bullet under the three named
   sections becomes one. Body of a task (### subsections) is skipped — it's
   internal session-summary cruft that would flood the garden. */

function looksLikeCodexFile(content: string): boolean {
  return /^# Task Group:/m.test(content.slice(0, 4000));
}

function parseCodexFile(name: string, content: string): MemorySeed[] {
  const lines = content.split(/\r?\n/);
  const seeds: MemorySeed[] = [];
  let groupTitle = '';
  let groupIdx = 0;
  let taskIdx = 0;
  let bulletIdx = 0;
  let section: '' | 'pref' | 'knowledge' | 'failures' | 'skip' = '';

  const now = Date.now();
  function push(s: Omit<MemorySeed, 'age' | 'archived' | 'watered' | 'firstSeen' | 'lastUpdated'>) {
    seeds.push({ ...s, age: 'fresh', archived: false, watered: false, firstSeen: now, lastUpdated: now });
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trim = raw.trim();

    const groupM = trim.match(/^# Task Group:\s*(.+)$/);
    if (groupM) {
      groupTitle = groupM[1].trim();
      groupIdx += 1;
      taskIdx = 0;
      section = '';
      continue;
    }

    const taskM = trim.match(/^## Task\s+(\d+):\s*(.+)$/);
    if (taskM) {
      taskIdx += 1;
      section = '';
      const full = taskM[2].trim();
      const statusM = full.match(/,\s*(success|partial|uncertain|failed|in[- ]progress)\s*$/i);
      const status = statusM?.[1]?.toLowerCase() ?? '';
      const cleanTitle = statusM ? full.slice(0, statusM.index).trim() : full;
      const isProblem = status === 'partial' || status === 'uncertain' || status === 'failed';
      push({
        id: `${name}:g${groupIdx}t${taskIdx}`,
        title: titleFrom(cleanTitle) || cleanTitle.slice(0, 80) || 'Task',
        text: groupTitle ? `${cleanTitle} — ${groupTitle}` : cleanTitle,
        kind: isProblem ? 'open-loop' : 'project',
        mood: status === 'success' ? 'focus' : isProblem ? 'stress' : 'curious',
        source: name,
        line: i + 1,
        importance: isProblem ? 3 : 2,
      });
      continue;
    }

    if (/^## User preferences\b/i.test(trim)) { section = 'pref'; continue; }
    if (/^## Reusable knowledge\b/i.test(trim)) { section = 'knowledge'; continue; }
    if (/^## Failures and how to do differently\b/i.test(trim)) { section = 'failures'; continue; }

    // `### rollout_summary_files` / `### keywords` etc. — internal noise.
    if (/^### /.test(trim)) {
      section = 'skip';
      continue;
    }

    // Any other ## resets section tracking.
    if (/^## /.test(trim)) {
      section = '';
      continue;
    }

    if ((section === 'pref' || section === 'knowledge' || section === 'failures') && /^[-*]\s+/.test(trim)) {
      const text = trim.replace(/^[-*]\s+/, '').replace(/\s*\[Task \d+\]\s*$/, '').trim();
      if (!text) continue;
      bulletIdx += 1;
      const kind: MemoryKind =
        section === 'pref' ? 'preference'
        : section === 'knowledge' ? 'identity'
        : 'open-loop';
      const mood: Mood =
        section === 'failures' ? 'stress'
        : section === 'pref' ? 'care'
        : classifyMood(text);
      push({
        id: `${name}:g${groupIdx}b${bulletIdx}`,
        title: titleFrom(text) || text.slice(0, 80),
        text,
        kind,
        mood,
        source: name,
        line: i + 1,
        importance: section === 'failures' ? 4 : section === 'pref' ? 3 : 2,
      });
    }
  }

  return seeds;
}

/* Tiny pure-function relative-time formatter. Avoids pulling in date-fns /
   dayjs — we only need 7 thresholds. "just now" is anything < 30s. */
function formatRelativeTime(targetMs: number, nowMs: number = Date.now()): string {
  const diff = Math.max(0, nowMs - targetMs);
  const s = Math.floor(diff / 1000);
  if (s < 30) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} ${m === 1 ? 'minute' : 'minutes'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} ${d === 1 ? 'day' : 'days'} ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w} ${w === 1 ? 'week' : 'weeks'} ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} ${mo === 1 ? 'month' : 'months'} ago`;
  const y = Math.floor(d / 365);
  return `${y} ${y === 1 ? 'year' : 'years'} ago`;
}

/* Absolute date for the tooltip on the relative-time row. Uses Intl so it
   respects the user's locale instead of forcing en-US. */
const ABS_DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});
function formatAbsoluteTime(ms: number): string {
  try { return ABS_DATE_FORMAT.format(new Date(ms)); }
  catch { return new Date(ms).toISOString(); }
}

function gardenReflection(memory: MemorySeed) {
  if (memory.kind === 'open-loop') return 'This memory needs tending. Resolve it, archive it, or turn it into a concrete next action.';
  if (memory.kind === 'preference') return 'This helps the assistant feel more aligned with the user over time.';
  if (memory.kind === 'project') return 'Part of the shared creative landscape — a thing the assistant can help grow.';
  if (memory.kind === 'goal') return 'Goals become saplings: small now, but worth revisiting and watering.';
  if (memory.kind === 'moment') return 'A small emotional landmark. These are what make memory feel less mechanical.';
  if (memory.kind === 'person') return 'Someone the assistant should remember by name and care about.';
  return 'A quiet memory. Keep it if it still feels true; compost it if it has gone stale.';
}

/* ────────────────────────────────────────────────────────────────
   Pixel-art primitives
   ────────────────────────────────────────────────────────────── */

const OUT = '#1f140d'; // warm near-black outline (Stardew-y)

function PixelSvg({
  size,
  viewBox = '0 0 16 16',
  children,
  className,
}: {
  size: number;
  viewBox?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      shapeRendering="crispEdges"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {children}
    </svg>
  );
}

/* — Terrain tiles — */

/* Grass tile with seeded variation. The `variant` prop is kept for
   backwards compatibility but `seed` (a stable per-tile integer) is
   preferred — it drives both the base pattern (6 variants) and an
   occasional decoration (flower, rock, mushroom, weed). */
/* — Memory plant sprites (refined, Stardew-leaning palette) — */

function Tulip() {
  return (
    <PixelSvg size={TILE} viewBox="0 0 16 16">
      {/* leaves */}
      <rect x="3" y="11" width="3" height="1" fill="#4f8a35" />
      <rect x="3" y="11" width="3" height="1" fill={OUT} opacity=".0" />
      <rect x="2" y="10" width="1" height="2" fill={OUT} />
      <rect x="6" y="10" width="1" height="2" fill={OUT} />
      <rect x="10" y="9" width="3" height="2" fill="#4f8a35" />
      <rect x="9" y="9" width="1" height="2" fill={OUT} />
      <rect x="13" y="9" width="1" height="2" fill={OUT} />
      {/* stem */}
      <rect x="7" y="6" width="2" height="8" fill="#3e6c27" />
      <rect x="6" y="6" width="1" height="8" fill={OUT} />
      <rect x="9" y="6" width="1" height="8" fill={OUT} />
      {/* bulb outline */}
      <rect x="5" y="5" width="6" height="1" fill={OUT} />
      <rect x="4" y="3" width="1" height="3" fill={OUT} />
      <rect x="11" y="3" width="1" height="3" fill={OUT} />
      <rect x="5" y="2" width="2" height="1" fill={OUT} />
      <rect x="9" y="2" width="2" height="1" fill={OUT} />
      <rect x="7" y="1" width="2" height="1" fill={OUT} />
      {/* bulb fill */}
      <rect x="5" y="3" width="6" height="2" fill="#d04373" />
      <rect x="6" y="2" width="4" height="1" fill="#e85a8c" />
      <rect x="7" y="2" width="2" height="1" fill="#ffa3c8" />
      <rect x="6" y="3" width="1" height="1" fill="#ffa3c8" />
      <rect x="9" y="3" width="1" height="1" fill="#ffa3c8" opacity=".7" />
      {/* ground shadow */}
      <rect x="6" y="14" width="4" height="1" fill={OUT} opacity=".35" />
    </PixelSvg>
  );
}

function Wilted() {
  // Signpost-like: a wooden post with a fluttering note ribbon — open-loop / needs care.
  return (
    <PixelSvg size={TILE} viewBox="0 0 16 16">
      <rect x="7" y="6" width="2" height="9" fill="#7a5a32" />
      <rect x="6" y="6" width="1" height="9" fill={OUT} />
      <rect x="9" y="6" width="1" height="9" fill={OUT} />
      <rect x="7" y="6" width="2" height="1" fill="#a07a45" />
      {/* note plank */}
      <rect x="3" y="3" width="10" height="5" fill="#d9b377" />
      <rect x="3" y="3" width="10" height="1" fill="#ecd29b" />
      <rect x="3" y="7" width="10" height="1" fill="#a87a52" />
      <rect x="2" y="3" width="1" height="5" fill={OUT} />
      <rect x="13" y="3" width="1" height="5" fill={OUT} />
      <rect x="3" y="2" width="10" height="1" fill={OUT} />
      <rect x="3" y="8" width="10" height="1" fill={OUT} />
      {/* scribble */}
      <rect x="4" y="5" width="3" height="1" fill={OUT} />
      <rect x="8" y="5" width="4" height="1" fill={OUT} />
      <rect x="6" y="15" width="4" height="1" fill={OUT} opacity=".35" />
    </PixelSvg>
  );
}

function Firefly() {
  // A small glowing stone for "moment" memories.
  return (
    <PixelSvg size={TILE} viewBox="0 0 16 16">
      <rect x="4" y="10" width="8" height="4" fill="#7c6a55" />
      <rect x="3" y="10" width="1" height="4" fill={OUT} />
      <rect x="12" y="10" width="1" height="4" fill={OUT} />
      <rect x="4" y="9" width="8" height="1" fill={OUT} />
      <rect x="4" y="14" width="8" height="1" fill={OUT} />
      <rect x="4" y="10" width="8" height="1" fill="#a08c70" />
      {/* glow */}
      <rect x="6" y="6" width="4" height="4" fill="#fff3b0" opacity=".85" />
      <rect x="5" y="7" width="6" height="2" fill="#fff3b0" opacity=".55" />
      <rect x="7" y="5" width="2" height="6" fill="#fff3b0" opacity=".4" />
      <rect x="7" y="7" width="2" height="2" fill="#ffffff" />
    </PixelSvg>
  );
}

/* Painted sprite component — wraps a PNG asset from /public/sprites/. The
   four small SVG icons that remain above (Tulip, Wilted, Firefly, plus
   WaterDrop further down) are reused as HUD stat-chip glyphs and are not
   wired into KIND_META; KIND_META always uses the painted PNGs below. */
const SPRITE_SRC: Record<MemoryKind, string> = {
  preference: '/sprites/preference.png',
  person:     '/sprites/person.png',
  project:    '/sprites/project.png',
  goal:       '/sprites/goal.png',
  'open-loop':'/sprites/open-loop.png',
  moment:     '/sprites/moment.png',
  identity:   '/sprites/identity.png',
};

const KIND_LABEL: Record<MemoryKind, string> = {
  preference: 'Preference',
  person:     'Person',
  project:    'Project',
  goal:       'Goal',
  'open-loop':'Open Loop',
  moment:     'Moment',
  identity:   'Identity',
};

/* One-line description per kind — shown in the welcome-modal legend so the
   user learns the visual vocabulary before walking into the garden. */
const KIND_BLURB: Record<MemoryKind, string> = {
  preference: 'Preferences bloom as flowers.',
  person:     'People grow as lavender and vines.',
  project:    'Projects grow into trees.',
  goal:       'Goals start as saplings, worth revisiting.',
  'open-loop':'Open loops wilt until you tend them.',
  moment:     'Moments glow like fireflies in the dusk.',
  identity:   'Identity sits at the shrine.',
};

const KIND_ORDER: ReadonlyArray<MemoryKind> = [
  'preference', 'project', 'goal', 'open-loop', 'moment', 'person', 'identity',
];

function makeKindSprite(kind: MemoryKind): React.FC {
  const src = SPRITE_SRC[kind];
  const label = KIND_LABEL[kind];
  const C: React.FC = () => (
    <img src={src} alt="" aria-label={label} className="kind-sprite" draggable={false} />
  );
  C.displayName = `Sprite(${kind})`;
  return C;
}

const KIND_META: Record<MemoryKind, { label: string; Sprite: React.FC; chip: string }> = {
  preference: { label: KIND_LABEL.preference, Sprite: makeKindSprite('preference'), chip: '✿' },
  person:     { label: KIND_LABEL.person,     Sprite: makeKindSprite('person'),     chip: '❀' },
  project:    { label: KIND_LABEL.project,    Sprite: makeKindSprite('project'),    chip: '✦' },
  goal:       { label: KIND_LABEL.goal,       Sprite: makeKindSprite('goal'),       chip: '✶' },
  'open-loop':{ label: KIND_LABEL['open-loop'],Sprite: makeKindSprite('open-loop'), chip: '!' },
  moment:     { label: KIND_LABEL.moment,     Sprite: makeKindSprite('moment'),     chip: '★' },
  identity:   { label: KIND_LABEL.identity,   Sprite: makeKindSprite('identity'),   chip: '✦' },
};

const MOOD_LABEL: Record<Mood, string> = {
  joy: 'Joyful',
  care: 'Tender',
  curious: 'Curious',
  stress: 'Needs care',
  focus: 'Focused',
  neutral: 'Quiet',
};

/* Mood dot color for the sidebar list. Mirrors the existing palette tokens
   so the dot reads as the same family as the dialogue mood label. */
const MOOD_COLOR: Record<Mood, string> = {
  joy: '#f5d77a',     // gold
  care: '#e85a8c',    // rose
  curious: '#c89efb', // magic
  stress: '#ff5b69',  // alert
  focus: '#6fd3ff',   // water
  neutral: '#c8a890', // dim taupe
};

/* — Player sprite — 4 facings, 2-frame walk — */

function Player({ facing, frame }: { facing: Direction; frame: number }) {
  // Each direction is its own pre-cropped PNG (cropped from player-sheet.png
  // — the four characters aren't on a uniform grid). The cropped files fill
  // their bounding box with no whitespace so the rendered sprite reads clean.
  // The sheet only contains three unique poses: front (DOWN), side-walk
  // (LEFT), and back (UP). The 3rd sprite is a second left-walk variant,
  // not a right-facing pose — so we reuse the LEFT png for "right" and
  // mirror it horizontally via the .player.facing-right CSS rule.
  const SRC: Record<Direction, string> = {
    left:  '/player-left.png',
    down:  '/player-down.png',
    right: '/player-left.png',
    up:    '/player-up.png',
  };
  void frame; // walk bob is driven by .walking CSS animation on the parent
  return (
    <img
      src={SRC[facing]}
      alt=""
      className="player-img"
      data-facing={facing}
      draggable={false}
    />
  );
}

/* ────────────────────────────────────────────────────────────────
   App
   ────────────────────────────────────────────────────────────── */

function App() {
  const [memories, setMemories] = useState<MemorySeed[]>(() =>
    parseMemoryFile('tutorial/MEMORY.md', TUTORIAL_MEMORY).map((m) => ({ ...m, isTutorial: true })),
  );
  // Start with the inspector empty so the "walk to me and press Space"
  // tutorial step is actually a step the user has to perform.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<MemoryKind | 'all'>('all');
  const [query, setQuery] = useState('');
  const [splashKey, setSplashKey] = useState(0);
  const [started, setStarted] = useState(false);
  // Welcome overlay stays mounted briefly after `started` flips so it can
  // fade out while the game-shell fades in (crossfade rather than swap).
  const [welcomeMounted, setWelcomeMounted] = useState(true);

  // First-visit hint shows once for new users and fades on first movement or
  // after 10s. localStorage flag prevents it from re-appearing.
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    try { return localStorage.getItem('mg.seen-intro') !== '1'; } catch { return true; }
  });
  const dismissIntroRef = useRef(() => {});
  function dismissIntro() {
    setShowIntro(false);
    try { localStorage.setItem('mg.seen-intro', '1'); } catch {}
  }
  dismissIntroRef.current = dismissIntro;
  // Auto-dismiss the intro: 10s after the user enters, or as soon as they move.
  useEffect(() => {
    if (!started || !showIntro) return;
    const id = window.setTimeout(() => dismissIntroRef.current(), 10000);
    return () => window.clearTimeout(id);
  }, [started, showIntro]);
  // `isSample` is true until the user imports their own file; the first
  // import replaces the sample garden, subsequent imports append.
  const [isSample, setIsSample] = useState(true);
  const [showImportHelp, setShowImportHelp] = useState(false);
  // While true, existing plants fade out so a new memory set can sprout in.
  const [isImporting, setIsImporting] = useState(false);
  // (Previously this state, paired with an effect, panned the camera to the
  // first newly-imported memory after import. That left the player far
  // off-screen — usually toward the top-right of the world where the first
  // GARDEN_SPOT sits — so it's been replaced with a recenter-on-player call
  // at each import call site.)

  // Memory list sidebar — open by default on desktop, collapsed below 1024.
  // Persisted under 'mg.sidebar-open' so a user's preference survives reloads.
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('mg.sidebar-open');
      if (stored === 'true') return true;
      if (stored === 'false') return false;
    } catch { /* ignore */ }
    return typeof window !== 'undefined' && window.innerWidth >= 1024;
  });
  useEffect(() => {
    try { localStorage.setItem('mg.sidebar-open', String(sidebarOpen)); } catch { /* ignore */ }
  }, [sidebarOpen]);
  // Hover state — when a sidebar row is hovered, the corresponding plant in
  // the scene glows. Overrides the proximity-based `focused` while set.
  const [hoveredMemoryId, setHoveredMemoryId] = useState<string | null>(null);
  // When fast-travelling from the sidebar, briefly enable a transform
  // transition on the world so the camera pan reads as a glide.
  const [isTraveling, setIsTraveling] = useState(false);

  // Close the Import help popover on Esc or click outside its wrapper.
  useEffect(() => {
    if (!showImportHelp) return;
    const onDown = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key === 'Escape') setShowImportHelp(false);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target?.closest('.hud-import-help-wrap')) return;
      setShowImportHelp(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onDown);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onDown);
    };
  }, [showImportHelp]);
  const [toast, setToast] = useState<string | null>(null);
  const [importanceFlash, setImportanceFlash] = useState(0);

  /* Inline-edit state. `null` means the inspector is in read mode. When the
     user clicks Edit we copy the selected memory's title/text into draft
     fields here; Save commits via updateMemory + (if connected) writeMemoryFile;
     Cancel drops the draft. previewKind/previewMood let "Re-detect kind"
     show the new classification in the portrait before save. */
  const [editing, setEditing] = useState<{
    id: string;
    title: string;
    text: string;
    previewKind: MemoryKind | null;
    previewMood: Mood | null;
  } | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  /* Forget action: when non-null, the destructive-confirm modal is open and
     references the memory id. Kept as an id (not the whole memory) so the
     modal closes itself if the underlying memory disappears for any reason
     (e.g. an external disk reload removed the file). */
  const [forgetTargetId, setForgetTargetId] = useState<string | null>(null);

  const [playerPos, setPlayerPos] = useState(PLAYER_START);
  const [facing, setFacing] = useState<Direction>('down');
  const [walking, setWalking] = useState(false);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<Phase>('dusk');

  // Connected memory directory (File System Access API). When non-null, the
  // garden is a live view of files on disk and actions write back.
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [hasPersistedHandle, setHasPersistedHandle] = useState(false);
  // Tracks per-file lastModified so we can detect external edits on focus.
  const fileMtimesRef = useRef<Map<string, number>>(new Map());

  // Camera: top-left of the visible viewport in world pixels. Initial value
  // centers the camera on the player so the spawn isn't pressed against the
  // corner of the world.
  const [camera, setCamera] = useState(() => clampCamera(
    PLAYER_START.col * TILE + TILE / 2 - VIEWPORT_W / 2,
    PLAYER_START.row * TILE + TILE / 2 - VIEWPORT_H / 2,
  ));
  const dragRef = useRef<null | { startX: number; startY: number; camX: number; camY: number; moved: boolean }>(null);

  // Scene-fit: a single scale factor applied to the .scene element so the
  // playable viewport always fits the available stage area. Pixel coordinates
  // inside the scene stay native; we just visually scale the rendered output.
  const stageRef = useRef<HTMLElement | null>(null);
  const [sceneScale, setSceneScale] = useState(1);
  const sceneScaleRef = useRef(1);
  useEffect(() => { sceneScaleRef.current = sceneScale; }, [sceneScale]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const compute = (w: number, h: number) => {
      // Leave room for the scene's chunky 12px drop shadow + 4px outer ring.
      const padX = 28;
      const padY = 40;
      const s = Math.min(
        (w - padX) / VIEWPORT_W,
        (h - padY) / VIEWPORT_H,
        1, // never upscale — pixel art at 1:1 is the design target
      );
      // Floor to clean increments so per-pixel jitter doesn't blur tiles.
      const snapped = Math.max(0.3, Math.floor(s * 100) / 100);
      setSceneScale((prev) => (Math.abs(prev - snapped) < 0.005 ? prev : snapped));
    };
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        compute(cr.width, cr.height);
      }
    });
    ro.observe(el);
    // Prime on mount in case ResizeObserver doesn't deliver an initial entry.
    const rect = el.getBoundingClientRect();
    compute(rect.width, rect.height);
    return () => ro.disconnect();
  }, []);

  // Apply current phase to :root variables on every change, including mount.
  useEffect(() => {
    applyPhaseToRoot(phase);
  }, [phase]);

  // Advance to the next phase on a slow interval.
  useEffect(() => {
    const id = window.setInterval(() => {
      setPhase((p) => PHASE_ORDER[(PHASE_ORDER.indexOf(p) + 1) % PHASE_ORDER.length]);
    }, PHASE_DURATION_MS);
    return () => window.clearInterval(id);
  }, []);

  // Stat counters for the HUD.
  const stats = useMemo(() => {
    const live = memories.filter((m) => !m.archived);
    return {
      total: live.length,
      openLoops: live.filter((m) => m.kind === 'open-loop').length,
      important: live.filter((m) => m.importance >= 4).length,
      watered: live.filter((m) => m.watered).length,
    };
  }, [memories]);

  // Per-kind counts for the filter-rail tooltip ("All · 7", "Preference · 3").
  const kindCounts = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = { all: 0 };
    for (const m of memories) {
      if (m.archived) continue;
      counts.all = (counts.all ?? 0) + 1;
      counts[m.kind] = (counts[m.kind] ?? 0) + 1;
    }
    return counts;
  }, [memories]);

  // Rail-button tooltip is rendered as a single fixed-position element at app
  // level so it escapes the .filter-rail overflow:auto clipping context.
  const [railTip, setRailTip] = useState<
    | { label: string; count: number; top: number; left: number }
    | null
  >(null);
  function showRailTip(el: HTMLElement, label: string, count: number) {
    const r = el.getBoundingClientRect();
    setRailTip({ label, count, top: r.top + r.height / 2, left: r.right + 10 });
  }
  function hideRailTip() {
    setRailTip(null);
  }

  // Layout: assign every non-archived memory a stable spot keyed by id, then
  // filter. This keeps plant positions steady across search, filter, AND
  // single-memory removals (Compost / Forget) — only the removed memory's
  // tile is freed.
  const gardenSpotMapRef = useRef<SpotMap>(new Map());
  const tutorialSpotMapRef = useRef<SpotMap>(new Map());
  const allPlaced = useMemo<PlacedMemory[]>(
    () => layoutMemories(memories, gardenSpotMapRef.current, tutorialSpotMapRef.current),
    [memories],
  );
  const placed = useMemo<PlacedMemory[]>(
    () =>
      allPlaced.filter(
        (m) =>
          (filter === 'all' || m.kind === filter) &&
          `${m.title} ${m.text}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [allPlaced, filter, query],
  );

  // Focused = memory in front of player (preferring the facing direction),
  // or a memory the user is hovering in the sidebar (preview override).
  const focused = useMemo<PlacedMemory | null>(() => {
    if (hoveredMemoryId) {
      const hovered = placed.find((m) => m.id === hoveredMemoryId);
      if (hovered) return hovered;
    }
    const tryDir = (dir: Direction) => {
      const v = DIR_VEC[dir];
      const fr = playerPos.row + v.dr;
      const fc = playerPos.col + v.dc;
      return placed.find((m) => m.row === fr && m.col === fc) ?? null;
    };
    return (
      tryDir(facing) ??
      tryDir('down') ??
      tryDir('up') ??
      tryDir('left') ??
      tryDir('right') ??
      null
    );
  }, [placed, playerPos, facing, hoveredMemoryId]);

  // Selection is derived from the visible (placed) memories. If the selected
  // memory was just composted or filtered out, the inspector clears so the
  // user is never looking at a memory that isn't actually in the garden.
  const selected = useMemo<PlacedMemory | undefined>(
    () => (selectedId ? placed.find((m) => m.id === selectedId) : undefined),
    [placed, selectedId],
  );

  // If the previously-selected memory disappears (archived or filtered out),
  // drop the stale id so action buttons disable correctly and the dialogue
  // shows its empty state.
  useEffect(() => {
    if (selectedId && !placed.some((m) => m.id === selectedId)) {
      setSelectedId(null);
    }
  }, [placed, selectedId]);

  // The Forget modal references the underlying MemorySeed (not the placed
  // copy) so the modal stays open even if a search/filter would have hidden
  // the memory. Auto-dismiss if the target id disappears from state.
  const forgetTarget = useMemo<MemorySeed | undefined>(
    () => (forgetTargetId ? memories.find((m) => m.id === forgetTargetId) : undefined),
    [memories, forgetTargetId],
  );
  useEffect(() => {
    if (forgetTargetId && !memories.some((m) => m.id === forgetTargetId)) {
      setForgetTargetId(null);
    }
  }, [memories, forgetTargetId]);

  // Refs for keyboard handler closures.
  const posRef = useRef(playerPos);
  const facingRef = useRef<Direction>(facing);
  const placedRef = useRef(placed);
  const focusedRef = useRef(focused);
  const movingRef = useRef(false);
  const stepRef = useRef(0);
  const keysRef = useRef<Set<string>>(new Set());
  const startedRef = useRef(started);

  useEffect(() => { posRef.current = playerPos; }, [playerPos]);

  // First time the player moves off the spawn tile, retire the intro hint.
  useEffect(() => {
    if (!showIntro) return;
    if (playerPos.row !== PLAYER_START.row || playerPos.col !== PLAYER_START.col) {
      dismissIntroRef.current();
    }
  }, [playerPos, showIntro]);
  useEffect(() => { facingRef.current = facing; }, [facing]);
  useEffect(() => { placedRef.current = placed; }, [placed]);
  useEffect(() => { focusedRef.current = focused; }, [focused]);
  useEffect(() => {
    startedRef.current = started;
    if (!started) keysRef.current.clear();
  }, [started]);

  // Keyboard listeners (set up once).
  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
    };
    // Sidebar owns its own keys (arrow nav, Enter to fast-travel) when one
    // of its rows is focused, so the global player-movement handler must not
    // also fire for the same press.
    const isInSidebar = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      return !!el?.closest?.('.memory-sidebar');
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (isInSidebar(e.target)) return;
      if (!startedRef.current) return; // welcome modal owns input until dismissed
      // Use e.code (physical key position) instead of e.key so layouts like
      // AZERTY/Dvorak don't remap W to a left/right motion.
      if (MOVE_CODES.has(e.code)) {
        keysRef.current.add(e.code);
        e.preventDefault();
        return;
      }
      if (INSPECT_CODES.has(e.code)) {
        e.preventDefault();
        const f = focusedRef.current;
        if (f) setSelectedId(f.id);
        return;
      }
      if (e.code === 'Escape') {
        e.preventDefault();
        setSelectedId(null);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
    };

    // If the window loses focus (Alt-Tab, focus another app, the page is
    // backgrounded), the keyup may never fire — leaving e.g. KeyW stuck in
    // keysRef and the player walking up forever, or showing the wrong sprite
    // because the if-else chain still picks an old direction. Clear on blur.
    const onBlur = () => keysRef.current.clear();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Preload the four direction sprites at startup so the first turn in each
  // direction doesn't show the previous sprite for one frame while the new
  // PNG decodes. Image() puts the file in the browser's HTTP+decode cache.
  useEffect(() => {
    ['up', 'down', 'left'].forEach((d) => {
      const img = new Image();
      img.src = `/player-${d}.png`;
    });
  }, []);

  // RAF movement loop.
  useEffect(() => {
    let raf = 0;
    let cooldown = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      cooldown = Math.max(0, cooldown - dt);

      // Determine current intent EVERY frame so the sprite facing updates
      // the moment keys change — previously facing was only set when the
      // cooldown elapsed, which meant tapping S right after W could show
      // the "up" sprite while walking down for up to 150ms.
      const ks = keysRef.current;
      let dir: Direction | null = null;
      if (ks.has('ArrowUp') || ks.has('KeyW')) dir = 'up';
      else if (ks.has('ArrowDown') || ks.has('KeyS')) dir = 'down';
      else if (ks.has('ArrowLeft') || ks.has('KeyA')) dir = 'left';
      else if (ks.has('ArrowRight') || ks.has('KeyD')) dir = 'right';

      // Update facing as soon as the desired direction changes, regardless
      // of whether a movement step can actually happen this frame.
      if (dir && dir !== facingRef.current) {
        facingRef.current = dir;
        setFacing(dir);
      }

      if (cooldown === 0) {
        if (dir) {
          const v = DIR_VEC[dir];
          const nr = posRef.current.row + v.dr;
          const nc = posRef.current.col + v.dc;
          if (passable(nr, nc, placedRef.current)) {
            posRef.current = { row: nr, col: nc };
            setPlayerPos(posRef.current);
            stepRef.current = (stepRef.current + 1) % 2;
            setStep(stepRef.current);
            setWalking(true);
            cooldown = 150;
          } else {
            // Bump: face, brief pause, no move.
            cooldown = 110;
            setWalking(false);
          }
          movingRef.current = true;
        } else {
          if (movingRef.current) {
            movingRef.current = false;
            setWalking(false);
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  function showToast(message: string) {
    setToast(message);
  }

  // Auto-clear toasts after a short while so they don't linger.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    const parsed: MemorySeed[] = [];
    const fileNames: string[] = [];
    const emptyFiles: string[] = [];
    let hadError = false;
    // Suffix duplicate ids so re-importing the same file (or two imports
    // sharing line numbers) can't collide on React keys.
    const existingIds = isSample ? new Set<string>() : new Set(memories.map((m) => m.id));
    const ensureUnique = (seed: MemorySeed): MemorySeed => {
      if (!existingIds.has(seed.id)) {
        existingIds.add(seed.id);
        return seed;
      }
      let n = 2;
      let id = `${seed.id}#${n}`;
      while (existingIds.has(id)) {
        n += 1;
        id = `${seed.id}#${n}`;
      }
      existingIds.add(id);
      return { ...seed, id };
    };
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const parser = looksLikeCodexFile(text) ? parseCodexFile : parseMemoryFile;
        const seeds = parser(file.name, text).map(ensureUnique);
        if (seeds.length === 0) {
          emptyFiles.push(file.name);
        } else {
          parsed.push(...seeds);
          fileNames.push(file.name);
        }
      } catch {
        hadError = true;
      }
    }

    if (parsed.length === 0) {
      if (hadError) showToast('Could not read one of those files.');
      else if (emptyFiles.length === 1) showToast(`No parseable memories found in ${emptyFiles[0]}.`);
      else if (emptyFiles.length > 1) showToast(`No parseable memories found in ${emptyFiles.length} files.`);
      else showToast('No memories imported.');
      return;
    }

    // First-ever import replaces the sample garden; later imports append so
    // the user can keep building up their garden.
    const next = isSample ? parsed : [...memories, ...parsed];

    // Fade existing plants out, swap, then let the new plants sprout in via
    // the .plant CSS keyframe. Drop the selected memory first so the open
    // dialogue collapses to its empty state during the fade.
    setIsImporting(true);
    setSelectedId(null);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 280));
    setMemories(next);
    const wasSample = isSample;
    setIsSample(false);
    setSelectedId(parsed[0]?.id ?? null);
    // Keep the camera centered on the player so importing doesn't yank the
    // viewport across the world to wherever the first GARDEN_SPOT happens to
    // sit. The new plants will pop in around the player and elsewhere in the
    // world; the user can walk over to explore.
    {
      const p = posRef.current ?? PLAYER_START;
      setCamera(clampCamera(
        p.col * TILE + TILE / 2 - VIEWPORT_W / 2,
        p.row * TILE + TILE / 2 - VIEWPORT_H / 2,
      ));
    }
    window.setTimeout(() => setIsImporting(false), 60);

    const fileLabel = fileNames.length === 1
      ? fileNames[0]
      : `${fileNames.length} files`;
    const verb = wasSample ? 'Loaded' : 'Added';
    const skipped = emptyFiles.length
      ? ` · ${emptyFiles.length} skipped (empty)`
      : '';
    showToast(`${verb} ${parsed.length} memories from ${fileLabel}${skipped}`);
  }

  /* `updateMemory` is the single funnel through which mutations flow (water,
     boost, edit, compost toggle…). It auto-stamps `lastUpdated` so every
     mutation refreshes the "Updated <relative time>" row in the inspector.
     Pass `bumpUpdated: false` for internal patches that shouldn't count as
     a user-visible update (e.g. reverting after a failed disk write). */
  function updateMemory(
    id: string,
    patch: Partial<MemorySeed>,
    opts: { bumpUpdated?: boolean } = {},
  ) {
    const bump = opts.bumpUpdated !== false;
    setMemories((items) => items.map((item) => {
      if (item.id !== id) return item;
      return { ...item, ...patch, ...(bump ? { lastUpdated: Date.now() } : {}) };
    }));
  }

  /* ─── Connected directory: load / reload / disconnect ─────────── */

  function applyConnectedMemories(connected: ConnectedMemory[]) {
    const seeds = connected.map(memoryFromConnected);
    const mtimes = new Map<string, number>();
    for (const c of connected) mtimes.set(c.fileName, c.lastModified);
    fileMtimesRef.current = mtimes;
    // Same fade-out → swap → sprout-in flow as importFiles.
    setIsImporting(true);
    setSelectedId(null);
    window.setTimeout(() => {
      fileMtimesRef.current = mtimes;
      setMemories(seeds);
      setIsSample(false);
      setSelectedId(seeds[0]?.id ?? null);
      // Recenter on the player (see importFiles for rationale).
      const p = posRef.current ?? PLAYER_START;
      setCamera(clampCamera(
        p.col * TILE + TILE / 2 - VIEWPORT_W / 2,
        p.row * TILE + TILE / 2 - VIEWPORT_H / 2,
      ));
      window.setTimeout(() => setIsImporting(false), 60);
    }, 280);
  }

  async function connectMemoryFolder() {
    if (!isFsAccessSupported()) {
      showToast('This browser does not support folder connection. Use Chrome, Edge, or Brave.');
      return;
    }
    try {
      const handle = await pickMemoryDirectory();
      const { memories: connected, errors } = await readMemoryDir(handle);

      // If the folder doesn't follow the per-file memory schema, fall back to
      // parsing a top-level MEMORY.md / MEMORY.txt as line-bullets (read-only
      // since live writeback only makes sense for per-file storage).
      if (connected.length === 0) {
        const index = await readMemoryIndexFile(handle);
        if (index) {
          const parser = looksLikeCodexFile(index.text) ? parseCodexFile : parseMemoryFile;
          const seeds = parser(index.fileName, index.text);
          if (seeds.length > 0) {
            // Use the same fade-swap-sprout transition as Import.
            setIsImporting(true);
            setSelectedId(null);
            window.setTimeout(() => {
              setMemories(seeds);
              setIsSample(false);
              setSelectedId(seeds[0]?.id ?? null);
              // Recenter on the player (see importFiles for rationale).
              const p = posRef.current ?? PLAYER_START;
              setCamera(clampCamera(
                p.col * TILE + TILE / 2 - VIEWPORT_W / 2,
                p.row * TILE + TILE / 2 - VIEWPORT_H / 2,
              ));
              window.setTimeout(() => setIsImporting(false), 60);
            }, 280);
            // Don't persist the handle: the per-file write-back path doesn't
            // apply to a single index file, so leave it as a plain import.
            showToast(`Loaded ${seeds.length} memories from ${handle.name}/${index.fileName}.`);
            return;
          }
        }
      }

      applyConnectedMemories(connected);
      setDirHandle(handle);
      await persistHandle(handle);
      setHasPersistedHandle(true);
      const skipped = errors.length ? ` · ${errors.length} skipped` : '';
      if (connected.length === 0) {
        showToast(
          `Connected to ${handle.name} · 0 memory files found. ` +
            `Expected one .md per memory (with frontmatter) or a MEMORY.md inside${skipped}`,
        );
      } else {
        showToast(`Connected to ${handle.name} · loaded ${connected.length} memories${skipped}`);
      }
    } catch (err) {
      // AbortError = user cancelled the picker; stay silent.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'unknown error';
      showToast(`Could not connect to that folder: ${message}`);
    }
  }

  async function reconnectFromPersisted() {
    const handle = await loadPersistedHandle();
    if (!handle) return;
    try {
      const ok = await ensurePermission(handle, 'readwrite');
      if (!ok) {
        showToast('Permission to read/write the memory folder was not granted.');
        return;
      }
      const { memories: connected, errors } = await readMemoryDir(handle);
      applyConnectedMemories(connected);
      setDirHandle(handle);
      const skipped = errors.length ? ` · ${errors.length} skipped` : '';
      showToast(`Reconnected · ${connected.length} memories${skipped}`);
    } catch {
      showToast('Could not reconnect to the memory folder.');
    }
  }

  async function reloadFromDisk(opts: { silent?: boolean } = {}) {
    if (!dirHandle) return;
    try {
      const { memories: connected } = await readMemoryDir(dirHandle);
      const prevSelected = selectedId;
      applyConnectedMemories(connected);
      // Preserve selection if the file is still there.
      if (prevSelected && connected.some((c) => `dir:${c.fileName}` === prevSelected)) {
        setSelectedId(prevSelected);
      }
      if (!opts.silent) showToast(`Reloaded · ${connected.length} memories`);
    } catch {
      if (!opts.silent) showToast('Reload failed.');
    }
  }

  async function disconnectMemoryFolder() {
    setDirHandle(null);
    setHasPersistedHandle(false);
    fileMtimesRef.current = new Map();
    await clearPersistedHandle();
    // Restore the tutorial garden so the scene isn't empty.
    setMemories(parseMemoryFile('tutorial/MEMORY.md', TUTORIAL_MEMORY).map((m) => ({ ...m, isTutorial: true })));
    setIsSample(true);
    setSelectedId(null);
    showToast('Disconnected from memory folder.');
  }

  /* Reset the garden to the tutorial state — used by the Home button so the
     user can return to the onboarding landing after they've imported their
     own memories. Disconnects any connected folder, restores tutorial
     memories, clears selection, recenters the player + camera on spawn. */
  async function resetToTutorial() {
    if (dirHandle || hasPersistedHandle) {
      setDirHandle(null);
      setHasPersistedHandle(false);
      fileMtimesRef.current = new Map();
      await clearPersistedHandle();
    }
    setMemories(parseMemoryFile('tutorial/MEMORY.md', TUTORIAL_MEMORY).map((m) => ({ ...m, isTutorial: true })));
    setIsSample(true);
    setSelectedId(null);
    // Snap player + camera back to spawn so the tutorial ring is immediately
    // visible regardless of where the user was wandering.
    posRef.current = { ...PLAYER_START };
    setPlayerPos({ ...PLAYER_START });
    setCamera(clampCamera(
      PLAYER_START.col * TILE + TILE / 2 - VIEWPORT_W / 2,
      PLAYER_START.row * TILE + TILE / 2 - VIEWPORT_H / 2,
    ));
    showToast('Returned to the tutorial garden.');
  }

  // On mount: check if we have a persisted handle from a previous session.
  // Don't auto-load — the browser requires a fresh user gesture to grant
  // permission, so we surface a "Reconnect" button instead.
  useEffect(() => {
    if (!isFsAccessSupported()) return;
    void loadPersistedHandle().then((h) => setHasPersistedHandle(!!h));
  }, []);

  // While connected, re-read on window focus to pick up external edits
  // (e.g. Claude Code writing to the same folder from another session).
  useEffect(() => {
    if (!dirHandle) return;
    function onFocus() {
      if (document.visibilityState === 'visible') void reloadFromDisk({ silent: true });
    }
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [dirHandle]);

  function isConnectedMemory(m: MemorySeed): boolean {
    return m.id.startsWith('dir:');
  }

  /* ─── Camera: follow player + drag-to-pan ───────────────────────── */

  // When the player approaches the viewport edge, scroll the camera so the
  // player stays in view. Uses a deadzone so small steps don't yank the
  // camera around.
  useEffect(() => {
    const EDGE = 80;
    const px = playerPos.col * TILE + TILE / 2;
    const py = playerPos.row * TILE + TILE / 2;
    setCamera((c) => {
      let { x, y } = c;
      if (px - x < EDGE) x = px - EDGE;
      else if (px - x > VIEWPORT_W - EDGE) x = px - (VIEWPORT_W - EDGE);
      if (py - y < EDGE) y = py - EDGE;
      else if (py - y > VIEWPORT_H - EDGE) y = py - (VIEWPORT_H - EDGE);
      const clamped = clampCamera(x, y);
      return clamped.x === c.x && clamped.y === c.y ? c : clamped;
    });
  }, [playerPos]);

  function recenterCamera() {
    setCamera(clampCamera(
      playerPos.col * TILE + TILE / 2 - VIEWPORT_W / 2,
      playerPos.row * TILE + TILE / 2 - VIEWPORT_H / 2,
    ));
  }

  /* Fast-travel from a sidebar click: teleport the avatar to the nearest
     passable tile adjacent to the chosen memory, pan the camera so the
     memory is centred (smooth via a temporary transform transition on
     .world), and open the inspector. We chose teleport over auto-walk
     because pathfinding around props/water in a 56×32 world would feel
     laggy and the camera glide already gives spatial continuity. */
  function fastTravelTo(memory: PlacedMemory) {
    const target = nearestPassableAdjacent(memory.row, memory.col, placedRef.current);
    if (!target) return;
    // Hand keyboard focus back to the world so the user can resume walking
    // immediately after the click. Without this, focus stays on the clicked
    // sidebar row and the global keydown handler keeps bailing on it.
    const active = document.activeElement as HTMLElement | null;
    if (active?.closest('.memory-sidebar')) active.blur();
    // Face the memory after teleport so it becomes the focused plant.
    const dr = memory.row - target.row;
    const dc = memory.col - target.col;
    let dir: Direction = 'down';
    if (dr < 0) dir = 'up';
    else if (dr > 0) dir = 'down';
    else if (dc < 0) dir = 'left';
    else if (dc > 0) dir = 'right';

    setIsTraveling(true);
    posRef.current = target;
    setPlayerPos(target);
    facingRef.current = dir;
    setFacing(dir);
    setCamera(clampCamera(
      memory.col * TILE + TILE / 2 - VIEWPORT_W / 2,
      memory.row * TILE + TILE / 2 - VIEWPORT_H / 2,
    ));
    setSelectedId(memory.id);
    window.setTimeout(() => setIsTraveling(false), 320);
  }

  // `C` key recenters the camera on the player. Wired up alongside the
  // existing keyboard listener block via a ref so the listener stays
  // mount-once.
  const recenterRef = useRef(recenterCamera);
  useEffect(() => { recenterRef.current = recenterCamera; });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        recenterRef.current();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function onScenePointerDown(e: React.PointerEvent) {
    // Don't start a camera drag if the user clicked a memory button — let
    // its own onClick fire.
    if ((e.target as Element).closest('.plant')) return;
    // Clicking the game scene should always restore keyboard movement, even
    // if focus was left in the search box, a sidebar row, or another input.
    const active = document.activeElement as HTMLElement | null;
    if (
      active && (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.isContentEditable ||
        active.closest('.memory-sidebar')
      )
    ) {
      active.blur();
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      camX: camera.x,
      camY: camera.y,
      moved: false,
    };
  }
  function onScenePointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const rawDx = e.clientX - d.startX;
    const rawDy = e.clientY - d.startY;
    // 5px threshold is in screen pixels — measure before unscaling.
    if (!d.moved && Math.hypot(rawDx, rawDy) < 5) return;
    d.moved = true;
    // Scene is visually scaled by sceneScale; world coords are 1:1, so divide
    // the screen-pixel drag delta to get world-pixel camera movement.
    const s = sceneScaleRef.current || 1;
    setCamera(clampCamera(d.camX - rawDx / s, d.camY - rawDy / s));
  }
  function onScenePointerUp(e: React.PointerEvent) {
    const d = dragRef.current;
    if (d && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragRef.current = null;
  }

  /* Build a frontmatter patch that always includes `last_updated`, so the
     "Updated <relative time>" row in the inspector stays accurate after
     reload. Each action handler spreads in its own keys on top.

     If `firstSeenMs` is provided we also stamp `first_seen` — used the first
     time a connected memory is touched so the on-disk value matches what the
     inspector shows. Subsequent mutations leave it alone. */
  function stampedPatch(
    extra: Record<string, string | null>,
    firstSeenMs?: number,
  ): Record<string, string | null> {
    const out: Record<string, string | null> = { ...extra, last_updated: new Date().toISOString() };
    if (firstSeenMs !== undefined) out.first_seen = new Date(firstSeenMs).toISOString();
    return out;
  }

  async function waterMemory() {
    if (!selected) return;
    const next = !selected.watered;
    updateMemory(selected.id, { watered: next });
    if (next) setSplashKey((k) => k + 1);
    if (dirHandle && isConnectedMemory(selected)) {
      try {
        const result = await writeMemoryFile(dirHandle, selected.source, stampedPatch({
          last_watered: next ? new Date().toISOString() : null,
        }, selected.firstSeen));
        fileMtimesRef.current.set(selected.source, result.lastModified);
      } catch {
        showToast('Could not save watering to disk.');
        // Revert local state to match disk; don't bump lastUpdated for the revert.
        updateMemory(selected.id, { watered: !next, lastUpdated: selected.lastUpdated }, { bumpUpdated: false });
      }
    }
  }

  async function boostMemory() {
    if (!selected) return;
    if (selected.importance >= 5) {
      setImportanceFlash((n) => n + 1);
      return;
    }
    const next = Math.min(5, selected.importance + 1);
    updateMemory(selected.id, { importance: next });
    setImportanceFlash((n) => n + 1);
    if (dirHandle && isConnectedMemory(selected)) {
      try {
        const result = await writeMemoryFile(dirHandle, selected.source, stampedPatch({
          importance: String(next),
        }, selected.firstSeen));
        fileMtimesRef.current.set(selected.source, result.lastModified);
      } catch {
        showToast('Could not save importance to disk.');
        updateMemory(
          selected.id,
          { importance: selected.importance, lastUpdated: selected.lastUpdated },
          { bumpUpdated: false },
        );
      }
    }
  }

  async function compostMemory() {
    if (!selected) return;
    const id = selected.id;
    const sourceFile = selected.source;
    const title = selected.title;
    const prevLastUpdated = selected.lastUpdated;
    const wasConnected = !!dirHandle && isConnectedMemory(selected);
    updateMemory(id, { archived: true });
    setSelectedId(null);
    if (wasConnected) {
      try {
        await softCompost(dirHandle!, sourceFile);
        fileMtimesRef.current.delete(sourceFile);
        showToast(`Composted "${title.slice(0, 36)}${title.length > 36 ? '…' : ''}" → .compost/`);
        return;
      } catch {
        // Revert: un-archive locally so the memory doesn't silently vanish.
        updateMemory(id, { archived: false, lastUpdated: prevLastUpdated }, { bumpUpdated: false });
        showToast('Could not move file to .compost/.');
        return;
      }
    }
    showToast(`Composted "${title.slice(0, 36)}${title.length > 36 ? '…' : ''}"`);
  }

  /* Forget = irreversible hard delete. Unlike Compost there is no `.compost/`
     copy and no archived-flag toggle; the memory is removed from state and,
     when connected, the source file is unlinked from disk. Tutorial memories
     are removed from state only (no disk write). */
  async function forgetMemory(target?: MemorySeed) {
    const m = target ?? selected;
    if (!m) return;
    const id = m.id;
    const sourceFile = m.source;
    const title = m.title;
    const wasConnected = !!dirHandle && isConnectedMemory(m) && !m.isTutorial;
    // Drop the inspector and remove from state immediately so the UI doesn't
    // flash a "ghost" of the memory while the file delete is in flight.
    setSelectedId(null);
    setEditing(null);
    setMemories((items) => items.filter((m) => m.id !== id));
    if (wasConnected) {
      try {
        await hardDeleteMemoryFile(dirHandle!, sourceFile);
        fileMtimesRef.current.delete(sourceFile);
        showToast(`Forgot "${title.slice(0, 36)}${title.length > 36 ? '…' : ''}"`);
      } catch {
        showToast('Could not delete the source file. Local state cleared.');
      }
    } else {
      showToast(`Forgot "${title.slice(0, 36)}${title.length > 36 ? '…' : ''}"`);
    }
    // Return focus to the scene so arrow keys move the avatar again. The
    // global keyboard handler listens on window and only suppresses input
    // when focus is inside an INPUT / TEXTAREA / contentEditable — blurring
    // the modal's button (just-focused before the modal unmounted) is enough
    // to restore movement.
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== document.body) active.blur();
  }

  /* ─── Inline edit: open / change / re-detect / save / cancel ────── */

  // If the selection moves or the target memory disappears (filter, compost,
  // import), drop the draft so we don't keep stale text in the inputs.
  useEffect(() => {
    if (!editing) return;
    if (!selected || selected.id !== editing.id) setEditing(null);
  }, [selected, editing]);

  function startEdit() {
    if (!selected) return;
    setEditing({
      id: selected.id,
      title: selected.title,
      text: selected.text,
      previewKind: null,
      previewMood: null,
    });
  }

  function cancelEdit() {
    setEditing(null);
  }

  function redetectKind() {
    setEditing((e) => {
      if (!e) return e;
      const sample = `${e.title}\n${e.text}`;
      return {
        ...e,
        previewKind: classifyKind(sample),
        previewMood: classifyMood(sample),
      };
    });
  }

  async function saveEdit() {
    if (!editing) return;
    const target = memories.find((m) => m.id === editing.id);
    if (!target) {
      setEditing(null);
      return;
    }
    const nextTitle = editing.title.trim() || target.title;
    const nextText = editing.text.trim();
    // Empty body collapses the dialogue text — refuse silently rather than
    // letting the user create an unreadable memory.
    if (!nextText) {
      showToast('Memory text can\'t be empty.');
      return;
    }
    const patch: Partial<MemorySeed> = { title: nextTitle, text: nextText };
    if (editing.previewKind) patch.kind = editing.previewKind;
    if (editing.previewMood) patch.mood = editing.previewMood;

    setIsSavingEdit(true);
    try {
      updateMemory(editing.id, patch);
      // Persist to disk only for connected per-file memories. Tutorial and
      // file-picker imports stay in memory by design.
      if (
        dirHandle &&
        isConnectedMemory(target) &&
        !target.isTutorial
      ) {
        try {
          const result = await writeMemoryFile(dirHandle, target.source, stampedPatch({
            name: nextTitle,
            description: nextText,
          }, target.firstSeen));
          fileMtimesRef.current.set(target.source, result.lastModified);
        } catch {
          // Revert local edit if the disk write fails.
          updateMemory(
            editing.id,
            {
              title: target.title,
              text: target.text,
              kind: target.kind,
              mood: target.mood,
              lastUpdated: target.lastUpdated,
            },
            { bumpUpdated: false },
          );
          showToast('Could not save edits to disk.');
          return;
        }
      }
      setEditing(null);
    } finally {
      setIsSavingEdit(false);
    }
  }

  /* Pre-computed scene pieces */
  /* Procedural tile grid + decorations removed — the painted garden-bg.png
     covers all of grass / path / cottage / fence / pond / dock / lanterns.
     Plants and the player overlay the painting at grid-aligned positions. */

  const fireflies = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        id: i,
        left: 10 + ((i * 53) % 80),
        top: 8 + ((i * 31) % 35),
        delay: (i * 0.7) % 4,
        dur: 6 + (i % 4),
      })),
    [],
  );

  return (
    <>
      <div className="game-shell" data-started={started}>
        <div className="scanlines" aria-hidden />
        <div className="screen-glow" aria-hidden />

        <header className="hud-bar">
          <div className="hud-brand">
            <div className="brand-mark"><PixelLogo /></div>
            <div className="brand-text">
              <span className="brand-eyebrow">MEMORY</span>
              <span className="brand-title">Garden</span>
            </div>
          </div>

          <div className="hud-stats" role="status" aria-label="Garden stats">
            <StatChip Sprite={Tulip} count={stats.total} label="memories" />
            <StatChip Sprite={Wilted} count={stats.openLoops} label="open" tone="alert" />
            <StatChip Sprite={Firefly} count={stats.important} label="important" tone="gold" />
            <StatChip Sprite={WaterDrop} count={stats.watered} label="watered" tone="water" />
          </div>

          <div className="hud-tools">
            {!isSample && (
              <button
                type="button"
                className="hud-home"
                onClick={() => void resetToTutorial()}
                title="Back to the tutorial garden"
                aria-label="Back to tutorial"
              >
                <Home size={14} /> Home
              </button>
            )}
            <div className="hud-search">
              <Search size={12} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // Let the user return to keyboard movement without using
                  // the mouse: Esc clears + blurs, Enter just blurs.
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setQuery('');
                    e.currentTarget.blur();
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                placeholder="Search... (Esc to return)"
                aria-label="Search memories"
              />
            </div>
            <label className="hud-import" title="Import a MEMORY.md or .txt file">
              <Upload size={14} /> Import
              <input
                type="file"
                accept=".md,.txt"
                multiple
                onChange={(event) => {
                  const input = event.currentTarget;
                  void importFiles(input.files);
                  // Reset so the same file (or any file after the first) can
                  // be picked again — without this, onChange never re-fires.
                  input.value = '';
                }}
              />
            </label>
            <div className="hud-import-help-wrap">
              <button
                type="button"
                className={`hud-import-help ${showImportHelp ? 'active' : ''}`}
                onClick={() => setShowImportHelp((v) => !v)}
                aria-expanded={showImportHelp}
                aria-label="Where do I get a MEMORY.md?"
                title="Where do I get a MEMORY.md?"
              >
                <HelpCircle size={14} />
              </button>
              {showImportHelp && (
                <div className="hud-import-popover" role="dialog" aria-label="Import help">
                  <button
                    type="button"
                    className="hud-import-popover-close"
                    onClick={() => setShowImportHelp(false)}
                    aria-label="Close"
                  >
                    <X size={10} strokeWidth={3} />
                  </button>
                  <p className="hud-import-popover-title">Where's my MEMORY.md?</p>
                  <p>
                    Any <code>.md</code> or <code>.txt</code> file where each line is a memory
                    (a leading <code>-</code> works great). If your AI assistant writes its own
                    memory file, point Import at that file.
                  </p>
                  <p>
                    To live-sync as the file updates, use <strong>Connect folder</strong> instead —
                    the garden will refresh as your AI writes to it.
                  </p>
                </div>
              )}
            </div>
            {isFsAccessSupported() && (
              dirHandle ? (
                <div className="hud-connected" title={`Connected to ${dirHandle.name}`}>
                  <FolderOpen size={14} />
                  <span className="hud-connected-name">{dirHandle.name}</span>
                  <button
                    type="button"
                    className="hud-connected-action"
                    onClick={() => void reloadFromDisk()}
                    title="Reload from disk"
                    aria-label="Reload memories from disk"
                  >
                    <RefreshCw size={12} />
                  </button>
                  <button
                    type="button"
                    className="hud-connected-action"
                    onClick={() => void disconnectMemoryFolder()}
                    title="Disconnect"
                    aria-label="Disconnect memory folder"
                  >
                    <Unplug size={12} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="hud-import hud-connect"
                  onClick={() => (hasPersistedHandle ? void reconnectFromPersisted() : void connectMemoryFolder())}
                  title={hasPersistedHandle ? 'Reconnect to last folder' : 'Connect a memory folder'}
                >
                  <FolderOpen size={14} /> {hasPersistedHandle ? 'Reconnect' : 'Connect folder'}
                </button>
              )
            )}
          </div>
        </header>

        <div className="game-body">
          <nav className="filter-rail" aria-label="Filter by memory kind">
            {(['all', ...Object.keys(KIND_META)] as Array<MemoryKind | 'all'>).map((kind) => {
              const Sprite = kind === 'all' ? null : KIND_META[kind].Sprite;
              const label = kind === 'all' ? 'All' : KIND_META[kind].label;
              const count = kindCounts[kind] ?? 0;
              return (
                <button
                  key={kind}
                  className={`rail-btn ${filter === kind ? 'active' : ''}`}
                  onClick={() => setFilter(kind)}
                  onMouseEnter={(e) => showRailTip(e.currentTarget, label, count)}
                  onMouseLeave={hideRailTip}
                  onFocus={(e) => showRailTip(e.currentTarget, label, count)}
                  onBlur={hideRailTip}
                  aria-label={`${label} (${count})`}
                >
                  <span className="rail-icon">
                    {kind === 'all' ? <span className="rail-all-text">ALL</span> : Sprite ? <Sprite /> : null}
                  </span>
                </button>
              );
            })}
          </nav>

          <MemorySidebar
            open={sidebarOpen}
            onToggle={() => setSidebarOpen((v) => !v)}
            placed={placed}
            totalCount={placed.length}
            filter={filter}
            query={query}
            onClearFilters={() => { setFilter('all'); setQuery(''); }}
            selectedId={selectedId}
            hoveredMemoryId={hoveredMemoryId}
            onHover={setHoveredMemoryId}
            onPick={fastTravelTo}
          />

          <main
            className="stage"
            aria-label="Pixel memory garden"
            ref={(el) => { stageRef.current = el; }}
          >
            <div className="stage-fog" aria-hidden />

            {/* .scene-fit takes the visual (scaled) footprint so the stage's
                grid-center positions correctly; .scene itself stays at native
                pixel size and is transform: scale()'d to fit. */}
            <div
              className="scene-fit"
              style={{ width: VIEWPORT_W * sceneScale, height: VIEWPORT_H * sceneScale }}
            >
            <div
              className="scene"
              style={{
                width: VIEWPORT_W,
                height: VIEWPORT_H,
                transform: `scale(${sceneScale})`,
                transformOrigin: '0 0',
              }}
              onPointerDown={onScenePointerDown}
              onPointerMove={onScenePointerMove}
              onPointerUp={onScenePointerUp}
              onPointerCancel={onScenePointerUp}
            >
              {/* The world is larger than the viewport; the .scene clips it
                  and we translate by -camera to scroll. The painted bg lives
                  on .world so it pans with the rest of the scene. */}
              <div
                className="world scene-painted"
                data-importing={isImporting ? 'true' : undefined}
                data-traveling={isTraveling ? 'true' : undefined}
                style={{
                  width: WORLD_W,
                  height: WORLD_H,
                  transform: `translate(${-camera.x}px, ${-camera.y}px)`,
                }}
              >
              {/* Painted background does the work of tiles + cottage + fence +
                  pond + dock + lanterns. Plants and the player overlay it. */}

              {/* Memories — viewport-culled. With a big import (~200 plants)
                  the DOM was holding hundreds of animated buttons + glow
                  pseudo-elements, which choked the compositor (especially
                  under the scanline mix-blend layer). Only render plants that
                  intersect the camera's visible window plus a small margin so
                  movement feels smooth as plants enter/leave. */}
              {placed.filter((m) => {
                const MARGIN = TILE * 3;
                const px = m.col * TILE;
                const py = m.row * TILE;
                return (
                  px + TILE > camera.x - MARGIN &&
                  px < camera.x + VIEWPORT_W + MARGIN &&
                  py + TILE > camera.y - MARGIN &&
                  py < camera.y + VIEWPORT_H + MARGIN
                );
              }).map((m) => {
                const Sprite = KIND_META[m.kind].Sprite;
                const isSelected = selectedId === m.id;
                const isFocused = focused?.id === m.id;
                return (
                  <button
                    key={m.id}
                    className={`plant kind-${m.kind} mood-${m.mood} ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''} ${m.watered ? 'watered' : ''}`}
                    style={{
                      left: m.col * TILE,
                      top: m.row * TILE,
                      width: TILE,
                      height: TILE,
                      zIndex: 5 + m.row,
                    }}
                    onClick={() => setSelectedId(m.id)}
                    aria-label={m.title}
                  >
                    <span className="sprite">
                      <Sprite />
                    </span>
                    {m.kind === 'open-loop' && <span className="alert-dot" />}
                    {isFocused && <span className="focus-bob">!</span>}
                    {isSelected && splashKey > 0 && m.watered && <span className="splash" key={splashKey} />}
                    <span className="plant-label" aria-hidden>
                      <span className="plant-label-kind">{KIND_META[m.kind].label}</span>
                      <span className="plant-label-title">{m.title}</span>
                    </span>
                  </button>
                );
              })}

              {/* Player — each direction is a pre-cropped PNG. Container is
                  slightly wider than one tile to fit the widest crop, and a
                  little over 1.5× tile tall so the character's head pokes up
                  above its tile. Anchored feet-to-tile-bottom; z = row so
                  plants further south still occlude the character. */}
              {(() => {
                const PW = 64;
                const PH = Math.round(TILE * 1.6); // ~90 at TILE=56
                return (
                  <div
                    className={`player facing-${facing} ${walking ? 'walking' : ''}`}
                    style={{
                      left: playerPos.col * TILE + (TILE - PW) / 2,
                      top: (playerPos.row + 1) * TILE - PH,
                      width: PW,
                      height: PH,
                      zIndex: 5 + playerPos.row,
                    }}
                  >
                    <div className="player-inner">
                      <Player facing={facing} frame={step} />
                    </div>
                  </div>
                );
              })()}

              {/* Fireflies — relative to world so they pan with the scene. */}
              <div className="fireflies-layer" aria-hidden>
                {fireflies.map((f) => (
                  <span
                    key={f.id}
                    className="firefly"
                    style={{
                      left: `${f.left}%`,
                      top: `${f.top}%`,
                      animationDelay: `${f.delay}s`,
                      animationDuration: `${f.dur}s`,
                    }}
                  />
                ))}
              </div>
              </div>{/* /.world */}

              {/* Overlays pinned to the viewport, not the world */}
              <div className="scene-vignette" aria-hidden />

              {/* Recenter on player — visible only when the camera is off the
                  player's tile, so it doesn't clutter the UI by default. */}
              <button
                type="button"
                className="recenter-btn"
                onClick={recenterCamera}
                title="Recenter on player (C)"
                aria-label="Recenter camera on player"
              >
                <span className="recenter-icon" aria-hidden>◎</span>
                <span className="recenter-label">C</span>
              </button>

              {focused && focused.id !== selectedId && (
                <div className="floor-hint" aria-live="polite">
                  <span className="kbd-bubble"><kbd>E</kbd></span>
                  <span className="floor-hint-text">read “{focused.title.slice(0, 28)}{focused.title.length > 28 ? '…' : ''}”</span>
                </div>
              )}

              {placed.length === 0 && (
                <div className="scene-empty" role="status">
                  <span className="scene-empty-cursor">▸</span>
                  <p>No memories match.</p>
                  <span className="scene-empty-hint">Clear the search or pick "All" to see your garden again.</span>
                </div>
              )}
            </div>
            </div>{/* /.scene-fit */}

            {started && showIntro && (
              <div className="intro-hint" role="status">
                <p className="intro-hint-line">
                  Walk with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or the arrow keys.
                </p>
                <p className="intro-hint-line">
                  Step next to a memory and press <kbd>Space</kbd> to read it.
                </p>
                <button
                  type="button"
                  className="intro-hint-close"
                  onClick={dismissIntro}
                  aria-label="Dismiss"
                >
                  Got it
                </button>
              </div>
            )}

            {/* Controls hint pinned to the stage */}
            <div className="controls-card" aria-hidden>
              <span className="controls-row">
                <kbd className="kbd-arrow">↑</kbd>
                <span className="controls-cluster">
                  <kbd className="kbd-arrow">←</kbd>
                  <kbd className="kbd-arrow">↓</kbd>
                  <kbd className="kbd-arrow">→</kbd>
                </span>
                <span className="controls-label">move · WASD</span>
              </span>
              <span className="controls-row">
                <kbd>E</kbd><kbd>Space</kbd>
                <span className="controls-label">inspect</span>
              </span>
              <span className="controls-row">
                <kbd>C</kbd>
                <span className="controls-label">recenter · drag to pan</span>
              </span>
            </div>
          </main>
        </div>

        <Dialogue
          selected={selected}
          splashKey={splashKey}
          importanceFlash={importanceFlash}
          hasAnyVisible={placed.length > 0}
          editing={editing}
          isSavingEdit={isSavingEdit}
          canPersist={!!dirHandle && !!selected && selected.id.startsWith('dir:') && !selected.isTutorial}
          onWater={waterMemory}
          onBoost={boostMemory}
          onCompost={compostMemory}
          onForget={() => setForgetTargetId(selected?.id ?? null)}
          onClose={() => { setEditing(null); setSelectedId(null); }}
          onStartEdit={startEdit}
          onCancelEdit={cancelEdit}
          onSaveEdit={saveEdit}
          onEditChange={(patch) => setEditing((e) => (e ? { ...e, ...patch } : e))}
          onRedetectKind={redetectKind}
        />

        {forgetTarget && (
          <ForgetDialog
            memory={forgetTarget}
            onCancel={() => setForgetTargetId(null)}
            onConfirm={() => {
              const m = forgetTarget;
              setForgetTargetId(null);
              void forgetMemory(m);
            }}
          />
        )}

        {toast && (
          <div className="toast" role="status" aria-live="polite">
            <span className="toast-bullet">▸</span> {toast}
          </div>
        )}
      </div>

      {railTip && (
        <div
          className="rail-tooltip"
          role="tooltip"
          style={{ top: railTip.top, left: railTip.left }}
        >
          <span className="rail-tooltip-label">{railTip.label}</span>
          <span className="rail-tooltip-count">{railTip.count}</span>
        </div>
      )}

      {welcomeMounted && (
        <WelcomeOverlay
          isExiting={started}
          onEnter={() => {
            // Flip `started` immediately so the game-shell's existing .35s
            // filter+opacity transition starts; keep the welcome overlay
            // mounted for the duration of its own fade-out, then unmount it.
            setStarted(true);
            window.setTimeout(() => setWelcomeMounted(false), 420);
          }}
        />
      )}
    </>
  );
}

/* ────────────────────────────────────────────────────────────────
   Memory list sidebar
   ────────────────────────────────────────────────────────────── */

function MemorySidebar({
  open,
  onToggle,
  placed,
  totalCount,
  filter,
  query,
  onClearFilters,
  selectedId,
  hoveredMemoryId,
  onHover,
  onPick,
}: {
  open: boolean;
  onToggle: () => void;
  placed: PlacedMemory[];
  totalCount: number;
  filter: MemoryKind | 'all';
  query: string;
  onClearFilters: () => void;
  selectedId: string | null;
  hoveredMemoryId: string | null;
  onHover: (id: string | null) => void;
  onPick: (m: PlacedMemory) => void;
}) {
  const hasFilter = filter !== 'all' || query.trim() !== '';
  return (
    <aside
      className="memory-sidebar"
      data-open={open ? 'true' : 'false'}
      aria-label="Memory list"
    >
      <button
        type="button"
        className="memory-sidebar-toggle"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? 'Collapse memory list' : 'Expand memory list'}
        title={open ? 'Hide memory list' : 'Show memory list'}
      >
        {open ? <ChevronLeft size={14} /> : <ListFilter size={14} />}
      </button>

      {open && (
        <>
          <div className="memory-sidebar-header">
            <span className="memory-sidebar-count">
              {totalCount} {totalCount === 1 ? 'memory' : 'memories'}
            </span>
            {hasFilter && (
              <button
                type="button"
                className="memory-sidebar-clear"
                onClick={onClearFilters}
                title="Clear search + filter"
              >
                <X size={10} strokeWidth={3} /> Clear
              </button>
            )}
          </div>
          <div
            className="memory-sidebar-list"
            role="listbox"
            aria-label="Memories matching current filter"
          >
            {placed.length === 0 && (
              <div className="memory-sidebar-empty">
                No memories match. {hasFilter ? 'Clear filters to see them all.' : ''}
              </div>
            )}
            {placed.map((m) => {
              const Sprite = KIND_META[m.kind].Sprite;
              const isSelected = selectedId === m.id;
              const isHovered = hoveredMemoryId === m.id;
              return (
                <button
                  type="button"
                  key={m.id}
                  role="option"
                  aria-selected={isSelected}
                  className={`memory-sidebar-row ${isSelected ? 'is-selected' : ''} ${isHovered ? 'is-hovered' : ''}`}
                  onMouseEnter={() => onHover(m.id)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(m.id)}
                  onBlur={() => onHover(null)}
                  onClick={() => onPick(m)}
                  onKeyDown={(e) => {
                    // Browser already fires onClick on Enter for buttons.
                    // We only handle Arrow nav here. The global movement
                    // listener bails on events whose target is inside the
                    // sidebar, so these arrows don't leak to the avatar.
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      const next = e.currentTarget.nextElementSibling as HTMLElement | null;
                      next?.focus();
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      const prev = e.currentTarget.previousElementSibling as HTMLElement | null;
                      if (prev && prev.classList.contains('memory-sidebar-row')) prev.focus();
                    }
                  }}
                >
                  <span className="memory-sidebar-icon" aria-hidden>
                    <Sprite />
                  </span>
                  <span className="memory-sidebar-text">
                    <span className="memory-sidebar-title" title={m.title}>{m.title}</span>
                    <span className="memory-sidebar-hearts" aria-label={`Importance ${m.importance} of 5`}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <span key={i} className={`memory-sidebar-heart ${i < m.importance ? 'on' : ''}`} />
                      ))}
                    </span>
                  </span>
                  <span
                    className="memory-sidebar-mood"
                    style={{ background: MOOD_COLOR[m.mood] }}
                    aria-label={`Mood: ${MOOD_LABEL[m.mood]}`}
                    title={MOOD_LABEL[m.mood]}
                  />
                </button>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}

/* ────────────────────────────────────────────────────────────────
   HUD + Dialogue components
   ────────────────────────────────────────────────────────────── */

function StatChip({
  Sprite,
  count,
  label,
  tone,
}: {
  Sprite: React.FC;
  count: number;
  label: string;
  tone?: 'alert' | 'gold' | 'water';
}) {
  return (
    <div className={`stat-chip ${tone ? `tone-${tone}` : ''}`} role="group" aria-label={`${count} ${label}`}>
      <span className="stat-icon"><Sprite /></span>
      <span className="stat-value">{count}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

type EditingState = {
  id: string;
  title: string;
  text: string;
  previewKind: MemoryKind | null;
  previewMood: Mood | null;
};

function Dialogue({
  selected,
  splashKey,
  importanceFlash,
  hasAnyVisible,
  editing,
  isSavingEdit,
  canPersist,
  onWater,
  onBoost,
  onCompost,
  onForget,
  onClose,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onEditChange,
  onRedetectKind,
}: {
  selected: PlacedMemory | undefined;
  splashKey: number;
  importanceFlash: number;
  hasAnyVisible: boolean;
  editing: EditingState | null;
  isSavingEdit: boolean;
  canPersist: boolean;
  onWater: () => void;
  onBoost: () => void;
  onCompost: () => void;
  onForget: () => void;
  onClose: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onEditChange: (patch: Partial<EditingState>) => void;
  onRedetectKind: () => void;
}) {
  // Overflow menu (currently just Forget). Open state is local to Dialogue —
  // simple enough to inline rather than thread through the parent.
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement | null>(null);
  // Tick once a minute so "just now" relative-time labels age into "1 minute
  // ago", "2 minutes ago", etc. Anchored to component-mount, so the inspector
  // for a long-open memory stays accurate without polling every second.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (!overflowOpen) return;
    function onDocDown(e: MouseEvent | KeyboardEvent) {
      if (e instanceof KeyboardEvent) {
        if (e.key === 'Escape') setOverflowOpen(false);
        return;
      }
      const node = overflowRef.current;
      if (node && !node.contains(e.target as Node)) setOverflowOpen(false);
    }
    window.addEventListener('mousedown', onDocDown);
    window.addEventListener('keydown', onDocDown);
    return () => {
      window.removeEventListener('mousedown', onDocDown);
      window.removeEventListener('keydown', onDocDown);
    };
  }, [overflowOpen]);
  // Close the overflow whenever the selected memory changes — otherwise it
  // would linger over the next memory's header.
  useEffect(() => { setOverflowOpen(false); }, [selected?.id]);
  if (!selected) {
    return (
      <section className="dialogue" data-empty>
        <div className="dialogue-frame">
          <div className="dialogue-empty">
            <span className="dialogue-empty-cursor">▸</span>{' '}
            {hasAnyVisible
              ? <>No memory selected. Walk near a sprite and press <kbd>Space</kbd>, or click one in the garden.</>
              : <>No memories match. Clear the search or filter to see your garden again.</>}
          </div>
        </div>
      </section>
    );
  }

  const isEditing = editing !== null && editing.id === selected.id;
  // While editing, the portrait should reflect the user's re-detection
  // preview (if any) so they can see what the new kind will look like
  // before committing. Otherwise it stays on the saved kind.
  const displayKind: MemoryKind = isEditing && editing!.previewKind ? editing!.previewKind : selected.kind;
  const displayMood: Mood = isEditing && editing!.previewMood ? editing!.previewMood : selected.mood;
  const S = KIND_META[displayKind].Sprite;
  const maxed = selected.importance >= 5;

  // Keyboard shortcuts inside the editable inputs.
  function handleEditKeyDown(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancelEdit();
      return;
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onSaveEdit();
    }
  }

  return (
    <section className="dialogue" data-open key={selected.id} data-editing={isEditing || undefined}>
      <div className="dialogue-frame">
        {/* Header overflow menu (Forget lives here so it stays clearly separate
            from the main action row). Hidden during inline editing to avoid
            stacking menus on top of the title input. */}
        {!isEditing && (
          <div className="dialogue-overflow" ref={overflowRef}>
            <button
              type="button"
              className="dialogue-overflow-trigger"
              onClick={() => setOverflowOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={overflowOpen}
              aria-label="More memory actions"
              title="More actions"
            >
              <MoreHorizontal size={16} strokeWidth={3} />
            </button>
            {overflowOpen && (
              <div className="dialogue-overflow-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="dialogue-overflow-item is-danger"
                  onClick={() => {
                    setOverflowOpen(false);
                    onForget();
                  }}
                >
                  <Trash2 size={13} strokeWidth={2.5} />
                  <span>Forget memory…</span>
                </button>
                <p className="dialogue-overflow-hint">
                  Permanent. No <code>.compost/</code> copy.
                </p>
              </div>
            )}
          </div>
        )}
        <button
          type="button"
          className="dialogue-close"
          onClick={onClose}
          aria-label="Close memory"
          title="Close (Esc)"
        >
          <X size={14} strokeWidth={3} />
        </button>
        <div className="dialogue-portrait">
          <div className="portrait-sprite"><S /></div>
          <div className="portrait-kind">{KIND_META[displayKind].label}</div>
        </div>

        <div className="dialogue-body">
          <div className="dialogue-namebar">
            {isEditing ? (
              <input
                type="text"
                className="dialogue-title-input"
                value={editing!.title}
                onChange={(e) => onEditChange({ title: e.target.value })}
                onKeyDown={handleEditKeyDown}
                placeholder="Title"
                aria-label="Memory title"
                maxLength={140}
                autoFocus
              />
            ) : (
              <h2 className="dialogue-title">{selected.title}</h2>
            )}
            <span className={`dialogue-mood mood-${displayMood}`}>{MOOD_LABEL[displayMood]}</span>
          </div>

          {isEditing ? (
            <AutoTextarea
              className="dialogue-text-input"
              value={editing!.text}
              onChange={(v) => onEditChange({ text: v })}
              onKeyDown={handleEditKeyDown}
              placeholder="One line. The whole memory."
              ariaLabel="Memory text"
              minRows={4}
              maxRows={16}
            />
          ) : (
            <p className="dialogue-text">{selected.text}</p>
          )}

          {!isEditing && (
            <DialogueTimestamps memory={selected} nowMs={nowTick} />
          )}

          <div className="dialogue-meta">
            <span className="meta-pair">
              <span className="meta-key">src</span>
              <span className="meta-val">{selected.source}:{selected.line}</span>
            </span>
            <span className="meta-pair">
              <span className="meta-key">age</span>
              <span className="meta-val">{selected.age}</span>
            </span>
            <span className="meta-pair">
              <span className="meta-key">★</span>
              <span
                className={`meta-val importance ${importanceFlash > 0 ? 'flash' : ''}`}
                key={importanceFlash}
              >
                {Array.from({ length: 5 }, (_, i) => (
                  <span key={i} className={i < selected.importance ? 'heart on' : 'heart'} />
                ))}
              </span>
            </span>
            {splashKey > 0 && selected.watered && <span className="meta-watered">~ watered ~</span>}
          </div>

          {isEditing ? (
            <p className="dialogue-edit-hint">
              <button
                type="button"
                className="dialogue-redetect"
                onClick={onRedetectKind}
                title="Re-classify kind/mood from the new text"
              >
                ▸ Re-detect kind
              </button>
              {' · '}
              <kbd>⌘</kbd>/<kbd>Ctrl</kbd>+<kbd>Enter</kbd> save · <kbd>Esc</kbd> cancel
              {!canPersist && (
                <> · <span className="dialogue-edit-mute">in-memory only{selected.isTutorial ? ' (tutorial)' : ''}</span></>
              )}
            </p>
          ) : (
            <p className="dialogue-note">{gardenReflection(selected)}</p>
          )}
        </div>

        <div className="dialogue-actions">
          {isEditing ? (
            <>
              <button
                className="game-btn"
                onClick={onSaveEdit}
                disabled={isSavingEdit}
                aria-disabled={isSavingEdit}
                title={isSavingEdit ? 'Saving…' : 'Save (⌘/Ctrl+Enter)'}
              >
                <span className="game-btn-face">
                  <Check size={14} /> {isSavingEdit ? 'Saving' : 'Save'}
                </span>
              </button>
              <button
                className="game-btn danger"
                onClick={onCancelEdit}
                disabled={isSavingEdit}
                title="Cancel (Esc)"
              >
                <span className="game-btn-face">
                  <X size={14} /> Cancel
                </span>
              </button>
            </>
          ) : (
            <>
              <button
                className="game-btn"
                onClick={onStartEdit}
                title="Edit title and text"
              >
                <span className="game-btn-face">
                  <Pencil size={14} /> Edit
                </span>
              </button>
              <button className="game-btn" onClick={onWater} aria-pressed={selected.watered}>
                <span className="game-btn-face">
                  <Droplets size={14} /> {selected.watered ? 'Dry' : 'Water'}
                </span>
              </button>
              <button
                className="game-btn gold"
                onClick={onBoost}
                disabled={maxed}
                aria-disabled={maxed}
                title={maxed ? 'Already at max importance' : 'Mark important'}
              >
                <span className="game-btn-face">
                  <Sparkles size={14} /> {maxed ? 'Maxed' : 'Important'}
                </span>
              </button>
              <button className="game-btn danger" onClick={onCompost}>
                <span className="game-btn-face">
                  <Archive size={14} /> Compost
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/* Small dim row beneath the dialogue body that surfaces first-seen and
   last-updated relative timestamps. If the memory has never been mutated
   since creation (firstSeen === lastUpdated), only the "Remembered" half
   renders, to keep the strip quiet. */
function DialogueTimestamps({ memory, nowMs }: { memory: MemorySeed; nowMs: number }) {
  const remembered = formatRelativeTime(memory.firstSeen, nowMs);
  const updated = formatRelativeTime(memory.lastUpdated, nowMs);
  const hasBeenTouched = memory.lastUpdated !== memory.firstSeen;
  return (
    <p className="dialogue-timestamps" aria-label="When this memory was first seen and last updated">
      <span title={formatAbsoluteTime(memory.firstSeen)}>
        Remembered <span className="dialogue-ts-val">{remembered}</span>
      </span>
      {hasBeenTouched && (
        <>
          <span className="dialogue-ts-sep" aria-hidden> · </span>
          <span title={formatAbsoluteTime(memory.lastUpdated)}>
            Updated <span className="dialogue-ts-val">{updated}</span>
          </span>
        </>
      )}
    </p>
  );
}

/* Truncate helper for the Forget confirm preview — keep at most `n` chars
   and append a single ellipsis. Avoids cutting at mid-word when possible. */
function truncatePreview(s: string, n = 240): string {
  if (s.length <= n) return s;
  const slice = s.slice(0, n);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > n - 40 ? slice.slice(0, lastSpace) : slice;
  return cut.trimEnd() + '…';
}

/* Forget-confirm modal. Renders as a pixel-art game dialogue stacked over the
   scene, with a 1-second hold-to-confirm pattern on the destructive button:
   the user must press-and-hold the "Forget" button for ~1s before the action
   fires. Mouse-up before the timer empties cancels. Esc / Cancel close.
   Focus is trapped while open and the initial focus is Cancel (safer default
   than the destructive option). */
function ForgetDialog({
  memory,
  onCancel,
  onConfirm,
}: {
  memory: MemorySeed;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [holdProgress, setHoldProgress] = useState(0); // 0..1
  const holdRafRef = useRef<number | null>(null);
  const holdStartRef = useRef<number | null>(null);
  const HOLD_MS = 1000;

  function startHold() {
    if (holdRafRef.current !== null) return;
    holdStartRef.current = performance.now();
    const tick = (now: number) => {
      const start = holdStartRef.current;
      if (start === null) return;
      const t = Math.min(1, (now - start) / HOLD_MS);
      setHoldProgress(t);
      if (t >= 1) {
        holdRafRef.current = null;
        holdStartRef.current = null;
        onConfirm();
        return;
      }
      holdRafRef.current = requestAnimationFrame(tick);
    };
    holdRafRef.current = requestAnimationFrame(tick);
  }
  function cancelHold() {
    if (holdRafRef.current !== null) cancelAnimationFrame(holdRafRef.current);
    holdRafRef.current = null;
    holdStartRef.current = null;
    setHoldProgress(0);
  }
  useEffect(() => () => cancelHold(), []);

  // Focus the Cancel button on mount and trap Tab navigation between the two
  // buttons so focus can't wander to the scene behind the modal.
  useEffect(() => {
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        return;
      }
      if (e.key === 'Tab') {
        const focusables = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLElement[];
        if (focusables.length === 0) return;
        const idx = focusables.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        const next = e.shiftKey
          ? focusables[(idx - 1 + focusables.length) % focusables.length]
          : focusables[(idx + 1) % focusables.length];
        next.focus();
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  // Click-outside the inner frame cancels (clicks on the backdrop).
  function onBackdropMouseDown(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onCancel();
  }

  return (
    <div
      className="forget-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="forget-title"
      onMouseDown={onBackdropMouseDown}
    >
      <div className="forget-frame" ref={frameRef}>
        <header className="forget-header">
          <span className="forget-glyph"><Trash2 size={16} strokeWidth={2.5} /></span>
          <h2 id="forget-title" className="forget-title">Forget this memory?</h2>
        </header>
        <div className="forget-preview">
          <p className="forget-memory-title">{memory.title}</p>
          <p className="forget-memory-text">{truncatePreview(memory.text)}</p>
        </div>
        <p className="forget-warn">
          This permanently removes the memory and rewrites the source file.
          Compost is recoverable; Forget is not.
        </p>
        <div className="forget-actions">
          <button
            ref={cancelRef}
            type="button"
            className="game-btn forget-cancel"
            onClick={onCancel}
          >
            <span className="game-btn-face">
              <X size={14} /> Cancel
            </span>
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="game-btn forget-confirm"
            onMouseDown={startHold}
            onMouseUp={cancelHold}
            onMouseLeave={cancelHold}
            onTouchStart={startHold}
            onTouchEnd={cancelHold}
            onTouchCancel={cancelHold}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                if (!e.repeat) startHold();
              }
            }}
            onKeyUp={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                cancelHold();
              }
            }}
            onBlur={cancelHold}
            aria-label="Hold to confirm Forget"
            title="Press and hold for 1 second to confirm"
          >
            <span
              className="forget-confirm-fill"
              style={{ transform: `scaleX(${holdProgress})` }}
              aria-hidden
            />
            <span className="game-btn-face">
              <Trash2 size={14} /> {holdProgress > 0 ? 'Hold…' : 'Forget (hold)'}
            </span>
          </button>
        </div>
        <p className="forget-hint">Press and hold <kbd>Forget</kbd> for 1 second to confirm. <kbd>Esc</kbd> cancels.</p>
      </div>
    </div>
  );
}

/* Auto-growing textarea (min 4 rows, max 16) — used by the inline edit
   mode in the inspector so the field expands as the user types and stops
   at a reasonable cap rather than scrolling forever. */
function AutoTextarea({
  value,
  onChange,
  onKeyDown,
  className,
  placeholder,
  ariaLabel,
  minRows,
  maxRows,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  minRows: number;
  maxRows: number;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reset before measuring so shrinking works.
    el.style.height = 'auto';
    const lineH = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const max = lineH * maxRows;
    const next = Math.min(max, el.scrollHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [value, maxRows]);
  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      aria-label={ariaLabel}
      rows={minRows}
      autoFocus
    />
  );
}

function WelcomeOverlay({ isExiting, onEnter }: { isExiting: boolean; onEnter: () => void }) {
  useEffect(() => {
    if (isExiting) return; // already on the way out — ignore further input
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onEnter();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onEnter, isExiting]);

  return (
    <div
      className={`welcome-overlay ${isExiting ? 'is-exiting' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Memory Garden welcome screen"
    >
      <div className="welcome-stars" aria-hidden />
      <div className="welcome-card">
        <div className="welcome-emblem">
          <PixelLogo big />
        </div>
        <p className="welcome-eyebrow">▸ A Pixel Garden of AI Memories</p>
        <h1 className="welcome-title">MEMORY GARDEN</h1>
        <p className="welcome-sub">
          Wander your assistant's memory. Tend what matters, compost what's stale,
          let the fireflies remember the rest.
        </p>

        <div className="welcome-legend" aria-label="What grows in the garden">
          <p className="welcome-legend-title">▸ What grows here</p>
          <ul className="welcome-legend-grid">
            {KIND_ORDER.map((kind) => {
              const S = KIND_META[kind].Sprite;
              return (
                <li key={kind} className="welcome-legend-row">
                  <span className="welcome-legend-icon"><S /></span>
                  <span className="welcome-legend-text">
                    <span className="welcome-legend-name">{KIND_LABEL[kind]}</span>
                    <span className="welcome-legend-blurb">{KIND_BLURB[kind]}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <button className="welcome-cta" onClick={onEnter} autoFocus>
          <span className="welcome-cta-face">▶ Enter Memory Garden</span>
        </button>
        <p className="welcome-hint">
          Move with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> · Inspect with <kbd>Space</kbd>
        </p>
        <p className="welcome-foot">local-first · no telemetry · MEMORY.md stays on your machine</p>
      </div>
    </div>
  );
}

function AllSprite() {
  return (
    <PixelSvg size={TILE} viewBox="0 0 16 16">
      <rect x="2" y="11" width="3" height="3" fill="#4a8536" />
      <rect x="6" y="9" width="3" height="5" fill="#5fa148" />
      <rect x="10" y="6" width="4" height="8" fill="#6dac4a" />
      <rect x="7" y="6" width="1" height="3" fill="#d04373" />
      <rect x="11" y="3" width="2" height="3" fill="#8a5fc8" />
      <rect x="3" y="9" width="1" height="2" fill="#f5d77a" />
    </PixelSvg>
  );
}

function WaterDrop() {
  return (
    <PixelSvg size={TILE} viewBox="0 0 16 16">
      <rect x="7" y="3" width="2" height="2" fill="#3f7fa8" />
      <rect x="6" y="5" width="4" height="2" fill="#3f7fa8" />
      <rect x="5" y="7" width="6" height="4" fill="#3f7fa8" />
      <rect x="6" y="11" width="4" height="1" fill="#3f7fa8" />
      <rect x="6" y="6" width="2" height="2" fill="#a7d6ee" />
      <rect x="6" y="6" width="1" height="1" fill="#ffffff" />
      <rect x="5" y="7" width="6" height="1" fill="#5fa1c8" />
      <rect x="5" y="11" width="6" height="1" fill={OUT} opacity=".55" />
    </PixelSvg>
  );
}

function PixelLogo({ big = false }: { big?: boolean }) {
  const size = big ? 128 : 48;
  return (
    <div className={`pixel-logo ${big ? 'pixel-logo-big' : ''}`} aria-hidden>
      <img
        src="/logo.png"
        alt=""
        width={size}
        height={size}
        draggable={false}
        className="pixel-logo-img"
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
