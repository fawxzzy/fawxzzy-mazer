import { expect } from 'vitest';

import { isIndexValid, type MazeBuildResult } from '../../src/domain/maze';

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

const assertShortcutStructure = (maze: MazeBuildResult): void => {
  const pathIndexSet = new Set(maze.pathIndices);

  for (const tile of maze.tiles) {
    if (!tile.path || pathIndexSet.has(tile.index)) {
      continue;
    }

    const [top, bottom, left, right] = tile.neighbors;
    expect(top).not.toBe(-1);
    expect(bottom).not.toBe(-1);
    expect(left).not.toBe(-1);
    expect(right).not.toBe(-1);

    const verticalWallsHorizontalPath = !maze.tiles[top].floor && !maze.tiles[bottom].floor && maze.tiles[left].path && maze.tiles[right].path;
    const horizontalWallsVerticalPath = !maze.tiles[left].floor && !maze.tiles[right].floor && maze.tiles[top].path && maze.tiles[bottom].path;

    expect(verticalWallsHorizontalPath || horizontalWallsVerticalPath).toBe(true);
  }
};

export const assertMazeInvariants = (maze: MazeBuildResult): void => {
  expect(maze.tiles).toHaveLength(maze.scale * maze.scale);
  expect(maze.pathIndices.length).toBeGreaterThan(0);
  expect(maze.checkpointIndices.length).toBeLessThanOrEqual(maze.checkpointCount);
  expect(isIndexValid(maze.startIndex, maze.scale)).toBe(true);
  expect(isIndexValid(maze.endIndex, maze.scale)).toBe(true);

  const startTile = maze.tiles[maze.startIndex];
  const endTile = maze.tiles[maze.endIndex];
  expect(startTile.floor).toBe(true);
  expect(startTile.path).toBe(true);
  expect(endTile.floor).toBe(true);
  expect(endTile.path).toBe(true);
  expect(endTile.end).toBe(true);

  const startNeighborSet = new Set(startTile.neighbors.filter((neighborIndex) => neighborIndex !== -1));
  for (const checkpointIndex of maze.checkpointIndices) {
    expect(isIndexValid(checkpointIndex, maze.scale)).toBe(true);
    expect(checkpointIndex).not.toBe(maze.startIndex);
    expect(startNeighborSet.has(checkpointIndex)).toBe(false);
    expect(maze.tiles[checkpointIndex].neighborCount).toBe(4);
    expect(maze.tiles[checkpointIndex].path).toBe(true);
  }

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
  }

  expect(hasPathConnection(maze)).toBe(true);
  assertShortcutStructure(maze);
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
