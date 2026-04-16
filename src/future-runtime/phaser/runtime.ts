import { RuntimeAdapterBridge, type RuntimeAdapterHost, type RuntimeAdapterStepResult } from '../../mazer-core/adapters';
import { EpisodicPolicyScorer } from '../../mazer-core/agent/PolicyScorer';
import type {
  HeadingToken,
  LocalObservation,
  TileId
} from '../../mazer-core/agent/types';
import type {
  RuntimeEpisodeDelivery,
  RuntimeIntentDelivery,
  RuntimeMoveApplication,
  RuntimeObservationProjection,
  RuntimeTrailDelivery
} from '../../mazer-core/adapters';
import {
  FUTURE_PHASER_START_HEADING,
  FUTURE_PHASER_START_TILE_ID,
  FUTURE_PHASER_TOPOLOGY,
  resolveFutureHeading,
  resolveFutureTile,
  type FutureTile,
  type FutureTileId
} from './topology';

export interface FuturePhaserRuntimeSnapshot {
  currentTileId: FutureTileId;
  currentHeading: HeadingToken;
  results: readonly RuntimeAdapterStepResult[];
  trailDeliveries: readonly RuntimeTrailDelivery[];
  intentDeliveries: readonly RuntimeIntentDelivery[];
  episodeDeliveries: readonly RuntimeEpisodeDelivery[];
  contentProof: FutureRuntimeContentProof;
}

export interface FutureRuntimeContentProof {
  trapInferencePass: boolean;
  wardenReadabilityPass: boolean;
  itemProxyPass: boolean;
  puzzleProxyPass: boolean;
  signalOverloadPass: boolean;
}

export const FUTURE_PHASER_WINDOW_KEY = '__MAZER_FUTURE_PHASER__';
export const FUTURE_PHASER_PROOF_SIGNAL_KEY = '__MAZER_FUTURE_PHASER_SIGNAL__';

export type FuturePhaserProofReadyState = 'booting' | 'ready' | 'error';
export type FuturePhaserProofCompletionState = 'pending' | 'complete' | 'error';

export interface FuturePhaserRuntimeProofStatus {
  readyState: FuturePhaserProofReadyState;
  completionState: FuturePhaserProofCompletionState;
  currentStep: number;
  isComplete: boolean;
  lastUpdatedAt: string;
  error: string | null;
  snapshot: FuturePhaserRuntimeSnapshot | null;
}

interface FuturePhaserWindowLike {
  [FUTURE_PHASER_WINDOW_KEY]?: FuturePhaserRuntimeSession;
  [FUTURE_PHASER_PROOF_SIGNAL_KEY]?: FuturePhaserRuntimeProofController;
}

const hasIntentRecord = (
  deliveries: readonly RuntimeIntentDelivery[],
  predicate: (record: RuntimeIntentDelivery['bus']['records'][number]) => boolean
): boolean => deliveries.some((delivery) => delivery.bus.records.some(predicate));

const hasEpisodeOutcomeSignal = (
  deliveries: readonly RuntimeEpisodeDelivery[],
  predicate: (outcome: NonNullable<NonNullable<RuntimeEpisodeDelivery['latestEpisode']>['outcome']>) => boolean
): boolean => deliveries.some((delivery) => {
  const outcome = delivery.latestEpisode?.outcome;
  if (!outcome) {
    return false;
  }

  return predicate(outcome);
});

const buildFutureRuntimeContentProof = (
  intentDeliveries: readonly RuntimeIntentDelivery[],
  episodeDeliveries: readonly RuntimeEpisodeDelivery[]
): FutureRuntimeContentProof => {
  const latestIntentDelivery = intentDeliveries.at(-1) ?? null;
  const visibleIntentRecordCount = latestIntentDelivery?.bus.records.slice(-3).length ?? 0;
  const trapInferencePass = hasIntentRecord(intentDeliveries, (record) => record.kind === 'trap-inferred' || record.speaker === 'TrapNet')
    || hasEpisodeOutcomeSignal(episodeDeliveries, (outcome) => (outcome.trapCueCount ?? 0) > 0);
  const wardenReadabilityPass = hasIntentRecord(intentDeliveries, (record) => record.kind === 'enemy-seen' || record.speaker === 'Warden')
    || hasEpisodeOutcomeSignal(episodeDeliveries, (outcome) => (outcome.enemyCueCount ?? 0) > 0);
  const itemProxyPass = hasIntentRecord(intentDeliveries, (record) => record.kind === 'item-spotted' || record.speaker === 'Inventory')
    || hasEpisodeOutcomeSignal(episodeDeliveries, (outcome) => (outcome.itemCueCount ?? 0) > 0);
  const puzzleProxyPass = hasIntentRecord(intentDeliveries, (record) => record.kind === 'puzzle-state-observed' || record.speaker === 'Puzzle')
    || hasEpisodeOutcomeSignal(episodeDeliveries, (outcome) => (outcome.puzzleCueCount ?? 0) > 0);

  return {
    trapInferencePass,
    wardenReadabilityPass,
    itemProxyPass,
    puzzleProxyPass,
    signalOverloadPass: trapInferencePass
      && wardenReadabilityPass
      && itemProxyPass
      && puzzleProxyPass
      && visibleIntentRecordCount <= 3
  };
};

