import {
  RuntimeAdapterBridge,
  type RuntimeAdapterConfig,
  type RuntimeAdapterHost,
  type RuntimeEpisodeDelivery,
  type RuntimeIntentDelivery,
  type RuntimeMoveApplication,
  type RuntimeObservationProjection,
  type RuntimeTrailDelivery
} from '../../mazer-core/adapters';
import { EpisodicPolicyScorer } from '../../mazer-core/agent/PolicyScorer';
import type { TileId, VisibleLandmark } from '../../mazer-core/agent/types';
import type {
  Planet3DNode,
  Planet3DRotationStateId,
  Planet3DShell,
  Planet3DRuntimeOptions
} from './types';

const ROTATION_STATES: readonly Planet3DRotationStateId[] = ['north', 'east', 'south', 'west'];
const SHELL: Planet3DShell = {
  id: 'one-shell',
  label: 'One-shell prototype',
  radius: 1,
  rotationStates: ROTATION_STATES,
  transitionCount: 0
};

const TILE_IDS = {
  harbor: 'harbor',
  gallery: 'gallery',
  lanternHall: 'lantern-hall',
  observatory: 'observatory',
  axisCourt: 'axis-court',
  objectiveLedge: 'objective-ledge',
  coreApproach: 'core-approach',
  goal: 'goal'
} as const;

const withLandmark = (id: string, label: string, cue: string): VisibleLandmark => ({
  id,
  label,
  cue
});

const WORLD_NODES: Record<TileId, Planet3DNode> = {
  [TILE_IDS.harbor]: {
    id: TILE_IDS.harbor,
    label: 'Harbor ring',
    position: { x: -0.12, y: -0.88, z: 0.2 },
    neighbors: [TILE_IDS.gallery],
    cues: ['shell:one-shell', 'trail-readable', 'warden pressure'],
    landmarks: [withLandmark('harbor-beacon', 'Harbor beacon', 'dock-light')],
    goalVisible: false
  },
  [TILE_IDS.gallery]: {
    id: TILE_IDS.gallery,
    label: 'Gallery arc',
    position: { x: 0.42, y: -0.38, z: 0.5 },
    neighbors: [TILE_IDS.harbor, TILE_IDS.lanternHall, TILE_IDS.observatory],
    cues: ['shell:one-shell', 'rotation-state: east', 'warden pursuit'],
    landmarks: [withLandmark('mirror-arch', 'Mirror arch', 'mirror-line')],
    goalVisible: false,
    rotationAdvance: 'east'
  },
  [TILE_IDS.lanternHall]: {
    id: TILE_IDS.lanternHall,
    label: 'Lantern hall',
    position: { x: 0.82, y: -0.18, z: 0.16 },
    neighbors: [TILE_IDS.gallery],
    cues: ['dead-end', 'trap rhythm', 'trail-readable'],
    landmarks: [withLandmark('lantern-post', 'Lantern post', 'lantern')],
    goalVisible: false
  },
  [TILE_IDS.observatory]: {
    id: TILE_IDS.observatory,
    label: 'Observatory ledge',
    position: { x: 0.18, y: 0.35, z: 0.58 },
    neighbors: [TILE_IDS.gallery, TILE_IDS.axisCourt, TILE_IDS.objectiveLedge],
    cues: ['shell:one-shell', 'goal-proxy', 'item cache', 'rotation-state: south'],
    landmarks: [
      withLandmark('sky-prism', 'Sky prism', 'goal-proxy'),
      withLandmark('bearing-ring', 'Bearing ring', 'rotation-state: south')
    ],
    goalVisible: true,
    goalLabel: 'Core projection',
    rotationAdvance: 'south',
    objectiveProxy: true
  },
  [TILE_IDS.axisCourt]: {
    id: TILE_IDS.axisCourt,
    label: 'Axis court',
    position: { x: -0.38, y: 0.08, z: 0.42 },
    neighbors: [TILE_IDS.observatory],
    cues: ['dead-end', 'puzzle plate', 'trail-readable'],
    landmarks: [withLandmark('axis-glyph', 'Axis glyph', 'axis')],
    goalVisible: false
  },
  [TILE_IDS.objectiveLedge]: {
    id: TILE_IDS.objectiveLedge,
    label: 'Objective ledge',
    position: { x: -0.08, y: 0.72, z: 0.34 },
    neighbors: [TILE_IDS.observatory, TILE_IDS.coreApproach],
    cues: ['shell:one-shell', 'goal-proxy', 'rotation-state: west', 'puzzle plate'],
    landmarks: [withLandmark('projection-beacon', 'Projection beacon', 'goal-proxy')],
    goalVisible: true,
    goalLabel: 'Core projection',
    rotationAdvance: 'west',
    objectiveProxy: true
  },
  [TILE_IDS.coreApproach]: {
    id: TILE_IDS.coreApproach,
    label: 'Core approach',
    position: { x: -0.42, y: 0.94, z: 0.16 },
    neighbors: [TILE_IDS.objectiveLedge, TILE_IDS.goal],
    cues: ['final-approach', 'trap rhythm', 'item cache'],
    landmarks: [withLandmark('core-signal', 'Core signal', 'final-approach')],
    goalVisible: true,
    goalLabel: 'Core projection'
  },
  [TILE_IDS.goal]: {
    id: TILE_IDS.goal,
    label: 'Core destination',
    position: { x: -0.08, y: 1.08, z: 0.02 },
    neighbors: [TILE_IDS.coreApproach],
    cues: ['goal', 'shell:one-shell', 'warden pursuit', 'rotation-state: north'],
    landmarks: [withLandmark('core-prism', 'Core prism', 'goal')],
    goalVisible: true,
    goalLabel: 'Core projection',
    rotationAdvance: 'north',
    objectiveProxy: true
  }
};

