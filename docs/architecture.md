# Architecture

Initial foundation is organized into boot, scenes, domain, render, and ui layers.

## Maze domain (pure TypeScript)

The maze generation lane is implemented as an index-based, renderer-agnostic domain module under `src/domain`.

- `src/domain/rng`
  - Deterministic seeded RNG (`Mulberry32`) used by all generation steps for reproducible mazes.
- `src/domain/maze/grid.ts`
  - Grid construction and cardinal neighbor indexing in ordered slots `[top, bottom, left, right]`.
  - Border handling is encoded via `neighborCount` and floor defaults.
- `src/domain/maze/path.ts`
  - Checkpoint-driven path carving with mixed neighbor strategy:
    - closest-to-checkpoint candidate
    - random candidate
    - direction-preferred candidate
  - Local adjacency validation prevents dense/invalid routing and supports controlled backtracking.
  - Longest discovered path branch drives end-tile selection.
- `src/domain/maze/shortcuts.ts`
  - Shortcut pass opens qualifying wall bridges only when opposite path corridors exist, matching legacy corridor-bridge behavior.
- `src/domain/maze/generator.ts`
  - Orchestrates full generation pipeline in pure functions and provides a reset/regenerate loop API.

### Output contract

`generateMaze` returns a `MazeBuildResult` designed for future renderer + demo AI consumers:

- flat `tiles` array with index/x/y/neighbor metadata
- explicit `startIndex` and `endIndex`
- `pathIndices` and `wallIndices`
- deterministic seed + budget counters (`checkpointCount`, `shortcutsCreated`)

No Phaser scene code is used inside this lane.

## Scene map

Current scene flow keeps menu-first startup with an attract-mode shell:

- `BootScene`
  - one-step startup scene that always routes into `MenuScene`.
- `MenuScene`
  - renders the starfield, centered square maze demo, translucent green `Mazer` title, and only the secondary actions (`Options`, `Exit`).
  - owns the attract-mode loop by scheduling deterministic demo walker phases (`explore`, `backtrack`, `goal-hold`, `reset-hold`) from the pure AI lane.
  - owns the overlay event bus and enforces one active overlay at a time through `OverlayManager`.
- `GameScene`
  - manual-play QA run entered from `OptionsScene` or hidden keyboard shortcuts on the menu.
- `OptionsScene`
  - compact secondary sheet opened from `MenuScene`.
  - exposes low-priority manual play for local QA and a single return action.

Overlay behavior is explicit and centralized: only `OptionsScene` can be active over the menu at once.

## UI + render support modules

- `src/render/palette.ts`
  - retro color tokens for background, board, and UI composition.
- `src/ui/menuButton.ts`
  - reusable retro action button primitive.
- `src/ui/overlaySheet.ts`
  - shared dimmer + panel composition for overlay scenes.
- `src/ui/overlayManager.ts`
  - scene-level overlay guard (`open`, `close`, `closeActive`) that prevents multi-overlay stacking.
