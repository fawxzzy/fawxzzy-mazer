import { describe, expect, test } from 'vitest';

import { generateMaze, type MazeEpisode } from '../../src/domain/maze';
import { pollMoveRepeatDirection, type MoveRepeatState } from '../../src/scenes/gameInput';
import { buildRunPerformanceData, buildWinSummaryData, resolveElapsedMs } from '../../src/scenes/gameSceneSummary';

const createMasteryTestMaze = (
  optimalPathLength: number,
  size: MazeEpisode['size'],
  difficulty: MazeEpisode['difficulty'],
  seed = 321
): MazeEpisode => ({
  accepted: true,
  difficulty,
  difficultyScore: 0,
  metrics: {
    coverage: 0,
    deadEnds: 0,
    junctions: 0,
    solutionLength: optimalPathLength + 1,
    straightness: 0
  },
  raster: {
    endIndex: optimalPathLength,
    height: 1,
    pathIndices: Uint32Array.from({ length: optimalPathLength + 1 }, (_value, index) => index),
    scale: optimalPathLength + 1,
    startIndex: 0,
    tiles: new Uint8Array(optimalPathLength + 1),
    width: optimalPathLength + 1
  },
  seed,
  shortcutsCreated: 0,
  size
});

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

  test('builds deterministic score data for the same maze and run stats', () => {
    const maze = createMasteryTestMaze(120, 'large', 'spicy');

    expect(buildRunPerformanceData(maze, 96_000, 132)).toEqual(
      buildRunPerformanceData(maze, 96_000, 132)
    );
  });

  test('maps run quality into readable rank thresholds', () => {
    const sMaze = createMasteryTestMaze(120, 'huge', 'brutal');
    const aMaze = createMasteryTestMaze(120, 'medium', 'standard');
    const bMaze = createMasteryTestMaze(120, 'medium', 'standard');
    const cMaze = createMasteryTestMaze(120, 'medium', 'standard');
    const dMaze = createMasteryTestMaze(120, 'medium', 'standard');

    expect(buildRunPerformanceData(sMaze, 96_000, 120).rank).toBe('S');
    expect(buildRunPerformanceData(aMaze, 114_000, 132).rank).toBe('A');
    expect(buildRunPerformanceData(bMaze, 150_000, 144).rank).toBe('B');
    expect(buildRunPerformanceData(cMaze, 180_000, 170).rank).toBe('C');
    expect(buildRunPerformanceData(dMaze, 264_000, 240).rank).toBe('D');
  });

  test('builds a fast win summary with result and personal-best callouts', () => {
    const maze = generateMaze({
      scale: 40,
      seed: 321,
      size: 'large',
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.18
    });
    const performance = buildRunPerformanceData(maze, 92_000, 148);

    const summary = buildWinSummaryData(maze, 92_000, 148, performance, {
      bestEfficiencyPct: performance.efficiencyPercent,
      bestMoves: 148,
      bestRank: performance.rank,
      bestScore: performance.score,
      bestTimeMs: 92_000,
      isNewBestEfficiency: true,
      isNewBestMoves: true,
      isNewBestRank: true,
      isNewBestScore: true,
      isNewBestTime: false,
      previousBestEfficiencyPct: performance.efficiencyPercent - 3,
      previousBestMoves: 151,
      previousBestRank: 'B',
      previousBestScore: performance.score - 120,
      previousBestTimeMs: 88_000,
      progress: {
        bestByBucket: {
          small: {
            chill: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
            standard: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
            spicy: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
            brutal: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null }
          },
          medium: {
            chill: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
            standard: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
            spicy: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
            brutal: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null }
          },
          large: {
            chill: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
            standard: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
            spicy: {
              bestEfficiencyPct: performance.efficiencyPercent,
              bestMoves: 148,
              bestRank: performance.rank,
              bestScore: performance.score,
              bestTimeMs: 92_000
            },
            brutal: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null }
          },
          huge: {
            chill: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
            standard: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
            spicy: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
            brutal: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null }
          }
        },
        clearsCount: 1,
        lastDifficulty: maze.difficulty,
        lastSize: maze.size
      }
    });

    expect(summary.title).toBe('Maze Complete');
    expect(summary.subtitle).toContain(`RANK ${performance.rank}`);
    expect(summary.detailLines[0]).toContain('LARGE');
    expect(summary.detailLines[0]).toContain('#321');
    expect(summary.detailLines[1]).toContain('01:32');
    expect(summary.detailLines[2]).toContain('148');
    expect(summary.detailLines[2]).toContain('NEW BEST');
    expect(summary.detailLines[3]).toContain('OPT');
    expect(summary.detailLines[4]).toContain(`${performance.score}`);
    expect(summary.detailLines[5]).toContain(`RANK ${performance.rank}`);
  });
});
