import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Upload, Sparkles, Droplets, Archive, Search } from 'lucide-react';
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
};

type PlacedMemory = MemorySeed & { row: number; col: number };

const SAMPLE_MEMORY = `# MEMORY.md
- User likes creating small useful AI/productivity apps with nice interfaces.
- Remember: GitHub is connected as ashleytoh.
- Open loop: connect phone node with Tailscale later.
- Preference: concise replies by default, more depth when asked.
- Project: local-brief is a local-first open-loop briefing CLI.
- Goal: explore emotionally legible AI memory visualization.
- Moment: user said "ure amazing" after calendar setup.
`;

/* ────────────────────────────────────────────────────────────────
   Tile grid — single source of truth for the scene
   ────────────────────────────────────────────────────────────── */

const COLS = 18;
const ROWS = 11;
const TILE = 36;

// G = grass · P = path stone · W = water · S = sand/shore · D = dirt patch
const TERRAIN: ReadonlyArray<string> = [
  'WWWWSGGGGGGGGGGGGS',
  'WWWWSGGGGGGGGGGGGG',
  'WWWSGGGGGGGGGGGGGG',
  'WWSGGGGGGGDDDDGGGG',
  'WSGGGGGGGGGGGGGGGG',
  'GGGGGGGGGGPGGGGGGG',
  'GGGGGGGGGGPGGGGGGG',
  'GGGGGGGGGPPGGGGGGG',
  'GGGGGGGGGPGGGGGGGG',
  'GGGGGGGGPPGGGGGGGG',
  'GGGGGGGGPGGGGGGGGG',
];

// Cottage occupies the upper-middle of the map; its footprint is solid.
const COTTAGE = { row: 0, col: 8, w: 4, h: 3 };

// Solid scene props the player cannot walk through.
const FENCE_TILES: ReadonlyArray<readonly [number, number]> = [
  [10, 14],
  [10, 16],
];

const DIR_VEC: Record<Direction, { dr: number; dc: number }> = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
};

const MOVE_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'w', 'a', 's', 'd',
]);

const INSPECT_KEYS = new Set([' ', 'Enter', 'e']);

function tileAt(row: number, col: number): string | null {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return null;
  return TERRAIN[row][col];
}

function inCottage(row: number, col: number): boolean {
  return (
    row >= COTTAGE.row &&
    row < COTTAGE.row + COTTAGE.h &&
    col >= COTTAGE.col &&
    col < COTTAGE.col + COTTAGE.w
  );
}

function passable(row: number, col: number, placed: PlacedMemory[]): boolean {
  const t = tileAt(row, col);
  if (t === null) return false;
  if (t === 'W') return false;
  if (inCottage(row, col)) return false;
  if (FENCE_TILES.some(([fr, fc]) => fr === row && fc === col)) return false;
  if (placed.some((m) => !m.archived && m.row === row && m.col === col)) return false;
  return true;
}

/* Garden spots: a fixed, hand-tuned set of tiles where memories can be planted.
   Tuned to spread plants over the open grass while keeping the path and
   cottage approach clear. */
const GARDEN_SPOTS: ReadonlyArray<{ row: number; col: number }> = [
  { row: 5, col: 14 },
  { row: 6, col: 4 },
  { row: 7, col: 13 },
  { row: 8, col: 6 },
  { row: 9, col: 14 },
  { row: 4, col: 6 },
  { row: 10, col: 4 },
  { row: 5, col: 16 },
  { row: 7, col: 16 },
  { row: 9, col: 4 },
  { row: 4, col: 12 },
  { row: 8, col: 16 },
  { row: 6, col: 13 },
  { row: 10, col: 12 },
  { row: 5, col: 6 },
];

/* Assign each non-archived memory a stable spot based on its position in the
   full memories array, so filtering/searching never makes plants jump around. */
function layoutMemories(seeds: MemorySeed[]): PlacedMemory[] {
  let nonArchivedIndex = 0;
  const placed: PlacedMemory[] = [];
  for (const m of seeds) {
    if (m.archived) continue;
    const spot = GARDEN_SPOTS[nonArchivedIndex % GARDEN_SPOTS.length];
    placed.push({ ...m, ...spot });
    nonArchivedIndex++;
  }
  return placed;
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
      } satisfies MemorySeed;
    });
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

function GrassTile({ variant, size = TILE }: { variant: number; size?: number }) {
  // Three subtle grass variants to break up tiling.
  const base = '#6aa84a';
  const dark = '#4f8a35';
  const light = '#8cc55c';
  const blade = '#3e6c27';
  return (
    <PixelSvg size={size}>
      <rect width="16" height="16" fill={base} />
      {/* speckle / dappled darker patches */}
      <rect x="0" y="0" width="16" height="2" fill={dark} opacity="0.35" />
      <rect x="12" y="13" width="4" height="3" fill={dark} opacity="0.45" />
      <rect x="2" y="9" width="3" height="2" fill={dark} opacity="0.4" />
      <rect x="9" y="4" width="2" height="2" fill={dark} opacity="0.35" />
      {/* highlight tufts */}
      {variant === 0 && (
        <>
          <rect x="3" y="3" width="1" height="2" fill={light} />
          <rect x="4" y="2" width="1" height="2" fill={light} />
          <rect x="11" y="7" width="1" height="1" fill={light} />
          <rect x="6" y="11" width="1" height="2" fill={blade} />
          <rect x="7" y="12" width="1" height="2" fill={blade} />
        </>
      )}
      {variant === 1 && (
        <>
          <rect x="10" y="10" width="1" height="2" fill={light} />
          <rect x="11" y="9" width="1" height="2" fill={light} />
          <rect x="2" y="6" width="1" height="2" fill={blade} />
          <rect x="13" y="3" width="1" height="2" fill={blade} />
          <rect x="5" y="14" width="2" height="1" fill={blade} opacity=".6" />
        </>
      )}
      {variant === 2 && (
        <>
          <rect x="13" y="11" width="1" height="2" fill={light} />
          <rect x="14" y="10" width="1" height="2" fill={light} />
          <rect x="6" y="5" width="1" height="2" fill={blade} />
          <rect x="2" y="13" width="1" height="2" fill={blade} />
          <rect x="9" y="8" width="2" height="1" fill={light} opacity=".7" />
        </>
      )}
    </PixelSvg>
  );
}

