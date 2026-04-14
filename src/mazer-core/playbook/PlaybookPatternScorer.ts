import type {
  ExplorerSnapshot,
  LocalObservation,
  PolicyActionCandidate,
  PolicyEpisode,
  PolicyEpisodeLogFeatures
} from '../agent/types';
import {
  createDefaultPlaybookTuningWeights,
  normalizePlaybookTuningWeights,
  type PlaybookTuningWeights
} from './tuning/PlaybookTuningWeights';
import {
  appendEpisodeLogFeatures,
  blendAdaptiveSignal,
  centerAdaptiveSignal,
  createEmptyEpisodeLogFeatures,
  localCueAdaptiveSignal,
  resolveTileAdaptivePrior,
  summarizeObservationFeatures
} from './PlaybookFeatureSignals';

export interface PlaybookLegalCandidateInput {
  seed: string;
  step: number;
  observation: LocalObservation;
  snapshot: ExplorerSnapshot;
  candidates: readonly PolicyActionCandidate[];
  episodeLogFeatures?: PolicyEpisodeLogFeatures | null;
  tuningWeights?: Partial<PlaybookTuningWeights> | null;
}

const scoreCandidate = (
  candidate: PolicyActionCandidate,
  input: PlaybookLegalCandidateInput,
  learnedFeatures: PolicyEpisodeLogFeatures,
  tuningWeights: PlaybookTuningWeights
): number => {
  const observationFeatures = summarizeObservationFeatures(input.observation.localCues);
  const globalPrior = learnedFeatures.global;
  const tilePrior = resolveTileAdaptivePrior(learnedFeatures, candidate.targetTileId);

  const frontierSignal = blendAdaptiveSignal([
    [globalPrior.frontierValue, 0.34],
    [tilePrior.frontierValue, 0.46],
    [localCueAdaptiveSignal(candidate.features.unexploredNeighborCount, 0.08), 0.2]
  ]);
  const backtrackSignal = blendAdaptiveSignal([
    [globalPrior.backtrackUrgency, 0.42],
    [tilePrior.backtrackUrgency, 0.38],
    [localCueAdaptiveSignal(candidate.features.visitCount > 0 ? 1 : 0, 0.12), 0.2]
  ]);
  const trapSignal = blendAdaptiveSignal([
    [globalPrior.trapSuspicion, 0.24],
    [tilePrior.trapSuspicion, 0.34],
    [candidate.features.trapRisk, 0.24],
    [localCueAdaptiveSignal(observationFeatures.dangerCueCount, 0.16), 0.18]
  ]);
  const enemySignal = blendAdaptiveSignal([
    [globalPrior.enemyRisk, 0.24],
    [tilePrior.enemyRisk, 0.34],
    [candidate.features.enemyPressure, 0.24],
    [localCueAdaptiveSignal(observationFeatures.enemyCueCount, 0.18), 0.18]
  ]);
  const itemSignal = blendAdaptiveSignal([
    [globalPrior.itemValue, 0.22],
    [tilePrior.itemValue, 0.28],
    [candidate.features.itemOpportunity, 0.3],
    [localCueAdaptiveSignal(observationFeatures.itemCueCount, 0.18), 0.2]
  ]);
  const puzzleSignal = blendAdaptiveSignal([
    [globalPrior.puzzleValue, 0.22],
    [tilePrior.puzzleValue, 0.28],
    [candidate.features.puzzleOpportunity, 0.3],
    [localCueAdaptiveSignal(observationFeatures.puzzleCueCount, 0.18), 0.2]
  ]);
  const rotationSignal = blendAdaptiveSignal([
    [globalPrior.rotationTiming, 0.24],
    [tilePrior.rotationTiming, 0.24],
    [candidate.features.timingWindow, 0.32],
    [localCueAdaptiveSignal(observationFeatures.timingCueCount, 0.2), 0.2]
  ]);

  const heuristicBias = (
    (candidate.features.unexploredNeighborCount * 0.18)
    - (candidate.features.pathCost * 0.1)
    - (candidate.features.visitCount * 0.08)
    + (candidate.features.goalVisible ? 0.12 : 0)
  );
  const frontierBias = centerAdaptiveSignal(frontierSignal) * (
    0.38
    + (candidate.features.unexploredNeighborCount * 0.1)
  );
  const backtrackBias = candidate.features.visitCount > 0
    ? centerAdaptiveSignal(backtrackSignal) * (0.42 + (candidate.features.visitCount * 0.08))
    : 0;
  const trapPenalty = centerAdaptiveSignal(trapSignal) * (
    0.34
    + (candidate.features.unexploredNeighborCount * 0.06)
    + (observationFeatures.dangerCueCount * 0.03)
    + (candidate.features.trapRisk * 0.26)
  );
  const enemyPenalty = centerAdaptiveSignal(enemySignal) * (
    0.32
    + (candidate.features.pathCost * 0.05)
    + (observationFeatures.enemyCueCount * 0.04)
    + (candidate.features.enemyPressure * 0.24)
  );
  const itemBias = centerAdaptiveSignal(itemSignal) * (
    0.24
    + (observationFeatures.itemCueCount * 0.06)
    + (Math.max(0, candidate.features.unexploredNeighborCount - candidate.features.visitCount) * 0.04)
    + (candidate.features.itemOpportunity * 0.22)
  );
  const puzzleBias = centerAdaptiveSignal(puzzleSignal) * (
    0.22
    + (observationFeatures.puzzleCueCount * 0.05)
    + (candidate.features.puzzleOpportunity * 0.24)
  );
  const rotationBias = centerAdaptiveSignal(rotationSignal) * (
    0.22
    + (observationFeatures.timingCueCount * 0.05)
    + (Math.max(0, 2 - candidate.features.pathCost) * 0.05)
    + (candidate.features.timingWindow * 0.18)
  );

  return Number((
    heuristicBias
    + (frontierBias * tuningWeights.frontierValue)
    + (backtrackBias * tuningWeights.backtrackUrgency)
    + (itemBias * tuningWeights.itemValue)
    + (puzzleBias * tuningWeights.puzzleValue)
    + (rotationBias * tuningWeights.rotationTiming)
    - (trapPenalty * tuningWeights.trapSuspicion)
    - (enemyPenalty * tuningWeights.enemyRisk)
  ).toFixed(4));
};

export {
  summarizeEpisodeLogFeatures,
  summarizeObservationFeatures
} from './PlaybookFeatureSignals';

export class PlaybookPatternScorer {
  private learnedFeatures: PolicyEpisodeLogFeatures = createEmptyEpisodeLogFeatures();

  private tuningWeights: PlaybookTuningWeights = createDefaultPlaybookTuningWeights();

  scoreLegalCandidates(input: PlaybookLegalCandidateInput): ReadonlyMap<string, number> {
    const scores = new Map<string, number>();
    const episodeLogFeatures = input.episodeLogFeatures ?? this.learnedFeatures;
    const tuningWeights = normalizePlaybookTuningWeights(input.tuningWeights ?? this.tuningWeights);

    for (const candidate of input.candidates) {
      scores.set(candidate.id, scoreCandidate(candidate, input, episodeLogFeatures, tuningWeights));
    }

    return scores;
  }

  updateEpisodePatterns(episode: PolicyEpisode): void {
    this.learnedFeatures = appendEpisodeLogFeatures(this.learnedFeatures, episode);
  }

  updateTuningWeights(weights: Partial<PlaybookTuningWeights> | null | undefined): void {
    this.tuningWeights = normalizePlaybookTuningWeights(weights);
  }
}