const EDGE_LABELS: Record<string, string> = {
  [`${TILE_IDS.harbor}::${TILE_IDS.gallery}`]: 'Harbor ring to gallery arc',
  [`${TILE_IDS.gallery}::${TILE_IDS.lanternHall}`]: 'Gallery arc to lantern hall',
  [`${TILE_IDS.gallery}::${TILE_IDS.observatory}`]: 'Gallery arc to observatory ledge',
  [`${TILE_IDS.observatory}::${TILE_IDS.axisCourt}`]: 'Observatory ledge to axis court',
  [`${TILE_IDS.observatory}::${TILE_IDS.objectiveLedge}`]: 'Observatory ledge to objective ledge',
  [`${TILE_IDS.objectiveLedge}::${TILE_IDS.coreApproach}`]: 'Objective ledge to core approach',
  [`${TILE_IDS.coreApproach}::${TILE_IDS.goal}`]: 'Core approach to core destination'
};

const cloneLandmarks = (landmarks: readonly VisibleLandmark[]): VisibleLandmark[] => landmarks.map((landmark) => ({ ...landmark }));

const resolveHeading = (rotationState: Planet3DRotationStateId): string => rotationState;

export class OneShellPlanet3DHost implements RuntimeAdapterHost {
  readonly config: RuntimeAdapterConfig;

  readonly shell = SHELL;

  readonly trailDeliveries: RuntimeTrailDelivery[] = [];

  readonly intentDeliveries: RuntimeIntentDelivery[] = [];

  readonly episodeDeliveries: RuntimeEpisodeDelivery[] = [];

  currentTileId: TileId = TILE_IDS.harbor;

  rotationState: Planet3DRotationStateId = 'north';

  constructor(options: Planet3DRuntimeOptions = {}) {
    this.config = {
      seed: options.seed ?? 'planet3d-seed',
      startTileId: TILE_IDS.harbor,
      startHeading: 'north'
    };
  }

  projectObservation(step: number): RuntimeObservationProjection {
    const node = WORLD_NODES[this.currentTileId];
    return {
      currentTileLabel: node.label,
      observation: {
        step,
        currentTileId: this.currentTileId,
        heading: resolveHeading(this.rotationState),
        traversableTileIds: [...node.neighbors],
        localCues: [
          ...node.cues,
          `rotation:${this.rotationState}`,
          `shell:${this.shell.id}`
        ],
        visibleLandmarks: cloneLandmarks(node.landmarks),
        goal: {
          visible: node.goalVisible,
          tileId: node.goalVisible ? TILE_IDS.goal : null,
          label: node.goalVisible ? node.goalLabel ?? WORLD_NODES[TILE_IDS.goal].label : undefined
        }
      }
    };
  }

  applyLegalMove(nextTileId: TileId): RuntimeMoveApplication {
    const current = WORLD_NODES[this.currentTileId];
    if (!current.neighbors.includes(nextTileId)) {
      throw new Error(`Illegal move ${this.currentTileId} -> ${nextTileId}.`);
    }

    const previousTileId = this.currentTileId;
    this.currentTileId = nextTileId;

    const nextNode = WORLD_NODES[nextTileId];
    if (nextNode.rotationAdvance) {
      this.rotationState = nextNode.rotationAdvance;
    }

    return {
      currentTileId: this.currentTileId,
      traversedConnectorId: `${previousTileId}::${nextTileId}`,
      traversedConnectorLabel: EDGE_LABELS[`${previousTileId}::${nextTileId}`] ?? `${current.label} to ${nextNode.label}`
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
    const node = WORLD_NODES[tileId];
    if (!node) {
      return null;
    }

    return {
      id: node.id,
      label: node.label
    };
  }
}

export const createOneShellPlanet3DHost = (options: Planet3DRuntimeOptions = {}): OneShellPlanet3DHost => (
  new OneShellPlanet3DHost(options)
);

export const createOneShellPlanet3DBridge = (host: OneShellPlanet3DHost): RuntimeAdapterBridge => (
  new RuntimeAdapterBridge(host, new EpisodicPolicyScorer())
);

export const createOneShellPlanet3DWorld = () => ({
  shell: SHELL,
  nodes: WORLD_NODES,
  entryTileId: TILE_IDS.harbor,
  objectiveTileId: TILE_IDS.goal,
  rotationStates: ROTATION_STATES
});

export const oneShellPlanet3DWorld = createOneShellPlanet3DWorld();

export const oneShellPlanet3DTiles = TILE_IDS;
