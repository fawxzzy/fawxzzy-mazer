import { disposeMazeEpisode, toCortexSample } from './core';
import { buildMaze } from './generator';
import type { CortexSink } from './types';

export interface BatchSummary {
  runs: number;
  avgSolutionLength: number;
  avgDeadEnds: number;
  avgJunctions: number;
  avgStraightness: number;
  avgCoverage: number;
  minSolutionLength: number;
  maxSolutionLength: number;
}

export const runBatch = (
  runs = 100,
  width = 50,
  height = 50,
  braidRatio = 0.08,
  cortex?: CortexSink
): BatchSummary => {
  let totalSolutionLength = 0;
  let totalDeadEnds = 0;
  let totalJunctions = 0;
  let totalStraightness = 0;
  let totalCoverage = 0;
  let minSolutionLength = Number.POSITIVE_INFINITY;
  let maxSolutionLength = Number.NEGATIVE_INFINITY;

  for (let iteration = 0; iteration < runs; iteration += 1) {
    const episode = buildMaze({
      width,
      height,
      seed: iteration + 1,
      braidRatio,
      minSolutionLength: Math.floor((Math.min(width, height) ** 2) / 5)
    });

    const { metrics } = episode;
    totalSolutionLength += metrics.solutionLength;
    totalDeadEnds += metrics.deadEnds;
    totalJunctions += metrics.junctions;
    totalStraightness += metrics.straightness;
    totalCoverage += metrics.coverage;
    minSolutionLength = Math.min(minSolutionLength, metrics.solutionLength);
    maxSolutionLength = Math.max(maxSolutionLength, metrics.solutionLength);
    cortex?.push(toCortexSample(episode));
    disposeMazeEpisode(episode);
  }

  return {
    runs,
    avgSolutionLength: totalSolutionLength / runs,
    avgDeadEnds: totalDeadEnds / runs,
    avgJunctions: totalJunctions / runs,
    avgStraightness: totalStraightness / runs,
    avgCoverage: totalCoverage / runs,
    minSolutionLength,
    maxSolutionLength
  };
};
