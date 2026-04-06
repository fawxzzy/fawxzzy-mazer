import { describe, expect, test } from 'vitest';

import {
  createGrid,
  generateMaze,
  isIndexValid,
  isWithinSameRow,
  type MazeBuildResult,
  resetAndRegenerate
} from '../../src/domain/maze';

const defaultConfig = {
  scale: 20,
  seed: 42,
  checkPointModifier: 0.2,
  shortcutCountModifier: 0.2
};

const hasPathConnection = (maze: MazeBuildResult): boolean => {
  const queue = [maze.startIndex];
  const visited = new Set<number>([maze.startIndex]);

  while (queue.length > 0) {
    const index = queue.shift();
    if (index === undefined) {
      continue;
    }

    if (index === maze.endIndex) {
      return true;
    }

    for (const neighborIndex of maze.tiles[index].neighbors) {
      if (neighborIndex === -1 || visited.has(neighborIndex) || !maze.tiles[neighborIndex].path) {
        continue;
      }
      visited.add(neighborIndex);
      queue.push(neighborIndex);
    }
  }

  return false;
};

describe('maze domain generation', () => {
  test('is deterministic from seed', () => {
    const a = generateMaze(defaultConfig);
    const b = generateMaze(defaultConfig);

    expect(a.startIndex).toBe(b.startIndex);
    expect(a.endIndex).toBe(b.endIndex);
    expect(a.pathIndices).toEqual(b.pathIndices);
    expect(a.tiles.map((t) => ({ floor: t.floor, path: t.path, end: t.end }))).toEqual(
      b.tiles.map((t) => ({ floor: t.floor, path: t.path, end: t.end }))
    );
  });

  test('start and end are valid and marked as floor/path', () => {
    const maze = generateMaze(defaultConfig);

    expect(maze.startIndex).toBeGreaterThanOrEqual(0);
    expect(maze.startIndex).toBeLessThan(maze.tiles.length);
    expect(maze.endIndex).toBeGreaterThanOrEqual(0);
    expect(maze.endIndex).toBeLessThan(maze.tiles.length);

    expect(maze.tiles[maze.startIndex].floor).toBe(true);
    expect(maze.tiles[maze.startIndex].path).toBe(true);
    expect(maze.tiles[maze.endIndex].floor).toBe(true);
    expect(maze.tiles[maze.endIndex].path).toBe(true);
    expect(maze.tiles[maze.endIndex].end).toBe(true);
  });

  test('main path is traversable from start to end', () => {
    const maze = generateMaze(defaultConfig);
    expect(hasPathConnection(maze)).toBe(true);
  });

  test('shortcuts are created when configured for large scales', () => {
    const maze = generateMaze({
      scale: 40,
      seed: 333,
      checkPointModifier: 0.3,
      shortcutCountModifier: 0.8
    });

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
  });
});