function PathTile({ size = TILE }: { size?: number }) {
  return (
    <PixelSvg size={size}>
      <rect width="16" height="16" fill="#c69b6d" />
      <rect x="0" y="0" width="16" height="2" fill="#a47a4d" opacity=".7" />
      <rect x="0" y="14" width="16" height="2" fill="#a47a4d" opacity=".55" />
      {/* pebbles */}
      <rect x="3" y="4" width="3" height="2" fill="#8a6a44" />
      <rect x="3" y="4" width="3" height="1" fill="#b58a5a" />
      <rect x="10" y="9" width="3" height="2" fill="#8a6a44" />
      <rect x="10" y="9" width="3" height="1" fill="#b58a5a" />
      <rect x="7" y="12" width="2" height="1" fill="#8a6a44" />
      <rect x="11" y="2" width="2" height="1" fill="#8a6a44" />
    </PixelSvg>
  );
}

function WaterTile({ variant, size = TILE }: { variant: number; size?: number }) {
  return (
    <PixelSvg size={size}>
      <rect width="16" height="16" fill="#3f7fa8" />
      <rect width="16" height="2" fill="#2b6488" />
      <rect y="14" width="16" height="2" fill="#2b6488" />
      {variant === 0 && (
        <>
          <rect x="2" y="5" width="3" height="1" fill="#a7d6ee" opacity=".8" />
          <rect x="9" y="9" width="4" height="1" fill="#a7d6ee" opacity=".7" />
          <rect x="6" y="12" width="2" height="1" fill="#a7d6ee" opacity=".6" />
        </>
      )}
      {variant === 1 && (
        <>
          <rect x="4" y="3" width="2" height="1" fill="#a7d6ee" opacity=".7" />
          <rect x="10" y="6" width="3" height="1" fill="#a7d6ee" opacity=".75" />
          <rect x="3" y="11" width="3" height="1" fill="#a7d6ee" opacity=".7" />
        </>
      )}
      {variant === 2 && (
        <>
          <rect x="6" y="4" width="3" height="1" fill="#a7d6ee" opacity=".8" />
          <rect x="2" y="8" width="2" height="1" fill="#a7d6ee" opacity=".7" />
          <rect x="11" y="12" width="3" height="1" fill="#a7d6ee" opacity=".7" />
        </>
      )}
    </PixelSvg>
  );
}

function SandTile({ size = TILE }: { size?: number }) {
  return (
    <PixelSvg size={size}>
      <rect width="16" height="16" fill="#d9b377" />
      <rect width="16" height="2" fill="#b78f54" opacity=".7" />
      <rect y="14" width="16" height="2" fill="#b78f54" opacity=".55" />
      <rect x="4" y="6" width="2" height="1" fill="#b78f54" />
      <rect x="11" y="10" width="2" height="1" fill="#b78f54" />
      <rect x="7" y="3" width="1" height="1" fill="#ecd29b" />
      <rect x="13" y="5" width="1" height="1" fill="#ecd29b" />
    </PixelSvg>
  );
}

function DirtTile({ size = TILE }: { size?: number }) {
  return (
    <PixelSvg size={size}>
      <rect width="16" height="16" fill="#8a5e3a" />
      <rect width="16" height="2" fill="#6b4626" />
      <rect y="14" width="16" height="2" fill="#6b4626" />
      <rect x="3" y="5" width="2" height="1" fill="#6b4626" />
      <rect x="10" y="9" width="3" height="1" fill="#6b4626" />
      <rect x="6" y="12" width="2" height="1" fill="#6b4626" />
      <rect x="11" y="3" width="2" height="1" fill="#a87a52" />
      <rect x="5" y="9" width="1" height="1" fill="#a87a52" />
    </PixelSvg>
  );
}

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

function Lavender() {
  return (
    <PixelSvg size={TILE} viewBox="0 0 16 16">
      {/* leaves */}
      <rect x="3" y="13" width="3" height="1" fill="#4f8a35" />
      <rect x="2" y="12" width="1" height="2" fill={OUT} />
      <rect x="6" y="12" width="1" height="2" fill={OUT} />
      {/* stem */}
      <rect x="7" y="8" width="2" height="6" fill="#3e6c27" />
      <rect x="6" y="8" width="1" height="6" fill={OUT} />
      <rect x="9" y="8" width="1" height="6" fill={OUT} />
      {/* flower outline */}
      <rect x="5" y="1" width="6" height="1" fill={OUT} />
      <rect x="4" y="2" width="1" height="6" fill={OUT} />
      <rect x="11" y="2" width="1" height="6" fill={OUT} />
      <rect x="5" y="8" width="6" height="1" fill={OUT} />
      {/* flower fill */}
      <rect x="5" y="2" width="6" height="2" fill="#8a5fc8" />
      <rect x="5" y="4" width="6" height="2" fill="#a079d9" />
      <rect x="5" y="6" width="6" height="2" fill="#8a5fc8" />
      <rect x="6" y="3" width="1" height="1" fill="#d0b3ff" />
      <rect x="9" y="5" width="1" height="1" fill="#d0b3ff" />
      <rect x="7" y="7" width="1" height="1" fill="#d0b3ff" />
      <rect x="6" y="14" width="4" height="1" fill={OUT} opacity=".35" />
    </PixelSvg>
  );
}

