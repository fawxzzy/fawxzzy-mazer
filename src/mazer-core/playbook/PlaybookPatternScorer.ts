import type {
  ExplorerSnapshot,
  LocalObservation,
  PolicyActionCandidate,
  PolicyEpisode,
  TileId
} from '../agent/types';

const DANGER_CUE_KEYWORDS = ['trap', 'hazard', 'spike', 'ward', 'mine', 'alarm', 'laser', 'timing'];
const ENEMY_CUE_KEYWORDS = ['enemy', 'warden', 'guard', 'hunter', 'scout', 'sentry', 'patrol'];
const ITEM_CUE_KEYWORDS = ['item', 'key', 'cache', 'relic', 'shard', 'beacon', 'token'];
const PUZZLE_CUE_KEYWORDS = ['puzzle', 'glyph', 'switch', 'lever', 'plate', 'cipher', 'rune'];
const TIMING_CUE_KEYWORDS = ['timing', 'rotation', 'phase', 'align', 'cycle', 'gate'];

interface TilePolicyMemory {
  samples: number;
  frontierSuccess: number;
  trapHits: number;
  enemyHits: number;
  itemFinds: number;
  puzzleFinds: number;
}

export interface PlaybookLegalCandidateInput {
  seed: string;
  step: number;
  observation: LocalObservation;
  snapshot: ExplorerSnapshot;
  candidates: readonly PolicyActionCandidate[];
}

const countKeywordHits = (values: readonly string[], keywords: readonly string[]): number => (
  values.reduce((count, value) => {
    const normalized = value.toLowerCase();
    return count + (keywords.some((keyword) => normalized.includes(keyword)) ? 1 : 0);
  }, 0)
);

const getOrCreateMemory = (memory: Map<TileId, TilePolicyMemory>, tileId: TileId): TilePolicyMemory => {
  const existing = memory.get(tileId);
  if (existing) {
    return existing;
  }

  const created: TilePolicyMemory = {
    samples: 0,
    frontierSuccess: 0,
    trapHits: 0,
    enemyHits: 0,
    itemFinds: 0,
    puzzleFinds: 0
  };
  memory.set(tileId, created);
  return created;
};

export const summarizeObservationFeatures = (localCues: readonly string[]) => ({
  dangerCueCount: countKeywordHits(localCues, DANGER_CUE_KEYWORDS),
  enemyCueCount: countKeywordHits(localCues, ENEMY_CUE_KEYWORDS),
  itemCueCount: countKeywordHits(localCues, ITEM_CUE_KEYWORDS),
  puzzleCueCount: countKeywordHits(localCues, PUZZLE_CUE_KEYWORDS),
  timingCueCount: countKeywordHits(localCues, TIMING_CUE_KEYWORDS)
});

export class PlaybookPatternScorer {
  private readonly tileMemory = new Map<TileId, TilePolicyMemory>();

  scoreLegalCandidates(input: PlaybookLegalCandidateInput): ReadonlyMap<string, number> {
    const scores = new Map<string, number>();
    const observationFeatures = summarizeObservationFeatures(input.observation.localCues);

    for (const candidate of input.candidates) {
      const memory = candidate.targetTileId ? this.tileMemory.get(candidate.targetTileId) ?? null : null;
      const learnedBias = memory
        ? (
            (memory.frontierSuccess * 0.32)
            + (memory.itemFinds * 0.24)
            + (memory.puzzleFinds * 0.14)
            - (memory.trapHits * 0.42)
            - (memory.enemyHits * 0.5)
          )
        : 0;
      const frontierBias = candidate.features.unexploredNeighborCount * 0.2;
      const pathPenalty = candidate.features.pathCost * 0.12;
      const repeatPenalty = candidate.features.visitCount * 0.1;
      const trapPenalty = observationFeatures.dangerCueCount > 0
        ? candidate.features.unexploredNeighborCount * 0.06
        : 0;
      const enemyPenalty = observationFeatures.enemyCueCount > 0
        ? candidate.features.pathCost * 0.08
        : 0;
      const itemBias = observationFeatures.itemCueCount > 0
        ? candidate.features.unexploredNeighborCount * 0.08
        : 0;
      const puzzleBias = observationFeatures.puzzleCueCount > 0
        ? Math.max(0, candidate.features.frontierCount - candidate.features.pathCost) * 0.04
        : 0;
      const timingBias = observationFeatures.timingCueCount > 0
        ? Math.max(0, 2 - candidate.features.pathCost) * 0.06
        : 0;
      const heuristicBias = frontierBias - pathPenalty - repeatPenalty - trapPenalty - enemyPenalty + itemBias + puzzleBias + timingBias;
      scores.set(candidate.id, Number((learnedBias + heuristicBias).toFixed(4)));
    }

    return scores;
  }

  updateEpisodePatterns(episode: PolicyEpisode): void {
    if (!episode.outcome || !episode.chosenAction.targetTileId) {
      return;
    }

    const tileId = episode.outcome.arrivedTileId || episode.chosenAction.targetTileId;
    const memory = getOrCreateMemory(this.tileMemory, tileId);
    memory.samples += 1;
    if (episode.outcome.discoveredTilesDelta > 0 || episode.outcome.frontierDelta > 0 || episode.outcome.goalVisible) {
      memory.frontierSuccess += 1;
    }
    memory.trapHits += episode.outcome.trapCueCount;
    memory.enemyHits += episode.outcome.enemyCueCount;
    memory.itemFinds += episode.outcome.itemCueCount;
    memory.puzzleFinds += episode.outcome.puzzleCueCount;
  }
}
