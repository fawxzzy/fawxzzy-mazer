import { describe, expect, test } from 'vitest';

import { generateMaze } from '../../src/domain/maze';
import { pollMoveRepeatDirection, type MoveRepeatState } from '../../src/scenes/gameInput';
import { buildWinSummaryData, resolveElapsedMs } from '../../src/scenes/gameSceneSummary';

describe('game scene completion loop', () => {
  test('hold-to-move repeat stays bounded with a short delay and stable cadence', () => {
    const state: MoveRepeatState = {
      heldDirection: null,
      nextRepeatAtMs: 0
    };

    expect(pollMoveRepeatDirection(state, 0, 3, false, false, false, true, 160, 76)).toBe(3);
    expect(state.heldDirection).toBe(3);
    expect(pollMoveRepeatDirection(state, 120, null, false, false, false, true, 160, 76)).toBeNull();
    expect(pollMoveRepeatDirection(state, 160, null, false, false, false, true, 160, 76)).toBe(3);
    expect(pollMoveRepeatDirection(state, 200, null, false, false, false, true, 160, 76)).toBeNull();
    expect(pollMoveRepeatDirection(state, 236, null, false, false, false, true, 160, 76)).toBe(3);
    expect(pollMoveRepeatDirection(state, 240, 0, true, false, false, true, 160, 76)).toBe(0);
    expect(pollMoveRepeatDirection(state, 260, null, true, false, false, false, 160, 76)).toBeNull();
    expect(pollMoveRepeatDirection(state, 420, null, false, false, false, false, 160, 76)).toBeNull();
    expect(state.heldDirection).toBeNull();
  });

  test('keeps elapsed time at zero until the first legal move starts the run timer', () => {
    expect(resolveElapsedMs(false, 0, 5_000)).toBe(0);
    expect(resolveElapsedMs(true, 1_250, 5_000)).toBe(3_750);
  });

  test('builds a fast win summary with result and personal-best callouts', () => {
    const maze = generateMaze({
      scale: 40,
      seed: 321,
      size: 'large',
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.18
    });

    const summary = buildWinSummaryData(maze, 92_000, 148, {
      bestMoves: 148,
      bestTimeMs: 92_000,
      isNewBestMoves: true,
      isNewBestTime: false,
      previousBestMoves: 151,
      previousBestTimeMs: 88_000,
      progress: {
        bestByDifficulty: {
          chill: { bestMoves: null, bestTimeMs: null },
          standard: { bestMoves: null, bestTimeMs: null },
          spicy: { bestMoves: 148, bestTimeMs: 92_000 },
          brutal: { bestMoves: null, bestTimeMs: null }
        },
        clearsCount: 1,
        lastDifficulty: maze.difficulty,
        lastSize: maze.size
      }
    });

    expect(summary.title).toBe('Maze Complete');
    expect(summary.subtitle).toContain(maze.difficulty.toUpperCase());
    expect(summary.subtitle).toContain('LARGE');
    expect(summary.detailLines[0]).toContain('01:32');
    expect(summary.detailLines[1]).toContain('148');
    expect(summary.detailLines[1]).toContain('NEW BEST');
    expect(summary.detailLines[2]).toContain('LARGE');
    expect(summary.detailLines[3]).toContain('#321');
  });
});
