import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { PlaybookAdapter } from '../../src/mazer-core/playbook/PlaybookAdapter';
import type {
  ExplorerSnapshot,
  LocalObservation,
  PolicyActionCandidate,
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

const makeCandidate = (
  id: string,
  targetTileId: string,
  features: PolicyActionCandidate['features']
): PolicyActionCandidate => ({
  id,
  targetKind: 'frontier',
  targetTileId,
  path: ['junction-a', targetTileId],
  nextTileId: targetTileId,
  reason: 'expanding local frontier from current tile',
  heuristicScore: 0,
  policyScore: null,
  features
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
        localCues: ['trap rhythm', 'enemy patrol']
      }
    }));

    const after = adapter.scoreLegalCandidates(input);

    expect((after.get('frontier:safe-branch') ?? 0) - (before.get('frontier:safe-branch') ?? 0)).toBeGreaterThan(0);
    expect(after.get('frontier:safe-branch') ?? 0).toBeGreaterThan(after.get('frontier:trap-branch') ?? 0);
  });

  test('returns intent summaries without bus-owned record fields', () => {
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
    expect(summary.summary).toBe('Scanning West branch.');
    expect('id' in summary).toBe(false);
    expect('ttlSteps' in summary).toBe(false);
  });

  test('stays bounded away from manifest truth and bus record construction', () => {
    const boundedFiles = [
      '../../src/mazer-core/playbook/PlaybookAdapter.ts',
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
