import { buildMaze } from './generator';
import type { MazeMetrics } from './types';

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
  braidRatio = 0.08
): BatchSummary => {
  const metrics: MazeMetrics[] = [];

  for (let iteration = 0; iteration < runs; iteration += 1) {
    metrics.push(
      buildMaze({
        width,
        height,
        seed: iteration + 1,
        braidRatio,
        minSolutionLength: Math.floor((Math.min(width, height) ** 2) / 5)
      }).metrics
    );
  }

  const sum = <K extends keyof MazeMetrics>(key: K): number => (
    metrics.reduce((acc, item) => acc + item[key], 0)
  );
  const lengths = metrics.map((metric) => metric.solutionLength);

  return {
    runs,
    avgSolutionLength: sum('solutionLength') / runs,
    avgDeadEnds: sum('deadEnds') / runs,
    avgJunctions: sum('junctions') / runs,
    avgStraightness: sum('straightness') / runs,
    avgCoverage: sum('coverage') / runs,
    minSolutionLength: Math.min(...lengths),
    maxSolutionLength: Math.max(...lengths)
  };
};
