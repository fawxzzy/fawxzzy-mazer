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
  - Legacy-ported checkpoint-driven path carving with mixed neighbor strategy:
    - closest-to-checkpoint candidate
    - random candidate
    - direction-preferred candidate
  - Local adjacency validation prevents dense/invalid routing and preserves the Unreal backtracking rules.
  - Checkpoint sampling now follows the recovered legacy banding (`scale * 3 .. scale^2 - 1`) instead of scanning the full board.
  - Legacy backtracking behavior is preserved, including the "record new closest path entries, then retry from the newest viable one" quirk.
- `src/domain/maze/shortcuts.ts`
  - Shortcut pass opens qualifying wall bridges only when opposite path corridors exist, matching legacy corridor-bridge behavior.
  - Wall candidates intentionally remain duplicated because the Unreal `WallArray` accumulated duplicates and that weighting affects shortcut picks.
- `src/domain/maze/generator.ts`
  - Orchestrates the legacy stage order in pure functions and provides a reset/regenerate loop API.

### Legacy parity notes

- Ported directly from recovered Unreal code:
  - checkpoint count and shortcut budget formulas
  - checkpoint validity rules
  - mixed next-tile chooser ordering
  - backtracking path selection behavior
  - duplicate wall accumulation before shortcut carving
  - reset loop semantics of "consume reset flag, rebuild, return ready state"
- Approximated on purpose:
  - legacy randomness mixed `std::mt19937`, `std::rand`, and `std::time(0)` reseeding; the rebuild uses one deterministic seeded stream so the same input seed always reproduces the same maze
  - legacy menu/demo generation yielded partial work across ticks; the pure TS domain runs the same logic to completion in one call

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
  - renders the starfield, translucent green `Mazer` title, the centered square live maze demo, and one subtle gear utility affordance in the top-right.
  - owns the attract-mode loop by scheduling deterministic demo walker phases (`explore`, `backtrack`, `goal-hold`, `reset-hold`) from the pure AI lane.
  - owns the overlay event bus and enforces one active overlay at a time through `OverlayManager`.
- `GameScene`
  - manual-play QA run entered from `OptionsScene` or hidden keyboard shortcuts on the menu.
- `OptionsScene`
  - compact secondary sheet opened from `MenuScene` via the gear affordance or `Esc`.
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

## Local data contract

Persistent browser data is versioned and namespaced under `mazer:v1:*`.

- `mazer:v1:meta`
  - schema marker used for safe boot cleanup and future migrations.
- `mazer:v1:bestTimes`
  - bounded list of best local completion times, deduped by maze seed and sorted fastest-first.
- `mazer:v1:settings`
  - reserved for future durable player settings; transient runtime state is intentionally excluded.

Boot cleanup removes only Mazer-owned legacy keys, malformed entries, and prior-version artifacts. Runtime-only state such as live trails, demo history, overlays, and debug noise stays in memory and is capped instead of persisted.
