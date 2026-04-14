import type { PolicyEpisode } from '../agent/types';
import {
  PlaybookPatternScorer,
  type PlaybookLegalCandidateInput
} from './PlaybookPatternScorer';
import {
  PlaybookIntentTemplates,
  type PlaybookIntentSummary,
  type PlaybookIntentSummaryInput
} from './PlaybookIntentTemplates';
import type { PlaybookTuningWeights } from './tuning';

export type {
  PlaybookLegalCandidateInput
} from './PlaybookPatternScorer';
export type {
  PlaybookIntentReference,
  PlaybookIntentState,
  PlaybookIntentSummary,
  PlaybookIntentSummaryInput
} from './PlaybookIntentTemplates';

export class PlaybookAdapter {
  private readonly patternScorer = new PlaybookPatternScorer();

  private readonly intentTemplates = new PlaybookIntentTemplates();

  scoreLegalCandidates(input: PlaybookLegalCandidateInput): ReadonlyMap<string, number> {
    return this.patternScorer.scoreLegalCandidates(input);
  }

  summarizeIntent(input: PlaybookIntentSummaryInput): PlaybookIntentSummary {
    return this.intentTemplates.summarizeIntent(input);
  }

  updateEpisodePatterns(episode: PolicyEpisode): void {
    this.patternScorer.updateEpisodePatterns(episode);
  }

  updateTuningWeights(weights: Partial<PlaybookTuningWeights> | null | undefined): void {
    this.patternScorer.updateTuningWeights(weights);
  }
}
