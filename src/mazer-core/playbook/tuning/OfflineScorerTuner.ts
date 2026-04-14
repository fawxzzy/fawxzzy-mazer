import type { PolicyAdaptivePrior } from '../../agent/types';
import type {
  ReplayEvalMetricsSummary,
  ReplayLinkedTrainingDataset
} from '../../logging/export';
import { createDefaultPlaybookTuningWeights, normalizePlaybookTuningWeights, type PlaybookTuningWeights } from './PlaybookTuningWeights';

export interface OfflineScorerTuningRun {
  schemaVersion: 1;
  advisoryOnly: true;
  datasetCount: number;
  episodeCount: number;
  weights: PlaybookTuningWeights;
  diagnostics: {
    priors: PolicyAdaptivePrior;
    metrics: ReplayEvalMetricsSummary;
    datasets: string[];
  };
}

const clampMetric = (value: number): number => Number(Math.min(1, Math.max(0, value)).toFixed(4));

const average = (values: readonly number[]): number => (
  values.length > 0
    ? clampMetric(values.reduce((total, value) => total + value, 0) / values.length)
    : 0.5
);

const averageMetrics = (datasets: readonly ReplayLinkedTrainingDataset[]): ReplayEvalMetricsSummary => ({
  discoveryEfficiency: average(datasets.map((dataset) => dataset.evalSummary?.metrics.discoveryEfficiency ?? 0.5)),
  backtrackPressure: average(datasets.map((dataset) => dataset.evalSummary?.metrics.backtrackPressure ?? 0.5)),
  trapFalsePositiveRate: average(datasets.map((dataset) => dataset.evalSummary?.metrics.trapFalsePositiveRate ?? 0.5)),
  trapFalseNegativeRate: average(datasets.map((dataset) => dataset.evalSummary?.metrics.trapFalseNegativeRate ?? 0.5)),
  wardenPressureExposure: average(datasets.map((dataset) => dataset.evalSummary?.metrics.wardenPressureExposure ?? 0.5)),
  itemUsefulnessScore: average(datasets.map((dataset) => dataset.evalSummary?.metrics.itemUsefulnessScore ?? 0.5)),
  puzzleStateClarityScore: average(datasets.map((dataset) => dataset.evalSummary?.metrics.puzzleStateClarityScore ?? 0.5))
});

const averagePriors = (datasets: readonly ReplayLinkedTrainingDataset[]): PolicyAdaptivePrior => {
  const priors = datasets.map((dataset) => dataset.priors.global);

  return {
    samples: Math.round(priors.reduce((total, prior) => total + prior.samples, 0) / Math.max(priors.length, 1)),
    frontierValue: average(priors.map((prior) => prior.frontierValue)),
    backtrackUrgency: average(priors.map((prior) => prior.backtrackUrgency)),
    trapSuspicion: average(priors.map((prior) => prior.trapSuspicion)),
    enemyRisk: average(priors.map((prior) => prior.enemyRisk)),
    itemValue: average(priors.map((prior) => prior.itemValue)),
    puzzleValue: average(priors.map((prior) => prior.puzzleValue)),
    rotationTiming: average(priors.map((prior) => prior.rotationTiming))
  };
};

const deriveWeight = (baseline: number, delta: number): number => Number((baseline + delta).toFixed(4));

export const tunePlaybookWeightsOffline = (
  datasets: readonly ReplayLinkedTrainingDataset[],
  baselineWeights?: Partial<PlaybookTuningWeights> | null
): OfflineScorerTuningRun => {
  const resolvedBaseline = normalizePlaybookTuningWeights(baselineWeights);
  const metrics = averageMetrics(datasets);
  const priors = averagePriors(datasets);
  const weights = normalizePlaybookTuningWeights({
    frontierValue: deriveWeight(
      resolvedBaseline.frontierValue,
      ((metrics.discoveryEfficiency - 0.5) * 0.7) - ((metrics.backtrackPressure - 0.5) * 0.2)
    ),
    backtrackUrgency: deriveWeight(
      resolvedBaseline.backtrackUrgency,
      ((metrics.backtrackPressure - 0.5) * 0.75) + ((priors.backtrackUrgency - 0.5) * 0.25)
    ),
    trapSuspicion: deriveWeight(
      resolvedBaseline.trapSuspicion,
      ((metrics.trapFalseNegativeRate - metrics.trapFalsePositiveRate) * 0.85) + ((priors.trapSuspicion - 0.5) * 0.1)
    ),
    enemyRisk: deriveWeight(
      resolvedBaseline.enemyRisk,
      ((metrics.wardenPressureExposure - 0.5) * 0.8) + ((priors.enemyRisk - 0.5) * 0.2)
    ),
    itemValue: deriveWeight(
      resolvedBaseline.itemValue,
      ((metrics.itemUsefulnessScore - 0.5) * 0.8) + ((priors.itemValue - 0.5) * 0.25)
    ),
    puzzleValue: deriveWeight(
      resolvedBaseline.puzzleValue,
      ((metrics.puzzleStateClarityScore - 0.5) * 0.7) + ((priors.puzzleValue - 0.5) * 0.2)
    ),
    rotationTiming: deriveWeight(
      resolvedBaseline.rotationTiming,
      (((metrics.discoveryEfficiency - metrics.backtrackPressure)) * 0.35) + ((priors.rotationTiming - 0.5) * 0.25)
    )
  });

  return {
    schemaVersion: 1,
    advisoryOnly: true,
    datasetCount: datasets.length,
    episodeCount: datasets.reduce((total, dataset) => total + dataset.episodes.length, 0),
    weights,
    diagnostics: {
      priors,
      metrics,
      datasets: datasets.map((dataset) => dataset.replayLink.logDigest)
    }
  };
};

export const mergePlaybookTuningWeights = (
  baselineWeights: Partial<PlaybookTuningWeights> | null | undefined,
  overrideWeights: Partial<PlaybookTuningWeights> | null | undefined
): PlaybookTuningWeights => normalizePlaybookTuningWeights({
  ...createDefaultPlaybookTuningWeights(),
  ...baselineWeights,
  ...overrideWeights
});
