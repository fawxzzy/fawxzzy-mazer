import type {
  PolicyAdaptivePrior,
  PolicyEpisode,
  PolicyEpisodeLogFeatures,
  TileId
} from '../agent/types';

const DANGER_CUE_KEYWORDS = ['trap', 'hazard', 'spike', 'ward', 'mine', 'alarm', 'laser', 'timing'];
const ENEMY_CUE_KEYWORDS = ['enemy', 'warden', 'guard', 'hunter', 'scout', 'sentry', 'patrol'];
const ITEM_CUE_KEYWORDS = ['item', 'key', 'cache', 'relic', 'shard', 'beacon', 'token'];
const PUZZLE_CUE_KEYWORDS = ['puzzle', 'glyph', 'switch', 'lever', 'plate', 'cipher', 'rune'];
const TIMING_CUE_KEYWORDS = ['timing', 'rotation', 'phase', 'align', 'cycle', 'gate'];
const MAX_PRIOR_WINDOW = 6;

export interface ObservationCueSummary {
  dangerCueCount: number;
  enemyCueCount: number;
  itemCueCount: number;
  puzzleCueCount: number;
  timingCueCount: number;
}

const countKeywordHits = (values: readonly string[], keywords: readonly string[]): number => (
  values.reduce((count, value) => {
    const normalized = value.toLowerCase();
    return count + (keywords.some((keyword) => normalized.includes(keyword)) ? 1 : 0);
  }, 0)
);

const clampPrior = (value: number): number => Number(Math.min(1, Math.max(0, value)).toFixed(4));

const cueSignal = (count: number, step = 0.18): number => clampPrior(0.5 + (Math.min(count, 3) * step));

const blendPriorValue = (current: number, sample: number, samples: number): number => {
  const alpha = 1 / Math.min(samples + 1, MAX_PRIOR_WINDOW);
  return clampPrior(current + ((sample - current) * alpha));
};

const buildPriorSample = (episode: PolicyEpisode): Omit<PolicyAdaptivePrior, 'samples'> | null => {
  if (!episode.outcome) {
    return null;
  }

  const outcomeCueSummary = summarizeObservationFeatures(episode.outcome.localCues);
  const progressSignal = (
    Math.min(episode.outcome.discoveredTilesDelta, 3) * 0.18
    + Math.max(episode.outcome.frontierDelta, 0) * 0.12
    + (episode.outcome.goalVisible ? 0.2 : 0)
  );
  const stallSignal = (
    Math.min(episode.outcome.backtrackDelta, 2) * 0.12
    + (episode.outcome.discoveredTilesDelta === 0 ? 0.08 : 0)
    + (episode.outcome.frontierDelta < 0 ? 0.08 : 0)
  );

  return {
    frontierValue: clampPrior(0.5 + progressSignal - stallSignal),
    backtrackUrgency: clampPrior(
      0.5
      + (Math.min(episode.outcome.backtrackDelta, 2) * 0.18)
      + (episode.outcome.discoveredTilesDelta === 0 ? 0.08 : 0)
      + (episode.outcome.frontierDelta < 0 ? 0.08 : 0)
      - (Math.min(episode.outcome.discoveredTilesDelta, 2) * 0.06)
      - (episode.outcome.goalVisible ? 0.1 : 0)
    ),
    trapSuspicion: clampPrior(
      0.5
      + (Math.min(episode.outcome.trapCueCount, 3) * 0.18)
      + (Math.min(episode.observation.dangerCueCount, 2) * 0.08)
      + (Math.min(outcomeCueSummary.dangerCueCount, 2) * 0.06)
    ),
    enemyRisk: clampPrior(
      0.5
      + (Math.min(episode.outcome.enemyCueCount, 3) * 0.2)
      + (Math.min(episode.observation.enemyCueCount, 2) * 0.08)
    ),
    itemValue: clampPrior(
      0.5
      + (Math.min(episode.outcome.itemCueCount, 3) * 0.18)
      + (Math.min(episode.observation.itemCueCount, 2) * 0.08)
      + (Math.min(episode.outcome.puzzleCueCount, 2) * 0.04)
      + (episode.outcome.discoveredTilesDelta > 0 ? 0.04 : 0)
    ),
    puzzleValue: clampPrior(
      0.5
      + (Math.min(episode.outcome.puzzleCueCount, 3) * 0.18)
      + (Math.min(episode.observation.puzzleCueCount, 2) * 0.08)
      + (Math.min(episode.outcome.itemCueCount, 2) * 0.04)
      + (episode.outcome.goalVisible ? 0.04 : 0)
    ),
    rotationTiming: clampPrior(
      0.5
      + (Math.min(episode.observation.timingCueCount, 2) * 0.12)
      + (Math.min(episode.outcome.timingCueCount, 3) * 0.18)
      + (Math.min(outcomeCueSummary.timingCueCount, 2) * 0.06)
      - (Math.min(episode.outcome.backtrackDelta, 2) * 0.05)
    )
  };
};

