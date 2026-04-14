import { ExplorerAgent } from '../agent/ExplorerAgent';
import type { ExplorerDecision, ExplorerSnapshot, PolicyEpisode, PolicyScorer, TileId } from '../agent/types';
import { buildIntentBus, type IntentSourceState } from '../intent/IntentBus';
import type { IntentBusBuildResult } from '../intent/IntentBus';
import type { IntentBusRecord } from '../intent/IntentEvent';
import { createRuntimeEpisodeLog, type RuntimeEpisodeLog } from '../logging';
import { TrailTracker } from './TrailTracker';
import type {
  RuntimeAdapterHost,
  RuntimeAdapterStepResult,
  RuntimeEpisodeDelivery,
  RuntimeIntentDelivery,
  RuntimeMoveApplication,
  RuntimeObservationProjection,
  RuntimeTrailDelivery,
  RuntimeTrailSnapshot
} from './types';

const cloneTrailSnapshot = (trail: RuntimeTrailSnapshot): RuntimeTrailSnapshot => ({
  ...trail,
  trailTailTileIds: [...trail.trailTailTileIds],
  occupancyHistory: [...trail.occupancyHistory]
});

const cloneExplorerSnapshot = (snapshot: ExplorerSnapshot): ExplorerSnapshot => ({
  ...snapshot,
  counters: { ...snapshot.counters },
  discoveredNodeIds: [...snapshot.discoveredNodeIds],
  frontierIds: [...snapshot.frontierIds],
  observedLandmarkIds: [...snapshot.observedLandmarkIds],
  observedCues: [...snapshot.observedCues]
});

const cloneDecision = (decision: ExplorerDecision): ExplorerDecision => ({
  ...decision,
  path: [...decision.path]
});

const cloneEpisodes = (episodes: readonly PolicyEpisode[]): PolicyEpisode[] => episodes.map((episode) => ({
  ...episode,
  observation: { ...episode.observation },
  candidates: episode.candidates.map((candidate) => ({
    ...candidate,
    path: [...candidate.path],
    features: { ...candidate.features }
  })),
  chosenAction: { ...episode.chosenAction },
  outcome: episode.outcome
    ? {
        ...episode.outcome,
        localCues: [...episode.outcome.localCues]
      }
    : null
}));

const cloneIntentSourceState = (state: IntentSourceState): IntentSourceState => ({
  ...state,
  visibleLandmarks: state.visibleLandmarks.map((landmark) => ({ ...landmark })),
  observedLandmarkIds: [...state.observedLandmarkIds],
  localCues: [...state.localCues],
  traversableTileIds: [...state.traversableTileIds]
});

const cloneIntentRecords = (records: readonly IntentBusRecord[]): IntentBusRecord[] => records.map((record) => ({
  ...record,
  anchor: record.anchor ? { ...record.anchor } : undefined
}));

const cloneIntentBus = (bus: IntentBusBuildResult): IntentBusBuildResult => ({
  records: cloneIntentRecords(bus.records),
  totalSteps: bus.totalSteps,
  debouncedEventCount: bus.debouncedEventCount,
  debouncedWorldPingCount: bus.debouncedWorldPingCount
});

const cloneObservationProjection = (projection: RuntimeObservationProjection): RuntimeObservationProjection => ({
  currentTileLabel: projection.currentTileLabel ?? null,
  observation: {
    ...projection.observation,
    traversableTileIds: [...projection.observation.traversableTileIds],
    localCues: [...projection.observation.localCues],
    candidateSignals: projection.observation.candidateSignals
      ? Object.fromEntries(
          Object.entries(projection.observation.candidateSignals).map(([tileId, features]) => [
            tileId,
            features ? { ...features } : features
          ])
        )
      : undefined,
    visibleLandmarks: projection.observation.visibleLandmarks.map((landmark) => ({ ...landmark })),
    goal: { ...projection.observation.goal }
  }
});

const cloneMove = (move: RuntimeMoveApplication | null): RuntimeMoveApplication | null => (
  move
    ? {
        ...move,
        traversedConnectorId: move.traversedConnectorId ?? null,
        traversedConnectorLabel: move.traversedConnectorLabel ?? null
      }
    : null
);

const resolveTileLabel = (
  host: RuntimeAdapterHost,
  tileId: TileId | null,
  fallback: string | null = null
): string | null => {
  if (!tileId) {
    return fallback;
  }

  const described = host.describeTile?.(tileId);
  return described?.label ?? fallback ?? tileId;
};

const buildIntentSourceState = (
  host: RuntimeAdapterHost,
  projection: RuntimeObservationProjection,
  decision: ExplorerDecision,
  snapshot: ExplorerSnapshot,
  move: RuntimeMoveApplication | null
): IntentSourceState => ({
  step: projection.observation.step,
  currentTileId: projection.observation.currentTileId,
  currentTileLabel: projection.currentTileLabel
    ?? resolveTileLabel(host, projection.observation.currentTileId, projection.observation.currentTileId)
    ?? projection.observation.currentTileId,
  targetTileId: decision.targetTileId,
  targetTileLabel: resolveTileLabel(host, decision.targetTileId),
  targetKind: decision.targetKind,
  nextTileId: decision.nextTileId,
  reason: decision.reason,
  frontierCount: snapshot.frontierIds.length,
  replanCount: snapshot.counters.replanCount,
  backtrackCount: snapshot.counters.backtrackCount,
  goalVisible: projection.observation.goal.visible,
  goalObservedStep: snapshot.counters.goalObservedStep,
  visibleLandmarks: projection.observation.visibleLandmarks.map((landmark) => ({
    id: landmark.id,
    label: landmark.label
  })),
  observedLandmarkIds: [...snapshot.observedLandmarkIds],
  localCues: [...projection.observation.localCues],
  traversableTileIds: [...projection.observation.traversableTileIds],
  traversedConnectorId: move?.traversedConnectorId ?? null,
  traversedConnectorLabel: move?.traversedConnectorLabel ?? null
});

