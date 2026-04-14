import { describe, expect, test } from 'vitest';
import { createRuntimeEpisodeLog } from '../../../src/mazer-core/logging';
import type { RuntimeAdapterStepResult } from '../../../src/mazer-core/adapters';

const makeStepResult = (): RuntimeAdapterStepResult => ({
  step: 0,
  observation: {
    currentTileLabel: 'Start',
    observation: {
      step: 0,
      currentTileId: 'start',
      heading: 'north',
      traversableTileIds: ['goal'],
      localCues: ['start', 'goal-visible'],
      visibleLandmarks: [],
      goal: {
        visible: true,
        tileId: 'goal',
        label: 'Goal'
      }
    }
  },
  decision: {
    step: 0,
    currentTileId: 'start',
    targetKind: 'goal',
    targetTileId: 'goal',
    path: ['start', 'goal'],
    nextTileId: 'goal',
    reason: 'goal observed and reachable on discovered graph',
    goalVisible: true
  },
  snapshot: {
    seed: 'seed-1',
    currentTileId: 'start',
    currentHeading: 'north',
    mode: 'goal',
    counters: {
      replanCount: 0,
      backtrackCount: 0,
      frontierCount: 0,
      goalObservedStep: 0,
      tilesDiscovered: 1
    },
    discoveredNodeIds: ['start'],
    frontierIds: ['goal'],
    goalTileId: 'goal',
    observedLandmarkIds: [],
    observedCues: ['start', 'goal-visible']
  },
  trail: {
    currentPlayerTileId: 'start',
    trailHeadTileId: 'start',
    trailTailTileIds: [],
    occupancyHistory: ['start'],
    committedTileCount: 1
  },
  move: null,
  intent: {
    step: 0,
    sourceState: {
      step: 0,
      currentTileId: 'start',
      currentTileLabel: 'Start',
      targetTileId: 'goal',
      targetTileLabel: 'Goal',
      targetKind: 'goal',
      nextTileId: 'goal',
      reason: 'goal observed and reachable on discovered graph',
      frontierCount: 0,
      replanCount: 0,
      backtrackCount: 0,
      goalVisible: true,
      goalObservedStep: 0,
      visibleLandmarks: [],
      observedLandmarkIds: [],
      localCues: ['start', 'goal-visible'],
      traversableTileIds: ['goal'],
      traversedConnectorId: null,
      traversedConnectorLabel: null
    },
    sourceStates: [],
    bus: {
      records: [],
      totalSteps: 1,
      debouncedEventCount: 0,
      debouncedWorldPingCount: 0
    },
    emittedAtStep: []
  },
  episodes: {
    step: 0,
    episodes: [],
    latestEpisode: null
  }
});

describe('runtime episode log', () => {
  test('serializes only bounded local truth', () => {
    const log = createRuntimeEpisodeLog({
      seed: 'seed-1',
      startTileId: 'start',
      startHeading: 'north',
      intentCanary: null
    }, [makeStepResult()]);

    expect(log).toMatchObject({
      schemaVersion: 1,
      stepCount: 1,
      source: {
        seed: 'seed-1',
        startTileId: 'start',
        startHeading: 'north',
        intentCanary: null
      }
    });
    expect(Object.keys(log)).toEqual(['schemaVersion', 'generatedAt', 'source', 'stepCount', 'entries']);
    expect(JSON.stringify(log)).not.toMatch(/manifest|visual-proof|PlanetProofManifest/i);
  });
});