const applyPriorSample = (
  current: PolicyAdaptivePrior,
  sample: Omit<PolicyAdaptivePrior, 'samples'>
): PolicyAdaptivePrior => ({
  samples: current.samples + 1,
  frontierValue: blendPriorValue(current.frontierValue, sample.frontierValue, current.samples),
  backtrackUrgency: blendPriorValue(current.backtrackUrgency, sample.backtrackUrgency, current.samples),
  trapSuspicion: blendPriorValue(current.trapSuspicion, sample.trapSuspicion, current.samples),
  enemyRisk: blendPriorValue(current.enemyRisk, sample.enemyRisk, current.samples),
  itemValue: blendPriorValue(current.itemValue, sample.itemValue, current.samples),
  puzzleValue: blendPriorValue(current.puzzleValue, sample.puzzleValue, current.samples),
  rotationTiming: blendPriorValue(current.rotationTiming, sample.rotationTiming, current.samples)
});

export const createNeutralAdaptivePrior = (): PolicyAdaptivePrior => ({
  samples: 0,
  frontierValue: 0.5,
  backtrackUrgency: 0.5,
  trapSuspicion: 0.5,
  enemyRisk: 0.5,
  itemValue: 0.5,
  puzzleValue: 0.5,
  rotationTiming: 0.5
});

export const createEmptyEpisodeLogFeatures = (): PolicyEpisodeLogFeatures => ({
  totalEpisodes: 0,
  global: createNeutralAdaptivePrior(),
  byTileId: {}
});

export const summarizeObservationFeatures = (localCues: readonly string[]): ObservationCueSummary => ({
  dangerCueCount: countKeywordHits(localCues, DANGER_CUE_KEYWORDS),
  enemyCueCount: countKeywordHits(localCues, ENEMY_CUE_KEYWORDS),
  itemCueCount: countKeywordHits(localCues, ITEM_CUE_KEYWORDS),
  puzzleCueCount: countKeywordHits(localCues, PUZZLE_CUE_KEYWORDS),
  timingCueCount: countKeywordHits(localCues, TIMING_CUE_KEYWORDS)
});

export const appendEpisodeLogFeatures = (
  features: PolicyEpisodeLogFeatures,
  episode: PolicyEpisode
): PolicyEpisodeLogFeatures => {
  const sample = buildPriorSample(episode);
  const targetTileId = episode.outcome?.arrivedTileId ?? episode.chosenAction.targetTileId;
  if (!sample || !targetTileId) {
    return features;
  }

  const currentTilePrior = features.byTileId[targetTileId] ?? createNeutralAdaptivePrior();

  return {
    totalEpisodes: features.totalEpisodes + 1,
    global: applyPriorSample(features.global, sample),
    byTileId: {
      ...features.byTileId,
      [targetTileId]: applyPriorSample(currentTilePrior, sample)
    }
  };
};

export const summarizeEpisodeLogFeatures = (
  episodes: readonly PolicyEpisode[]
): PolicyEpisodeLogFeatures => episodes.reduce(
  (features, episode) => appendEpisodeLogFeatures(features, episode),
  createEmptyEpisodeLogFeatures()
);

export const blendAdaptiveSignal = (
  entries: readonly [number, number][]
): number => {
  let weightedTotal = 0;
  let totalWeight = 0;

  for (const [value, weight] of entries) {
    if (!Number.isFinite(weight) || weight <= 0) {
      continue;
    }

    weightedTotal += value * weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0) {
    return 0.5;
  }

  return clampPrior(weightedTotal / totalWeight);
};

export const centerAdaptiveSignal = (value: number): number => Number((value - 0.5).toFixed(4));

export const localCueAdaptiveSignal = cueSignal;

export const resolveTileAdaptivePrior = (
  features: PolicyEpisodeLogFeatures,
  tileId: TileId | null
): PolicyAdaptivePrior => {
  if (!tileId) {
    return createNeutralAdaptivePrior();
  }

  return features.byTileId[tileId] ?? createNeutralAdaptivePrior();
};
