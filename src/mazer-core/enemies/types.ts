import type { TileId, VisibleLandmark } from '../agent/types';

export type WardenIntent = 'pursue' | 'intercept' | 'contain' | 'patrol' | 'hold';
export type WardenRotationPhase = 'stable' | 'turning' | 'recovery' | string | null;

export interface WardenLocalObservation {
  step: number;
  currentTileId: TileId;
  traversableTileIds: readonly TileId[];
  localCues: readonly string[];
  visibleLandmarks: readonly VisibleLandmark[];
  playerVisible: boolean;
  playerTileId: TileId | null;
  playerLastKnownTileId: TileId | null;
  sightlineBroken: boolean;
  rotationPhase: WardenRotationPhase;
}

export interface WardenNodeMemory {
  id: TileId;
  visitCount: number;
  firstSeenStep: number;
  lastSeenStep: number;
  knownNeighborCount: number;
  cues: string[];
}

export interface WardenMoveFeatures {
  visitCount: number;
  directPlayerContact: boolean;
  lastKnownPlayerContact: boolean;
  junctionCandidate: boolean;
  loopCandidate: boolean;
  sightlineRecoveryCandidate: boolean;
  rotationAligned: boolean;
}

export interface WardenMoveCandidate {
  id: string;
  nextTileId: TileId;
  score: number;
  tieBreak: number;
  features: WardenMoveFeatures;
  reason: string;
}

export interface WardenDecision {
  step: number;
  currentTileId: TileId;
  intent: WardenIntent;
  nextTileId: TileId | null;
  reason: string;
  candidates: WardenMoveCandidate[];
}

export interface WardenSnapshot {
  seed: string;
  currentTileId: TileId | null;
  totalDecisions: number;
  nodes: Record<TileId, WardenNodeMemory>;
}

export interface WardenGraphAgentOptions {
  seed: string;
  startTileId: TileId;
}
