import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Upload, Sparkles, Droplets, Archive, Search } from 'lucide-react';
import './styles.css';

type MemoryKind = 'preference' | 'person' | 'project' | 'goal' | 'open-loop' | 'moment' | 'identity';
type Mood = 'joy' | 'care' | 'curious' | 'stress' | 'focus' | 'neutral';

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

const SAMPLE_MEMORY = `# MEMORY.md
- User likes creating small useful AI/productivity apps with nice interfaces.
- Remember: GitHub is connected as ashleytoh.
- Open loop: connect phone node with Tailscale later.
- Preference: concise replies by default, more depth when asked.
- Project: local-brief is a local-first open-loop briefing CLI.
- Goal: explore emotionally legible AI memory visualization.
- Moment: user said "ure amazing" after calendar setup.
`;

const KIND_META: Record<MemoryKind, { label: string; sprite: React.FC; chip: string }> = {
  preference: { label: 'Preference', sprite: Tulip, chip: '✿' },
  person: { label: 'Person', sprite: Lavender, chip: '❀' },
  project: { label: 'Project', sprite: Oak, chip: '✦' },
  goal: { label: 'Goal', sprite: Sapling, chip: '✶' },
  'open-loop': { label: 'Open Loop', sprite: Wilted, chip: '!' },
  moment: { label: 'Moment', sprite: Firefly, chip: '★' },
  identity: { label: 'Identity', sprite: Mushroom, chip: '✦' },
};

const MOOD_LABEL: Record<Mood, string> = {
  joy: 'Joyful',
  care: 'Tender',
  curious: 'Curious',
  stress: 'Needs care',
  focus: 'Focused',
  neutral: 'Quiet',
};

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
      const importance = Math.min(5, 1 + Number(/remember|important|goal|project|open loop/i.test(text)) + Number(/amazing|blocked|future|preference/i.test(text)) + (kind === 'open-loop' ? 2 : 0));
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

