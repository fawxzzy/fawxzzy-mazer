import type { SeededRng } from '../rng/seededRng';
import type { MazeTile } from './types';

interface MapPathResult {
  pathIndices: number[];
  endIndex: number;
}

const distanceSquared = (a: MazeTile, b: MazeTile): number => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return (dx * dx) + (dy * dy);
};

const pickCheckpoint = (
  tiles: MazeTile[],
  startIndex: number,
  remainingCheckpoints: number,
  rng: SeededRng
): { checkpointIndex: number | null; remainingCheckpoints: number } => {
  let breakCount = 1;
  let remaining = remainingCheckpoints;
  const startNeighbors = new Set(tiles[startIndex].neighbors.filter((n) => n !== -1));

  while (remaining > 0) {
    if (breakCount % 10 === 0) {
      remaining -= 1;
      if (remaining <= 0) {
        return { checkpointIndex: null, remainingCheckpoints: 0 };
      }
    }

    const randTile = rng.nextInt(0, tiles.length - 1);
    const tile = tiles[randTile];

    if (tile.index === startIndex || tile.neighborCount !== 4 || tile.path || startNeighbors.has(tile.index)) {
      breakCount += 1;
      continue;
    }

    const hasPathNeighbor = tile.neighbors.some((neighborIndex) => neighborIndex === -1 || tiles[neighborIndex].path);
    if (!hasPathNeighbor) {
      return { checkpointIndex: tile.index, remainingCheckpoints: remaining - 1 };
    }

    breakCount += 1;
  }

  return { checkpointIndex: null, remainingCheckpoints: remaining };
};

const checkNextTile = (tiles: MazeTile[], startIndex: number, currentIndex: number, neighborIndex: number, backtracking: boolean): boolean => {
  let pathCount = 0;
  const neighborTile = tiles[neighborIndex];

  for (const subNeighborIndex of neighborTile.neighbors) {
    if (subNeighborIndex === -1 || subNeighborIndex === currentIndex || subNeighborIndex === startIndex || currentIndex === startIndex) {
      continue;
    }

    if (tiles[subNeighborIndex].path) {
      pathCount += 1;
      if ((backtracking && pathCount > 1) || (!backtracking && pathCount > 0)) {
        return false;
      }
    }
  }

  return true;
};

const findClosestTile = (tiles: MazeTile[], currentIndex: number, checkpointIndex: number, startIndex: number, backtracking: boolean): number => {
  const current = tiles[currentIndex];
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const neighborIndex of current.neighbors) {
    if (neighborIndex === -1 || tiles[neighborIndex].path) {
      continue;
    }

    if (neighborIndex === checkpointIndex) {
      return neighborIndex;
    }

    if (checkNextTile(tiles, startIndex, currentIndex, neighborIndex, backtracking)) {
      const d = distanceSquared(tiles[neighborIndex], tiles[checkpointIndex]);
      if (d < bestDistance) {
        bestDistance = d;
        best = neighborIndex;
      }
    }
  }

  return best;
};

const findRandomTile = (tiles: MazeTile[], currentIndex: number, checkpointIndex: number, startIndex: number, backtracking: boolean, rng: SeededRng): number => {
  const candidate = tiles[currentIndex].neighbors[rng.nextInt(0, 3)];
  if (candidate === -1 || tiles[candidate].path) {
    return -1;
  }

  return checkNextTile(tiles, startIndex, currentIndex, candidate, backtracking) || candidate === checkpointIndex ? candidate : -1;
};

const findPreferredTile = (tiles: MazeTile[], currentIndex: number, checkpointIndex: number, startIndex: number, backtracking: boolean): number => {
  const current = tiles[currentIndex];
  const checkpoint = tiles[checkpointIndex];

  const dx = checkpoint.x - current.x;
  const dy = checkpoint.y - current.y;
  const preferredDirection = (Math.abs(dx) <= Math.abs(dy)
    ? (dx > 0 ? 3 : 2)
    : (dy > 0 ? 0 : 1)) as 0 | 1 | 2 | 3;

  const candidate = current.neighbors[preferredDirection];
  if (candidate === -1 || tiles[candidate].path) {
    return -1;
  }

  return checkNextTile(tiles, startIndex, currentIndex, candidate, backtracking) || candidate === checkpointIndex ? candidate : -1;
};

