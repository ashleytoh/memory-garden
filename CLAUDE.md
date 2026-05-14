# CLAUDE.md

## Project

Memory Garden is a local-first React/Vite app that visualizes an AI assistant's memories as an interactive pixel-art garden.

It is specifically about **AI memory**, not human scrapbooking:

> See what your AI remembers.

The UI should feel emotionally legible, warm, cozy, and game-like — closer to a tiny pixel world / tamagotchi / Stardew-like garden than a productivity dashboard.

## Current Problem

The MVP works, but the visuals are not good enough. The user dislikes the current look. Improve the visual design substantially.

## Goals for the redesign

- Make it feel like a charming pixel-art game interface.
- Keep it polished and modern despite the pixel style.
- Avoid generic SaaS dashboard vibes.
- Use CSS-only art; do not add external image assets unless absolutely necessary.
- Keep the app local-only and browser-only.
- Preserve the core functionality:
  - sample memory garden on load
  - import `.md` / `.txt` files
  - search
  - filters
  - clickable memory objects
  - inspector panel
  - water / mark important / compost interactions
- Improve spatial composition, hierarchy, colors, hover/selected states, and empty states.

## Suggested visual direction

- Pixel RPG garden scene with:
  - cozy sky/grass background
  - tile paths
  - cottage or shrine motif for AI identity/user context
  - plants/trees/signposts/stone tablets/fireflies as memory metaphors
  - small decorative animations
- Inspector should feel like a game dialogue/card panel, not a form.
- Buttons should feel tactile and playful.
- Typography can mix a pixel display font for headings with readable body text.

## Technical constraints

- React + Vite + TypeScript.
- Prefer simple maintainable CSS.
- No backend.
- No paid APIs.
- Must pass:
  - `npm run build`

## Deliverable

Make the visuals substantially better. Commit-ready changes only. If you need to simplify the implementation to improve design quality, do it.
