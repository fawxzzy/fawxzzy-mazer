import { expect, test } from 'vitest';

import { advanceDemoWalker, createDemoWalkerState } from '../../src/domain/ai';
import { legacyTuning } from '../../src/config/tuning';
import { generateMaze, resetAndRegenerate, type MazeConfig } from '../../src/domain/maze';
import { assertMazeInvariants, serializeMaze } from './maze-test-utils';

const soakIterations = Number.parseInt(process.env.MAZE_SOAK_ITERATIONS ?? '200', 10);
const soakScales = [18, 30, 40, 50];

test(
  'soak: repeated seeded generation and reset cycles hold invariants',
  () => {
    let state = {
      processCount: 7,
      resetGame: false,
      result: generateMaze({
        scale: soakScales[0],
        seed: 1,
        checkPointModifier: 0.35,
        shortcutCountModifier: 0.18
      })
    };

    for (let iteration = 0; iteration < soakIterations; iteration += 1) {
      const scale = soakScales[iteration % soakScales.length];
      const config: MazeConfig = {
        scale,
        seed: iteration + 1,
        checkPointModifier: 0.35,
        shortcutCountModifier: scale >= 40 ? 0.18 : 0.13
      };

      const maze = generateMaze(config);
      assertMazeInvariants(maze);

      state = resetAndRegenerate(
        {
          ...state,
          resetGame: true
        },
        config
      );

      assertMazeInvariants(state.result);
      expect(serializeMaze(state.result)).toEqual(serializeMaze(maze));
    }
  },
  soakIterations > 1000 ? 180000 : 120000
);

test(
  'soak: demo playback stays on the solved path through regeneration loops',
  () => {
    const demoIterations = Math.max(24, Math.floor(soakIterations / 8));

    for (let iteration = 0; iteration < demoIterations; iteration += 1) {
      const scale = soakScales[iteration % soakScales.length];
      const maze = generateMaze({
        scale,
        seed: iteration + 700,
        checkPointModifier: 0.35,
        shortcutCountModifier: scale >= 40 ? 0.18 : 0.13
      });
      let state = createDemoWalkerState(maze);
      let completedLoop = false;

      for (let step = 0; step < 6000; step += 1) {
        const advance = advanceDemoWalker(maze, state, legacyTuning.demo);
        state = advance.state;

        expect(maze.raster.tiles[state.currentIndex].floor).toBe(true);
        expect(maze.raster.pathIndices.includes(state.currentIndex)).toBe(true);

        if (advance.shouldRegenerateMaze || state.loops > 0) {
          completedLoop = true;
          break;
        }
      }

      expect(completedLoop).toBe(true);
    }
  },
  soakIterations > 1000 ? 180000 : 120000
);
