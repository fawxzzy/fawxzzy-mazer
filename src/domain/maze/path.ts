import type { SeededRng } from '../rng/seededRng';
import type { MazeTile } from './types';

interface MapPathResult {
  pathIndices: number[];
  checkpointIndices: number[];
  endIndex: number;
}

interface PathEntry {
  index: number;
  pathLength: number;
}

const distance = (a: MazeTile, b: MazeTile): number => Math.hypot(a.x - b.x, a.y - b.y);

const pickCheckpoint = (
  tiles: MazeTile[],
  startIndex: number,
  scale: number,
  remainingCheckpoints: number,
  rng: SeededRng
): { checkpointIndex: number | null; remainingCheckpoints: number } => {
  const gridSize = tiles.length;
  const lowerBound = Math.min(gridSize - 1, Math.max(0, scale * 3));
  const startNeighbors = new Set(tiles[startIndex].neighbors.filter((neighborIndex) => neighborIndex !== -1));
  let breakCount = 1;
  let remaining = remainingCheckpoints;

  while (remaining > 0) {
    if (breakCount % 10 === 0) {
      remaining -= 1;
      if (remaining <= 0) {
        return { checkpointIndex: null, remainingCheckpoints: 0 };
      }
    }

    const candidateIndex = rng.nextInt(lowerBound, gridSize - 1);
    const candidate = tiles[candidateIndex];

    if (
      candidate.index === startIndex ||
      candidate.neighborCount !== 4 ||
      candidate.path ||
      startNeighbors.has(candidate.index)
    ) {
      breakCount += 1;
      continue;
    }

    const hasOnlyNonPathNeighbors = candidate.neighbors.every(
      (neighborIndex) => neighborIndex !== -1 && !tiles[neighborIndex].path
    );

    if (hasOnlyNonPathNeighbors) {
      return { checkpointIndex: candidate.index, remainingCheckpoints: remaining - 1 };
    }

    breakCount += 1;
  }

  return { checkpointIndex: null, remainingCheckpoints: remaining };
};

