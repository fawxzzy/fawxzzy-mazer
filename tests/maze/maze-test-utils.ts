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

export interface EpisodeTopologySummary {
  corridorMean: number;
  corridorP90: number;
  startEnvironment: EndpointEnvironmentSummary;
  goalEnvironment: EndpointEnvironmentSummary;
  endpointEnvironmentGap: number;
}

export interface EndpointEnvironmentSummary {
  edgeBias: number;
  branchReach: number;
  regionDepth: number;
  turnPotential: number;
  corridorLead: number;
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

export const measureEpisodeTopology = (episode: MazeEpisode): EpisodeTopologySummary => {
  const { tiles, width, height } = episode.raster;
  const degrees = new Uint8Array(tiles.length);
  const turnOpportunities = new Uint8Array(tiles.length);
  for (let index = 0; index < tiles.length; index += 1) {
    if (!isTileFloor(tiles, index)) {
      continue;
    }

    let degree = 0;
    for (let direction = 0; direction < 4; direction += 1) {
      const neighborIndex = getNeighborIndex(index, width, height, direction as 0 | 1 | 2 | 3);
      if (neighborIndex !== -1 && isTileFloor(tiles, neighborIndex)) {
        degree += 1;
      }
    }
    degrees[index] = degree;
    turnOpportunities[index] = degree >= 3 || hasTurnOpportunity(tiles, width, height, index) ? 1 : 0;
  }

  const corridorLengths = collectCorridorLengths(tiles, width, height, degrees);
  const perimeterDistances = buildPerimeterDistances(tiles, width, height);
  const startEnvironment = analyzeEndpointEnvironment(
    episode.raster.startIndex,
    tiles,
    width,
    height,
    degrees,
    turnOpportunities,
    perimeterDistances
  );
  const goalEnvironment = analyzeEndpointEnvironment(
    episode.raster.endIndex,
    tiles,
    width,
    height,
    degrees,
    turnOpportunities,
    perimeterDistances
  );
  return {
    corridorMean: mean(corridorLengths),
    corridorP90: quantile(corridorLengths, 0.9),
    startEnvironment,
    goalEnvironment,
    endpointEnvironmentGap: measureEndpointEnvironmentGap(startEnvironment, goalEnvironment)
  };
};

const collectCorridorLengths = (
  tiles: Uint8Array,
  width: number,
  height: number,
  degrees: Uint8Array
): number[] => {
  const visitedEdges = new Set<string>();
  const lengths: number[] = [];
  const steps = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 }
  ] as const;

  const edgeKey = (from: number, to: number): string => (
    from < to ? `${from}:${to}` : `${to}:${from}`
  );

  const neighborInDirection = (index: number, direction: number): number => {
    const x = (index % width) + steps[direction].dx;
    const y = Math.floor(index / width) + steps[direction].dy;
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return -1;
    }

    const next = (y * width) + x;
    return isTileFloor(tiles, next) ? next : -1;
  };

  for (let index = 0; index < tiles.length; index += 1) {
    if (!isTileFloor(tiles, index)) {
      continue;
    }

    for (let direction = 0; direction < steps.length; direction += 1) {
      const next = neighborInDirection(index, direction);
      if (next === -1) {
        continue;
      }

      const initialEdge = edgeKey(index, next);
      if (visitedEdges.has(initialEdge)) {
        continue;
      }

      visitedEdges.add(initialEdge);
      let current = next;
      let previous = index;
      let length = 1;
      let heading = direction;

      while (degrees[current] === 2) {
        const forward = neighborInDirection(current, heading);
        if (forward !== -1 && forward !== previous) {
          visitedEdges.add(edgeKey(current, forward));
          previous = current;
          current = forward;
          length += 1;
          continue;
        }

        const opposite = (heading + 2) % 4;
        let turned = false;
        for (let nextHeading = 0; nextHeading < steps.length; nextHeading += 1) {
          if (nextHeading === heading || nextHeading === opposite) {
            continue;
          }
          const turnedNeighbor = neighborInDirection(current, nextHeading);
          if (turnedNeighbor === -1 || turnedNeighbor === previous) {
            continue;
          }

          visitedEdges.add(edgeKey(current, turnedNeighbor));
          previous = current;
          current = turnedNeighbor;
          heading = nextHeading;
          length += 1;
          turned = true;
          break;
        }

        if (!turned) {
          break;
        }
      }

      lengths.push(length);
    }
  }

  return lengths;
};

const analyzeEndpointEnvironment = (
  index: number,
  tiles: Uint8Array,
  width: number,
  height: number,
  degrees: Uint8Array,
  turnOpportunities: Uint8Array,
  perimeterDistances: Int32Array
): EndpointEnvironmentSummary => {
  const x = index % width;
  const y = Math.floor(index / width);
  const edgeDistance = Math.min(x, y, (width - 1) - x, (height - 1) - y);
  const edgeBias = clamp(1 - (edgeDistance / Math.max(1, Math.floor(Math.min(width, height) / 2))), 0, 1);
  const maxPerimeterDistance = Math.max(1, ...perimeterDistances);
  return {
    edgeBias,
    branchReach: measureBranchReach(width, height, degrees, x, y),
    regionDepth: clamp(perimeterDistances[index] / maxPerimeterDistance, 0, 1),
    turnPotential: measureTurnPotential(width, height, degrees, turnOpportunities, x, y),
    corridorLead: measureCorridorLead(index, tiles, width, height, degrees) / Math.max(1, Math.max(width, height))
  };
};

