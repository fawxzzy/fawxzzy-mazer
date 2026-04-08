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

## Notes about service workers
- PWA plugin is configured with `devOptions.enabled = false`.
- On localhost, startup code unregisters existing service workers to prevent stale behavior during rebuild iterations.
