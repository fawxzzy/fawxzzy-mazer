import { expect, test } from 'vitest';

import { generateMaze, resetAndRegenerate, type MazeConfig } from '../../src/domain/maze';
import { assertMazeInvariants, serializeMaze } from './maze-test-utils';

const soakIterations = Number.parseInt(process.env.MAZE_SOAK_ITERATIONS ?? '200', 10);
const soakScales = [10, 20, 36, 50];

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
        shortcutCountModifier: scale > 35 ? 0.18 : 0.13
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
