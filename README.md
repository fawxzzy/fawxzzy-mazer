# Mazer

This repository is a clean rebuild of Mazer using **Vite + TypeScript + Phaser**.

## Wave 1 scope
- Fresh app bootstrap and Phaser wiring.
- Initial scenes (`BootScene`, `MenuScene`, `GameScene`).
- Domain/render/ui/test folders scaffolded for later lanes.
- Dev-safe PWA setup that avoids stale local service worker state.

## Local development

### 1) Install dependencies
```bash
npm install
```

### Commands
```bash
npm run dev -- --open
npm run build
npm run preview
npm run lint
npm run test
npm run test:soak
```

`npm run preview` serves the production build locally on port `4173`.
`dist/` is generated build output and is ignored by git.

## Launch profiles
Use the production preview for freeze validation:

- `http://127.0.0.1:4173/?profile=tv`
- `http://127.0.0.1:4173/?profile=tv&title=show`
- `http://127.0.0.1:4173/?profile=obs&chrome=none`
- `http://127.0.0.1:4173/?profile=mobile`

Defaults stay unchanged. Launch profiles tune packaging and presentation for deployment surfaces without changing app logic.

## Testing surfaces
- TV / kiosk: run `?profile=tv` for the ambient loop, or `?profile=tv&title=show` when explicit branding is needed. Validate distance legibility, brightness, reload behavior, and long-loop calmness.
- OBS: start with `?profile=obs&chrome=none` in a Browser Source sized to the scene. Check for clean edges, no odd padding, and stable refresh behavior.
- OBS-safe profile centers the board, preserves full board visibility, and minimizes chrome for overlays.
- Mobile: use `?profile=mobile`, then try `?profile=mobile&chrome=none` for a board-first shell check. Test portrait and landscape, resize, reload, and tab away/back.

## Freeze notes
- Rule: freeze product behavior before adding more polish once deployment profiles are validated.
- Pattern: use URL-level launch profiles for deployment surfaces instead of branching app logic.
- Pattern: deployment profiles may constrain motion and framing more aggressively than the default presentation when a surface needs compositional stability.
- Failure Mode: tiny packaging issues like icons, manifest wiring, or audio-init warnings can make a polished ambient build feel unfinished even when the core loop is stable.
- Failure Mode: aesthetically nice drift can make capture surfaces feel misaligned or zoomed even when the layout math is technically valid.

## Notes about service workers
- PWA plugin is configured with `devOptions.enabled = false`.
- On localhost, startup code unregisters existing service workers to prevent stale behavior during rebuild iterations.

## Maze runtime notes
- Wilson remains the maze generation truth.
- Solving now runs on a compressed corridor graph, then expands back to tile indices only for rendering.
- Ambient presentation can route mazes through deterministic `classic`, `braided`, `framed`, and rare `blueprint-rare` presets without adding storage or gameplay state.
- Deployment profiles tune presentation defaults only:
  - TV ambient loop: `?profile=tv`
  - TV with explicit title: `?profile=tv&title=show`
  - OBS-safe board-first shell: `?profile=obs&chrome=none`
  - Mobile portrait ambient shell: `?profile=mobile`

## Legacy boundary
- `legacy/` and `docs/legacy/` are archival reference only.
- Do not extract `legacy/old-project.zip` into the working tree.
- Live development happens only in the current source tree.
