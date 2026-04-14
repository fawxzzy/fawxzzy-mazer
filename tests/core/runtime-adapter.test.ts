import { describe, expect, test } from 'vitest';
import { RuntimeAdapterBridge, type RuntimeAdapterHost, type RuntimeEpisodeDelivery, type RuntimeIntentDelivery, type RuntimeMoveApplication, type RuntimeObservationProjection, type RuntimeTrailDelivery } from '../../src/mazer-core/adapters';
import { EpisodicPolicyScorer } from '../../src/mazer-core/agent/PolicyScorer';
import { createRuntimeEpisodeReplayHost } from '../../src/mazer-core/logging';
import type { LocalObservation, TileId, VisibleLandmark } from '../../src/mazer-core/agent/types';

type TileSpec = {
  label: string;
  neighbors: TileId[];
  goalVisible: boolean;
  goalTileId: TileId | null;
  cues: string[];
  landmarks: VisibleLandmark[];
};

const MAZE: Record<TileId, TileSpec> = {
  start: {
    label: 'Start',
    neighbors: ['branch-a', 'main-a'],
    goalVisible: false,
    goalTileId: null,
    cues: ['start'],
    landmarks: [{ id: 'entry-sign', label: 'Entry sign' }]
  },
  'branch-a': {
    label: 'Branch A',
    neighbors: ['start', 'branch-dead-end'],
    goalVisible: false,
    goalTileId: null,
    cues: ['branch'],
    landmarks: [{ id: 'branch-mark', label: 'Branch mark' }]
  },
  'branch-dead-end': {
    label: 'Branch dead end',
    neighbors: ['branch-a'],
    goalVisible: false,
    goalTileId: null,
    cues: ['dead-end'],
    landmarks: []
  },
  'main-a': {
    label: 'Main A',
    neighbors: ['start', 'junction'],
    goalVisible: false,
    goalTileId: null,
    cues: ['hall'],
    landmarks: []
  },
  junction: {
    label: 'Junction',
    neighbors: ['main-a', 'side-room', 'goal-approach'],
    goalVisible: true,
    goalTileId: 'goal',
    cues: ['junction', 'enemy patrol'],
    landmarks: [{ id: 'goal-signal', label: 'Goal signal' }]
  },
  'side-room': {
    label: 'Side room',
    neighbors: ['junction'],
    goalVisible: true,
    goalTileId: 'goal',
    cues: ['side'],
    landmarks: []
  },
  'goal-approach': {
    label: 'Goal approach',
    neighbors: ['junction', 'goal'],
    goalVisible: true,
    goalTileId: 'goal',
    cues: ['approach', 'trap sigil'],
    landmarks: []
  },
  goal: {
    label: 'Goal',
    neighbors: ['goal-approach'],
    goalVisible: true,
    goalTileId: 'goal',
    cues: ['goal'],
    landmarks: [{ id: 'exit-marker', label: 'Exit marker' }]
  }
};

const directionByEdge: Record<string, string> = {
  'start::branch-a': 'west',
  'start::main-a': 'east',
  'branch-a::branch-dead-end': 'north',
  'branch-a::start': 'east',
  'main-a::junction': 'east',
  'main-a::start': 'west',
  'junction::side-room': 'south',
  'junction::goal-approach': 'east',
  'junction::main-a': 'west',
  'side-room::junction': 'north',
  'goal-approach::goal': 'east',
  'goal-approach::junction': 'west',
  'goal::goal-approach': 'west'
};

const makeObservation = (step: number, tileId: TileId, heading: string): LocalObservation => {
  const tile = MAZE[tileId];
  return {
    step,
    currentTileId: tileId,
    heading,
    traversableTileIds: [...tile.neighbors],
    localCues: [...tile.cues],
    visibleLandmarks: [...tile.landmarks],
    goal: {
      visible: tile.goalVisible,
      tileId: tile.goalTileId,
      label: tile.goalVisible ? MAZE.goal.label : undefined
    }
  };
};

const nextHeading = (from: TileId, to: TileId): string => directionByEdge[`${from}::${to}`] ?? 'north';

class MazeRuntimeHost implements RuntimeAdapterHost {
  readonly config = {
    seed: 'seed-77',
    startTileId: 'start' as TileId,
    startHeading: 'east'
  };

  protected tileId: TileId = this.config.startTileId;
  protected heading = this.config.startHeading;

  readonly trailDeliveries: RuntimeTrailDelivery[] = [];
  readonly intentDeliveries: RuntimeIntentDelivery[] = [];
  readonly episodeDeliveries: RuntimeEpisodeDelivery[] = [];
  readonly appliedMoves: TileId[] = [];