const measureEndpointEnvironmentGap = (
  start: EndpointEnvironmentSummary,
  goal: EndpointEnvironmentSummary
): number => (
  (Math.abs(start.edgeBias - goal.edgeBias) * 0.52)
  + (Math.abs(start.branchReach - goal.branchReach) * 0.96)
  + (Math.abs(start.regionDepth - goal.regionDepth) * 0.9)
  + (Math.abs(start.turnPotential - goal.turnPotential) * 0.84)
  + (Math.abs(start.corridorLead - goal.corridorLead) * 0.72)
);

const measureBranchReach = (
  width: number,
  height: number,
  degrees: Uint8Array,
  originX: number,
  originY: number
): number => {
  let branchWeight = 0;
  let totalWeight = 0;

  for (let offsetY = -3; offsetY <= 3; offsetY += 1) {
    for (let offsetX = -3; offsetX <= 3; offsetX += 1) {
      const manhattanDistance = Math.abs(offsetX) + Math.abs(offsetY);
      if (manhattanDistance > 4) {
        continue;
      }

      const x = originX + offsetX;
      const y = originY + offsetY;
      if (x < 0 || y < 0 || x >= width || y >= height) {
        continue;
      }

      const weight = 1 / (1 + (manhattanDistance * 0.68));
      totalWeight += weight;
      if (degrees[(y * width) + x] >= 3) {
        branchWeight += weight;
      }
    }
  }

  return branchWeight / Math.max(1, totalWeight);
};

const measureTurnPotential = (
  width: number,
  height: number,
  degrees: Uint8Array,
  turnOpportunities: Uint8Array,
  originX: number,
  originY: number
): number => {
  let turnWeight = 0;
  let totalWeight = 0;

  for (let offsetY = -3; offsetY <= 3; offsetY += 1) {
    for (let offsetX = -3; offsetX <= 3; offsetX += 1) {
      const manhattanDistance = Math.abs(offsetX) + Math.abs(offsetY);
      if (manhattanDistance > 4) {
        continue;
      }

      const x = originX + offsetX;
      const y = originY + offsetY;
      if (x < 0 || y < 0 || x >= width || y >= height) {
        continue;
      }

      const currentIndex = (y * width) + x;
      const weight = 1 / (1 + (manhattanDistance * 0.68));
      totalWeight += weight;
      if (degrees[currentIndex] >= 3) {
        turnWeight += weight;
        continue;
      }
      if (turnOpportunities[currentIndex] === 1) {
        turnWeight += weight * 0.82;
        continue;
      }
      if (degrees[currentIndex] === 1) {
        turnWeight += weight * 0.14;
      }
    }
  }

  return turnWeight / Math.max(1, totalWeight);
};

const measureCorridorLead = (
  startIndex: number,
  tiles: Uint8Array,
  width: number,
  height: number,
  degrees: Uint8Array
): number => {
  let length = 0;
  let current = startIndex;
  let previous = -1;

  while (true) {
    const next = getOpenNeighbors(tiles, width, height, current).filter((candidate) => candidate !== previous);
    if (next.length !== 1) {
      return length;
    }

    previous = current;
    current = next[0];
    length += 1;

    if (degrees[current] !== 2) {
      return length;
    }
  }
};

const buildPerimeterDistances = (tiles: Uint8Array, width: number, height: number): Int32Array => {
  const distances = new Int32Array(tiles.length);
  distances.fill(-1);
  const queue = new Int32Array(tiles.length);
  let head = 0;
  let tail = 0;

  for (let index = 0; index < tiles.length; index += 1) {
    const x = index % width;
    const y = Math.floor(index / width);
    if (!isTileFloor(tiles, index) || (x !== 0 && y !== 0 && x !== width - 1 && y !== height - 1)) {
      continue;
    }

    distances[index] = 0;
    queue[tail] = index;
    tail += 1;
  }

  while (head < tail) {
    const current = queue[head];
    head += 1;

    for (const neighbor of getOpenNeighbors(tiles, width, height, current)) {
      if (distances[neighbor] !== -1) {
        continue;
      }

      distances[neighbor] = distances[current] + 1;
      queue[tail] = neighbor;
      tail += 1;
    }
  }

  return distances;
};

const getOpenNeighbors = (tiles: Uint8Array, width: number, height: number, index: number): number[] => {
  const neighbors: number[] = [];
  const x = index % width;
  const y = Math.floor(index / width);
  for (const step of [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 }
  ] as const) {
    const nextX = x + step.dx;
    const nextY = y + step.dy;
    if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
      continue;
    }

    const next = (nextY * width) + nextX;
    if (isTileFloor(tiles, next)) {
      neighbors.push(next);
    }
  }
  return neighbors;
};

const hasTurnOpportunity = (tiles: Uint8Array, width: number, height: number, index: number): boolean => {
  if (!isTileFloor(tiles, index)) {
    return false;
  }

  const x = index % width;
  const y = Math.floor(index / width);
  const openNorth = y > 0 && isTileFloor(tiles, ((y - 1) * width) + x);
  const openSouth = y < height - 1 && isTileFloor(tiles, ((y + 1) * width) + x);
  const openEast = x < width - 1 && isTileFloor(tiles, (y * width) + x + 1);
  const openWest = x > 0 && isTileFloor(tiles, (y * width) + x - 1);
  return (openNorth || openSouth) && (openEast || openWest);
};

const quantile = (values: readonly number[], q: number): number => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) {
    return sorted[lower];
  }
  const ratio = position - lower;
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * ratio);
};

const mean = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total / values.length;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
