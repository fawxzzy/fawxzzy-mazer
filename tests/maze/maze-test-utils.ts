import { expect } from 'vitest';

import { isIndexValid, type MazeEpisode } from '../../src/domain/maze';

const hasFloorConnection = (episode: MazeEpisode): boolean => {
  const queue = [episode.raster.startIndex];
  const visited = new Set<number>([episode.raster.startIndex]);

  while (queue.length > 0) {
    const index = queue.shift();
    if (index === undefined) {
      continue;
    }

    if (index === episode.raster.endIndex) {
      return true;
    }

    for (const neighborIndex of episode.raster.tiles[index].neighbors) {
      if (neighborIndex === -1 || visited.has(neighborIndex) || !episode.raster.tiles[neighborIndex].floor) {
        continue;
      }

      visited.add(neighborIndex);
      queue.push(neighborIndex);
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

  const startTile = episode.raster.tiles[episode.raster.startIndex];
  const endTile = episode.raster.tiles[episode.raster.endIndex];
  expect(startTile.floor).toBe(true);
  expect(startTile.path).toBe(true);
  expect(endTile.floor).toBe(true);
  expect(endTile.path).toBe(true);
  expect(endTile.end).toBe(true);

  for (const tile of episode.raster.tiles) {
    for (const neighborIndex of tile.neighbors) {
      if (neighborIndex === -1) {
        continue;
      }

      expect(isIndexValid(neighborIndex, episode.raster.width, episode.raster.height)).toBe(true);
    }

    if (tile.path) {
      expect(tile.floor).toBe(true);
    }

    if (tile.end) {
      expect(tile.path).toBe(true);
      expect(tile.floor).toBe(true);
    }
  }

  for (const index of episode.raster.pathIndices) {
    expect(isIndexValid(index, episode.raster.width, episode.raster.height)).toBe(true);
    expect(episode.raster.tiles[index].path).toBe(true);
    expect(episode.raster.tiles[index].floor).toBe(true);
  }

  for (let i = 1; i < episode.raster.pathIndices.length; i += 1) {
    const current = episode.raster.tiles[episode.raster.pathIndices[i]];
    const previous = episode.raster.pathIndices[i - 1];
    expect(current.neighbors.includes(previous)).toBe(true);
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
  pathIndices: [...episode.raster.pathIndices],
  shortcutsCreated: episode.shortcutsCreated,
  accepted: episode.accepted,
  tiles: episode.raster.tiles.map((tile) => ({
    floor: tile.floor,
    path: tile.path,
    end: tile.end
  }))
});
