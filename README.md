# Mazer (Rebuild Foundation)

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
npm run test
npm run test:soak
```

`npm run preview` serves the production build locally on port `4173`.
`dist/` is generated build output and is ignored by git.

## Notes about service workers
- PWA plugin is configured with `devOptions.enabled = false`.
- On localhost, startup code unregisters existing service workers to prevent stale behavior during rebuild iterations.

## Maze runtime notes
- Wilson remains the maze generation truth.
- Solving now runs on a compressed corridor graph, then expands back to tile indices only for rendering.
- Ambient presentation can route mazes through deterministic `classic`, `braided`, `framed`, and rare `blueprint-rare` presets without adding storage or gameplay state.

## Legacy boundary
- `legacy/` and `docs/legacy/` are archival reference only.
- Do not extract `legacy/old-project.zip` into the working tree.
- Live development happens only in the current source tree.
