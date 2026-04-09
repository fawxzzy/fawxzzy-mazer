import { describe, expect, test } from 'vitest';

import { generateMaze } from '../../src/domain/maze';
import { buildWinSummaryData } from '../../src/scenes/gameSceneSummary';

describe('game scene completion loop', () => {
  test('builds a deterministic win summary from the completed run state', () => {
    const maze = generateMaze({
      scale: 40,
      seed: 321,
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.18
    });

    const summary = buildWinSummaryData(maze, 92_000, 148);

    expect(summary.title).toBe('Maze Complete');
    expect(summary.subtitle).toContain(maze.difficulty.toUpperCase());
    expect(summary.subtitle).toContain('01:32');
    expect(summary.subtitle).toContain('148 moves');
  });
});
