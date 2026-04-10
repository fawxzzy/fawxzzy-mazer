import {
  getNeighborIndex,
  isTileEnd,
  isTileFloor,
  isTilePath,
  resolveDirectionBetween,
  type MazeEpisode
} from '../../src/domain/maze';

export interface MazeInvariantOptions {
  exhaustive?: boolean;
  requireFloorConnection?: boolean;
}

const assertInvariant = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const expectIndexInBounds = (index: number, limit: number, label: string): void => {
  assertInvariant(index >= 0, `${label} expected non-negative index, received ${index}`);
  assertInvariant(index < limit, `${label} expected index below ${limit}, received ${index}`);
};

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

export const assertMazeInvariants = (
  episode: MazeEpisode,
  options: MazeInvariantOptions = {}
): void => {
  const {
    exhaustive = true,
    requireFloorConnection = true
  } = options;
  const tileCount = episode.raster.width * episode.raster.height;
  assertInvariant(
    episode.raster.tiles.length === tileCount,
    `expected ${tileCount} raster tiles, received ${episode.raster.tiles.length}`
  );
  assertInvariant(episode.raster.pathIndices.length > 0, 'expected a non-empty solved path');
  expectIndexInBounds(episode.raster.startIndex, tileCount, 'startIndex');
  expectIndexInBounds(episode.raster.endIndex, tileCount, 'endIndex');
  assertInvariant(
    episode.metrics.solutionLength === episode.raster.pathIndices.length,
    `metrics.solutionLength ${episode.metrics.solutionLength} did not match raster path length ${episode.raster.pathIndices.length}`
  );

  assertInvariant(isTileFloor(episode.raster.tiles, episode.raster.startIndex), 'start tile must be floor');
  assertInvariant(isTilePath(episode.raster.tiles, episode.raster.startIndex), 'start tile must be on the solved path');
  assertInvariant(isTileFloor(episode.raster.tiles, episode.raster.endIndex), 'end tile must be floor');
  assertInvariant(isTilePath(episode.raster.tiles, episode.raster.endIndex), 'end tile must be on the solved path');
  assertInvariant(isTileEnd(episode.raster.tiles, episode.raster.endIndex), 'end tile must be marked as the exit');

  for (const index of episode.raster.pathIndices) {
    expectIndexInBounds(index, tileCount, 'path index');
    assertInvariant(isTilePath(episode.raster.tiles, index), `path index ${index} must be flagged as solved path`);
    assertInvariant(isTileFloor(episode.raster.tiles, index), `path index ${index} must be a floor tile`);
  }

  for (let i = 1; i < episode.raster.pathIndices.length; i += 1) {
    const previous = episode.raster.pathIndices[i - 1];
    assertInvariant(
      resolveDirectionBetween(episode.raster.pathIndices[i], previous, episode.raster.width) !== null,
      `path step ${previous} -> ${episode.raster.pathIndices[i]} must stay cardinally adjacent`
    );
  }

  if (exhaustive) {
    for (let index = 0; index < episode.raster.tiles.length; index += 1) {
      for (let direction = 0; direction < 4; direction += 1) {
        const neighborIndex = getNeighborIndex(index, episode.raster.width, episode.raster.height, direction as 0 | 1 | 2 | 3);
        if (neighborIndex === -1) {
          continue;
        }

        expectIndexInBounds(neighborIndex, tileCount, 'neighbor index');
      }

      if (isTilePath(episode.raster.tiles, index)) {
        assertInvariant(isTileFloor(episode.raster.tiles, index), `path tile ${index} must also be floor`);
      }

      if (isTileEnd(episode.raster.tiles, index)) {
        assertInvariant(isTilePath(episode.raster.tiles, index), `end tile ${index} must also be on the path`);
        assertInvariant(isTileFloor(episode.raster.tiles, index), `end tile ${index} must also be floor`);
      }
    }
  }

  if (requireFloorConnection) {
    assertInvariant(hasFloorConnection(episode), 'floor graph must connect start to end');
  }

  assertInvariant(episode.metrics.coverage > 0, `coverage must be positive, received ${episode.metrics.coverage}`);
  assertInvariant(episode.metrics.coverage <= 1, `coverage must not exceed 1, received ${episode.metrics.coverage}`);
};

export const serializeMaze = (episode: MazeEpisode) => ({
  size: episode.size,
  difficulty: episode.difficulty,
  family: episode.family,
  placementStrategy: episode.placementStrategy,
  presentationPreset: episode.presentationPreset,
  width: episode.raster.width,
  height: episode.raster.height,
  seed: episode.seed,
  startIndex: episode.raster.startIndex,
  endIndex: episode.raster.endIndex,
  pathIndices: episode.raster.pathIndices.slice(),
  shortcutsCreated: episode.shortcutsCreated,
  accepted: episode.accepted,
  tiles: episode.raster.tiles.slice()
});
