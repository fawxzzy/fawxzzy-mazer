import { describe, expect, test } from 'vitest';
import { PlaybookPatternScorer } from '../../../src/mazer-core/playbook';
import { tunePlaybookWeightsOffline } from '../../../src/mazer-core/playbook/tuning';
import type {
  ExplorerSnapshot,
  LocalObservation,
  PolicyActionCandidate
} from '../../../src/mazer-core/agent/types';
import type { ReplayLinkedTrainingDataset } from '../../../src/mazer-core/logging';

const makeObservation = (): LocalObservation => ({
  step: 8,
  currentTileId: 'junction-a',
  heading: 'east',
  traversableTileIds: ['cache-branch', 'trap-branch'],
  localCues: ['item cache', 'puzzle proxy', 'enemy patrol', 'trap rhythm'],
  visibleLandmarks: [],
  goal: {
    visible: false,
    tileId: null
  }
});

const makeSnapshot = (): ExplorerSnapshot => ({
  seed: 'seed-training',
  currentTileId: 'junction-a',
  currentHeading: 'east',
  mode: 'explore',
  counters: {
    replanCount: 1,
    backtrackCount: 0,
    frontierCount: 2,
    goalObservedStep: null,
    tilesDiscovered: 3
  },
  discoveredNodeIds: ['junction-a', 'cache-branch', 'trap-branch'],
  frontierIds: ['cache-branch', 'trap-branch'],
  goalTileId: null,
  observedLandmarkIds: [],
  observedCues: ['item cache', 'puzzle proxy', 'enemy patrol', 'trap rhythm']
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

const makeDataset = (): ReplayLinkedTrainingDataset => ({
  schemaVersion: 1,
  exportedAt: '2026-04-14T00:00:00.000Z',
  lane: 'offline',
  replayLink: {
    seed: 'seed-training',
    startTileId: 'start',
    startHeading: 'north',
    intentCanary: null,
    stepCount: 2,
    episodeCount: 2,
    logDigest: 'fnv1a-seed-training'
  },
  priors: {
    totalEpisodes: 2,
    global: {
      samples: 2,
      frontierValue: 0.72,
      backtrackUrgency: 0.58,
      trapSuspicion: 0.81,
      enemyRisk: 0.76,
      itemValue: 0.84,
      puzzleValue: 0.71,
      rotationTiming: 0.63
    },
    byTileId: {}
  },
  evalSummary: {
    schemaVersion: 1,
    summaryId: 'eval-seed-training',
    runId: 'eval-seed-training',
    seed: 'seed-training',
    metrics: {
      discoveryEfficiency: 0.79,
      backtrackPressure: 0.31,
      trapFalsePositiveRate: 0.14,
      trapFalseNegativeRate: 0.09,
      wardenPressureExposure: 0.28,
      itemUsefulnessScore: 0.83,
      puzzleStateClarityScore: 0.74
    }
  },
  episodes: []
});

describe('offline scorer tuner', () => {
  test('derives bounded advisory weights from replay-linked datasets', () => {
    const tuningRun = tunePlaybookWeightsOffline([makeDataset()]);

    expect(tuningRun.advisoryOnly).toBe(true);
    expect(tuningRun.datasetCount).toBe(1);
    expect(tuningRun.weights.itemValue).toBeGreaterThan(1);
    expect(tuningRun.weights.frontierValue).toBeGreaterThan(1);
    expect(tuningRun.weights.trapSuspicion).toBeLessThanOrEqual(1);
  });

  test('keeps tuned scoring bounded to legal candidates and preserves healthy-lane ranking', () => {
    const scorer = new PlaybookPatternScorer();
    const candidates = [
      makeCandidate('frontier:cache-branch', 'cache-branch', {
        pathCost: 1,
        visitCount: 0,
        unexploredNeighborCount: 2,
        frontierCount: 2,
        goalVisible: false,
        trapRisk: 0.08,
        enemyPressure: 0.12,
        itemOpportunity: 0.94,
        puzzleOpportunity: 0.72,
        timingWindow: 0.48
      }),
      makeCandidate('frontier:trap-branch', 'trap-branch', {
        pathCost: 1,
        visitCount: 0,
        unexploredNeighborCount: 2,
        frontierCount: 2,
        goalVisible: false,
        trapRisk: 0.94,
        enemyPressure: 0.68,
        itemOpportunity: 0.1,
        puzzleOpportunity: 0.08,
        timingWindow: 0.12
      })
    ];
    const baseline = scorer.scoreLegalCandidates({
      seed: 'seed-training',
      step: 8,
      observation: makeObservation(),
      snapshot: makeSnapshot(),
      candidates
    });
    const tuningRun = tunePlaybookWeightsOffline([makeDataset()]);
    const tuned = scorer.scoreLegalCandidates({
      seed: 'seed-training',
      step: 8,
      observation: makeObservation(),
      snapshot: makeSnapshot(),
      candidates,
      tuningWeights: tuningRun.weights
    });

    expect([...tuned.keys()].sort()).toEqual(candidates.map((candidate) => candidate.id).sort());
    expect(tuned.has('frontier:illegal-shortcut')).toBe(false);
    expect(tuned.get('frontier:cache-branch') ?? 0).toBeGreaterThan(tuned.get('frontier:trap-branch') ?? 0);
    expect((tuned.get('frontier:cache-branch') ?? 0) - (baseline.get('frontier:cache-branch') ?? 0)).toBeGreaterThan(0);
  });
});
