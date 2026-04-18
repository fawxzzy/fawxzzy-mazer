import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { PlaybookAdapter } from '../../src/mazer-core/playbook/PlaybookAdapter';
import { summarizeEpisodeLogFeatures } from '../../src/mazer-core/playbook';
import type {
  ExplorerSnapshot,
  LocalObservation,
  PolicyActionCandidate,
  PolicyCandidateAdvisoryFeatures,
  PolicyEpisode
} from '../../src/mazer-core/agent/types';

const makeObservation = (overrides: Partial<LocalObservation> = {}): LocalObservation => ({
  step: overrides.step ?? 4,
  currentTileId: overrides.currentTileId ?? 'junction-a',
  heading: overrides.heading ?? 'east',
  traversableTileIds: overrides.traversableTileIds ?? ['safe-branch', 'trap-branch'],
  localCues: overrides.localCues ?? ['timing gate'],
  visibleLandmarks: overrides.visibleLandmarks ?? [],
  goal: overrides.goal ?? {
    visible: false,
    tileId: null
  }
});

const makeSnapshot = (overrides: Partial<ExplorerSnapshot> = {}): ExplorerSnapshot => ({
  seed: overrides.seed ?? 'seed-7',
  currentTileId: overrides.currentTileId ?? 'junction-a',
  currentHeading: overrides.currentHeading ?? 'east',
  mode: overrides.mode ?? 'explore',
  counters: overrides.counters ?? {
    replanCount: 1,
    backtrackCount: 0,
    frontierCount: 2,
    goalObservedStep: null,
    tilesDiscovered: 3
  },
  discoveredNodeIds: overrides.discoveredNodeIds ?? ['junction-a', 'safe-branch', 'trap-branch'],
  frontierIds: overrides.frontierIds ?? ['safe-branch', 'trap-branch'],
  goalTileId: overrides.goalTileId ?? null,
  observedLandmarkIds: overrides.observedLandmarkIds ?? [],
  observedCues: overrides.observedCues ?? ['timing gate']
});

type CandidateFeatureInput = Omit<
  PolicyActionCandidate['features'],
  keyof PolicyCandidateAdvisoryFeatures
> & Partial<PolicyCandidateAdvisoryFeatures>;

const withAdvisoryDefaults = (
  features: CandidateFeatureInput
): PolicyActionCandidate['features'] => {
  const defaults: PolicyCandidateAdvisoryFeatures = {
    trapRisk: 0,
    enemyPressure: 0,
    itemOpportunity: 0,
    puzzleOpportunity: 0,
    timingWindow: 0
  };

  return {
    ...defaults,
    ...features
  };
};

const makeCandidate = (
  id: string,
  targetTileId: string,
  features: CandidateFeatureInput
): PolicyActionCandidate => ({
  id,
  targetKind: 'frontier',
  targetTileId,
  path: ['junction-a', targetTileId],
  nextTileId: targetTileId,
  reason: 'expanding local frontier from current tile',
  heuristicScore: 0,
  policyScore: null,
  features: withAdvisoryDefaults(features)
});

const makeEpisode = (overrides: Partial<PolicyEpisode> = {}): PolicyEpisode => ({
  step: overrides.step ?? 4,
  seed: overrides.seed ?? 'seed-7',
  scorerId: overrides.scorerId ?? 'episode-priors',
  currentTileId: overrides.currentTileId ?? 'junction-a',
  heading: overrides.heading ?? 'east',
  observation: overrides.observation ?? {
    traversableCount: 2,
    landmarkCount: 0,
    localCueCount: 1,
    dangerCueCount: 0,
    enemyCueCount: 0,
    itemCueCount: 0,
    puzzleCueCount: 0,
    timingCueCount: 1,
    goalVisible: false
  },
  candidates: overrides.candidates ?? [
    makeCandidate('frontier:safe-branch', 'safe-branch', {
      pathCost: 1,
      visitCount: 0,
      unexploredNeighborCount: 2,
      frontierCount: 2,
      goalVisible: false
    }),
    makeCandidate('frontier:trap-branch', 'trap-branch', {
      pathCost: 1,
      visitCount: 0,
      unexploredNeighborCount: 2,
      frontierCount: 2,
      goalVisible: false
    })
  ],
  chosenCandidateId: overrides.chosenCandidateId ?? 'frontier:safe-branch',
  chosenAction: overrides.chosenAction ?? {
    targetKind: 'frontier',
    targetTileId: 'safe-branch',
    nextTileId: 'safe-branch',
    reason: 'expanding local frontier from current tile'
  },
  outcome: overrides.outcome ?? {
    arrivedTileId: 'safe-branch',
    discoveredTilesDelta: 2,
    frontierDelta: 1,
    replanDelta: 1,
    backtrackDelta: 0,
    goalVisible: false,
    goalObservedStep: null,
    trapCueCount: 0,
    enemyCueCount: 0,
    itemCueCount: 1,
    puzzleCueCount: 0,
    timingCueCount: 1,
    localCues: ['beacon cache']
  }
});