class FuturePhaserRuntimeHost implements RuntimeAdapterHost {
  readonly config = {
    seed: 'future-phaser-seed',
    startTileId: FUTURE_PHASER_START_TILE_ID,
    startHeading: FUTURE_PHASER_START_HEADING,
    intentCanary: null
  };

  private currentTileId: FutureTileId = FUTURE_PHASER_START_TILE_ID;

  private currentHeading: HeadingToken = FUTURE_PHASER_START_HEADING;

  readonly appliedMoves: FutureTileId[] = [];
  readonly trailDeliveries: RuntimeTrailDelivery[] = [];
  readonly intentDeliveries: RuntimeIntentDelivery[] = [];
  readonly episodeDeliveries: RuntimeEpisodeDelivery[] = [];

  projectObservation(step: number): RuntimeObservationProjection {
    const tile = resolveFutureTile(this.currentTileId);
    if (!tile) {
      throw new Error(`Unknown runtime tile: ${this.currentTileId}.`);
    }

    return {
      currentTileLabel: tile.label,
      observation: this.buildObservation(step, tile)
    };
  }

  applyLegalMove(nextTileId: TileId): RuntimeMoveApplication {
    const currentTile = resolveFutureTile(this.currentTileId);
    if (!currentTile) {
      throw new Error(`Unknown runtime tile: ${this.currentTileId}.`);
    }

    if (!currentTile.neighbors.includes(nextTileId as FutureTileId)) {
      throw new Error(`Illegal move ${this.currentTileId} -> ${nextTileId}.`);
    }

    this.appliedMoves.push(nextTileId as FutureTileId);
    this.currentHeading = resolveFutureHeading(this.currentTileId, nextTileId);
    this.currentTileId = nextTileId as FutureTileId;

    const traversedConnectorId = nextTileId === 'approach' ? 'connector-core-approach' : null;
    const traversedConnectorLabel = nextTileId === 'approach' ? 'Core approach gate' : null;

    return {
      currentTileId: this.currentTileId,
      traversedConnectorId,
      traversedConnectorLabel
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
    const tile = resolveFutureTile(tileId);
    return tile
      ? {
          id: tile.id,
          label: tile.label
        }
      : null;
  }

  getCurrentTileId(): FutureTileId {
    return this.currentTileId;
  }

  getCurrentHeading(): HeadingToken {
    return this.currentHeading;
  }

  private buildObservation(step: number, tile: FutureTile): LocalObservation {
    return {
      step,
      currentTileId: tile.id,
      heading: this.currentHeading,
      traversableTileIds: [...tile.neighbors],
      localCues: [...tile.localCues],
      visibleLandmarks: tile.landmarks.map((landmark) => ({ ...landmark })),
      goal: {
        visible: tile.goalVisible,
        tileId: tile.goalTileId,
        label: tile.goalVisible ? FUTURE_PHASER_TOPOLOGY.core.label : undefined
      }
    };
  }
}

export class FuturePhaserRuntimeSession {
  readonly host = new FuturePhaserRuntimeHost();

  readonly bridge = new RuntimeAdapterBridge(this.host, new EpisodicPolicyScorer());

  private readonly results: RuntimeAdapterStepResult[] = [];

  step(): RuntimeAdapterStepResult {
    const result = this.bridge.runStep();
    this.results.push(result);
    return result;
  }

  runUntilIdle(maxSteps = 12): readonly RuntimeAdapterStepResult[] {
    const output: RuntimeAdapterStepResult[] = [];

    for (let index = 0; index < maxSteps; index += 1) {
      const result = this.step();
      output.push(result);
      if (this.bridge.isComplete) {
        return output;
      }
    }

    throw new Error(`FuturePhaserRuntimeSession exceeded maxSteps=${maxSteps} before idling.`);
  }

  get isComplete(): boolean {
    return this.bridge.isComplete;
  }

  get currentStep(): number {
    return this.bridge.currentStep;
  }

