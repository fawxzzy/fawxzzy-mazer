import { describe, expect, test } from 'vitest';

import { createGrid, generateMaze, isIndexValid, isWithinSameRow, resetAndRegenerate, type MazeConfig } from '../../src/domain/maze';
import { assertMazeInvariants, serializeMaze } from './maze-test-utils';

const defaultConfig: MazeConfig = {
  scale: 20,
  seed: 42,
  checkPointModifier: 0.2,
  shortcutCountModifier: 0.2
};

describe('maze domain generation', () => {
  test('is deterministic from seed', () => {
    const a = generateMaze(defaultConfig);
    const b = generateMaze(defaultConfig);

    expect(serializeMaze(a)).toEqual(serializeMaze(b));
  });

  test('preserves core maze invariants', () => {
    assertMazeInvariants(generateMaze(defaultConfig));
  });

  test('keeps checkpoint selection aligned with the recovered legacy sampling band', () => {
    const maze = generateMaze(defaultConfig);

    expect(maze.checkpointIndices.length).toBeGreaterThan(0);
    for (const checkpointIndex of maze.checkpointIndices) {
      expect(checkpointIndex).toBeGreaterThanOrEqual(defaultConfig.scale * 3);
    }
  });

  test('creates shortcut bridges on larger boards', () => {
    const maze = generateMaze({
      scale: 40,
      seed: 333,
      checkPointModifier: 0.3,
      shortcutCountModifier: 0.8
    });

    assertMazeInvariants(maze);
    expect(maze.shortcutsCreated).toBeGreaterThan(0);
  });

  test('neighbor logic does not create out-of-bounds neighbors', () => {
    const scale = 9;
    const grid = createGrid(scale);

    for (const tile of grid) {
      for (let direction = 0; direction < 4; direction += 1) {
        const cardinalDirection = direction as 0 | 1 | 2 | 3;
        const neighborIndex = tile.neighbors[cardinalDirection];
        if (neighborIndex === -1) {
          continue;
        }

        expect(isIndexValid(neighborIndex, scale)).toBe(true);
        expect(isWithinSameRow(tile.index, neighborIndex, cardinalDirection, scale)).toBe(true);
      }
    }
  });

  test('reset/regenerate loop only regenerates when flagged', () => {
    const initial = {
      processCount: 7,
      resetGame: false,
      result: generateMaze(defaultConfig)
    };

    const untouched = resetAndRegenerate(initial, defaultConfig);
    expect(untouched).toBe(initial);

    const regenerated = resetAndRegenerate({ ...initial, resetGame: true }, { ...defaultConfig, seed: 43 });
    expect(regenerated).not.toBe(initial);
    expect(regenerated.resetGame).toBe(false);
    expect(regenerated.processCount).toBe(7);
    expect(regenerated.result.seed).toBe(43);
    assertMazeInvariants(regenerated.result);
  });

  test('remains stable across repeated regeneration', () => {
    let state = {
      processCount: 7,
      resetGame: false,
      result: generateMaze(defaultConfig)
    };

    for (let seed = 44; seed < 84; seed += 1) {
      state = resetAndRegenerate(
        {
          ...state,
          resetGame: true
        },
        {
          ...defaultConfig,
          seed
        }
      );

      assertMazeInvariants(state.result);
      expect(serializeMaze(state.result)).toEqual(
        serializeMaze(
          generateMaze({
            ...defaultConfig,
            seed
          })
        )
      );
    }
  }, 20000);
});
