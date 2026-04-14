import { describe, expect, test } from 'vitest';
import type { RuntimeAdapterStepResult } from '../../../src/mazer-core/adapters';
import {
  createReplayEvalSummaryId,
  createReplayLinkedTrainingDataset,
  createRuntimeEpisodeLog,
  getReplayLinkedDatasetDigest
} from '../../../src/mazer-core/logging';

const makeStepResult = (step: number): RuntimeAdapterStepResult => ({
  step,
  observation: {
    currentTileLabel: step === 0 ? 'Start' : 'Cache branch',
    observation: {
      step,
      currentTileId: step === 0 ? 'start' : 'cache-branch',
      heading: 'north',
      traversableTileIds: step === 0 ? ['cache-branch'] : ['goal'],
      localCues: step === 0 ? ['item cache'] : ['item cache', 'puzzle proxy'],
      visibleLandmarks: [],
      goal: {
        visible: step > 0,
        tileId: step > 0 ? 'goal' : null,
        label: step > 0 ? 'Goal' : undefined
      }
    }
  },
  decision: {
    step,
    currentTileId: step === 0 ? 'start' : 'cache-branch',
    targetKind: 'frontier',
    targetTileId: step === 0 ? 'cache-branch' : 'goal',
    path: step === 0 ? ['start', 'cache-branch'] : ['cache-branch', 'goal'],
    nextTileId: step === 0 ? 'cache-branch' : 'goal',
    reason: 'expanding local frontier from current tile',
    goalVisible: step > 0
  },
  snapshot: {
    seed: 'seed-training',
    currentTileId: step === 0 ? 'start' : 'cache-branch',
    currentHeading: 'north',
    mode: 'explore',
    counters: {
      replanCount: step,
      backtrackCount: 0,
      frontierCount: 1,
      goalObservedStep: step > 0 ? 1 : null,
      tilesDiscovered: step + 1
    },
    discoveredNodeIds: step === 0 ? ['start'] : ['start', 'cache-branch'],
    frontierIds: step === 0 ? ['cache-branch'] : ['goal'],
    goalTileId: step > 0 ? 'goal' : null,
    observedLandmarkIds: [],
    observedCues: step === 0 ? ['item cache'] : ['item cache', 'puzzle proxy']
  },
  trail: {
    currentPlayerTileId: step === 0 ? 'start' : 'cache-branch',
    trailHeadTileId: step === 0 ? 'start' : 'cache-branch',
    trailTailTileIds: step === 0 ? [] : ['start'],
    occupancyHistory: step === 0 ? ['start'] : ['start', 'cache-branch'],
    committedTileCount: step + 1
  },
  move: step === 0
    ? {
        currentTileId: 'cache-branch',
        traversedConnectorId: null,
        traversedConnectorLabel: null
      }
    : null,
  intent: {
    step,
    sourceState: {
      step,
      currentTileId: step === 0 ? 'start' : 'cache-branch',
      currentTileLabel: step === 0 ? 'Start' : 'Cache branch',
      targetTileId: step === 0 ? 'cache-branch' : 'goal',
      targetTileLabel: step === 0 ? 'Cache branch' : 'Goal',
      targetKind: 'frontier',
      nextTileId: step === 0 ? 'cache-branch' : 'goal',
      reason: 'expanding local frontier from current tile',
      frontierCount: 1,
      replanCount: step,
      backtrackCount: 0,
      goalVisible: step > 0,
      goalObservedStep: step > 0 ? 1 : null,
      visibleLandmarks: [],
      observedLandmarkIds: [],
      localCues: step === 0 ? ['item cache'] : ['item cache', 'puzzle proxy'],
      traversableTileIds: step === 0 ? ['cache-branch'] : ['goal'],
      traversedConnectorId: null,
      traversedConnectorLabel: null
    },
    sourceStates: [],
    bus: {
      records: [],
      totalSteps: step + 1,
      debouncedEventCount: 0,
      debouncedWorldPingCount: 0
    },
    emittedAtStep: []
  },
  episodes: {
    step,
    episodes: step === 0
      ? []
      : [
          {
            step: 0,
            seed: 'seed-training',
            scorerId: 'episode-priors',
            currentTileId: 'start',
            heading: 'north',
            observation: {
              traversableCount: 1,
              landmarkCount: 0,
              localCueCount: 1,
              dangerCueCount: 0,
              enemyCueCount: 0,
              itemCueCount: 1,
              puzzleCueCount: 0,
              timingCueCount: 0,
              goalVisible: false
            },
            candidates: [],
            chosenCandidateId: 'frontier:cache-branch',
            chosenAction: {
              targetKind: 'frontier',
              targetTileId: 'cache-branch',
              nextTileId: 'cache-branch',
              reason: 'expanding local frontier from current tile'
            },
            outcome: {
              arrivedTileId: 'cache-branch',
              discoveredTilesDelta: 1,
              frontierDelta: 1,
              replanDelta: 1,
              backtrackDelta: 0,
              goalVisible: false,
              goalObservedStep: null,
              trapCueCount: 0,
              enemyCueCount: 0,
              itemCueCount: 1,
              puzzleCueCount: 1,
              timingCueCount: 0,
              localCues: ['item cache', 'puzzle proxy']
            }
          }
        ],
    latestEpisode: step === 0 ? null : {
      step: 0,
      seed: 'seed-training',
      scorerId: 'episode-priors',
      currentTileId: 'start',
      heading: 'north',
      observation: {
        traversableCount: 1,
        landmarkCount: 0,
        localCueCount: 1,
        dangerCueCount: 0,
        enemyCueCount: 0,
        itemCueCount: 1,
        puzzleCueCount: 0,
        timingCueCount: 0,
        goalVisible: false
      },
      candidates: [],
      chosenCandidateId: 'frontier:cache-branch',
      chosenAction: {
        targetKind: 'frontier',
        targetTileId: 'cache-branch',
        nextTileId: 'cache-branch',
        reason: 'expanding local frontier from current tile'
      },
      outcome: {
        arrivedTileId: 'cache-branch',
        discoveredTilesDelta: 1,
        frontierDelta: 1,
        replanDelta: 1,
        backtrackDelta: 0,
        goalVisible: false,
        goalObservedStep: null,
        trapCueCount: 0,
        enemyCueCount: 0,
        itemCueCount: 1,
        puzzleCueCount: 1,
        timingCueCount: 0,
        localCues: ['item cache', 'puzzle proxy']
      }
    }
  }
});

