# Legacy tuning defaults (Unreal -> rebuild)

This pass rechecked the rebuilt maze/domain code against the read-only Unreal source in `../mazer-legacy-unreal/Mazer` (`Source/**` and `Config/**`) and tightens the rebuild where the earlier lane still differed.

## Source references used
- Legacy maze lifecycle: `Mazer/Source/Mazer/MazerGameModeBase.cpp`
- Legacy reset scheduler: `Mazer/Source/Mazer/Private/MazerGameState.cpp`
- Legacy menu/demo AI: `Mazer/Source/Mazer/Private/Player/MazerPlayer.cpp`
- Legacy shared defaults: `Mazer/Source/Mazer/Public/MazerGameInstance.h`
- Rebuild tuning source: `src/config/tuning.ts`

## Exact-from-legacy behavior now reflected

### Maze generation
- Grid scale default remains `_Scale = 50` when unset.
- Checkpoint count remains `_Scale + (_Scale * _CheckPointModifier)`.
- Shortcut budget remains `_Scale * _ShortcutCountModifier`.
- Shortcut carving still only runs when `scale > 35`.
- The rebuilt `wallIndices` now mirror the legacy `_WallArray` lifecycle:
  only the selected wall-array entry is removed during shortcut carving, so duplicate references to the same tile can remain behind as stale wall entries.

### Reset / regenerate loop
- Legacy reset still has two distinct branches:
  - reaching the goal sets `_ResetGame`, then `GameState` drives process `8` and regenerates a new maze
  - exhausting the demo AI path stack calls `ResetAiPosition()` and resets only the AI position on the current maze
- The rebuild now distinguishes those branches in the demo walker:
  - goal completion requests a new maze
  - path-stack exhaustion performs an AI-only reset

### Menu demo AI walker
- Direct movement now matches the Unreal logic:
  - scan adjacent path tiles
  - discard visited tiles
  - keep only tiles that pass `AiTilePathCheck(...)`
  - choose the candidate with the smallest distance to the end
- Alternate branches are accumulated in a legacy-style potential-tile list and revisited through backtracking.
- Backtracking now follows the legacy path stack instead of the previous scored DFS trail rewind.
- `AiTilePathCheck(...)` semantics are now reflected:
  non-end candidates must expose at least one unvisited onward path besides the current tile.
- AI-only resets now preserve visited history the same way `ResetAiPosition()` does in legacy:
  only the current tile is cleared, the start tile is marked current again, and the rest of the visited set remains.
- The `_AiLogicSwitch` flip on AI-only reset is now preserved.
- The legacy `AiLogicSwitch` retarget bug is intentionally preserved:
  when that switch is active, the original C++ path retarget branch effectively drains the potential list without selecting a new target, and the rebuild now mirrors that behavior.

### Legacy defaults already retained
- Camera scale edit range remains `-50..50`.
- Camera buffer formula remains `(scale + (camScale * 2)) * preScalar`.
- Path linear RGB remains `(0.19099, 0.192708, 0.18769)`.
- Wall linear RGB remains `(0.067708, 0.067708, 0.067708)`.

## Approximated behavior that remains
- Maze randomness is still deterministic/seeded in the rebuild.
  Legacy C++ mixed `std::random_device`, `std::rand`, and `std::srand(time(0))`, so exact roll-for-roll output is not reproducible from source alone.
- Demo timer values remain approximated.
  `_PlayerAiDelayDuration` was blueprint-driven in the Unreal project; the rebuild keeps the current calibrated timings:
  `exploreStepMs: 92`, `backtrackStepMs: 60`, `decisionPauseMs: 124`, `branchResumeMs: 86`, `goalHoldMs: 960`, `resetHoldMs: 420`.
- Demo maze regeneration uses deterministic seed stepping (`seed + 1` per completed goal maze) as a rebuild approximation for legacy's non-deterministic fresh generation.
- The menu trail rendering is still a rebuild interpretation of the legacy tile color-revert system rather than a literal material-timer port.
- The attract-mode menu now prerolls a small deterministic number of demo steps before first paint so the board reads as active immediately instead of opening on a blank maze.
- The responsive shell is intentionally a rebuild adaptation, not a literal Unreal widget layout port.
  Exact legacy placement depended on a fixed desktop presentation with a visible Start button.
  The rebuild keeps the legacy board-first composition, title-over-board treatment, and side-action feel, but adapts spacing and button placement by breakpoint so the same shell works at `1366x900` and `390x844` without a separate mobile UI.
- Menu-time manual play access is intentionally productized away from the legacy front door.
  Legacy exposed a visible Start button; the rebuild keeps manual play behind the Options overlay and the hidden `M` shortcut so attract mode remains the public default.

## Verification coverage added
- Maze tests now assert the legacy wall-array duplicate quirk after shortcut creation.
- Demo walker tests now cover:
  - direct candidate choice
  - legacy branch backtracking
  - visited-preserving AI reset
  - the legacy `AiLogicSwitch` retarget bug
  - goal-driven maze regeneration requests
- Soak coverage now exercises the recovered demo walker reset/backtrack loop across generated mazes.
