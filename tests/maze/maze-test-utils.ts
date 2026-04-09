import { expect } from 'vitest';

import {
  getNeighborIndex,
  isIndexValid,
  isTileEnd,
  isTileFloor,
  isTilePath,
  resolveDirectionBetween,
  type MazeEpisode
} from '../../src/domain/maze';

const hasFloorConnection = (episode: MazeEpisode): boolean => {
  const queue = new Int32Array(episode.raster.tiles.length);
  const visited = new Uint8Array(episode.raster.tiles.length);
  let head = 0;
  let tail = 0;

  queue[tail] = episode.raster.startIndex;
  tail += 1;
  visited[episode.raster.startIndex] = 1;

  while (head < tail) {
    const index = queue[head];
    head += 1;

    if (index === episode.raster.endIndex) {
      return true;
    }

    for (let direction = 0; direction < 4; direction += 1) {
      const neighborIndex = getNeighborIndex(index, episode.raster.width, episode.raster.height, direction as 0 | 1 | 2 | 3);
      if (neighborIndex === -1 || visited[neighborIndex] === 1 || !isTileFloor(episode.raster.tiles, neighborIndex)) {
        continue;
      }

      visited[neighborIndex] = 1;
      queue[tail] = neighborIndex;
      tail += 1;
    }
  }

  return false;
};

export const assertMazeInvariants = (episode: MazeEpisode): void => {
  expect(episode.raster.tiles).toHaveLength(episode.raster.width * episode.raster.height);
  expect(episode.raster.pathIndices.length).toBeGreaterThan(0);
  expect(isIndexValid(episode.raster.startIndex, episode.raster.width, episode.raster.height)).toBe(true);
  expect(isIndexValid(episode.raster.endIndex, episode.raster.width, episode.raster.height)).toBe(true);
  expect(episode.metrics.solutionLength).toBe(episode.raster.pathIndices.length);

  expect(isTileFloor(episode.raster.tiles, episode.raster.startIndex)).toBe(true);
  expect(isTilePath(episode.raster.tiles, episode.raster.startIndex)).toBe(true);
  expect(isTileFloor(episode.raster.tiles, episode.raster.endIndex)).toBe(true);
  expect(isTilePath(episode.raster.tiles, episode.raster.endIndex)).toBe(true);
  expect(isTileEnd(episode.raster.tiles, episode.raster.endIndex)).toBe(true);

  for (let index = 0; index < episode.raster.tiles.length; index += 1) {
    for (let direction = 0; direction < 4; direction += 1) {
      const neighborIndex = getNeighborIndex(index, episode.raster.width, episode.raster.height, direction as 0 | 1 | 2 | 3);
      if (neighborIndex === -1) {
        continue;
      }

      expect(isIndexValid(neighborIndex, episode.raster.width, episode.raster.height)).toBe(true);
    }

    if (isTilePath(episode.raster.tiles, index)) {
      expect(isTileFloor(episode.raster.tiles, index)).toBe(true);
    }

    if (isTileEnd(episode.raster.tiles, index)) {
      expect(isTilePath(episode.raster.tiles, index)).toBe(true);
      expect(isTileFloor(episode.raster.tiles, index)).toBe(true);
    }
  }

  for (const index of episode.raster.pathIndices) {
    expect(isIndexValid(index, episode.raster.width, episode.raster.height)).toBe(true);
    expect(isTilePath(episode.raster.tiles, index)).toBe(true);
    expect(isTileFloor(episode.raster.tiles, index)).toBe(true);
  }

  for (let i = 1; i < episode.raster.pathIndices.length; i += 1) {
    const previous = episode.raster.pathIndices[i - 1];
    expect(resolveDirectionBetween(episode.raster.pathIndices[i], previous, episode.raster.width)).not.toBeNull();
  }

  expect(hasFloorConnection(episode)).toBe(true);
  expect(episode.metrics.coverage).toBeGreaterThan(0);
  expect(episode.metrics.coverage).toBeLessThanOrEqual(1);
};

export const serializeMaze = (episode: MazeEpisode) => ({
  width: episode.raster.width,
  height: episode.raster.height,
  seed: episode.seed,
  startIndex: episode.raster.startIndex,
  endIndex: episode.raster.endIndex,
  pathIndices: Array.from(episode.raster.pathIndices),
  shortcutsCreated: episode.shortcutsCreated,
  accepted: episode.accepted,
  tiles: Array.from(episode.raster.tiles, (_tile, index) => ({
    floor: isTileFloor(episode.raster.tiles, index),
    path: isTilePath(episode.raster.tiles, index),
    end: isTileEnd(episode.raster.tiles, index)
  }))
});