function Oak() {
  return (
    <PixelSvg size={TILE} viewBox="0 0 16 16">
      {/* trunk */}
      <rect x="6" y="10" width="4" height="5" fill="#6b4218" />
      <rect x="5" y="10" width="1" height="5" fill={OUT} />
      <rect x="10" y="10" width="1" height="5" fill={OUT} />
      <rect x="6" y="15" width="4" height="1" fill={OUT} />
      <rect x="6" y="11" width="1" height="3" fill="#4a2c10" />
      {/* canopy outline */}
      <rect x="3" y="3" width="10" height="1" fill={OUT} />
      <rect x="2" y="4" width="1" height="6" fill={OUT} />
      <rect x="13" y="4" width="1" height="6" fill={OUT} />
      <rect x="3" y="10" width="10" height="1" fill={OUT} />
      <rect x="4" y="2" width="1" height="1" fill={OUT} />
      <rect x="11" y="2" width="1" height="1" fill={OUT} />
      <rect x="5" y="1" width="6" height="1" fill={OUT} />
      {/* canopy fill */}
      <rect x="3" y="4" width="10" height="6" fill="#4a8536" />
      <rect x="4" y="3" width="1" height="1" fill="#4a8536" />
      <rect x="5" y="2" width="6" height="2" fill="#4a8536" />
      <rect x="11" y="3" width="1" height="1" fill="#4a8536" />
      {/* highlights */}
      <rect x="4" y="4" width="2" height="2" fill="#6dac4a" />
      <rect x="8" y="5" width="2" height="2" fill="#6dac4a" />
      <rect x="3" y="8" width="2" height="1" fill="#3a6a26" />
      <rect x="10" y="8" width="2" height="1" fill="#3a6a26" />
      <rect x="6" y="2" width="2" height="1" fill="#7fc35c" />
    </PixelSvg>
  );
}

