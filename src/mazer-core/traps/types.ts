export type TrapId = string;

export type TrapAnchorKind = 'junction' | 'loop' | 'checkpoint' | 'rotation-phase';
export type TrapSeverity = 'low' | 'medium' | 'high';
export type TrapStatus = 'armed' | 'cooldown';

export interface TrapVisibilityTiming {
  period: number;
  activeResidues: readonly number[];
  label: string;
}

export interface TrapVisibilityContract {
  timing?: TrapVisibilityTiming;
  landmarkId?: string;
  proxyId?: string;
  connectorId?: string;
}

export interface TrapAnchorBase {
  kind: TrapAnchorKind;
  tileId?: string | null;
}

export interface JunctionTrapAnchor extends TrapAnchorBase {
  kind: 'junction';
  junctionId: string;
}

export interface LoopTrapAnchor extends TrapAnchorBase {
  kind: 'loop';
  loopId: string;
}

export interface CheckpointTrapAnchor extends TrapAnchorBase {
  kind: 'checkpoint';
  checkpointId: string;
}

export interface RotationPhaseTrapAnchor extends TrapAnchorBase {
  kind: 'rotation-phase';
  rotationPhase: string;
}

export type TrapAnchor =
  | JunctionTrapAnchor
  | LoopTrapAnchor
  | CheckpointTrapAnchor
  | RotationPhaseTrapAnchor;

export interface TrapContract {
  id: TrapId;
  label: string;
  severity: TrapSeverity;
  anchor: TrapAnchor;
  visibility: TrapVisibilityContract;
  cooldownSteps?: number;
}

export interface TrapTopologyObservation {
  step: number;
  currentTileId: string;
  rotationPhase: string;
  activeJunctionIds: readonly string[];
  activeLoopIds: readonly string[];
  activeCheckpointIds: readonly string[];
  visibleLandmarkIds: readonly string[];
  visibleProxyIds: readonly string[];
  nearbyConnectorIds: readonly string[];
  traversedConnectorId: string | null;
}

export interface TrapVisibleSignals {
  timing: boolean;
  landmark: boolean;
  proxy: boolean;
  connector: boolean;
}

export interface TrapStepState {
  trapId: TrapId;
  status: TrapStatus;
  anchorMatched: boolean;
  inferable: boolean;
  visibleSignals: TrapVisibleSignals;
  cooldownRemainingSteps: number;
  triggerCount: number;
}

export interface TrapActivation {
  trapId: TrapId;
  trapLabel: string;
  severity: TrapSeverity;
  step: number;
  tileId: string;
  anchorKind: TrapAnchorKind;
  summary: string;
  visibleSignals: TrapVisibleSignals;
}

export interface TrapStepResult {
  step: number;
  tileId: string;
  triggered: TrapActivation[];
  blockedHiddenStateTrapIds: TrapId[];
  states: TrapStepState[];
}

export interface TrapSnapshot {
  stepCount: number;
  contracts: readonly TrapContract[];
  lastStep: number | null;
  triggerCounts: Readonly<Record<TrapId, number>>;
  cooldownUntilById: Readonly<Record<TrapId, number | null>>;
}
