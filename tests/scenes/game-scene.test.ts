import { describe, expect, test } from 'vitest';

import { generateMaze } from '../../src/domain/maze';
import { buildWinSummaryData, resolveElapsedMs } from '../../src/scenes/gameSceneSummary';

describe('game scene completion loop', () => {
  test('keeps elapsed time at zero until the first legal move starts the run timer', () => {
    expect(resolveElapsedMs(false, 0, 5_000)).toBe(0);
    expect(resolveElapsedMs(true, 1_250, 5_000)).toBe(3_750);
  });

  test('builds a fast win summary with result and personal-best callouts', () => {
    const maze = generateMaze({
      scale: 40,
      seed: 321,
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
        lastDifficulty: maze.difficulty
      }
    });

    expect(summary.title).toBe('Maze Complete');
    expect(summary.subtitle).toContain(maze.difficulty.toUpperCase());
    expect(summary.detailLines[0]).toContain('01:32');
    expect(summary.detailLines[1]).toContain('148');
    expect(summary.detailLines[1]).toContain('NEW BEST');
    expect(summary.detailLines[2]).toContain('#321');
  });
});