function Sapling() {
  return (
    <PixelSvg size={TILE} viewBox="0 0 16 16">
      <rect x="7" y="9" width="2" height="6" fill="#3e6c27" />
      <rect x="6" y="9" width="1" height="6" fill={OUT} />
      <rect x="9" y="9" width="1" height="6" fill={OUT} />
      {/* leaves */}
      <rect x="3" y="6" width="4" height="3" fill="#4a8536" />
      <rect x="3" y="6" width="4" height="1" fill="#6dac4a" />
      <rect x="2" y="7" width="1" height="2" fill={OUT} />
      <rect x="3" y="5" width="2" height="1" fill={OUT} />
      <rect x="5" y="9" width="2" height="1" fill={OUT} />
      <rect x="9" y="6" width="4" height="3" fill="#4a8536" />
      <rect x="9" y="6" width="4" height="1" fill="#6dac4a" />
      <rect x="13" y="7" width="1" height="2" fill={OUT} />
      <rect x="11" y="5" width="2" height="1" fill={OUT} />
      <rect x="9" y="9" width="2" height="1" fill={OUT} />
      <rect x="6" y="15" width="4" height="1" fill={OUT} opacity=".35" />
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

function Mushroom() {
  // Identity shrine: a chunky red-cap mushroom.
  return (
    <PixelSvg size={TILE} viewBox="0 0 16 16">
      {/* stem */}
      <rect x="6" y="10" width="4" height="4" fill="#f5e7c1" />
      <rect x="5" y="10" width="1" height="4" fill={OUT} />
      <rect x="10" y="10" width="1" height="4" fill={OUT} />
      <rect x="6" y="14" width="4" height="1" fill={OUT} />
      <rect x="6" y="11" width="1" height="3" fill="#d9c79a" />
      {/* cap outline */}
      <rect x="3" y="9" width="10" height="1" fill={OUT} />
      <rect x="2" y="6" width="1" height="3" fill={OUT} />
      <rect x="13" y="6" width="1" height="3" fill={OUT} />
      <rect x="3" y="5" width="1" height="1" fill={OUT} />
      <rect x="12" y="5" width="1" height="1" fill={OUT} />
      <rect x="4" y="4" width="8" height="1" fill={OUT} />
      <rect x="6" y="3" width="4" height="1" fill={OUT} />
      {/* cap fill */}
      <rect x="3" y="6" width="10" height="3" fill="#c33a3a" />
      <rect x="4" y="5" width="8" height="1" fill="#c33a3a" />
      <rect x="6" y="4" width="4" height="1" fill="#c33a3a" />
      <rect x="4" y="6" width="2" height="1" fill="#e16060" />
      <rect x="7" y="4" width="2" height="1" fill="#e16060" />
      {/* spots */}
      <rect x="5" y="7" width="1" height="1" fill="#fff8d5" />
      <rect x="9" y="6" width="1" height="1" fill="#fff8d5" />
      <rect x="10" y="8" width="2" height="1" fill="#fff8d5" />
    </PixelSvg>
  );
}

const KIND_META: Record<MemoryKind, { label: string; Sprite: React.FC; chip: string }> = {
  preference: { label: 'Preference', Sprite: Tulip, chip: '✿' },
  person: { label: 'Person', Sprite: Lavender, chip: '❀' },
  project: { label: 'Project', Sprite: Oak, chip: '✦' },
  goal: { label: 'Goal', Sprite: Sapling, chip: '✶' },
  'open-loop': { label: 'Open Loop', Sprite: Wilted, chip: '!' },
  moment: { label: 'Moment', Sprite: Firefly, chip: '★' },
  identity: { label: 'Identity', Sprite: Mushroom, chip: '✦' },
};

const MOOD_LABEL: Record<Mood, string> = {
  joy: 'Joyful',
  care: 'Tender',
  curious: 'Curious',
  stress: 'Needs care',
  focus: 'Focused',
  neutral: 'Quiet',
};

/* — Player sprite — 4 facings, 2-frame walk — */

function Player({ facing, frame }: { facing: Direction; frame: number }) {
  // We draw "down" and "up" silhouettes; left/right reuse a side silhouette.
  // The frame (0/1) shifts a foot pixel for a subtle walk cycle.
  const SKIN = '#f1c89a';
  const SKIN_S = '#c79570';
  const HAT = '#7c4a1f';
  const HAT_H = '#a06d3a';
  const HAIR = '#3a1f0a';
  const SHIRT = '#c14b3a';
  const SHIRT_S = '#8a2f24';
  const PANTS = '#324a6c';
  const PANTS_S = '#1f3148';
  const BOOT = '#1b0e06';

  const footLeft = frame === 0 ? 0 : 1;
  const footRight = frame === 0 ? 1 : 0;

  if (facing === 'down') {
    return (
      <PixelSvg size={TILE} viewBox="0 0 16 16">
        {/* shadow */}
        <ellipse cx="8" cy="15" rx="3.5" ry="1" fill={OUT} opacity=".35" />
        {/* head */}
        <rect x="5" y="3" width="6" height="4" fill={SKIN} />
        <rect x="4" y="3" width="1" height="4" fill={OUT} />
        <rect x="11" y="3" width="1" height="4" fill={OUT} />
        <rect x="5" y="2" width="6" height="1" fill={OUT} />
        <rect x="5" y="7" width="6" height="1" fill={SKIN_S} />
        {/* eyes */}
        <rect x="6" y="5" width="1" height="1" fill={OUT} />
        <rect x="9" y="5" width="1" height="1" fill={OUT} />
        {/* hat */}
        <rect x="4" y="1" width="8" height="2" fill={HAT} />
        <rect x="3" y="2" width="10" height="1" fill={HAT} />
        <rect x="3" y="2" width="10" height="1" fill={HAT_H} opacity=".0" />
        <rect x="4" y="1" width="8" height="1" fill={HAT_H} />
        <rect x="3" y="3" width="10" height="1" fill={OUT} />
        <rect x="3" y="1" width="1" height="2" fill={OUT} />
        <rect x="12" y="1" width="1" height="2" fill={OUT} />
        <rect x="4" y="0" width="8" height="1" fill={OUT} />
        {/* hair peek */}
        <rect x="5" y="4" width="6" height="1" fill={HAIR} />
        {/* body / shirt */}
        <rect x="4" y="8" width="8" height="4" fill={SHIRT} />
        <rect x="3" y="8" width="1" height="4" fill={OUT} />
        <rect x="12" y="8" width="1" height="4" fill={OUT} />
        <rect x="4" y="7" width="8" height="1" fill={OUT} />
        <rect x="4" y="11" width="8" height="1" fill={SHIRT_S} />
        {/* arms */}
        <rect x="3" y="9" width="1" height="2" fill={SKIN} />
        <rect x="12" y="9" width="1" height="2" fill={SKIN} />
        {/* pants */}
        <rect x="5" y="12" width="6" height="2" fill={PANTS} />
        <rect x="4" y="12" width="1" height="2" fill={OUT} />
        <rect x="11" y="12" width="1" height="2" fill={OUT} />
        <rect x="5" y="13" width="6" height="1" fill={PANTS_S} />
        {/* boots */}
        <rect x="5" y={14 - footLeft} width="2" height={1 + footLeft} fill={BOOT} />
        <rect x="9" y={14 - footRight} width="2" height={1 + footRight} fill={BOOT} />
      </PixelSvg>
    );
  }

  if (facing === 'up') {
    return (
      <PixelSvg size={TILE} viewBox="0 0 16 16">
        <ellipse cx="8" cy="15" rx="3.5" ry="1" fill={OUT} opacity=".35" />
        {/* head back */}
        <rect x="5" y="3" width="6" height="4" fill={HAIR} />
        <rect x="4" y="3" width="1" height="4" fill={OUT} />
        <rect x="11" y="3" width="1" height="4" fill={OUT} />
        <rect x="5" y="2" width="6" height="1" fill={OUT} />
        <rect x="5" y="7" width="6" height="1" fill={SKIN_S} />
        {/* hat */}
        <rect x="4" y="1" width="8" height="2" fill={HAT} />
        <rect x="3" y="2" width="10" height="1" fill={HAT} />
        <rect x="4" y="1" width="8" height="1" fill={HAT_H} />
        <rect x="3" y="3" width="10" height="1" fill={OUT} />
        <rect x="3" y="1" width="1" height="2" fill={OUT} />
        <rect x="12" y="1" width="1" height="2" fill={OUT} />
        <rect x="4" y="0" width="8" height="1" fill={OUT} />
        {/* body */}
        <rect x="4" y="8" width="8" height="4" fill={SHIRT} />
        <rect x="3" y="8" width="1" height="4" fill={OUT} />
        <rect x="12" y="8" width="1" height="4" fill={OUT} />
        <rect x="4" y="7" width="8" height="1" fill={OUT} />
        <rect x="3" y="9" width="1" height="2" fill={SKIN} />
        <rect x="12" y="9" width="1" height="2" fill={SKIN} />
        <rect x="5" y="12" width="6" height="2" fill={PANTS} />
        <rect x="4" y="12" width="1" height="2" fill={OUT} />
        <rect x="11" y="12" width="1" height="2" fill={OUT} />
        <rect x="5" y={14 - footRight} width="2" height={1 + footRight} fill={BOOT} />
        <rect x="9" y={14 - footLeft} width="2" height={1 + footLeft} fill={BOOT} />
      </PixelSvg>
    );
  }

  // side (right). Flip horizontally for left via CSS.
  return (
    <PixelSvg size={TILE} viewBox="0 0 16 16">
      <ellipse cx="8" cy="15" rx="3.5" ry="1" fill={OUT} opacity=".35" />
      {/* head */}
      <rect x="5" y="3" width="6" height="4" fill={SKIN} />
      <rect x="4" y="3" width="1" height="4" fill={OUT} />
      <rect x="11" y="3" width="1" height="4" fill={OUT} />
      <rect x="5" y="2" width="6" height="1" fill={OUT} />
      <rect x="5" y="7" width="6" height="1" fill={SKIN_S} />
      <rect x="9" y="5" width="1" height="1" fill={OUT} />
      {/* hair side */}
      <rect x="5" y="4" width="3" height="1" fill={HAIR} />
      {/* hat */}
      <rect x="4" y="1" width="8" height="2" fill={HAT} />
      <rect x="3" y="2" width="10" height="1" fill={HAT} />
      <rect x="4" y="1" width="8" height="1" fill={HAT_H} />
      <rect x="3" y="3" width="10" height="1" fill={OUT} />
      <rect x="3" y="1" width="1" height="2" fill={OUT} />
      <rect x="12" y="1" width="1" height="2" fill={OUT} />
      <rect x="4" y="0" width="8" height="1" fill={OUT} />
      {/* body */}
      <rect x="5" y="8" width="6" height="4" fill={SHIRT} />
      <rect x="4" y="8" width="1" height="4" fill={OUT} />
      <rect x="11" y="8" width="1" height="4" fill={OUT} />
      <rect x="5" y="7" width="6" height="1" fill={OUT} />
      <rect x="5" y="11" width="6" height="1" fill={SHIRT_S} />
      <rect x="10" y="9" width="1" height="2" fill={SKIN} />
      <rect x="5" y="12" width="6" height="2" fill={PANTS} />
      <rect x="4" y="12" width="1" height="2" fill={OUT} />
      <rect x="11" y="12" width="1" height="2" fill={OUT} />
      <rect x="6" y={14 - footLeft} width="2" height={1 + footLeft} fill={BOOT} />
      <rect x="9" y={14 - footRight} width="2" height={1 + footRight} fill={BOOT} />
    </PixelSvg>
  );
}

/* — Decorative props — */

function Cottage() {
  // Drawn at COTTAGE.w * TILE wide, COTTAGE.h * TILE tall.
  const w = COTTAGE.w * TILE;
  const h = COTTAGE.h * TILE;
  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 64 48"
      shapeRendering="crispEdges"
      xmlns="http://www.w3.org/2000/svg"
      className="prop-cottage"
    >
      {/* chimney */}
      <rect x="46" y="2" width="6" height="9" fill="#5a2b2b" />
      <rect x="46" y="2" width="6" height="2" fill="#3e1f1f" />
      <rect x="46" y="11" width="6" height="1" fill="#2a1410" />
      <rect x="47" y="0" width="4" height="2" fill="#dcd0a0" opacity=".7" />
      <rect x="46" y="-2" width="6" height="2" fill="#dcd0a0" opacity=".4" />
      {/* roof */}
      <rect x="24" y="6" width="16" height="2" fill="#7a2a2a" />
      <rect x="20" y="8" width="24" height="2" fill="#7a2a2a" />
      <rect x="16" y="10" width="32" height="2" fill="#7a2a2a" />
      <rect x="12" y="12" width="40" height="2" fill="#7a2a2a" />
      <rect x="8" y="14" width="48" height="2" fill="#7a2a2a" />
      <rect x="8" y="14" width="48" height="1" fill="#4a1818" />
      <rect x="25" y="7" width="14" height="1" fill="#a04848" />
      <rect x="21" y="9" width="22" height="1" fill="#a04848" />
      <rect x="17" y="11" width="30" height="1" fill="#a04848" />
      <rect x="13" y="13" width="38" height="1" fill="#a04848" />
      <rect x="9" y="15" width="46" height="1" fill="#a04848" />
      <rect x="7" y="14" width="1" height="2" fill={OUT} />
      <rect x="56" y="14" width="1" height="2" fill={OUT} />
      <rect x="8" y="16" width="48" height="1" fill={OUT} />
      {/* walls */}
      <rect x="10" y="17" width="44" height="28" fill="#c89a66" />
      <rect x="10" y="17" width="44" height="2" fill="#dcb88a" />
      <rect x="10" y="43" width="44" height="2" fill="#8a6438" />
      <rect x="9" y="17" width="1" height="28" fill={OUT} />
      <rect x="54" y="17" width="1" height="28" fill={OUT} />
      <rect x="10" y="45" width="44" height="1" fill={OUT} />
      {/* horizontal wood grain */}
      <rect x="10" y="24" width="44" height="1" fill="#a07a4a" opacity=".5" />
      <rect x="10" y="31" width="44" height="1" fill="#a07a4a" opacity=".5" />
      <rect x="10" y="38" width="44" height="1" fill="#a07a4a" opacity=".5" />
      {/* door */}
      <rect x="28" y="29" width="8" height="16" fill="#5a3418" />
      <rect x="28" y="29" width="8" height="2" fill="#3a1f0c" />
      <rect x="28" y="29" width="1" height="16" fill={OUT} />
      <rect x="35" y="29" width="1" height="16" fill={OUT} />
      <rect x="28" y="28" width="8" height="1" fill={OUT} />
      <rect x="33" y="37" width="1" height="1" fill="#f5d77a" />
      {/* windows */}
      <rect x="14" y="22" width="8" height="7" fill="#1e2b3a" />
      <rect x="14" y="22" width="8" height="2" fill="#f5d77a" opacity=".85" />
      <rect x="14" y="22" width="8" height="7" fill="none" stroke={OUT} strokeWidth="1" />
      <rect x="17" y="22" width="1" height="7" fill={OUT} />
      <rect x="14" y="25" width="8" height="1" fill={OUT} />
      <rect x="42" y="22" width="8" height="7" fill="#1e2b3a" />
      <rect x="42" y="22" width="8" height="2" fill="#f5d77a" opacity=".85" />
      <rect x="42" y="22" width="8" height="7" fill="none" stroke={OUT} strokeWidth="1" />
      <rect x="45" y="22" width="1" height="7" fill={OUT} />
      <rect x="42" y="25" width="8" height="1" fill={OUT} />
      {/* sign */}
      <rect x="38" y="35" width="6" height="4" fill="#dcb88a" />
      <rect x="38" y="35" width="6" height="1" fill="#f5d8a8" />
      <rect x="38" y="35" width="6" height="4" fill="none" stroke={OUT} strokeWidth="1" />
      <rect x="39" y="37" width="4" height="1" fill={OUT} />
    </svg>
  );
}

function PondRim({ size = TILE }: { size?: number }) {
  // A rocky-rim tile to soften pond edges.
  return (
    <PixelSvg size={size}>
      <rect width="16" height="16" fill="#d9b377" />
      <rect x="0" y="0" width="6" height="6" fill="#7c6a55" />
      <rect x="0" y="0" width="6" height="1" fill="#a08c70" />
      <rect x="1" y="6" width="5" height="1" fill={OUT} />
      <rect x="6" y="0" width="1" height="6" fill={OUT} />
      <rect x="9" y="9" width="5" height="4" fill="#7c6a55" />
      <rect x="9" y="9" width="5" height="1" fill="#a08c70" />
      <rect x="9" y="13" width="5" height="1" fill={OUT} />
      <rect x="9" y="9" width="1" height="5" fill={OUT} />
      <rect x="14" y="9" width="1" height="5" fill={OUT} />
    </PixelSvg>
  );
}

function Bush({ size = TILE }: { size?: number }) {
  return (
    <PixelSvg size={size}>
      <rect x="2" y="6" width="12" height="8" fill="#4a8536" />
      <rect x="3" y="5" width="10" height="1" fill="#4a8536" />
      <rect x="2" y="6" width="12" height="1" fill="#6dac4a" />
      <rect x="3" y="4" width="10" height="1" fill={OUT} />
      <rect x="2" y="5" width="1" height="1" fill={OUT} />
      <rect x="13" y="5" width="1" height="1" fill={OUT} />
      <rect x="1" y="6" width="1" height="8" fill={OUT} />
      <rect x="14" y="6" width="1" height="8" fill={OUT} />
      <rect x="2" y="14" width="12" height="1" fill={OUT} />
      <rect x="4" y="7" width="2" height="2" fill="#6dac4a" />
      <rect x="9" y="9" width="2" height="2" fill="#6dac4a" />
      <rect x="11" y="6" width="1" height="1" fill="#3a6a26" />
      <rect x="5" y="11" width="2" height="1" fill="#3a6a26" />
      {/* berries */}
      <rect x="7" y="8" width="1" height="1" fill="#d04373" />
      <rect x="11" y="11" width="1" height="1" fill="#d04373" />
    </PixelSvg>
  );
}

function FencePost({ size = TILE }: { size?: number }) {
  return (
    <PixelSvg size={size}>
      <rect x="3" y="3" width="3" height="11" fill="#a87a52" />
      <rect x="2" y="3" width="1" height="11" fill={OUT} />
      <rect x="6" y="3" width="1" height="11" fill={OUT} />
      <rect x="3" y="2" width="3" height="1" fill={OUT} />
      <rect x="3" y="14" width="3" height="1" fill={OUT} />
      <rect x="3" y="3" width="3" height="1" fill="#d9b377" />
      <rect x="10" y="3" width="3" height="11" fill="#a87a52" />
      <rect x="9" y="3" width="1" height="11" fill={OUT} />
      <rect x="13" y="3" width="1" height="11" fill={OUT} />
      <rect x="10" y="2" width="3" height="1" fill={OUT} />
      <rect x="10" y="14" width="3" height="1" fill={OUT} />
      <rect x="10" y="3" width="3" height="1" fill="#d9b377" />
      <rect x="2" y="6" width="12" height="2" fill="#a87a52" />
      <rect x="2" y="6" width="12" height="1" fill="#d9b377" />
      <rect x="2" y="8" width="12" height="1" fill={OUT} />
      <rect x="2" y="11" width="12" height="2" fill="#a87a52" />
      <rect x="2" y="11" width="12" height="1" fill="#d9b377" />
      <rect x="2" y="13" width="12" height="1" fill={OUT} />
    </PixelSvg>
  );
}

/* ────────────────────────────────────────────────────────────────
   App
   ────────────────────────────────────────────────────────────── */

const PLAYER_START = { row: 10, col: 8 }; // bottom of the path

function App() {
  const [memories, setMemories] = useState<MemorySeed[]>(() => parseMemoryFile('sample/MEMORY.md', SAMPLE_MEMORY));
  const [selectedId, setSelectedId] = useState<string | null>(memories[0]?.id ?? null);
  const [filter, setFilter] = useState<MemoryKind | 'all'>('all');
  const [query, setQuery] = useState('');
  const [splashKey, setSplashKey] = useState(0);

  const [playerPos, setPlayerPos] = useState(PLAYER_START);
  const [facing, setFacing] = useState<Direction>('down');
  const [walking, setWalking] = useState(false);
  const [step, setStep] = useState(0);

  // Layout: assign every non-archived memory a stable spot, then filter.
  // This keeps plant positions steady across search and filter changes.
  const allPlaced = useMemo<PlacedMemory[]>(() => layoutMemories(memories), [memories]);
  const placed = useMemo<PlacedMemory[]>(
    () =>
      allPlaced.filter(
        (m) =>
          (filter === 'all' || m.kind === filter) &&
          `${m.title} ${m.text}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [allPlaced, filter, query],
  );

  // Focused = memory in front of player (preferring the facing direction).
  const focused = useMemo<PlacedMemory | null>(() => {
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
  }, [placed, playerPos, facing]);

  // Selection is derived from the visible (placed) memories. If the selected
  // memory was just composted or filtered out, advance to the first visible
  // one so the inspector never lingers on something no longer in the garden.
  const selected = useMemo<PlacedMemory | undefined>(
    () => placed.find((m) => m.id === selectedId) ?? placed[0],
    [placed, selectedId],
  );

  // Refs for keyboard handler closures.
  const posRef = useRef(playerPos);
  const facingRef = useRef<Direction>(facing);
  const placedRef = useRef(placed);
  const focusedRef = useRef(focused);
  const movingRef = useRef(false);
  const stepRef = useRef(0);
  const keysRef = useRef<Set<string>>(new Set());

  useEffect(() => { posRef.current = playerPos; }, [playerPos]);
  useEffect(() => { facingRef.current = facing; }, [facing]);
  useEffect(() => { placedRef.current = placed; }, [placed]);
  useEffect(() => { focusedRef.current = focused; }, [focused]);

  // Keyboard listeners (set up once).
  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (MOVE_KEYS.has(k)) {
        keysRef.current.add(k);
        e.preventDefault();
        return;
      }
      if (INSPECT_KEYS.has(k)) {
        e.preventDefault();
        const f = focusedRef.current;
        if (f) setSelectedId(f.id);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      keysRef.current.delete(k);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
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

      if (cooldown === 0) {
        const ks = keysRef.current;
        let dir: Direction | null = null;
        if (ks.has('ArrowUp') || ks.has('w')) dir = 'up';
        else if (ks.has('ArrowDown') || ks.has('s')) dir = 'down';
        else if (ks.has('ArrowLeft') || ks.has('a')) dir = 'left';
        else if (ks.has('ArrowRight') || ks.has('d')) dir = 'right';

        if (dir) {
          facingRef.current = dir;
          setFacing(dir);
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

  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    const next: MemorySeed[] = [];
    for (const file of Array.from(files)) {
      const text = await file.text();
      next.push(...parseMemoryFile(file.name, text));
    }
    setMemories(next.length ? next : memories);
    setSelectedId(next[0]?.id ?? null);
  }

  function updateMemory(id: string, patch: Partial<MemorySeed>) {
    setMemories((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function waterMemory() {
    if (!selected) return;
    updateMemory(selected.id, { watered: !selected.watered });
    if (!selected.watered) setSplashKey((k) => k + 1);
  }

  /* Pre-computed scene pieces */
  const tileGrid = useMemo(() => {
    const rows: React.ReactNode[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = TERRAIN[r][c];
        const key = `${r}-${c}`;
        const left = c * TILE;
        const top = r * TILE;
        const variant = (r * 7 + c * 13) % 3;
        let node: React.ReactNode = null;
        if (t === 'G') node = <GrassTile variant={variant} />;
        else if (t === 'P') node = <PathTile />;
        else if (t === 'W') node = <WaterTile variant={variant} />;
        else if (t === 'S') node = <SandTile />;
        else if (t === 'D') node = <DirtTile />;
        rows.push(
          <div key={key} className="tile" style={{ left, top, width: TILE, height: TILE }}>
            {node}
          </div>,
        );
      }
    }
    return rows;
  }, []);

  /* Static decorations (fence around south edge, a bush or two) */
  const decorations = useMemo(() => {
    const pieces: Array<{ key: string; row: number; col: number; el: React.ReactNode }> = [];
    // bushes near pond shore
    pieces.push({ key: 'bush-1', row: 4, col: 3, el: <Bush /> });
    pieces.push({ key: 'bush-2', row: 0, col: 17, el: <Bush /> });
    pieces.push({ key: 'bush-3', row: 10, col: 0, el: <Bush /> });
    // pond rim accents
    pieces.push({ key: 'rim-1', row: 1, col: 4, el: <PondRim /> });
    pieces.push({ key: 'rim-2', row: 3, col: 3, el: <PondRim /> });
    // fence along right edge bottom — kept in lockstep with FENCE_TILES so
    // collision and visuals never drift apart.
    FENCE_TILES.forEach(([r, c]) => {
      pieces.push({ key: `fence-${r}-${c}`, row: r, col: c, el: <FencePost /> });
    });
    return pieces;
  }, []);

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
    <main className="app-shell">
      <header className="hero">
        <div className="hero-banner">
          <div className="hero-banner-inner">
            <div className="hero-title-row">
              <PixelLogo />
              <div>
                <p className="eyebrow">Memory Garden</p>
                <h1>See what your AI remembers.</h1>
              </div>
            </div>
            <p className="subtitle">
              Walk with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or the arrow keys. Approach a memory and press <kbd>Space</kbd> to read it.
            </p>
            <p className="hero-count">{placed.length} memories planted</p>
          </div>
          <label className="upload-button">
            <span className="upload-button-face">
              <Upload size={16} /> Import MEMORY.md
            </span>
            <input type="file" accept=".md,.txt" multiple onChange={(event) => void importFiles(event.target.files)} />
          </label>
        </div>
      </header>

      <section className="toolbar">
        <div className="search-box">
          <Search size={14} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the garden..." />
        </div>
        <div className="filters">
          {(['all', ...Object.keys(KIND_META)] as Array<MemoryKind | 'all'>).map((kind) => (
            <button
              key={kind}
              className={`chip ${filter === kind ? 'active' : ''}`}
              onClick={() => setFilter(kind)}
            >
              {kind === 'all' ? 'All' : KIND_META[kind].label}
            </button>
          ))}
        </div>
      </section>

      <section className="workspace">
        <div
          className="garden"
          aria-label="Pixel memory garden"
          style={{ width: COLS * TILE, height: ROWS * TILE }}
        >
          <div className="tile-layer">{tileGrid}</div>

          {/* Cottage prop */}
          <div
            className="prop-layer prop"
            style={{
              left: COTTAGE.col * TILE,
              top: COTTAGE.row * TILE - TILE * 0.2,
              width: COTTAGE.w * TILE,
              height: COTTAGE.h * TILE,
              zIndex: 4,
            }}
          >
            <Cottage />
          </div>

          {/* Decorations */}
          {decorations.map((d) => (
            <div
              key={d.key}
              className="prop"
              style={{
                left: d.col * TILE,
                top: d.row * TILE,
                width: TILE,
                height: TILE,
                zIndex: 3,
              }}
            >
              {d.el}
            </div>
          ))}

          {/* Memories */}
          {placed.map((m) => {
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
              </button>
            );
          })}

          {/* Player — z matches its own row so plants further south render in
              front (southern is forward, like Stardew y-sort). */}
          <div
            className={`player facing-${facing} ${walking ? 'walking' : ''}`}
            style={{
              left: playerPos.col * TILE,
              top: playerPos.row * TILE - TILE * 0.3,
              width: TILE,
              height: TILE,
              zIndex: 5 + playerPos.row,
            }}
          >
            <div className="player-inner">
              <Player facing={facing} frame={step} />
            </div>
          </div>

          {/* Fireflies (top-most ambient) */}
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

          <div className="scene-vignette" aria-hidden />

          {/* Action hint */}
          {focused && (
            <div className="hint-bar" aria-live="polite">
              <span className="hint-chip">{KIND_META[focused.kind].label}</span>
              <span className="hint-title">{focused.title}</span>
              <span className="hint-key">
                <kbd>Space</kbd> read
              </span>
            </div>
          )}

          {/* Controls hint */}
          <div className="controls-card" aria-hidden>
            <span className="controls-row">
              <kbd className="kbd-arrow">↑</kbd>
              <span className="controls-cluster">
                <kbd className="kbd-arrow">←</kbd>
                <kbd className="kbd-arrow">↓</kbd>
                <kbd className="kbd-arrow">→</kbd>
              </span>
              <span className="controls-label">move</span>
            </span>
            <span className="controls-row">
              <kbd>Space</kbd>
              <span className="controls-label">inspect</span>
            </span>
          </div>
        </div>

        <aside className="memory-card">
          <div className="card-frame">
            <div className="card-pin card-pin-l" />
            <div className="card-pin card-pin-r" />
            {selected ? (
              <>
                <div className="card-namebar">
                  <span className="card-namebar-chip">
                    <span className="card-namebar-sprite">
                      {(() => {
                        const S = KIND_META[selected.kind].Sprite;
                        return <S />;
                      })()}
                    </span>
                    {KIND_META[selected.kind].label}
                  </span>
                  <span className="card-mood">{MOOD_LABEL[selected.mood]}</span>
                </div>
                <h2>{selected.title}</h2>
                <p className="memory-text">{selected.text}</p>
                <div className="meta-grid">
                  <span>Source</span>
                  <strong>
                    {selected.source}:{selected.line}
                  </strong>
                  <span>Importance</span>
                  <strong className="importance">
                    {Array.from({ length: 5 }, (_, i) => (
                      <span key={i} className={i < selected.importance ? 'heart on' : 'heart'} />
                    ))}
                  </strong>
                  <span>Age</span>
                  <strong>{selected.age}</strong>
                </div>
                <div className="actions">
                  <button className="game-btn" onClick={waterMemory}>
                    <span className="game-btn-face">
                      <Droplets size={14} /> {selected.watered ? 'Unwater' : 'Water'}
                    </span>
                  </button>
                  <button
                    className="game-btn"
                    onClick={() => updateMemory(selected.id, { importance: Math.min(5, selected.importance + 1) })}
                  >
                    <span className="game-btn-face">
                      <Sparkles size={14} /> Mark important
                    </span>
                  </button>
                  <button
                    className="game-btn danger"
                    onClick={() => updateMemory(selected.id, { archived: true })}
                  >
                    <span className="game-btn-face">
                      <Archive size={14} /> Compost
                    </span>
                  </button>
                </div>
                <div className="reflection">
                  <h3>
                    <span className="reflection-tag">Garden note</span>
                  </h3>
                  <p>{gardenReflection(selected)}</p>
                </div>
              </>
            ) : (
              <EmptyState />
            )}
          </div>
        </aside>
      </section>

      <footer className="footer-strip">
        <span>Local-first · No telemetry · MEMORY.md stays on your machine</span>
      </footer>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="empty">
      <div className="empty-pot">
        <PixelSvg size={96}>
          <rect x="3" y="9" width="10" height="5" fill="#a85a3e" />
          <rect x="3" y="9" width="10" height="1" fill="#c97a5a" />
          <rect x="2" y="8" width="12" height="2" fill="#a85a3e" />
          <rect x="2" y="8" width="12" height="1" fill="#c97a5a" />
          <rect x="1" y="8" width="1" height="6" fill={OUT} />
          <rect x="14" y="8" width="1" height="6" fill={OUT} />
          <rect x="3" y="14" width="10" height="1" fill={OUT} />
          <rect x="6" y="5" width="4" height="3" fill="#3e2a5a" />
          <rect x="7" y="3" width="2" height="2" fill="#3e2a5a" />
        </PixelSvg>
      </div>
      <p>No memories match this view.</p>
      <p className="empty-hint">Try clearing the search, or import a MEMORY.md to plant some.</p>
    </div>
  );
}

function PixelLogo() {
  return (
    <div className="pixel-logo" aria-hidden>
      <PixelSvg size={64}>
        {/* sky */}
        <rect width="16" height="10" fill="#7a9bc4" />
        <rect width="16" height="4" fill="#5c83b4" />
        {/* sun */}
        <rect x="11" y="2" width="3" height="3" fill="#f5d77a" />
        <rect x="11" y="2" width="3" height="1" fill="#fbe9a8" />
        {/* hill */}
        <rect x="0" y="8" width="16" height="2" fill="#4a8536" />
        <rect x="0" y="8" width="16" height="1" fill="#6dac4a" />
        {/* trunk */}
        <rect x="7" y="10" width="2" height="4" fill="#6b4218" />
        {/* foliage */}
        <rect x="4" y="5" width="8" height="4" fill="#4a8536" />
        <rect x="5" y="4" width="6" height="1" fill="#4a8536" />
        <rect x="4" y="5" width="8" height="1" fill="#6dac4a" />
        {/* ground */}
        <rect x="0" y="14" width="16" height="2" fill="#3e6c27" />
      </PixelSvg>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