describe('PlaybookAdapter', () => {
  test('scores only the provided legal candidates', () => {
    const adapter = new PlaybookAdapter();
    const candidates = [
      makeCandidate('frontier:safe-branch', 'safe-branch', {
        pathCost: 1,
        visitCount: 0,
        unexploredNeighborCount: 2,
        frontierCount: 2,
        goalVisible: false
      }),
      makeCandidate('frontier:trap-branch', 'trap-branch', {
        pathCost: 2,
        visitCount: 1,
        unexploredNeighborCount: 1,
        frontierCount: 2,
        goalVisible: false
      })
    ];

    const scores = adapter.scoreLegalCandidates({
      seed: 'seed-7',
      step: 4,
      observation: makeObservation(),
      snapshot: makeSnapshot(),
      candidates
    });

    expect([...scores.keys()].sort()).toEqual(candidates.map((candidate) => candidate.id).sort());
    expect(scores.has('illegal:shortcut')).toBe(false);
  });

  test('updates bounded episode patterns from replay logs', () => {
    const adapter = new PlaybookAdapter();
    const candidates = [
      makeCandidate('frontier:safe-branch', 'safe-branch', {
        pathCost: 1,
        visitCount: 0,
        unexploredNeighborCount: 2,
        frontierCount: 2,
        goalVisible: false
      }),
      makeCandidate('frontier:trap-branch', 'trap-branch', {
        pathCost: 1,
        visitCount: 0,
        unexploredNeighborCount: 2,
        frontierCount: 2,
        goalVisible: false
      })
    ];
    const input = {
      seed: 'seed-7',
      step: 5,
      observation: makeObservation({ localCues: [] }),
      snapshot: makeSnapshot({ observedCues: [] }),
      candidates
    } as const;

    const before = adapter.scoreLegalCandidates(input);

    adapter.updateEpisodePatterns(makeEpisode());
    adapter.updateEpisodePatterns(makeEpisode({
      chosenCandidateId: 'frontier:trap-branch',
      chosenAction: {
        targetKind: 'frontier',
        targetTileId: 'trap-branch',
        nextTileId: 'trap-branch',
        reason: 'expanding local frontier from current tile'
      },
      outcome: {
        arrivedTileId: 'trap-branch',
        discoveredTilesDelta: 0,
        frontierDelta: -1,
        replanDelta: 1,
        backtrackDelta: 1,
        goalVisible: false,
        goalObservedStep: null,
        trapCueCount: 2,
        enemyCueCount: 1,
        itemCueCount: 0,
        puzzleCueCount: 0,
        timingCueCount: 0,
        localCues: ['trap rhythm', 'enemy patrol']
      }
    }));

    const after = adapter.scoreLegalCandidates(input);

    expect((after.get('frontier:safe-branch') ?? 0) - (before.get('frontier:safe-branch') ?? 0)).toBeGreaterThan(0);
    expect(after.get('frontier:safe-branch') ?? 0).toBeGreaterThan(after.get('frontier:trap-branch') ?? 0);
  });

  test('consumes bounded episode-log priors without ranking missing candidates', () => {
    const adapter = new PlaybookAdapter();
    const candidates = [
      makeCandidate('frontier:loop-return', 'loop-return', {
        pathCost: 1,
        visitCount: 2,
        unexploredNeighborCount: 1,
        frontierCount: 2,
        goalVisible: false,
        timingWindow: 0.72
      }),
      makeCandidate('frontier:trap-branch', 'trap-branch', {
        pathCost: 1,
        visitCount: 0,
        unexploredNeighborCount: 2,
        frontierCount: 2,
        goalVisible: false,
        trapRisk: 0.88
      })
    ];
    const episodeLogFeatures = summarizeEpisodeLogFeatures([
      makeEpisode({
        chosenCandidateId: 'frontier:loop-return',
        chosenAction: {
          targetKind: 'backtrack',
          targetTileId: 'loop-return',
          nextTileId: 'loop-return',
          reason: 'reaching the best discovered frontier by shortest known path'
        },
        observation: {
          traversableCount: 2,
          landmarkCount: 0,
          localCueCount: 1,
          dangerCueCount: 0,
          enemyCueCount: 0,
          itemCueCount: 0,
          puzzleCueCount: 0,
          timingCueCount: 1,
          goalVisible: false
        },
        outcome: {
          arrivedTileId: 'loop-return',
          discoveredTilesDelta: 0,
          frontierDelta: -1,
          replanDelta: 1,
          backtrackDelta: 1,
          goalVisible: false,
          goalObservedStep: null,
          trapCueCount: 0,
          enemyCueCount: 0,
          itemCueCount: 0,
          puzzleCueCount: 0,
          timingCueCount: 2,
          localCues: ['rotation gate']
        }
      }),
      makeEpisode({
        chosenCandidateId: 'frontier:trap-branch',
        chosenAction: {
          targetKind: 'frontier',
          targetTileId: 'trap-branch',
          nextTileId: 'trap-branch',
          reason: 'expanding local frontier from current tile'
        },
        outcome: {
          arrivedTileId: 'trap-branch',
          discoveredTilesDelta: 0,
          frontierDelta: -1,
          replanDelta: 1,
          backtrackDelta: 1,
          goalVisible: false,
          goalObservedStep: null,
          trapCueCount: 2,
          enemyCueCount: 2,
          itemCueCount: 0,
          puzzleCueCount: 0,
          timingCueCount: 0,
          localCues: ['trap rhythm', 'enemy patrol']
        }
      }),
      makeEpisode({
        chosenCandidateId: 'frontier:illegal-shortcut',
        chosenAction: {
          targetKind: 'frontier',
          targetTileId: 'illegal-shortcut',
          nextTileId: 'illegal-shortcut',
          reason: 'expanding local frontier from current tile'
        },
        outcome: {
          arrivedTileId: 'illegal-shortcut',
          discoveredTilesDelta: 3,
          frontierDelta: 2,
          replanDelta: 1,
          backtrackDelta: 0,
          goalVisible: false,
          goalObservedStep: null,
          trapCueCount: 0,
          enemyCueCount: 0,
          itemCueCount: 2,
          puzzleCueCount: 0,
          timingCueCount: 1,
          localCues: ['cache beacon', 'timing gate']
        }
      })
    ]);

    const scores = adapter.scoreLegalCandidates({
      seed: 'seed-7',
      step: 6,
      observation: makeObservation({ localCues: ['rotation gate'] }),
      snapshot: makeSnapshot({ observedCues: ['rotation gate'] }),
      candidates,
      episodeLogFeatures
    });

    expect([...scores.keys()].sort()).toEqual(candidates.map((candidate) => candidate.id).sort());
    expect(scores.has('frontier:illegal-shortcut')).toBe(false);
    expect(scores.get('frontier:loop-return') ?? 0).toBeGreaterThan(scores.get('frontier:trap-branch') ?? 0);
  });

  test('treats item and puzzle opportunity as bounded advisory candidate signals', () => {
    const adapter = new PlaybookAdapter();
    const candidates = [
      makeCandidate('frontier:cache-branch', 'cache-branch', {
        pathCost: 1,
        visitCount: 0,
        unexploredNeighborCount: 2,
        frontierCount: 2,
        goalVisible: false,
        itemOpportunity: 0.92,
        puzzleOpportunity: 0.68
      }),
      makeCandidate('frontier:trap-branch', 'trap-branch', {
        pathCost: 1,
        visitCount: 0,
        unexploredNeighborCount: 2,
        frontierCount: 2,
        goalVisible: false,
        trapRisk: 0.94,
        enemyPressure: 0.6
      })
    ];

    const scores = adapter.scoreLegalCandidates({
      seed: 'seed-7',
      step: 7,
      observation: makeObservation({
        traversableTileIds: ['cache-branch', 'trap-branch'],
        localCues: ['item cache', 'puzzle proxy', 'enemy patrol', 'trap rhythm']
      }),
      snapshot: makeSnapshot({
        frontierIds: ['cache-branch', 'trap-branch'],
        discoveredNodeIds: ['junction-a', 'cache-branch', 'trap-branch'],
        observedCues: ['item cache', 'puzzle proxy', 'enemy patrol', 'trap rhythm']
      }),
      candidates
    });

    expect(scores.get('frontier:cache-branch') ?? 0).toBeGreaterThan(scores.get('frontier:trap-branch') ?? 0);
  });

  test('returns intent summaries without bus-owned record fields and preserves route context', () => {
    const adapter = new PlaybookAdapter();
    const summary = adapter.summarizeIntent({
      kind: 'frontier-chosen',
      state: {
        currentTileId: 'junction-a',
        currentTileLabel: 'Junction A',
        targetTileId: 'west-branch',
        targetTileLabel: 'West branch',
        targetKind: 'frontier',
        goalVisible: false,
        traversedConnectorId: null,
        traversedConnectorLabel: null
      }
    });

    expect(summary.speaker).toBe('Runner');
    expect(summary.kind).toBe('frontier-chosen');
    expect(summary.summary).toContain('Scanning West branch');
    expect(summary.summary).toContain('Junction A');
    expect('id' in summary).toBe(false);
    expect('ttlSteps' in summary).toBe(false);
  });

  test('stays bounded away from manifest truth and bus record construction', () => {
    const boundedFiles = [
      '../../src/mazer-core/playbook/PlaybookAdapter.ts',
      '../../src/mazer-core/playbook/PlaybookFeatureSignals.ts',
      '../../src/mazer-core/playbook/PlaybookPatternScorer.ts',
      '../../src/mazer-core/playbook/PlaybookIntentTemplates.ts'
    ];

    for (const relativePath of boundedFiles) {
      const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
      expect(source).not.toMatch(/from\s+['"][^'"]*(visual-proof|manifestLoader|manifestTypes|topology-proof|scenarioLibrary|proofRuntime)/);
    }

    const intentSource = readFileSync(new URL('../../src/mazer-core/playbook/PlaybookIntentTemplates.ts', import.meta.url), 'utf8');
    expect(intentSource).not.toMatch(/makeIntentRecord|IntentBusRecord|buildIntentBus/);
  });
});
