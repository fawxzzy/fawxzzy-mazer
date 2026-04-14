import type {
  HeadingToken,
  PolicyEpisode,
  PolicyEpisodeLogFeatures,
  TileId
} from '../../agent/types';
import { summarizeEpisodeLogFeatures } from '../../agent/PolicyScorer';
import type { RuntimeBenchmarkDistrictType, RuntimeBenchmarkMetricBand } from '../../eval';
import type { RuntimeEpisodeLog } from '../RuntimeEpisodeLog';

export interface ReplayEvalMetricsSummary {
  discoveryEfficiency: number;
  backtrackPressure: number;
  trapFalsePositiveRate: number;
  trapFalseNegativeRate: number;
  wardenPressureExposure: number;
  itemUsefulnessScore: number;
  puzzleStateClarityScore: number;
}

export interface ReplayEvalSummaryReference {
  schemaVersion: number;
  summaryId: string;
  runId: string;
  seed: string;
  metrics: ReplayEvalMetricsSummary;
}

export interface ReplayLinkedTrainingDatasetEpisode {
  step: number;
  seed: string;
  scorerId: string;
  currentTileId: TileId;
  heading: HeadingToken;
  observation: PolicyEpisode['observation'];
  candidates: PolicyEpisode['candidates'];
  chosenCandidateId: string | null;
  chosenAction: PolicyEpisode['chosenAction'];
  outcome: PolicyEpisode['outcome'];
}

export interface ReplayLinkedTrainingDataset {
  schemaVersion: 1;
  exportedAt: string;
  lane: 'offline';
  benchmark: {
    packId: string;
    scenarioId: string;
    districtType: RuntimeBenchmarkDistrictType;
    seed: string;
    expectedMetricBands: Record<string, RuntimeBenchmarkMetricBand>;
  } | null;
  replayLink: {
    seed: string;
    startTileId: TileId;
    startHeading: HeadingToken | null;
    intentCanary: string | null;
    stepCount: number;
    episodeCount: number;
    logDigest: string;
  };
  priors: PolicyEpisodeLogFeatures;
  evalSummary: ReplayEvalSummaryReference | null;
  episodes: readonly ReplayLinkedTrainingDatasetEpisode[];
}

const clampMetric = (value: number): number => Number(Math.min(1, Math.max(0, value)).toFixed(4));

const cloneEpisode = (episode: PolicyEpisode): ReplayLinkedTrainingDatasetEpisode => ({
  step: episode.step,
  seed: episode.seed,
  scorerId: episode.scorerId,
  currentTileId: episode.currentTileId,
  heading: episode.heading,
  observation: {
    ...episode.observation
  },
  candidates: episode.candidates.map((candidate) => ({
    ...candidate,
    path: [...candidate.path],
    features: {
      ...candidate.features
    }
  })),
  chosenCandidateId: episode.chosenCandidateId,
  chosenAction: {
    ...episode.chosenAction
  },
  outcome: episode.outcome
    ? {
        ...episode.outcome,
        localCues: [...episode.outcome.localCues]
      }
    : null
});

const stableSerialize = (value: unknown): string => {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`);

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(String(value));
};

const hashStableValue = (value: unknown): string => {
  const serialized = stableSerialize(value);
  let hash = 0x811c9dc5;

  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

export const collectReplayEpisodes = (log: RuntimeEpisodeLog): ReplayLinkedTrainingDatasetEpisode[] => {
  const episodes: ReplayLinkedTrainingDatasetEpisode[] = [];

  for (const entry of log.entries) {
    if (!entry.episodes.latestEpisode) {
      continue;
    }

    episodes.push(cloneEpisode(entry.episodes.latestEpisode));
  }

  return episodes;
};

export const normalizeReplayEvalSummary = (
  summary: ReplayEvalSummaryReference | null | undefined
): ReplayEvalSummaryReference | null => {
  if (!summary) {
    return null;
  }

  return {
    schemaVersion: summary.schemaVersion,
    summaryId: summary.summaryId,
    runId: summary.runId,
    seed: summary.seed,
    metrics: {
      discoveryEfficiency: clampMetric(summary.metrics.discoveryEfficiency),
      backtrackPressure: clampMetric(summary.metrics.backtrackPressure),
      trapFalsePositiveRate: clampMetric(summary.metrics.trapFalsePositiveRate),
      trapFalseNegativeRate: clampMetric(summary.metrics.trapFalseNegativeRate),
      wardenPressureExposure: clampMetric(summary.metrics.wardenPressureExposure),
      itemUsefulnessScore: clampMetric(summary.metrics.itemUsefulnessScore),
      puzzleStateClarityScore: clampMetric(summary.metrics.puzzleStateClarityScore)
    }
  };
};

export const createReplayLinkedTrainingDataset = (
  log: RuntimeEpisodeLog,
  evalSummary?: ReplayEvalSummaryReference | null,
  benchmark?: ReplayLinkedTrainingDataset['benchmark']
): ReplayLinkedTrainingDataset => {
  const sourceEpisodes = log.entries
    .map((entry) => entry.episodes.latestEpisode)
    .filter((episode): episode is PolicyEpisode => Boolean(episode));
  const episodes = sourceEpisodes.map((episode) => cloneEpisode(episode));
  const priors = summarizeEpisodeLogFeatures(sourceEpisodes);
  const replayLink = {
    seed: log.source.seed,
    startTileId: log.source.startTileId,
    startHeading: log.source.startHeading ?? null,
    intentCanary: log.source.intentCanary ?? null,
    stepCount: log.stepCount,
    episodeCount: episodes.length,
    logDigest: hashStableValue({
      source: log.source,
      stepCount: log.stepCount,
      entries: log.entries
    })
  };

  return {
    schemaVersion: 1,
    exportedAt: log.generatedAt,
    lane: 'offline',
    benchmark: benchmark
      ? {
          packId: benchmark.packId,
          scenarioId: benchmark.scenarioId,
          districtType: benchmark.districtType,
          seed: benchmark.seed,
          expectedMetricBands: Object.fromEntries(
            Object.entries(benchmark.expectedMetricBands).map(([metricName, band]) => [
              metricName,
              band ? { ...band } : band
            ])
          )
        }
      : null,
    replayLink,
    priors,
    evalSummary: normalizeReplayEvalSummary(evalSummary),
    episodes
  };
};

export const createReplayEvalSummaryId = (
  summary: Omit<ReplayEvalSummaryReference, 'summaryId'>
): string => hashStableValue(summary);

export const getReplayLinkedDatasetDigest = (dataset: ReplayLinkedTrainingDataset): string => hashStableValue(dataset);
