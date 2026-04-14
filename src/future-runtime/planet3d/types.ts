import type {
  RuntimeAdapterBridge,
  RuntimeAdapterHost,
  RuntimeAdapterStepResult,
  RuntimeEpisodeDelivery,
  RuntimeIntentDelivery,
  RuntimeMoveApplication,
  RuntimeObservationProjection,
  RuntimeTrailDelivery
} from '../../mazer-core/adapters';
import type { LocalObservation, TileId, VisibleLandmark } from '../../mazer-core/agent/types';

export type Planet3DRotationStateId = 'north' | 'east' | 'south' | 'west';

export interface Planet3DPoint3D {
  x: number;
  y: number;
  z: number;
}

export interface Planet3DPoint2D {
  x: number;
  y: number;
}

export interface Planet3DNode {
  id: TileId;
  label: string;
  position: Planet3DPoint3D;
  neighbors: TileId[];
  cues: string[];
  landmarks: VisibleLandmark[];
  goalVisible: boolean;
  goalLabel?: string;
  rotationAdvance?: Planet3DRotationStateId;
  objectiveProxy?: boolean;
}

export interface Planet3DShell {
  id: 'one-shell';
  label: string;
  radius: number;
  rotationStates: readonly Planet3DRotationStateId[];
  transitionCount: number;
}

export interface Planet3DTrailPoint {
  tileId: TileId;
  label: string;
  screen: Planet3DPoint2D;
  depth: number;
}

export interface Planet3DIntentFeedEntry {
  step: number;
  speaker: string;
  summary: string;
  importance: string;
}

export interface Planet3DMicroPing {
  id: string;
  label: string;
  screen: Planet3DPoint2D;
  depth: number;
  importance: 'low' | 'medium' | 'high';
}

export interface FutureRuntimeContentProof {
  trapInferencePass: boolean;
  wardenReadabilityPass: boolean;
  itemProxyPass: boolean;
  puzzleProxyPass: boolean;
  signalOverloadPass: boolean;
}

export interface Planet3DPrototypeFrame {
  shell: Planet3DShell;
  rotationState: Planet3DRotationStateId;
  camera: {
    headingDegrees: number;
    pitchDegrees: number;
    distance: number;
  };
  player: {
    tileId: TileId;
    label: string;
    screen: Planet3DPoint2D;
  };
  objectiveProxy: {
    tileId: TileId | null;
    label: string | null;
    visible: boolean;
    screen: Planet3DPoint2D | null;
  };
  landmarks: Array<{
    id: string;
    label: string;
    screen: Planet3DPoint2D;
    depth: number;
  }>;
  trail: {
    headTileId: TileId | null;
    points: Planet3DTrailPoint[];
  };
  intentFeed: {
    entries: Planet3DIntentFeedEntry[];
    primaryPlacement: 'screen-space';
    worldPings: Planet3DMicroPing[];
  };
  contentProof: FutureRuntimeContentProof;
  step: number;
}

export interface Planet3DPrototypeState {
  bridge: RuntimeAdapterBridge;
  host: RuntimeAdapterHost;
  shell: Planet3DShell;
  currentFrame: Planet3DPrototypeFrame;
  runStep(): RuntimeAdapterStepResult;
  runUntilIdle(maxSteps: number): RuntimeAdapterStepResult[];
  renderFrame(): Planet3DPrototypeFrame;
  getTrail(): readonly RuntimeTrailDelivery[];
  getIntents(): readonly RuntimeIntentDelivery[];
  getEpisodes(): readonly RuntimeEpisodeDelivery[];
}

export interface Planet3DRuntimeOptions {
  seed?: string;
}

export interface Planet3DObservationProjection extends RuntimeObservationProjection {
  currentTileLabel: string;
}

export interface Planet3DMoveApplication extends RuntimeMoveApplication {
  currentTileId: TileId;
}

export type { LocalObservation, TileId, VisibleLandmark };
