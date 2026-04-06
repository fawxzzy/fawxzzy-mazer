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