const findNextTile = (
  tiles: MazeTile[],
  currentIndex: number,
  checkpointIndex: number,
  startIndex: number,
  backtracking: boolean,
  rng: SeededRng
): number => {
  const indices = [
    findClosestTile(tiles, currentIndex, checkpointIndex, startIndex, backtracking),
    findRandomTile(tiles, currentIndex, checkpointIndex, startIndex, backtracking, rng),
    findPreferredTile(tiles, currentIndex, checkpointIndex, startIndex, backtracking)
  ];

  while (indices.length > 0) {
    const randomPick = rng.nextInt(0, indices.length - 1);
    const index = indices[randomPick];
    if (index !== -1) {
      return index;
    }
    indices.splice(randomPick, 1);
  }

  return -1;
};

const backtrack = (tiles: MazeTile[], pathIndices: number[], checkpointIndex: number, startIndex: number, rng: SeededRng): number => {
  const scored = pathIndices
    .map((index) => ({ index, d: distanceSquared(tiles[index], tiles[checkpointIndex]) }))
    .sort((a, b) => a.d - b.d)
    .map((entry) => entry.index);

  if (scored.length === 0) {
    return -1;
  }

  if (rng.nextInt(0, 3) === 3) {
    const randomTile = scored[rng.nextInt(0, scored.length - 1)];
    return findNextTile(tiles, randomTile, checkpointIndex, startIndex, true, rng);
  }

  for (let i = scored.length - 1; i >= 0; i -= 1) {
    const candidate = findNextTile(tiles, scored[i], checkpointIndex, startIndex, true, rng);
    if (candidate !== -1) {
      return candidate;
    }
  }

  return -1;
};

export const mapPathWithCheckpoints = (
  tiles: MazeTile[],
  startIndex: number,
  checkpointCount: number,
  rng: SeededRng
): MapPathResult => {
  const pathIndices: number[] = [];
  let remaining = checkpointCount;
  let currentIndex = startIndex;
  let pathLengthCount = 0;
  let longestLength = 0;
  let endIndex = startIndex;

  while (remaining > 0) {
    const { checkpointIndex, remainingCheckpoints } = pickCheckpoint(tiles, startIndex, remaining, rng);
    remaining = remainingCheckpoints;
    if (checkpointIndex === null) {
      break;
    }

    while (true) {
      tiles[currentIndex].path = true;
      pathIndices.push(currentIndex);
      pathLengthCount += 1;

      if (currentIndex === checkpointIndex) {
        break;
      }

      const tempCurrent = currentIndex;
      const nextIndex = findNextTile(tiles, currentIndex, checkpointIndex, startIndex, false, rng);
      if (nextIndex === -1) {
        if (pathLengthCount > longestLength) {
          longestLength = pathLengthCount;
          endIndex = tempCurrent;
        }

        const backtracked = backtrack(tiles, pathIndices, checkpointIndex, startIndex, rng);
        if (backtracked === -1) {
          break;
        }

        currentIndex = backtracked;
        const indexInPath = pathIndices.lastIndexOf(currentIndex);
        pathLengthCount = indexInPath >= 0 ? indexInPath + 1 : pathLengthCount;
        continue;
      }

      currentIndex = nextIndex;
    }
  }

  tiles[startIndex].path = true;
  if (!pathIndices.includes(startIndex)) {
    pathIndices.unshift(startIndex);
  }

  if (endIndex === startIndex && pathIndices.length > 0) {
    endIndex = pathIndices[pathIndices.length - 1];
  }

  tiles[endIndex].end = true;
  tiles[endIndex].floor = true;
  tiles[startIndex].floor = true;

  return {
    pathIndices,
    endIndex
  };
};
