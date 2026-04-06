# AGENTS.md

## Core rules for this repository
- Preserve gameplay logic truth from `legacy/old-project.zip`.
- Treat files under `legacy/screenshots/` as visual truth when rebuilding UI.
- Keep implementation board-first: core board simulation and rendering precede shell polish.
- Maintain exactly one active overlay at a time (menu/options/pause/win/etc.).

## Build discipline
- Prefer small, testable commits by lane/wave.
- Keep scene wiring explicit in `src/boot/phaserConfig.ts`.
- Avoid introducing service worker behavior that can stale localhost development.
