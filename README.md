# Memory Garden

A pixel-art garden for visualizing what your AI assistant remembers.

Memory Garden turns OpenClaw-style memory files (`MEMORY.md`, `memory/YYYY-MM-DD.md`, `USER.md`) into an interactive emotional landscape. Preferences bloom as flowers, projects grow into trees, open loops wilt until tended, and meaningful moments glow like fireflies.

## Why

AI memory should not be a hidden black box. Users should be able to see, inspect, prune, and emotionally understand what their assistant remembers about them.

Memory Garden is not a productivity dashboard first. It is a trust and feeling interface for AI memory.

## MVP features

- Pixel-art interactive garden UI
- Import local markdown/text memory files in the browser
- Classify memories into preferences, people, projects, goals, moments, open loops, and identity
- Sentiment/mood styling
- Clickable memory cards with source file + line
- Garden actions:
  - **Water** = mark as cared for
  - **Mark important** = increase visual weight
  - **Compost** = archive from the current view
- Fully local; no backend or API required

## Development

```bash
npm install
npm run dev
npm run build
```

## Positioning

> See what your AI remembers.

Memory Garden is for local-first AI assistants, personal agents, and anyone who wants AI memory to feel visible, editable, and human-legible.
