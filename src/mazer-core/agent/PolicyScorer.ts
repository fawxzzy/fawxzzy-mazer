import { PlaybookAdapter } from '../playbook/PlaybookAdapter';
import type { PolicyEpisode, PolicyScorer, PolicyScorerInput } from './types';

export { summarizeObservationFeatures } from '../playbook/PlaybookPatternScorer';

export class EpisodicPolicyScorer implements PolicyScorer {
  readonly id = 'episode-priors';

  private readonly playbook = new PlaybookAdapter();

  scoreCandidates(input: PolicyScorerInput): ReadonlyMap<string, number> {
    return this.playbook.scoreLegalCandidates(input);
  }

  recordEpisode(episode: PolicyEpisode): void {
    this.playbook.updateEpisodePatterns(episode);
  }
}