describe('replay-linked training dataset', () => {
  test('exports deterministic datasets from replayable episode logs', () => {
    const log = createRuntimeEpisodeLog({
      seed: 'seed-training',
      startTileId: 'start',
      startHeading: 'north',
      intentCanary: null
    }, [makeStepResult(0), makeStepResult(1)]);
    const evalSummary = {
      schemaVersion: 1,
      runId: 'eval-seed-training',
      seed: 'seed-training',
      metrics: {
        discoveryEfficiency: 0.78,
        backtrackPressure: 0.22,
        trapFalsePositiveRate: 0.1,
        trapFalseNegativeRate: 0.08,
        wardenPressureExposure: 0.24,
        itemUsefulnessScore: 0.82,
        puzzleStateClarityScore: 0.72
      }
    };
    const dataset = createReplayLinkedTrainingDataset(log, {
      ...evalSummary,
      summaryId: createReplayEvalSummaryId(evalSummary)
    });
    const repeat = createReplayLinkedTrainingDataset(log, {
      ...evalSummary,
      summaryId: createReplayEvalSummaryId(evalSummary)
    });

    expect(dataset.replayLink.seed).toBe('seed-training');
    expect(dataset.replayLink.episodeCount).toBe(1);
    expect(dataset.evalSummary?.summaryId).toBe(createReplayEvalSummaryId(evalSummary));
    expect(dataset.priors.totalEpisodes).toBe(1);
    expect(getReplayLinkedDatasetDigest(dataset)).toBe(getReplayLinkedDatasetDigest(repeat));
    expect(JSON.stringify(dataset)).not.toMatch(/manifest|visual-proof|PlanetProofManifest|objectiveNodeId|solutionPath/i);
  });
});
