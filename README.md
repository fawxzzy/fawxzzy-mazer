# Mazer

This repository is a clean rebuild of Mazer using **Vite + TypeScript + Phaser**.

The active product lane is the 2D Phaser shipping runtime. Current work should tighten truth, readability, composition, installability, and verification around that lane instead of reopening broad source-tree or package-manager churn.

## Current scope
- The shipping baseline is the current 2D Phaser runtime and its repo-owned verification surfaces.
- Current near-term work stays on repo-owned verification surfaces, runtime observe/soak visibility, composition, installability, and baseline freeze quality.
- TV, OBS, mobile, and preview profiles remain part of the active 2D delivery surface.
- Future-runtime and rotating-planet work stay isolated, deferred, and non-authoritative for shipping claims.

## Local development

### 1) Install dependencies
```bash
npm install
```

### Commands
```bash
npm run dev -- --open
npm run architecture:check
npm run verify
npm run build
npm run preview
npm run lint
npm run test
npm run test:playbook-adoption
npm run test:soak
npm run runtime:observe
npm run visual:capture
npm run visual:matrix
npm run edge:live
npm run visual:gate
npm run projection:export-pack
```

`npm run preview` serves the production build locally on port `4173`.
`dist/` is generated build output and is ignored by git.
`npm run visual:matrix` captures the shipping layout across the core viewport matrix into `../tmp/captures/mazer-layout-matrix/<run-id>/`.
`npm run visual:matrix -- --url https://<preview-host>` reuses a hosted preview instead of launching a local preview server.
`npm run edge:live -- --base-url http://127.0.0.1:4173` runs the same core viewport set through Microsoft Edge (`channel: msedge`) and saves screenshots, videos, and JSON summaries under `../tmp/captures/mazer-edge-live/<run-id>/`.
`npm run edge:live -- --url https://<preview-host>` targets an explicit preview URL instead of launching a local preview server.
`/?mode=play` switches the shared simulation shell into desktop keyboard play without forking the watcher core. Controls are `WASD` or arrows to move, `P` or `Space` to pause, `R` to restart the attempt, `T` to toggle thoughts, and `M` or `Tab` to return to watch mode.
`/proof-surfaces.html?surface=all&fixture=watching&skin=ios&mode=all` hosts the reduced proof-surface pack for Snapshot Card, Active-Run Tracker, and Ambient Tile on the dedicated proof route.
`/watch-pass-preview.html` hosts the Watch Pass preview + settings shell on top of those same reduced surfaces, with local-only privacy, reduced-motion, thought-density, and pacing controls.
`/watch-pass-paywall.html` hosts the local-first Watch Pass paywall shell with monthly/yearly plan selection, a quiet dismiss path, and the same reduced preview surfaces.
`/watch-pass-setup.html` hosts the Watch Pass setup shell for Snapshot Card, Active-Run Tracker, and Ambient Tile with platform framing, privacy mode, reduced motion, thought density, and pacing controls.
`npm run edge:live -- --run projection-proof-shell --skip-build true --headless true` captures the proof-surface shell routes through the same repo-owned Edge harness, and the sibling `projection-proof-snapshot`, `projection-proof-active`, and `projection-proof-ambient` runs target each reduced surface directly.
`npm run edge:live -- --run watch-pass-preview --skip-build true --headless true` captures the Watch Pass preview route across full, compact, and private shells.
`npm run edge:live -- --run watch-play-shell --skip-build true --headless true` and `npm run edge:live -- --run play-mode-smoke --skip-build true --headless true` now resolve to play-mode captures automatically.
`npm run edge:live -- --run play-mode-interactive --skip-build true --headless true` actively switches into play mode, presses desktop controls, and fails if live receipts do not record non-zero `control_used` events.
`npm run edge:live -- --run mobile-touch-smoke --skip-build true --headless true` emulates a phone-touch play shell, taps the on-screen D-pad and control buttons, and records the same shared play-mode receipts.
`npm run runtime:observe -- --duration-seconds 120 --label play-mode-a` now targets the play shell automatically so receipts carry `mode=play` without a manual URL override.
`npm run runtime:observe -- --duration-seconds 120 --label play-mode-b` reuses that same play shell label for active-play KPI follow-through.
`npm run runtime:observe -- --duration-seconds 120 --label pacing-a` captures a repo-owned runtime observe receipt under `../tmp/captures/mazer-runtime-observe/` and now includes experiment metadata plus a stable variant id.
`npm run projection:export-pack -- --fixture watching --label watch-pass-preview` emits iOS and Android projection export packs under `../tmp/captures/mazer-projections/`.
`npm run edge:live -- --base-url http://127.0.0.1:4173 --run experiment-smoke --pacing 0.7x` carries the same experiment metadata into Edge live receipts so visual decisions can be compared against explicit toggles instead of ad hoc notes.

## Branch lanes

- `main` is the repo truth branch.
- Use `codex/*` branches for narrow, lane-scoped changes such as doc alignment, proof spikes, or verification work.
- Keep 2D shipping-lane work separate from deferred future-runtime or 3D experiments unless that future lane is explicitly reopened.

