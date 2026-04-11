# AGENTS.md

## Core rules for this repository
- Preserve gameplay logic truth from `legacy/old-project.zip`.
- Treat files under `legacy/screenshots/` as visual truth when rebuilding UI.
- When current prose conflicts, prefer `docs/current-truth.md`, the latest visual-gate artifacts, and `tests/scenes/demo-build.test.ts` over older notes.
- Do not claim production is current unless the latest local visual pass is both committed and deployed.
- Keep implementation board-first: core board simulation and rendering precede shell polish.
- Maintain exactly one active overlay at a time (menu/options/pause/win/etc.).

## Build discipline
- Prefer small, testable commits by lane/wave.
- Keep scene wiring explicit in `src/boot/phaserConfig.ts`.
- Avoid introducing service worker behavior that can stale localhost development.