export class RuntimeAdapterBridge {
  readonly #agent: ExplorerAgent;
  readonly #trail: TrailTracker;
  readonly #intentSourceStates: IntentSourceState[] = [];
  readonly #results: RuntimeAdapterStepResult[] = [];
  #step = 0;
  #complete = false;

  constructor(
    private readonly host: RuntimeAdapterHost,
    policyScorer: PolicyScorer | null = null
  ) {
    this.#agent = new ExplorerAgent({
      seed: host.config.seed,
      startTileId: host.config.startTileId,
      startHeading: host.config.startHeading,
      policyScorer
    });
    this.#trail = new TrailTracker({ initialTileId: host.config.startTileId });
  }

  get currentStep(): number {
    return this.#step;
  }

  get isComplete(): boolean {
    return this.#complete;
  }

  runStep(): RuntimeAdapterStepResult {
    if (this.#complete) {
      throw new Error('RuntimeAdapterBridge is already complete.');
    }

    const projection = this.host.projectObservation(this.#step);
    if (projection.observation.step !== this.#step) {
      throw new Error(
        `Runtime observation step ${projection.observation.step} does not match bridge step ${this.#step}.`
      );
    }

    const decision = this.#agent.observe(projection.observation);
    const snapshot = this.#agent.getDiagnostics();
    const observedTrail = this.#trail.syncCurrentTile(projection.observation.currentTileId);
    this.host.receiveTrailUpdate(this.#buildTrailDelivery(
      'observe',
      projection.observation.currentTileId,
      projection.observation.currentTileId,
      decision,
      snapshot,
      observedTrail
    ));

    let move: RuntimeMoveApplication | null = null;
    let trail = observedTrail;

    if (decision.nextTileId) {
      move = this.host.applyLegalMove(decision.nextTileId);
      if (move.currentTileId !== decision.nextTileId) {
        throw new Error(
          `Runtime adapter must commit the requested legal move ${decision.nextTileId}; received ${move.currentTileId}.`
        );
      }

      trail = this.#trail.commitTile(move.currentTileId);
      this.host.receiveTrailUpdate(this.#buildTrailDelivery(
        'commit',
        move.currentTileId,
        projection.observation.currentTileId,
        decision,
        snapshot,
        trail
      ));
    }

    const sourceState = buildIntentSourceState(this.host, projection, decision, snapshot, move);
    this.#intentSourceStates.push(sourceState);

    const bus = buildIntentBus(this.#intentSourceStates, {
      canary: this.host.config.intentCanary ?? null
    });
    const intentDelivery = this.#buildIntentDelivery(sourceState, bus);
    this.host.receiveIntentDelivery(intentDelivery);

    const episodeDelivery = this.#buildEpisodeDelivery();
    this.host.receiveEpisodeLog(episodeDelivery);

    const result: RuntimeAdapterStepResult = {
      step: this.#step,
      observation: cloneObservationProjection(projection),
      decision: cloneDecision(decision),
      snapshot: cloneExplorerSnapshot(snapshot),
      trail: cloneTrailSnapshot(trail),
      move: cloneMove(move),
      intent: intentDelivery,
      episodes: episodeDelivery
    };

    this.#results.push(structuredClone(result));
    this.#step += 1;
    this.#complete = !decision.nextTileId;
    return result;
  }

  runUntilIdle(maxSteps: number): RuntimeAdapterStepResult[] {
    const results: RuntimeAdapterStepResult[] = [];

    for (let index = 0; index < maxSteps; index += 1) {
      results.push(this.runStep());
      if (this.#complete) {
        return results;
      }
    }

    throw new Error(`RuntimeAdapterBridge exceeded maxSteps=${maxSteps} before idling.`);
  }

  createEpisodeLog(): RuntimeEpisodeLog {
    return createRuntimeEpisodeLog({
      seed: this.host.config.seed,
      startTileId: this.host.config.startTileId,
      startHeading: this.host.config.startHeading ?? null,
      intentCanary: this.host.config.intentCanary ?? null
    }, this.#results);
  }

  #buildTrailDelivery(
    phase: RuntimeTrailDelivery['phase'],
    currentTileId: TileId,
    previousTileId: TileId | null,
    decision: ExplorerDecision,
    snapshot: ExplorerSnapshot,
    trail: RuntimeTrailSnapshot
  ): RuntimeTrailDelivery {
    return {
      step: this.#step,
      phase,
      currentTileId,
      previousTileId,
      nextTileId: decision.nextTileId,
      decision: cloneDecision(decision),
      snapshot: cloneExplorerSnapshot(snapshot),
      trail: cloneTrailSnapshot(trail)
    };
  }

  #buildIntentDelivery(
    sourceState: IntentSourceState,
    bus: IntentBusBuildResult
  ): RuntimeIntentDelivery {
    return {
      step: this.#step,
      sourceState: cloneIntentSourceState(sourceState),
      sourceStates: this.#intentSourceStates.map((entry) => cloneIntentSourceState(entry)),
      bus: cloneIntentBus(bus),
      emittedAtStep: cloneIntentRecords(bus.records.filter((record) => record.step === this.#step))
    };
  }

  #buildEpisodeDelivery(): RuntimeEpisodeDelivery {
    const episodes = cloneEpisodes(this.#agent.getEpisodeLog());
    return {
      step: this.#step,
      episodes,
      latestEpisode: episodes.at(-1) ?? null
    };
  }
}