  projectObservation(step: number): RuntimeObservationProjection {
    return {
      currentTileLabel: MAZE[this.tileId].label,
      observation: makeObservation(step, this.tileId, this.heading)
    };
  }

  applyLegalMove(nextTileId: TileId): RuntimeMoveApplication {
    const current = MAZE[this.tileId];
    if (!current.neighbors.includes(nextTileId)) {
      throw new Error(`Illegal move ${this.tileId} -> ${nextTileId}.`);
    }

    this.appliedMoves.push(nextTileId);
    this.heading = nextHeading(this.tileId, nextTileId);
    this.tileId = nextTileId;

    return {
      currentTileId: this.tileId,
      traversedConnectorId: nextTileId === 'goal-approach' ? 'connector-goal-lane' : null,
      traversedConnectorLabel: nextTileId === 'goal-approach' ? 'Goal lane' : null
    };
  }

  receiveTrailUpdate(delivery: RuntimeTrailDelivery): void {
    this.trailDeliveries.push(delivery);
  }

  receiveIntentDelivery(delivery: RuntimeIntentDelivery): void {
    this.intentDeliveries.push(delivery);
  }

  receiveEpisodeLog(delivery: RuntimeEpisodeDelivery): void {
    this.episodeDeliveries.push(delivery);
  }

  describeTile(tileId: TileId) {
    return {
      id: tileId,
      label: MAZE[tileId].label
    };
  }
}

class DivergingRuntimeHost extends MazeRuntimeHost {
  override applyLegalMove(nextTileId: TileId): RuntimeMoveApplication {
    super.applyLegalMove(nextTileId);
    return {
      currentTileId: 'branch-dead-end'
    };
  }
}

describe('RuntimeAdapterBridge', () => {
  test('keeps planner truth in mazer-core while delivering trail, intent, and episode outputs', () => {
    const runtime = new MazeRuntimeHost();
    const bridge = new RuntimeAdapterBridge(runtime, new EpisodicPolicyScorer());
    const steps = bridge.runUntilIdle(8);

    expect(bridge.isComplete).toBe(true);
    expect(steps.length).toBeGreaterThan(0);
    expect(runtime.intentDeliveries).toHaveLength(steps.length);
    expect(runtime.episodeDeliveries).toHaveLength(steps.length);
    expect(runtime.trailDeliveries.filter((entry) => entry.phase === 'observe')).toHaveLength(steps.length);
    expect(runtime.trailDeliveries.filter((entry) => entry.phase === 'commit')).toHaveLength(runtime.appliedMoves.length);
    expect(steps.every((entry) => (
      entry.decision.nextTileId === null
      || entry.observation.observation.traversableTileIds.includes(entry.decision.nextTileId)
    ))).toBe(true);
    expect(runtime.intentDeliveries[0].sourceState.currentTileLabel).toBe('Start');
    expect(runtime.intentDeliveries.some((delivery) => (
      delivery.bus.records.some((record) => record.kind === 'goal-observed')
    ))).toBe(true);
    expect(runtime.intentDeliveries.some((delivery) => (
      delivery.bus.records.some((record) => record.kind === 'enemy-seen')
    ))).toBe(true);
    expect(runtime.trailDeliveries
      .filter((delivery) => delivery.phase === 'commit')
      .every((delivery) => delivery.trail.trailHeadTileId === delivery.currentTileId)).toBe(true);
    expect(runtime.episodeDeliveries.at(-1)?.latestEpisode?.scorerId).toBe('episode-priors');
    expect(runtime.episodeDeliveries.at(-1)?.latestEpisode?.outcome).not.toBeNull();
  });

  test('replays a saved episode log through the bridge without bypassing planner truth', () => {
    const runtime = new MazeRuntimeHost();
    const bridge = new RuntimeAdapterBridge(runtime, new EpisodicPolicyScorer());
    const originalSteps = bridge.runUntilIdle(8);
    const episodeLog = bridge.createEpisodeLog();
    const replayBridge = new RuntimeAdapterBridge(
      createRuntimeEpisodeReplayHost(episodeLog),
      new EpisodicPolicyScorer()
    );
    const replaySteps = replayBridge.runUntilIdle(8);
    const replayLog = replayBridge.createEpisodeLog();

    expect(episodeLog.stepCount).toBe(originalSteps.length);
    expect(episodeLog.entries).toHaveLength(originalSteps.length);
    expect(replaySteps).toEqual(originalSteps);
    expect({
      ...replayLog,
      generatedAt: episodeLog.generatedAt
    }).toEqual(episodeLog);
  });

  test('rejects runtimes that mutate the committed legal move', () => {
    const bridge = new RuntimeAdapterBridge(new DivergingRuntimeHost());

    expect(() => bridge.runStep()).toThrow(/must commit the requested legal move/i);
  });
});