const checkNextTile = (
  tiles: MazeTile[],
  startIndex: number,
  currentIndex: number,
  neighborIndex: number,
  backtracking: boolean
): boolean => {
  let pathCount = 0;
  const neighborTile = tiles[neighborIndex];

  for (const subNeighborIndex of neighborTile.neighbors) {
    if (
      subNeighborIndex === -1 ||
      subNeighborIndex === currentIndex ||
      subNeighborIndex === startIndex ||
      currentIndex === startIndex
    ) {
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

const findClosestTile = (
  tiles: MazeTile[],
  currentIndex: number,
  checkpointIndex: number,
  startIndex: number,
  backtracking: boolean
): number => {
  let returnIndex = -1;
  let smallestDistance = Number.POSITIVE_INFINITY;

  for (const neighborIndex of tiles[currentIndex].neighbors) {
    if (neighborIndex === -1 || tiles[neighborIndex].path) {
      continue;
    }

    if (neighborIndex === checkpointIndex) {
      return neighborIndex;
    }

    if (checkNextTile(tiles, startIndex, currentIndex, neighborIndex, backtracking)) {
      const candidateDistance = distance(tiles[neighborIndex], tiles[checkpointIndex]);
      if (candidateDistance < smallestDistance) {
        smallestDistance = candidateDistance;
        returnIndex = neighborIndex;
      }
    }
  }

  return returnIndex;
};

const findRandomTile = (
  tiles: MazeTile[],
  currentIndex: number,
  checkpointIndex: number,
  startIndex: number,
  backtracking: boolean,
  rng: SeededRng
): number => {
  const randomDirection = rng.nextInt(0, 3) as 0 | 1 | 2 | 3;
  const candidateIndex = tiles[currentIndex].neighbors[randomDirection];
  if (candidateIndex === -1 || tiles[candidateIndex].path) {
    return -1;
  }

  return checkNextTile(tiles, startIndex, currentIndex, candidateIndex, backtracking) || candidateIndex === checkpointIndex
    ? candidateIndex
    : -1;
};

const findPreferredTile = (
  tiles: MazeTile[],
  currentIndex: number,
  checkpointIndex: number,
  startIndex: number,
  backtracking: boolean
): number => {
  const currentTile = tiles[currentIndex];
  const checkpointTile = tiles[checkpointIndex];
  const preferredDirection = (Math.abs(checkpointTile.x - currentTile.x) <= Math.abs(checkpointTile.y - currentTile.y)
    ? (checkpointTile.x > currentTile.x ? 3 : 2)
    : (checkpointTile.y > currentTile.y ? 0 : 1)) as 0 | 1 | 2 | 3;

  const candidateIndex = currentTile.neighbors[preferredDirection];
  if (candidateIndex === -1 || tiles[candidateIndex].path) {
    return -1;
  }

  return checkNextTile(tiles, startIndex, currentIndex, candidateIndex, backtracking) || candidateIndex === checkpointIndex
    ? candidateIndex
    : -1;
};

const findNextTile = (
  tiles: MazeTile[],
  currentIndex: number,
  checkpointIndex: number,
  startIndex: number,
  backtracking: boolean,
  rng: SeededRng
): number => {
  const candidateIndices = [
    findClosestTile(tiles, currentIndex, checkpointIndex, startIndex, backtracking),
    findRandomTile(tiles, currentIndex, checkpointIndex, startIndex, backtracking, rng),
    findPreferredTile(tiles, currentIndex, checkpointIndex, startIndex, backtracking)
  ];

  while (candidateIndices.length > 0) {
    const pickedCandidateOffset = rng.nextInt(0, candidateIndices.length - 1);
    const pickedIndex = candidateIndices[pickedCandidateOffset];
    if (pickedIndex !== -1) {
      return pickedIndex;
    }

    candidateIndices.splice(pickedCandidateOffset, 1);
  }

  return -1;
};

const backtrack = (
  tiles: MazeTile[],
  pathEntries: PathEntry[],
  checkpointIndex: number,
  startIndex: number,
  rng: SeededRng
): { nextIndex: number; pathLength: number } => {
  const potentialPathEntries: PathEntry[] = [];
  let smallestDistance = Number.POSITIVE_INFINITY;

  for (const entry of pathEntries) {
    const candidateDistance = distance(tiles[entry.index], tiles[checkpointIndex]);
    if (candidateDistance < smallestDistance) {
      smallestDistance = candidateDistance;
      potentialPathEntries.push(entry);
    }
  }

  if (potentialPathEntries.length === 0) {
    return { nextIndex: -1, pathLength: 0 };
  }

  if (rng.nextInt(0, 3) === 3) {
    const randomEntry = potentialPathEntries[rng.nextInt(0, potentialPathEntries.length - 1)];
    const nextIndex = findNextTile(tiles, randomEntry.index, checkpointIndex, startIndex, true, rng);
    if (nextIndex !== -1) {
      return { nextIndex, pathLength: randomEntry.pathLength };
    }
  } else {
    for (let i = potentialPathEntries.length - 1; i >= 0; i -= 1) {
      const entry = potentialPathEntries[i];
      const nextIndex = findNextTile(tiles, entry.index, checkpointIndex, startIndex, true, rng);
      if (nextIndex !== -1) {
        return { nextIndex, pathLength: entry.pathLength };
      }
    }
  }

  return { nextIndex: -1, pathLength: 0 };
};

export const mapPathWithCheckpoints = (
  tiles: MazeTile[],
  startIndex: number,
  scale: number,
  checkpointCount: number,
  rng: SeededRng
): MapPathResult => {
  const pathIndices: number[] = [];
  const checkpointIndices: number[] = [];
  const pathEntries: PathEntry[] = [];
  let remaining = checkpointCount;
  let currentIndex = startIndex;
  let pathLengthCount = 0;
  let longestLength = Number.NEGATIVE_INFINITY;
  let endIndex = startIndex;

  while (remaining > 0) {
    const { checkpointIndex, remainingCheckpoints } = pickCheckpoint(tiles, startIndex, scale, remaining, rng);
    remaining = remainingCheckpoints;
    if (checkpointIndex === null) {
      break;
    }

    while (true) {
      if (currentIndex === -1) {
        const { nextIndex, pathLength } = backtrack(tiles, pathEntries, checkpointIndex, startIndex, rng);
        if (nextIndex === -1) {
          break;
        }

        currentIndex = nextIndex;
        pathLengthCount = pathLength;
        continue;
      }

      tiles[currentIndex].path = true;
      tiles[currentIndex].floor = true;
      pathLengthCount += 1;
      pathIndices.push(currentIndex);
      pathEntries.push({ index: currentIndex, pathLength: pathLengthCount });

      if (currentIndex === checkpointIndex) {
        checkpointIndices.push(checkpointIndex);
        break;
      }

      const previousIndex = currentIndex;
      currentIndex = findNextTile(tiles, currentIndex, checkpointIndex, startIndex, false, rng);

      if (currentIndex === -1 && pathLengthCount > longestLength) {
        longestLength = pathLengthCount;
        endIndex = previousIndex;
      }
    }
  }

  tiles[startIndex].path = true;
  tiles[startIndex].floor = true;

  if (!pathIndices.includes(startIndex)) {
    pathIndices.unshift(startIndex);
  }

  if (endIndex === startIndex && pathIndices.length > 0) {
    endIndex = pathIndices[pathIndices.length - 1];
  }

  tiles[endIndex].end = true;
  tiles[endIndex].floor = true;

  return {
    pathIndices,
    checkpointIndices,
    endIndex
  };
};
