# CLAUDE.md

## Project

Memory Garden is a local-first React/Vite app that visualizes an AI assistant's memories as an interactive pixel-art garden.

It is specifically about **AI memory**, not human scrapbooking:

> See what your AI remembers.

The UI should feel emotionally legible, warm, cozy, and game-like — closer to a tiny pixel world / tamagotchi / Stardew-like garden than a productivity dashboard.

## Current Problem

The MVP works, but the visuals are not good enough. The user dislikes the current look. Improve the visual design substantially.
                   
## Goals for the redesign

- Make it feel like a charming pixel-art game interface in the spirit of Stardew Valley.
- Keep it polished and modern despite the pixel style.
- Avoid generic SaaS dashboard vibes.
- Bundled pixel-art assets are allowed (PNG spritesheets / tilesets), provided they are CC0 or otherwise freely licensed and shipped locally with the app. No remote image fetches at runtime.
- Keep the app local-only and browser-only.
- Preserve the core functionality:
  - sample memory garden on load
  - import `.md` / `.txt` files
  - search
  - filters
  - memory objects are interactable (see Input model)
  - inspector panel
  - water / mark important / compost interactions
- Improve spatial composition, hierarchy, colors, hover/selected states, and empty states.

## Input model

The garden is gamified with a controllable character:

- A pixel-art avatar lives in the scene and is moved with **arrow keys or WASD**.
- Movement is tile-based / grid-aligned, with simple collision against scene props (cottage, fence, water).
- Approaching a memory plant **focuses** it; pressing **Space / E / Enter** opens it in the inspector — replacing mouse-click as the primary interaction.
- Mouse clicks on memories should continue to work as a fallback for accessibility.
- The avatar should have at least 4-direction facing and a basic walk cycle.

## Suggested visual direction

Use this structured pixel-art prompt as the art direction:

> A cozy 16-bit pixel RPG memory garden UI, warm dusk lighting, soft grass tiles, winding stone path, tiny cottage/shrine for AI identity, glowing fireflies, chunky outlined sprites, tactile game dialogue panels, rounded pixel buttons, warm cream text, emerald/moss/lavender/gold palette, gentle idle animations, charming but readable, like a tiny emotional tamagotchi for AI memory.

Visual checklist:

- Replace generic SaaS layout with a cohesive game scene.
- Use tile-based ground/path composition, not random floating emojis.
- Make memory objects feel like sprites:
  - preferences → flowers
  - projects → trees/garden plots
  - goals → saplings
  - open loops → wilted plants/signposts needing care
  - moments → glowing stones/fireflies
  - identity/user context → cottage/shrine
- Inspector should feel like a game dialogue/card panel, not a form.
- Buttons should feel tactile and playful.
- Typography can mix a pixel display font for headings with readable body text.
- Add hover/selected states that feel magical: glow, bounce, sparkle, cursor affordance.
- Avoid photorealism, gradients that feel corporate, generic dashboard cards, and emoji-only sprites if real pixel sprites or CSS pixel shapes can do better.
- Reference look: Stardew Valley — warm earth tones, chunky black/dark outlines on sprites, hand-drawn-feeling grass and water tiles, dappled lighting. Match the *feel*, not specific copyrighted assets.

## Technical constraints

- React + Vite + TypeScript.
- Prefer simple maintainable CSS.
- No backend.
- No paid APIs.
- Must pass:
  - `npm run build`

## Deliverable

Make the visuals substantially better. Commit-ready changes only. If you need to simplify the implementation to improve design quality, do it.
