# Mazer

This repository is a clean rebuild of Mazer using **Vite + TypeScript + Phaser**.

Mazer remains ambient-only: no gameplay loop, no options shell, and no persisted install state.

## Current scope
- Fresh app bootstrap and Phaser wiring.
- Ambient-only scenes (`BootScene`, `MenuScene`).
- Profile-driven presentation surfaces for TV, OBS, and mobile.
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
- `http://127.0.0.1:4173/?theme=auto`
- `http://127.0.0.1:4173/?theme=noir`
- `http://127.0.0.1:4173/?theme=ember`
- `http://127.0.0.1:4173/?theme=aurora`
- `http://127.0.0.1:4173/?theme=vellum`
- `http://127.0.0.1:4173/?theme=monolith`
- `http://127.0.0.1:4173/?family=auto`
- `http://127.0.0.1:4173/?family=dense`
- `http://127.0.0.1:4173/?family=sparse`

Defaults stay unchanged. Launch profiles tune packaging and presentation for deployment surfaces without changing app logic.
`theme=auto` uses curated family rotation. Explicit theme values lock the presentation family without adding storage or a settings UI.
`family=auto|classic|braided|sparse|dense|framed|split-flow` locks maze topology families for local comparison or deterministic captures without adding storage or a settings UI.

## Install Mazer
- The install surface is a single top-right shell action when the browser actually exposes `beforeinstallprompt`.
- Installed or standalone launches hide the action cleanly and keep the ambient presentation running unchanged.
- Unsupported/manual-install surfaces fail open. On iOS-style browsers the top-right shell chip swaps to `Use Share > Add to Home Screen`.
- Install UX is optional by rule: if install APIs are unavailable or throw, the title/demo shell still renders normally.

## Testing surfaces
- TV / kiosk: run `?profile=tv` for the ambient loop, or `?profile=tv&title=show` when explicit branding is needed. Validate distance legibility, brightness, reload behavior, and long-loop calmness.
- OBS: start with `?profile=obs&chrome=none` in a Browser Source sized to the scene. Check for clean edges, no odd padding, and stable refresh behavior.
- OBS-safe profile centers the board, preserves full board visibility, and minimizes chrome for overlays.
- Mobile: use `?profile=mobile`, then try `?profile=mobile&chrome=none` for a board-first shell check. Test portrait and landscape, resize, reload, and tab away/back.

## Windows launcher
- `scripts/windows/Launch-Mazer.cmd` opens the current preview URL in an Edge app-style window by default and falls back to the browser when Edge is unavailable.
- `scripts/windows/Launch-Mazer.ps1 -Profile obs -Chrome none` is the direct profile-aware entrypoint if you want OBS-safe framing from the launcher.
- `scripts/windows/Prepare-MazerShortcut.cmd` creates a desktop shortcut that targets the repo-owned launcher instead of stale build artifacts.
- After creating the shortcut, launch it once and pin the resulting Edge app window or the shortcut itself to the taskbar.

## Freeze notes
- Rule: freeze product behavior before adding more polish once deployment profiles are validated.
- Pattern: use URL-level launch profiles for deployment surfaces instead of branching app logic.
- Pattern: deployment profiles may constrain motion and framing more aggressively than the default presentation when a surface needs compositional stability.
- Rule: visual variety should come from clearly different presentation families before touching generator truth.
- Rule: true ambient variety should come from materially different maze-family behavior before adding more decorative theme noise.
- Pattern: decouple theme scheduling from mood scheduling so the same topology can read differently without feeling repetitive.
- Pattern: preserve Wilson truth, then tune complexity through family-level straightness penalties, endpoint strategies, braid pressure, and region structure.
- Rule: install UX must be optional and fail-open; ambient presentation must remain usable even when install APIs are unavailable.
- Pattern: use one intentional install action instead of rebuilding a full settings/options system.
- Rule: readability and compositional clarity beat decorative tile detail in every ambient theme.
- Pattern: render the board as a coherent surface first, then layer route/trail/theme accents on top.
- Failure Mode: adding too many loosely defined visual variants creates noise, weakens identity, and can reintroduce long-run drift or framing regressions.
- Failure Mode: tiny packaging issues like icons, manifest wiring, or audio-init warnings can make a polished ambient build feel unfinished even when the core loop is stable.
- Failure Mode: aesthetically nice drift can make capture surfaces feel misaligned or zoomed even when the layout math is technically valid.
- Failure Mode: platform-specific install assumptions can create broken or confusing UI if unsupported surfaces are not handled cleanly.
- Failure Mode: per-tile edge styling and overactive trail effects can make a crisp ambient maze feel laggy, noisy, and less premium than the underlying system actually is.
- Failure Mode: if family output is visually different but topologically similar, long ambient watching still feels repetitive.

## Notes about service workers
- PWA plugin is configured with `devOptions.enabled = false`.
- On localhost, startup code unregisters existing service workers to prevent stale behavior during rebuild iterations.

## Maze runtime notes
- Wilson remains the maze generation truth.
- Solving now runs on a compressed corridor graph, then expands back to tile indices only for rendering.
- Ambient presentation can route mazes through deterministic `classic`, `braided`, `framed`, and rare `blueprint-rare` presets without adding storage or gameplay state.
- Ambient topology can also route mazes through deterministic `classic`, `braided`, `sparse`, `dense`, `framed`, and `split-flow` families while keeping Wilson as the base generator truth and shifting variety into topology and endpoint behavior before theme noise.
- Ambient themes (`noir`, `ember`, `aurora`, `vellum`, `monolith`) are presentation families layered above the same maze substrate; they are not generator forks.
- `theme=auto` rotates those families on a curated schedule that is independent from mood scheduling, while explicit `theme=` values lock capture output to one family.
- Install behavior is intentionally ephemeral and runtime-only; no install preference or launcher state is written into app storage.
- Deployment profiles tune presentation defaults only:
  - TV ambient loop: `?profile=tv`
  - TV with explicit title: `?profile=tv&title=show`
  - OBS-safe board-first shell: `?profile=obs&chrome=none`
  - Mobile portrait ambient shell: `?profile=mobile`

## Legacy boundary
- `legacy/` and `docs/legacy/` are archival reference only.
- Do not extract `legacy/old-project.zip` into the working tree.
- Live development happens only in the current source tree.
