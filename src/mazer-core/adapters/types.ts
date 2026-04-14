import type {
  ExplorerDecision,
  ExplorerSnapshot,
  HeadingToken,
  LocalObservation,
  PolicyEpisode,
  TileId
} from '../agent/types';
import type { IntentBusBuildResult, IntentSourceState } from '../intent/IntentBus';
import type { IntentBusRecord } from '../intent/IntentEvent';

export interface RuntimeAdapterConfig {
  seed: string;
  startTileId: TileId;
  startHeading?: HeadingToken;
  intentCanary?: string | null;
}

export interface RuntimeTileDescriptor {
  id: TileId;
  label: string;
}

export interface RuntimeObservationProjection {
  observation: LocalObservation;
  currentTileLabel?: string | null;
}

export interface RuntimeMoveApplication {
  currentTileId: TileId;
  traversedConnectorId?: string | null;
  traversedConnectorLabel?: string | null;
}

export interface RuntimeTrailSnapshot {
  currentPlayerTileId: TileId | null;
  trailHeadTileId: TileId | null;
  trailTailTileIds: readonly TileId[];
  occupancyHistory: readonly TileId[];
  committedTileCount: number;
}

export interface RuntimeTrailDelivery {
  step: number;
  phase: 'observe' | 'commit';
  currentTileId: TileId;
  previousTileId: TileId | null;
  nextTileId: TileId | null;
  decision: ExplorerDecision;
  snapshot: ExplorerSnapshot;
  trail: RuntimeTrailSnapshot;
}

export interface RuntimeIntentDelivery {
  step: number;
  sourceState: IntentSourceState;
  sourceStates: readonly IntentSourceState[];
  bus: IntentBusBuildResult;
  emittedAtStep: readonly IntentBusRecord[];
}

export interface RuntimeEpisodeDelivery {
  step: number;
  episodes: readonly PolicyEpisode[];
  latestEpisode: PolicyEpisode | null;
}

export interface RuntimeAdapterHost {
  readonly config: RuntimeAdapterConfig;

  projectObservation(step: number): RuntimeObservationProjection;

  applyLegalMove(nextTileId: TileId): RuntimeMoveApplication;

  receiveTrailUpdate(delivery: RuntimeTrailDelivery): void;

  receiveIntentDelivery(delivery: RuntimeIntentDelivery): void;

  receiveEpisodeLog(delivery: RuntimeEpisodeDelivery): void;

  describeTile?(tileId: TileId): RuntimeTileDescriptor | null;
}

export interface RuntimeAdapterStepResult {
  step: number;
  observation: RuntimeObservationProjection;
  decision: ExplorerDecision;
  snapshot: ExplorerSnapshot;
  trail: RuntimeTrailSnapshot;
  move: RuntimeMoveApplication | null;
  intent: RuntimeIntentDelivery;
  episodes: RuntimeEpisodeDelivery;
}