function seedPosition(seed: MemorySeed, index: number) {
  const hash = [...seed.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return {
    x: 10 + ((hash * 17 + index * 13) % 80),
    y: 55 + ((hash * 29 + index * 19) % 35),
  };
}

/* ───────────────────────── Pixel-art sprites ───────────────────────── */

function PixelSvg({ size = 64, viewBox = '0 0 16 16', children }: { size?: number; viewBox?: string; children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox={viewBox} shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      {children}
    </svg>
  );
}

function Tulip() {
  return (
    <PixelSvg>
      <rect x="3" y="11" width="3" height="2" fill="#3e8b4a" />
      <rect x="10" y="10" width="3" height="2" fill="#3e8b4a" />
      <rect x="4" y="10" width="1" height="1" fill="#5fb56f" />
      <rect x="11" y="9" width="1" height="1" fill="#5fb56f" />
      <rect x="7" y="6" width="2" height="9" fill="#2f6e3a" />
      <rect x="5" y="4" width="2" height="2" fill="#d04373" />
      <rect x="9" y="4" width="2" height="2" fill="#d04373" />
      <rect x="6" y="3" width="4" height="2" fill="#e85a8c" />
      <rect x="7" y="2" width="2" height="1" fill="#e85a8c" />
      <rect x="6" y="5" width="1" height="1" fill="#ffa3c8" />
      <rect x="9" y="3" width="1" height="1" fill="#ffa3c8" />
    </PixelSvg>
  );
}

function Lavender() {
  return (
    <PixelSvg>
      <rect x="3" y="13" width="3" height="2" fill="#3e8b4a" />
      <rect x="7" y="8" width="2" height="7" fill="#2f6e3a" />
      <rect x="6" y="2" width="4" height="2" fill="#7e54c0" />
      <rect x="5" y="4" width="6" height="2" fill="#9b6bd9" />
      <rect x="6" y="6" width="4" height="2" fill="#7e54c0" />
      <rect x="6" y="8" width="4" height="1" fill="#9b6bd9" />
      <rect x="7" y="3" width="1" height="1" fill="#d0b3ff" />
      <rect x="9" y="4" width="1" height="1" fill="#d0b3ff" />
      <rect x="7" y="7" width="1" height="1" fill="#d0b3ff" />
    </PixelSvg>
  );
}

function Oak() {
  return (
    <PixelSvg>
      <rect x="7" y="10" width="2" height="5" fill="#5c3318" />
      <rect x="6" y="14" width="4" height="1" fill="#3d1f0e" />
      <rect x="4" y="5" width="8" height="6" fill="#3e8b4a" />
      <rect x="3" y="6" width="1" height="4" fill="#3e8b4a" />
      <rect x="12" y="6" width="1" height="4" fill="#3e8b4a" />
      <rect x="5" y="3" width="6" height="2" fill="#3e8b4a" />
      <rect x="6" y="2" width="4" height="1" fill="#3e8b4a" />
      <rect x="5" y="4" width="2" height="2" fill="#5fb56f" />
      <rect x="8" y="6" width="2" height="2" fill="#5fb56f" />
      <rect x="4" y="8" width="2" height="1" fill="#5fb56f" />
      <rect x="9" y="9" width="1" height="1" fill="#5fb56f" />
      <rect x="7" y="3" width="1" height="1" fill="#7fd590" />
    </PixelSvg>
  );
}

function Sapling() {
  return (
    <PixelSvg>
      <rect x="7" y="9" width="2" height="6" fill="#2f6e3a" />
      <rect x="4" y="7" width="3" height="2" fill="#5db35d" />
      <rect x="5" y="6" width="2" height="1" fill="#5db35d" />
      <rect x="9" y="7" width="3" height="2" fill="#5db35d" />
      <rect x="9" y="6" width="2" height="1" fill="#5db35d" />
      <rect x="5" y="7" width="1" height="1" fill="#9be09b" />
      <rect x="10" y="7" width="1" height="1" fill="#9be09b" />
      <rect x="7" y="14" width="2" height="1" fill="#5c3318" />
    </PixelSvg>
  );
}

function Wilted() {
  return (
    <PixelSvg>
      <rect x="7" y="11" width="2" height="4" fill="#7a6a3a" />
      <rect x="8" y="9" width="2" height="2" fill="#7a6a3a" />
      <rect x="9" y="7" width="2" height="2" fill="#7a6a3a" />
      <rect x="10" y="5" width="3" height="3" fill="#a85a5a" />
      <rect x="11" y="4" width="2" height="1" fill="#a85a5a" />
      <rect x="12" y="6" width="1" height="1" fill="#d97a7a" />
      <rect x="3" y="13" width="3" height="2" fill="#8a9a4a" />
    </PixelSvg>
  );
}

function Firefly() {
  return (
    <PixelSvg>
      <rect x="6" y="6" width="4" height="4" fill="#fff3b0" />
      <rect x="5" y="7" width="6" height="2" fill="#fff3b0" />
      <rect x="7" y="5" width="2" height="6" fill="#fff3b0" />
      <rect x="7" y="7" width="2" height="2" fill="#ffffff" />
      <rect x="4" y="8" width="1" height="1" fill="#f8d66d" />
      <rect x="11" y="7" width="1" height="1" fill="#f8d66d" />
      <rect x="8" y="3" width="1" height="1" fill="#f8d66d" />
      <rect x="7" y="12" width="1" height="1" fill="#f8d66d" />
    </PixelSvg>
  );
}

function Mushroom() {
  return (
    <PixelSvg>
      <rect x="6" y="10" width="4" height="4" fill="#f8efd4" />
      <rect x="6" y="14" width="4" height="1" fill="#c9b890" />
      <rect x="7" y="11" width="1" height="2" fill="#d9c9ab" />
      <rect x="4" y="7" width="8" height="3" fill="#c33a3a" />
      <rect x="5" y="5" width="6" height="2" fill="#c33a3a" />
      <rect x="6" y="4" width="4" height="1" fill="#c33a3a" />
      <rect x="5" y="5" width="1" height="1" fill="#e96060" />
      <rect x="7" y="4" width="1" height="1" fill="#e96060" />
      <rect x="6" y="7" width="1" height="1" fill="#ffffff" />
      <rect x="9" y="6" width="1" height="1" fill="#ffffff" />
      <rect x="8" y="8" width="2" height="1" fill="#ffffff" />
    </PixelSvg>
  );
}

/* ───────────────────────── Scene decorations ───────────────────────── */

function Cottage() {
  return (
    <svg width="160" height="160" viewBox="0 0 32 32" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <rect x="21" y="2" width="3" height="6" fill="#7a3a3a" />
      <rect x="21" y="2" width="3" height="1" fill="#5e2b2b" />
      <rect x="22" y="0" width="1" height="1" fill="#e8d6b0" opacity=".7" />
      <rect x="21" y="-1" width="2" height="1" fill="#e8d6b0" opacity=".5" />
      <rect x="12" y="3" width="8" height="2" fill="#8b3a3a" />
      <rect x="10" y="5" width="12" height="2" fill="#8b3a3a" />
      <rect x="8" y="7" width="16" height="2" fill="#8b3a3a" />
      <rect x="6" y="9" width="20" height="2" fill="#8b3a3a" />
      <rect x="6" y="10" width="20" height="1" fill="#5e2b2b" />
      <rect x="13" y="4" width="6" height="1" fill="#a85252" />
      <rect x="11" y="6" width="10" height="1" fill="#a85252" />
      <rect x="6" y="11" width="20" height="14" fill="#d9a878" />
      <rect x="6" y="11" width="20" height="1" fill="#f0c498" />
      <rect x="6" y="24" width="20" height="1" fill="#a88858" />
      <rect x="6" y="11" width="1" height="14" fill="#a88858" />
      <rect x="25" y="11" width="1" height="14" fill="#a88858" />
      <rect x="14" y="17" width="4" height="8" fill="#5c3318" />
      <rect x="14" y="17" width="4" height="1" fill="#3d1f0e" />
      <rect x="17" y="21" width="1" height="1" fill="#f8d66d" />
      <rect x="9" y="14" width="3" height="3" fill="#f8d66d" />
      <rect x="20" y="14" width="3" height="3" fill="#f8d66d" />
      <rect x="9" y="14" width="3" height="1" fill="#fff3b0" />
      <rect x="20" y="14" width="3" height="1" fill="#fff3b0" />
      <rect x="10" y="14" width="1" height="3" fill="#3d1f0e" />
      <rect x="21" y="14" width="1" height="3" fill="#3d1f0e" />
      <rect x="9" y="15" width="3" height="1" fill="#3d1f0e" />
      <rect x="20" y="15" width="3" height="1" fill="#3d1f0e" />
      <rect x="8" y="13" width="5" height="1" fill="#5c3318" />
      <rect x="19" y="13" width="5" height="1" fill="#5c3318" />
    </svg>
  );
}

function FencePost() {
  return (
    <svg width="22" height="36" viewBox="0 0 11 18" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="2" width="3" height="16" fill="#a88858" />
      <rect x="7" y="2" width="3" height="16" fill="#a88858" />
      <rect x="1" y="2" width="3" height="1" fill="#d9b88a" />
      <rect x="7" y="2" width="3" height="1" fill="#d9b88a" />
      <rect x="1" y="1" width="3" height="1" fill="#7a6238" />
      <rect x="7" y="1" width="3" height="1" fill="#7a6238" />
      <rect x="0" y="6" width="11" height="2" fill="#a88858" />
      <rect x="0" y="11" width="11" height="2" fill="#a88858" />
      <rect x="0" y="6" width="11" height="1" fill="#d9b88a" />
      <rect x="0" y="11" width="11" height="1" fill="#d9b88a" />
    </svg>
  );
}

function GrassTuft({ tone = 0 }: { tone?: number }) {
  const greens = ['#4a9650', '#3e8b4a', '#5db35d'];
  const c = greens[tone % 3];
  return (
    <svg width="22" height="14" viewBox="0 0 11 7" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="3" width="1" height="4" fill={c} />
      <rect x="3" y="1" width="1" height="6" fill={c} />
      <rect x="5" y="2" width="1" height="5" fill={c} />
      <rect x="7" y="0" width="1" height="7" fill={c} />
      <rect x="9" y="3" width="1" height="4" fill={c} />
    </svg>
  );
}

/* ───────────────────────── App ───────────────────────── */

function App() {
  const [memories, setMemories] = useState<MemorySeed[]>(() => parseMemoryFile('sample/MEMORY.md', SAMPLE_MEMORY));
  const [selectedId, setSelectedId] = useState<string | null>(memories[0]?.id ?? null);
  const [filter, setFilter] = useState<MemoryKind | 'all'>('all');
  const [query, setQuery] = useState('');
  const [splashKey, setSplashKey] = useState(0);

  const visible = useMemo(
    () =>
      memories.filter(
        (m) =>
          !m.archived &&
          (filter === 'all' || m.kind === filter) &&
          `${m.title} ${m.text}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [memories, filter, query],
  );
  const selected = memories.find((m) => m.id === selectedId) ?? visible[0];

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

  const fireflies = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        id: i,
        left: 8 + ((i * 47) % 84),
        top: 20 + ((i * 31) % 32),
        delay: (i * 0.7) % 4,
        dur: 6 + (i % 4),
      })),
    [],
  );

  const grassTufts = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        left: 4 + ((i * 71) % 92),
        bottom: 2 + ((i * 13) % 14),
        tone: i % 3,
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
              A cozy pixel-art garden for OpenClaw memory files — preferences bloom, projects grow tall, and open
              loops wilt until you tend them.
            </p>
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
          {(['all', ...Object.keys(KIND_META)] as Array<MemoryKind | 'all'>).map((kind) => {
            const Sprite = kind === 'all' ? null : KIND_META[kind].sprite;
            return (
              <button
                key={kind}
                className={`chip ${filter === kind ? 'active' : ''}`}
                onClick={() => setFilter(kind)}
              >
                <span className="chip-icon">
                  {kind === 'all' ? <AllIcon /> : Sprite ? <Sprite /> : null}
                </span>
                {kind === 'all' ? 'All' : KIND_META[kind].label}
              </button>
            );
          })}
        </div>
        <div className="count-pill">
          <span className="count-pill-dot" /> {visible.length} memories
        </div>
      </section>

      <section className="workspace">
        <div className="garden" aria-label="Pixel memory garden">
          <div className="scene scene-sky" />
          <div className="scene scene-stars" />
          <div className="scene scene-moon">
            <div className="moon-disc" />
          </div>
          <div className="scene scene-clouds">
            <div className="cloud cloud-a" />
            <div className="cloud cloud-b" />
            <div className="cloud cloud-c" />
          </div>
          <div className="scene scene-hills-far" />
          <div className="scene scene-hills-near" />
          <div className="scene scene-cottage">
            <Cottage />
          </div>
          <div className="scene scene-fence" aria-hidden>
            {Array.from({ length: 9 }, (_, i) => (
              <FencePost key={i} />
            ))}
          </div>
          <div className="scene scene-grass" />
          <div className="scene scene-path">
            <div className="path-strip">
              {Array.from({ length: 18 }, (_, i) => (
                <span key={i} className={`tile tile-${i % 3}`} />
              ))}
            </div>
          </div>
          <div className="scene scene-grass-front" aria-hidden>
            {grassTufts.map((g) => (
              <div key={g.id} className="grass-tuft" style={{ left: `${g.left}%`, bottom: `${g.bottom}%` }}>
                <GrassTuft tone={g.tone} />
              </div>
            ))}
          </div>
          <div className="scene scene-fireflies" aria-hidden>
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

          {visible.map((memory, index) => {
            const pos = seedPosition(memory, index);
            const meta = KIND_META[memory.kind];
            const Sprite = meta.sprite;
            const isSelected = selected?.id === memory.id;
            return (
              <button
                key={memory.id}
                className={`plant mood-${memory.mood} kind-${memory.kind} ${isSelected ? 'selected' : ''} ${memory.watered ? 'watered' : ''}`}
                style={
                  {
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    '--scale': 0.85 + memory.importance * 0.1,
                    '--bob-delay': `${(index * 0.37) % 3}s`,
                  } as React.CSSProperties
                }
                onClick={() => setSelectedId(memory.id)}
              >
                <span className="plant-shadow" />
                <span className="sprite">
                  <Sprite />
                </span>
                {memory.kind === 'open-loop' && <span className="alert-dot" />}
                {isSelected && splashKey > 0 && memory.watered && <span className="splash" key={splashKey} />}
                <span className="plant-label">{memory.title}</span>
              </button>
            );
          })}

          <div className="scene scene-vignette" />
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
                        const S = KIND_META[selected.kind].sprite;
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
        <span className="footer-bit">local-first</span>
        <span className="footer-bit">no telemetry</span>
        <span className="footer-bit">CSS-only sprites</span>
      </footer>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="empty">
      <div className="empty-pot">
        <svg width="96" height="96" viewBox="0 0 16 16" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="9" width="10" height="5" fill="#a85a3e" />
          <rect x="3" y="9" width="10" height="1" fill="#c97a5a" />
          <rect x="2" y="8" width="12" height="2" fill="#a85a3e" />
          <rect x="2" y="8" width="12" height="1" fill="#c97a5a" />
          <rect x="6" y="5" width="4" height="3" fill="#3e2a5a" />
          <rect x="7" y="3" width="2" height="2" fill="#3e2a5a" />
        </svg>
      </div>
      <p>No memories match this view.</p>
      <p className="empty-hint">Try clearing the search, or import a MEMORY.md to plant some.</p>
    </div>
  );
}

function AllIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 16 16" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="11" width="3" height="3" fill="#3e8b4a" />
      <rect x="6" y="9" width="3" height="5" fill="#4a9650" />
      <rect x="10" y="6" width="4" height="8" fill="#5db35d" />
      <rect x="7" y="6" width="1" height="3" fill="#e85a8c" />
      <rect x="11" y="3" width="2" height="3" fill="#9b6bd9" />
      <rect x="3" y="9" width="1" height="2" fill="#f8d66d" />
    </svg>
  );
}

function PixelLogo() {
  return (
    <div className="pixel-logo" aria-hidden>
      <svg width="64" height="64" viewBox="0 0 16 16" shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="11" width="12" height="3" fill="#3e8b4a" />
        <rect x="2" y="11" width="12" height="1" fill="#5db35d" />
        <rect x="6" y="5" width="4" height="6" fill="#5c3318" />
        <rect x="4" y="3" width="8" height="3" fill="#3e8b4a" />
        <rect x="3" y="4" width="1" height="2" fill="#3e8b4a" />
        <rect x="12" y="4" width="1" height="2" fill="#3e8b4a" />
        <rect x="5" y="2" width="6" height="1" fill="#3e8b4a" />
        <rect x="5" y="4" width="2" height="1" fill="#5fb56f" />
        <rect x="9" y="3" width="2" height="1" fill="#5fb56f" />
        <rect x="11" y="8" width="2" height="2" fill="#f8d66d" />
      </svg>
    </div>
  );
}

function gardenReflection(memory: MemorySeed) {
  if (memory.kind === 'open-loop')
    return 'This memory needs tending. Resolve it, archive it, or turn it into a concrete next action.';
  if (memory.kind === 'preference') return 'This helps the assistant feel more aligned with the user over time.';
  if (memory.kind === 'project')
    return 'This is part of the shared creative landscape — a thing the assistant can help grow.';
  if (memory.kind === 'goal') return 'Goals become saplings: small now, but worth revisiting and watering.';
  if (memory.kind === 'moment')
    return 'A small emotional landmark. These are what make memory feel less mechanical.';
  return 'A quiet memory. Keep it if it still feels true; compost it if it has gone stale.';
}

createRoot(document.getElementById('root')!).render(<App />);
