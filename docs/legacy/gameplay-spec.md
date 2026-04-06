# Gameplay spec (legacy truth)

## Core loop
1. Build maze in staged passes.
2. Place player on start tile.
3. Player moves one tile-step per input in cardinal directions.
4. Reaching end tile sets `_ResetGame=true`.
5. Reset branch:
   - if actively playing: leave to template level (returns to menu flow).
   - if not playing (menu demo): regenerate maze in place.

## Maze generation structure
Pipeline (driven by `_ProcessCount`):
- `0`: `CreateGrid`
- `3`: `MapPath`
- `4`: `CreatePath`
- `5`: `CreateShortCuts` (only when scale > 35)
- `6`: `Draw`
- `7`: finalize spawn/HUD/start timer
- `8`: reset/reinitialize

Generation is tick-scheduled by `AMazerGameState::Tick` after `_LevelBuildingLogicDelayDuration`.

## Grid + topology
- Grid is square: `_Scale x _Scale`.
- Tiles are spawned in world-space at multiples of `_MoveDist`.
- Neighbor indices are cardinal-only and stored ordered: top, bottom, left, right.
- Border tiles are marked non-floor early (neighbor count < 4).

## Path carving and checkpoints
- Start tile: random tile index chosen after grid spawn completes.
- Checkpoint count is derived from scale + modifier:
  - `_CheckPointCount = _Scale + (_Scale * _CheckPointModifier)`
- For each checkpoint:
  - select valid interior non-path tile (not start, not adjacent to start, and no path neighbors)
  - extend path toward checkpoint using mixed strategy:
    - closest-to-checkpoint candidate
    - random candidate
    - direction-preferred candidate
  - use local path-adjacency validation to avoid over-dense routing
  - if blocked, backtrack to prior path tiles and retry
- Longest discovered path length updates `_EndTile`.

## Shortcuts
- Shortcut budget scales with maze size:
  - `_ShortcutCount = _Scale * _ShortcutCountModifier`
- Candidate shortcut tile must currently be wall and have full 4-neighbor context.
- A wall becomes a path only when it bridges two opposite existing path corridors:
  - vertical wall pair + horizontal path pair, or
  - horizontal wall pair + vertical path pair.

## Start/end behavior
- Start tile is forced floor and highlighted.
- End tile is forced floor, `End=true`, and highlighted.
- Player spawns at start tile + `_PlayerHeight` Z offset.

## Win/reset loop
- Player overlap on `End=true` tile triggers win branch by setting `_ResetGame=true`.
- Game state tick consumes `_ResetGame` and calls process `8` logic.
- Process `8` reinitializes all arrays/tiles and restarts generation.

## Timer + HUD behavior
- HUD is created only in active play (`_Playing=true`).
- Timer display uses world elapsed seconds formatted `M:SS`.
- HUD arrow rotates to point from player toward end tile.

## Menu demo AI behavior (when `_Playing=false`)
- After initialization, AI loop runs repeatedly on timer `_PlayerAiDelayDuration`.
- AI samples colliding neighbor path tiles and chooses unvisited candidate with smallest distance to end.
- If no direct move exists, AI enters backtracking mode:
  - rewinds through recorded path stack
  - can undo visited flags when needed
  - targets queued potential branch tiles
- If backtracking fully exhausts path list, AI resets to start and flips `_AiLogicSwitch` strategy.
- Trail fade interaction:
  - in demo mode, color-revert delay on traversed tiles depends on AI backtrack undo flags.