## Current truth
- The active shipping lane is the 2D Phaser build.
- The repo-owned proof path is green locally as of April 17, 2026: `npm run verify` passed after the active theme readability repairs.
- The immediate next-step lane is repo-owned verification and visibility follow-through, not a 3D reopen.
- Future-runtime and rotating-planet work remain parked behind isolated entrypoints and future-facing docs.
- Visual truth is owned by the screenshot gate first, then `tests/scenes/demo-build.test.ts`, then older prose.
- The latest local baseline is only production truth after that visual pass is committed and deployed.
- Trail attach plus no-future-preview is the active trail contract.
- Desktop, TV, and OBS composition now targets the tight 5px board-fit between the title band and the bottom-center install CTA lane.
- Player readability stays permanent, and the bottom panel remains the universal shell lane for now.
- Demo build/rebuild is part of the spectator story now. The live reveal consumes a real bounded generator trace from `buildMaze` instead of a presentation-only fake reveal.
- Generator-side endpoint strategy spread is improved but still unfinished; variety work is not closed.
- Runtime observe/soak visibility rollup work remains repo-local analysis WIP and is not part of the shipping claim yet.
- Compact glance surfaces should consume `RunProjection` state plus privacy transforms, not raw renderer/frame state.
- See `docs/current-truth.md` when older notes or pasted diffs disagree.

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
- The install surface lives in the bottom-center shell lane when the browser actually exposes `beforeinstallprompt`.
- Installed or standalone launches hide the action cleanly and keep the ambient presentation running unchanged.

## Layout Matrix
- Core matrix presets are `390x844`, `430x932`, `844x390`, `768x1024`, `1024x768`, `1366x768`, `1440x900`, and `1920x1080`.
- Extended presets add `2560x1080` and `1280x720` when you need wider or shorter shells.
- Each matrix run emits full-frame screenshots, gameplay-only board clips, per-viewport metadata, a markdown summary, and one contact sheet under `../tmp/captures/mazer-layout-matrix/<run-id>/`.
- Use `npm run visual:matrix -- --route "/?theme=ember"` to lock the route or theme without changing the preset file.
- Unsupported/manual-install surfaces fail open. On iOS-style browsers the bottom-center lane swaps to `Use Share > Add to Home Screen`.
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
- Rule: prefer small G0 truth-alignment passes around the active 2D lane before attempting broad repo reshapes.
- Rule: visual variety should come from clearly different presentation families before touching generator truth.
- Rule: true ambient variety should come from materially different maze-family behavior before adding more decorative theme noise.
- Rule: a smaller set of strongly differentiated families is better than a larger set with metric overlap.
- Pattern: decouple theme scheduling from mood scheduling so the same topology can read differently without feeling repetitive.
- Pattern: preserve Wilson truth, then tune complexity through family-level straightness penalties, endpoint strategies, braid pressure, and region structure.
- Pattern: use analysis to prove distinctness, then use exposure policy to make distinctness visible in ambient viewing.
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
- Failure Mode: evenly rotating too many medium-difference families can still feel repetitive because no memorable archetype dominates the loop.

## Notes about service workers
- PWA plugin is configured with `devOptions.enabled = false`.
- On localhost, startup code unregisters existing service workers to prevent stale behavior during rebuild iterations.

## Maze runtime notes
- Wilson remains the maze generation truth.
- Solving now runs on a compressed corridor graph, then expands back to tile indices only for rendering.
- The current 2D Phaser runtime remains the shipping lane and local freeze target.
- Spectator build/rebuild now uses a real bounded generator trace emitted behind `buildMaze`, then replays that trace through build, settle, watch, hold, reflection, erase, and next-build phases while keeping the board frame stable.
- Ambient presentation can route mazes through deterministic `classic`, `braided`, `framed`, and rare `blueprint-rare` presets without adding storage or gameplay state.
- Ambient topology can also route mazes through deterministic `classic`, `braided`, `sparse`, `dense`, `framed`, and `split-flow` families while keeping Wilson as the base generator truth and shifting variety into topology and endpoint behavior before theme noise.
- Auto family exposure is curated on purpose: hero families (`braided`, `dense`, `split-flow`) carry the loop, `classic` and `framed` support, and `sparse` stays rare so its contrast remains noticeable.
- Ambient themes (`noir`, `ember`, `aurora`, `vellum`, `monolith`) are presentation families layered above the same maze substrate; they are not generator forks.
- `theme=auto` rotates those families on a curated schedule that is independent from mood scheduling, while explicit `theme=` values lock capture output to one family.
- Install behavior is intentionally ephemeral and runtime-only; no install preference or launcher state is written into app storage.
- Projection artifacts are local-first and repo-owned. `src/projections/` exposes `RunProjection`, surface adapters, and iOS/Android export payloads plus `full`, `compact`, and `private` privacy transforms. `writeRunProjectionArtifact(...)` and `writeNativeProjectionArtifactSet(...)` write JSON artifacts for proof surfaces or tooling under `tmp/captures/mazer-projections/`.
- Telemetry and experiment receipts are local-first and repo-owned. `src/telemetry/` defines the event schema plus pacing, thought-density, fail-card, memory-beat, trap-telegraph, and business-surface events. Both `runtime:observe` and `edge:live` now record variant ids, privacy metadata, and KPI summaries in their local capture receipts.
- Future-runtime and `planet3d` proof code remain deferred and must not be presented as the shipping runtime.
- Deployment profiles tune presentation defaults only:
  - TV ambient loop: `?profile=tv`
  - TV with explicit title: `?profile=tv&title=show`
  - OBS-safe board-first shell: `?profile=obs&chrome=none`
  - Mobile portrait ambient shell: `?profile=mobile`

## Legacy boundary
- `legacy/` and `docs/legacy/` are archival reference only.
- Do not extract `legacy/old-project.zip` into the working tree.
- Live development happens only in the current source tree.
