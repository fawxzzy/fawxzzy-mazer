import { expect } from 'vitest';

import { isIndexValid, type MazeBuildResult } from '../../src/domain/maze';

const hasFloorConnection = (maze: MazeBuildResult): boolean => {
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
      if (neighborIndex === -1 || visited.has(neighborIndex) || !maze.tiles[neighborIndex].floor) {
        continue;
      }

      visited.add(neighborIndex);
      queue.push(neighborIndex);
    }
  }

  return false;
};

export const assertMazeInvariants = (maze: MazeBuildResult): void => {
  expect(maze.tiles).toHaveLength(maze.scale * maze.scale);
  expect(maze.pathIndices.length).toBeGreaterThan(0);
  expect(isIndexValid(maze.startIndex, maze.scale)).toBe(true);
  expect(isIndexValid(maze.endIndex, maze.scale)).toBe(true);
  expect(maze.solution.found).toBe(true);
  expect(maze.solution.path.length).toBe(maze.pathIndices.length);
  expect(maze.metrics.solutionLength).toBe(maze.pathIndices.length);

  const startTile = maze.tiles[maze.startIndex];
  const endTile = maze.tiles[maze.endIndex];
  expect(startTile.floor).toBe(true);
  expect(startTile.path).toBe(true);
  expect(endTile.floor).toBe(true);
  expect(endTile.path).toBe(true);
  expect(endTile.end).toBe(true);

  for (const tile of maze.tiles) {
    for (const neighborIndex of tile.neighbors) {
      if (neighborIndex === -1) {
        continue;
      }

      expect(isIndexValid(neighborIndex, maze.scale)).toBe(true);
    }

    if (tile.path) {
      expect(tile.floor).toBe(true);
    }

    if (tile.end) {
      expect(tile.path).toBe(true);
      expect(tile.floor).toBe(true);
    }
  }

  for (const index of maze.pathIndices) {
    expect(isIndexValid(index, maze.scale)).toBe(true);
    expect(maze.tiles[index].path).toBe(true);
    expect(maze.tiles[index].floor).toBe(true);
  }

  for (const index of maze.wallIndices) {
    expect(isIndexValid(index, maze.scale)).toBe(true);
    expect(maze.tiles[index].floor).toBe(false);
  }

  for (let i = 1; i < maze.pathIndices.length; i += 1) {
    const current = maze.tiles[maze.pathIndices[i]];
    const previous = maze.pathIndices[i - 1];
    expect(current.neighbors.includes(previous)).toBe(true);
  }

  expect(hasFloorConnection(maze)).toBe(true);
  expect(maze.metrics.coverage).toBeGreaterThan(0);
  expect(maze.metrics.coverage).toBeLessThanOrEqual(1);
};

export const serializeMaze = (maze: MazeBuildResult) => ({
  scale: maze.scale,
  seed: maze.seed,
  startIndex: maze.startIndex,
  endIndex: maze.endIndex,
  checkpointCount: maze.checkpointCount,
  checkpointIndices: [...maze.checkpointIndices],
  pathIndices: [...maze.pathIndices],
  wallIndices: [...maze.wallIndices],
  shortcutsCreated: maze.shortcutsCreated,
  tiles: maze.tiles.map((tile) => ({
    floor: tile.floor,
    path: tile.path,
    end: tile.end
  }))
});