  get snapshot(): FuturePhaserRuntimeSnapshot {
    const contentProof = buildFutureRuntimeContentProof(this.host.intentDeliveries, this.host.episodeDeliveries);
    return {
      currentTileId: this.host.getCurrentTileId(),
      currentHeading: this.host.getCurrentHeading(),
      results: [...this.results],
      trailDeliveries: [...this.host.trailDeliveries],
      intentDeliveries: [...this.host.intentDeliveries],
      episodeDeliveries: [...this.host.episodeDeliveries],
      contentProof
    };
  }
}

export const createFuturePhaserRuntimeSession = (): FuturePhaserRuntimeSession => new FuturePhaserRuntimeSession();

export class FuturePhaserRuntimeProofController {
  private session: FuturePhaserRuntimeSession | null = null;

  private status: FuturePhaserRuntimeProofStatus = {
    readyState: 'booting',
    completionState: 'pending',
    currentStep: 0,
    isComplete: false,
    lastUpdatedAt: new Date().toISOString(),
    error: null,
    snapshot: null
  };

  attachSession(session: FuturePhaserRuntimeSession): FuturePhaserRuntimeProofStatus {
    this.session = session;
    return this.sync('ready');
  }

  advanceToStep(minimumStep: number, maxSteps = 12): FuturePhaserRuntimeProofStatus {
    const session = this.requireSession();
    const targetStep = Math.max(0, Math.trunc(minimumStep));
    let attempts = 0;

    while (session.currentStep < targetStep && !session.isComplete) {
      session.step();
      attempts += 1;
      if (attempts > maxSteps) {
        throw new Error(`Future Phaser proof controller exceeded maxSteps=${maxSteps} while targeting step ${targetStep}.`);
      }
    }

    if (session.currentStep < targetStep) {
      throw new Error(`Future Phaser proof controller stopped at step ${session.currentStep} before step ${targetStep}.`);
    }

    return this.sync();
  }

  completeProof(maxSteps = 12): FuturePhaserRuntimeProofStatus {
    const session = this.requireSession();
    let attempts = 0;

    while (!session.isComplete) {
      session.step();
      attempts += 1;
      if (attempts > maxSteps) {
        throw new Error(`Future Phaser proof controller exceeded maxSteps=${maxSteps} before completing.`);
      }
    }

    return this.sync();
  }

  sync(readyStateOverride?: FuturePhaserProofReadyState): FuturePhaserRuntimeProofStatus {
    const snapshot = this.session?.snapshot ?? this.status.snapshot;
    const isComplete = this.session?.isComplete ?? this.status.isComplete;
    const readyState = readyStateOverride
      ?? (this.status.readyState === 'error' ? 'error' : this.session ? 'ready' : 'booting');
    const completionState = this.status.completionState === 'error'
      ? 'error'
      : isComplete
        ? 'complete'
        : 'pending';

    this.status = {
      readyState,
      completionState,
      currentStep: this.session?.currentStep ?? this.status.currentStep,
      isComplete,
      lastUpdatedAt: new Date().toISOString(),
      error: this.status.error,
      snapshot
    };

    return this.getStatus();
  }

  fail(error: unknown): FuturePhaserRuntimeProofStatus {
    const message = error instanceof Error ? error.message : String(error);
    this.status = {
      ...this.status,
      readyState: 'error',
      completionState: 'error',
      lastUpdatedAt: new Date().toISOString(),
      error: message
    };
    return this.getStatus();
  }

  getStatus(): FuturePhaserRuntimeProofStatus {
    return {
      ...this.status,
      snapshot: this.status.snapshot
        ? {
            ...this.status.snapshot,
            results: [...this.status.snapshot.results],
            trailDeliveries: [...this.status.snapshot.trailDeliveries],
            intentDeliveries: [...this.status.snapshot.intentDeliveries],
            episodeDeliveries: [...this.status.snapshot.episodeDeliveries],
            contentProof: { ...this.status.snapshot.contentProof }
          }
        : null
    };
  }

  private requireSession(): FuturePhaserRuntimeSession {
    if (!this.session) {
      throw new Error('Future Phaser proof controller is not ready.');
    }

    return this.session;
  }
}

export const getOrCreateFuturePhaserProofController = (
  target: FuturePhaserWindowLike
): FuturePhaserRuntimeProofController => {
  const existing = target[FUTURE_PHASER_PROOF_SIGNAL_KEY];
  if (existing) {
    return existing;
  }

  const controller = new FuturePhaserRuntimeProofController();
  target[FUTURE_PHASER_PROOF_SIGNAL_KEY] = controller;
  return controller;
};

export const createFuturePhaserRuntimeProofController = (): FuturePhaserRuntimeProofController => (
  new FuturePhaserRuntimeProofController()
);
