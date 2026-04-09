import type { CortexSample, MazeEpisode, Point } from './types';

export const toCortexSample = (
  episode: MazeEpisode,
  solveFrames?: number[]
): CortexSample => ({
  seed: episode.seed,
  metrics: episode.metrics,
  solutionLength: episode.solution.length,
  turns: countTurns(episode.solution),
  branches: countSolutionBranches(episode),
  accepted: episode.accepted,
  solveFrames
});

const countTurns = (path: Point[]): number => {
  let turns = 0;

  for (let index = 1; index < path.length - 1; index += 1) {
    const a = path[index - 1];
    const b = path[index];
    const c = path[index + 1];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const bcx = c.x - b.x;
    const bcy = c.y - b.y;

    if (abx !== bcx || aby !== bcy) {
      turns += 1;
    }
  }

  return turns;
};

const countSolutionBranches = (episode: MazeEpisode): number => {
  let branches = 0;

  for (const index of episode.raster.pathIndices) {
    const degree = openFloorNeighbors(episode.raster.tiles, index).length;
    if (degree >= 3) {
      branches += 1;
    }
  }

  return branches;
};

const openFloorNeighbors = (
  tiles: MazeEpisode['raster']['tiles'],
  index: number
): number[] => {
  const tile = tiles[index];
  const neighbors: number[] = [];

  for (const neighbor of tile.neighbors) {
    if (neighbor === -1 || !tiles[neighbor].floor) {
      continue;
    }
    neighbors.push(neighbor);
  }

  return neighbors;
};
