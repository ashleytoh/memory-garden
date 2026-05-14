import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Upload, Sparkles, Shovel, Droplets, Archive, Search, Sprout } from 'lucide-react';
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

const KIND_META: Record<MemoryKind, { label: string; emoji: string; className: string }> = {
  preference: { label: 'Preference', emoji: '🌷', className: 'flower' },
  person: { label: 'Person', emoji: '🪻', className: 'vine' },
  project: { label: 'Project', emoji: '🌳', className: 'tree' },
  goal: { label: 'Goal', emoji: '🌱', className: 'sapling' },
  'open-loop': { label: 'Open Loop', emoji: '🥀', className: 'wilted' },
  moment: { label: 'Moment', emoji: '✨', className: 'glow' },
  identity: { label: 'Identity', emoji: '🍄', className: 'mushroom' },
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
    x: 7 + ((hash * 17 + index * 13) % 84),
    y: 10 + ((hash * 29 + index * 19) % 76),
  };
}

function App() {
  const [memories, setMemories] = useState<MemorySeed[]>(() => parseMemoryFile('sample/MEMORY.md', SAMPLE_MEMORY));
  const [selectedId, setSelectedId] = useState<string | null>(memories[0]?.id ?? null);
  const [filter, setFilter] = useState<MemoryKind | 'all'>('all');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => memories.filter((m) => !m.archived && (filter === 'all' || m.kind === filter) && `${m.title} ${m.text}`.toLowerCase().includes(query.toLowerCase())), [memories, filter, query]);
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

  return (
    <main className="app-shell">
      <section className="hero panel">
        <div>
          <p className="eyebrow"><Sprout size={16} /> Memory Garden</p>
          <h1>See what your AI remembers.</h1>
          <p className="subtitle">A pixel-art garden for OpenClaw memory files — preferences bloom, projects grow, and open loops wilt until you tend them.</p>
        </div>
        <label className="upload-button">
          <Upload size={18} /> Import MEMORY.md / daily notes
          <input type="file" accept=".md,.txt" multiple onChange={(event) => void importFiles(event.target.files)} />
        </label>
      </section>

      <section className="toolbar panel">
        <div className="search-box"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the garden..." /></div>
        <div className="filters">
          {(['all', ...Object.keys(KIND_META)] as Array<MemoryKind | 'all'>).map((kind) => (
            <button key={kind} className={filter === kind ? 'active' : ''} onClick={() => setFilter(kind)}>{kind === 'all' ? '🌿 All' : `${KIND_META[kind].emoji} ${KIND_META[kind].label}`}</button>
          ))}
        </div>
      </section>

      <section className="workspace">
        <div className="garden panel" aria-label="Pixel memory garden">
          <div className="skyline">✦ ✧ ✦</div>
          <div className="pixel-grid" />
          {visible.map((memory, index) => {
            const pos = seedPosition(memory, index);
            const meta = KIND_META[memory.kind];
            return (
              <button
                key={memory.id}
                className={`plant ${meta.className} mood-${memory.mood} ${selected?.id === memory.id ? 'selected' : ''} ${memory.watered ? 'watered' : ''}`}
                style={{ left: `${pos.x}%`, top: `${pos.y}%`, '--scale': 0.85 + memory.importance * 0.1 } as React.CSSProperties}
                title={memory.title}
                onClick={() => setSelectedId(memory.id)}
              >
                <span className="sprite">{meta.emoji}</span>
                {memory.kind === 'open-loop' && <span className="alert-dot" />}
              </button>
            );
          })}
          <div className="ground" />
        </div>

        <aside className="memory-card panel">
          {selected ? (
            <>
              <div className="card-topline"><span>{KIND_META[selected.kind].emoji} {KIND_META[selected.kind].label}</span><span>{MOOD_LABEL[selected.mood]}</span></div>
              <h2>{selected.title}</h2>
              <p className="memory-text">{selected.text}</p>
              <div className="meta-grid">
                <span>Source</span><strong>{selected.source}:{selected.line}</strong>
                <span>Importance</span><strong>{'◆'.repeat(selected.importance)}{'◇'.repeat(5 - selected.importance)}</strong>
                <span>Age</span><strong>{selected.age}</strong>
              </div>
              <div className="actions">
                <button onClick={() => updateMemory(selected.id, { watered: !selected.watered })}><Droplets size={16} /> {selected.watered ? 'Unwater' : 'Water'}</button>
                <button onClick={() => updateMemory(selected.id, { importance: Math.min(5, selected.importance + 1) })}><Sparkles size={16} /> Mark important</button>
                <button className="danger" onClick={() => updateMemory(selected.id, { archived: true })}><Archive size={16} /> Compost</button>
              </div>
              <div className="reflection">
                <h3>Garden note</h3>
                <p>{gardenReflection(selected)}</p>
              </div>
            </>
          ) : (
            <div className="empty"><Shovel size={32} /><p>No memories match this view.</p></div>
          )}
        </aside>
      </section>
    </main>
  );
}

function gardenReflection(memory: MemorySeed) {
  if (memory.kind === 'open-loop') return 'This memory needs tending. Resolve it, archive it, or turn it into a concrete next action.';
  if (memory.kind === 'preference') return 'This helps the assistant feel more aligned with the user over time.';
  if (memory.kind === 'project') return 'This is part of the shared creative landscape — a thing the assistant can help grow.';
  if (memory.kind === 'goal') return 'Goals become saplings: small now, but worth revisiting and watering.';
  if (memory.kind === 'moment') return 'A small emotional landmark. These are what make memory feel less mechanical.';
  return 'A quiet memory. Keep it if it still feels true; compost it if it has gone stale.';
}

createRoot(document.getElementById('root')!).render(<App />);
