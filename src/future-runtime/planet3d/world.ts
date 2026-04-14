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
  Planet3DRuntimeOptions,
  Planet3DShell,
  Planet3DShellId
} from './types';

const ROTATION_STATES: readonly Planet3DRotationStateId[] = ['north', 'east', 'south', 'west'];

const SHELL_IDS = {
  outer: 'outer-shell',
  inner: 'inner-shell'
} as const;

const SHELLS: Record<Planet3DShellId, Planet3DShell> = {
  [SHELL_IDS.outer]: {
    id: SHELL_IDS.outer,
    label: 'Outer shell',
    radius: 1,
    rotationStates: ROTATION_STATES,
    transitionCount: 1
  },
  [SHELL_IDS.inner]: {
    id: SHELL_IDS.inner,
    label: 'Inner shell',
    radius: 0.62,
    rotationStates: ROTATION_STATES,
    transitionCount: 1
  }
};

const TILE_IDS = {
  harbor: 'harbor',
  gallery: 'gallery',
  lanternHall: 'lantern-hall',
  observatory: 'observatory',
  alignmentCourt: 'alignment-court',
  shellGate: 'shell-gate',
  innerLanding: 'inner-landing',
  innerObservatory: 'inner-observatory',
  goal: 'goal'
} as const;

const CONNECTOR_PAIR = {
  id: 'shell-gate::inner-landing',
  label: 'Scarce bridge span',
  requiredRotation: 'south' as Planet3DRotationStateId,
  outerTileId: TILE_IDS.shellGate,
  innerTileId: TILE_IDS.innerLanding
};

const withLandmark = (id: string, label: string, cue: string): VisibleLandmark => ({
  id,
  label,
  cue
});

const WORLD_NODES: Record<TileId, Planet3DNode> = {
  [TILE_IDS.harbor]: {
    id: TILE_IDS.harbor,
    shellId: SHELL_IDS.outer,
    label: 'Harbor ring',
    position: { x: -0.12, y: -0.88, z: 0.2 },
    neighbors: [TILE_IDS.gallery],
    cues: ['shell:outer-shell', 'trail-readable', 'warden pressure'],
    landmarks: [withLandmark('harbor-beacon', 'Harbor beacon', 'dock-light')],
    goalVisible: false
  },
  [TILE_IDS.gallery]: {
    id: TILE_IDS.gallery,
    shellId: SHELL_IDS.outer,
    label: 'Gallery arc',
    position: { x: 0.42, y: -0.38, z: 0.5 },
    neighbors: [TILE_IDS.harbor, TILE_IDS.lanternHall, TILE_IDS.observatory],
    cues: ['shell:outer-shell', 'rotation-state: east', 'warden pursuit'],
    landmarks: [withLandmark('mirror-arch', 'Mirror arch', 'mirror-line')],
    goalVisible: false,
    rotationAdvance: 'east'
  },
  [TILE_IDS.lanternHall]: {
    id: TILE_IDS.lanternHall,
    shellId: SHELL_IDS.outer,
    label: 'Lantern hall',
    position: { x: 0.82, y: -0.18, z: 0.16 },
    neighbors: [TILE_IDS.gallery],
    cues: ['shell:outer-shell', 'dead-end', 'trap rhythm', 'trail-readable'],
    landmarks: [withLandmark('lantern-post', 'Lantern post', 'lantern')],
    goalVisible: false
  },
  [TILE_IDS.observatory]: {
    id: TILE_IDS.observatory,
    shellId: SHELL_IDS.outer,
    label: 'Observatory ledge',
    position: { x: 0.18, y: 0.35, z: 0.58 },
    neighbors: [TILE_IDS.gallery, TILE_IDS.alignmentCourt],
    cues: ['shell:outer-shell', 'objective-proxy', 'shell-bridge', 'item cache', 'rotation-state: south'],
    landmarks: [
      withLandmark('sky-prism', 'Sky prism', 'goal-proxy'),
      withLandmark('bearing-ring', 'Bearing ring', 'rotation-state: south')
    ],
    goalVisible: true,
    goalLabel: 'Inner core projection',
    rotationAdvance: 'south',
    objectiveProxy: true
  },
  [TILE_IDS.alignmentCourt]: {
    id: TILE_IDS.alignmentCourt,
    shellId: SHELL_IDS.outer,
    label: 'Alignment court',
    position: { x: -0.02, y: 0.74, z: 0.42 },
    neighbors: [TILE_IDS.observatory, TILE_IDS.shellGate],
    cues: ['shell:outer-shell', 'goal-proxy', 'rotation-state: south', 'connector-readable', 'puzzle plate', 'shell-key'],
    landmarks: [
      withLandmark('bearing-spindle', 'Bearing spindle', 'rotation-state: south'),
      withLandmark('bridge-index', 'Bridge index', 'connector-readable')
    ],
    goalVisible: true,
    goalLabel: 'Inner core projection',
    rotationAdvance: 'south',
    objectiveProxy: true
  },
  [TILE_IDS.shellGate]: {
    id: TILE_IDS.shellGate,
    shellId: SHELL_IDS.outer,
    label: 'Shell gate',
    position: { x: -0.26, y: 0.88, z: 0.2 },
    neighbors: [TILE_IDS.alignmentCourt],
    cues: ['shell:outer-shell', 'connector-readable', 'shell-bridge', 'goal-proxy', 'landmark gate'],
    landmarks: [withLandmark('bridge-keystone', 'Bridge keystone', 'shell-bridge')],
    goalVisible: true,
    goalLabel: 'Inner core projection',
    objectiveProxy: true,
    connectorTargetId: TILE_IDS.innerLanding,
    connectorRequiredRotation: CONNECTOR_PAIR.requiredRotation,
    connectorLabel: CONNECTOR_PAIR.label
  },
  [TILE_IDS.innerLanding]: {
    id: TILE_IDS.innerLanding,
    shellId: SHELL_IDS.inner,
    label: 'Inner landing',
    position: { x: -0.48, y: 0.34, z: -0.18 },
    neighbors: [TILE_IDS.innerObservatory],
    cues: ['shell:inner-shell', 'connector-readable', 'shell-bridge', 'goal-proxy', 'rotation-state: north'],
    landmarks: [
      withLandmark('landing-bell', 'Landing bell', 'connector-readable'),
      withLandmark('inner-marker', 'Inner marker', 'shell:inner-shell')
    ],
    goalVisible: true,
    goalLabel: 'Inner core projection',
    rotationAdvance: 'north',
    objectiveProxy: true,
    connectorTargetId: TILE_IDS.shellGate,
    connectorRequiredRotation: 'north',
    connectorLabel: CONNECTOR_PAIR.label
  },
  [TILE_IDS.innerObservatory]: {
    id: TILE_IDS.innerObservatory,
    shellId: SHELL_IDS.inner,
    label: 'Inner observatory',
    position: { x: 0.12, y: 0.7, z: -0.26 },
    neighbors: [TILE_IDS.innerLanding, TILE_IDS.goal],
    cues: ['shell:inner-shell', 'objective-proxy', 'rotation-state: north', 'vantage'],
    landmarks: [
      withLandmark('inner-prism', 'Inner prism', 'goal-proxy'),
      withLandmark('bearing-ring-inner', 'Bearing ring', 'rotation-state: north')
    ],
    goalVisible: true,
    goalLabel: 'Inner core projection',
    rotationAdvance: 'north',
    objectiveProxy: true
  },
  [TILE_IDS.goal]: {
    id: TILE_IDS.goal,
    shellId: SHELL_IDS.inner,
    label: 'Core destination',
    position: { x: -0.08, y: 1.08, z: 0.02 },
    neighbors: [TILE_IDS.innerObservatory],
    cues: ['goal', 'shell:inner-shell', 'warden pursuit', 'rotation-state: north'],
    landmarks: [withLandmark('core-prism', 'Core prism', 'goal')],
    goalVisible: true,
    goalLabel: 'Inner core projection',
    rotationAdvance: 'north',
    objectiveProxy: true
  }
};

const EDGE_LABELS: Record<string, string> = {
  [`${TILE_IDS.harbor}::${TILE_IDS.gallery}`]: 'Harbor ring to gallery arc',
  [`${TILE_IDS.gallery}::${TILE_IDS.lanternHall}`]: 'Gallery arc to lantern hall',
  [`${TILE_IDS.gallery}::${TILE_IDS.observatory}`]: 'Gallery arc to observatory ledge',
  [`${TILE_IDS.observatory}::${TILE_IDS.alignmentCourt}`]: 'Observatory ledge to alignment court',
  [`${TILE_IDS.alignmentCourt}::${TILE_IDS.shellGate}`]: 'Alignment court to shell gate',
  [`${TILE_IDS.shellGate}::${TILE_IDS.innerLanding}`]: 'Scarce bridge span',
  [`${TILE_IDS.innerLanding}::${TILE_IDS.shellGate}`]: 'Scarce bridge span',
  [`${TILE_IDS.innerLanding}::${TILE_IDS.innerObservatory}`]: 'Inner landing to inner observatory',
  [`${TILE_IDS.innerObservatory}::${TILE_IDS.goal}`]: 'Inner observatory to core destination'
};

const cloneLandmarks = (landmarks: readonly VisibleLandmark[]): VisibleLandmark[] => landmarks.map((landmark) => ({ ...landmark }));

const resolveHeading = (rotationState: Planet3DRotationStateId): string => rotationState;

const isConnectorTraversalAllowed = (node: Planet3DNode, nextTileId: TileId, rotationState: Planet3DRotationStateId): boolean => (
  node.connectorTargetId === nextTileId
  && node.connectorRequiredRotation === rotationState
);

const resolveTraversableTileIds = (node: Planet3DNode, rotationState: Planet3DRotationStateId): TileId[] => {
  const traversable = [...node.neighbors];
  if (node.connectorTargetId && node.connectorRequiredRotation === rotationState && !traversable.includes(node.connectorTargetId)) {
    traversable.push(node.connectorTargetId);
  }

  return traversable;
};

const collectLocalCues = (deliveries: readonly RuntimeEpisodeDelivery[]): string[] => (
  deliveries.flatMap((delivery) => delivery.latestEpisode?.outcome?.localCues ?? [])
);

const hasLocalCue = (
  deliveries: readonly RuntimeEpisodeDelivery[],
  predicate: (cue: string) => boolean
): boolean => collectLocalCues(deliveries).some(predicate);

const hasVisitedShell = (deliveries: readonly RuntimeEpisodeDelivery[], shellId: Planet3DShellId): boolean => (
  hasLocalCue(deliveries, (cue) => cue === `shell:${shellId}`)
);

export const resolveShellRelationship = (host: OneShellPlanet3DHost) => {
  const currentNode = WORLD_NODES[host.currentTileId];
  const currentShell = SHELLS[currentNode.shellId];
  const linkedShellId = currentNode.shellId === SHELL_IDS.outer ? SHELL_IDS.inner : SHELL_IDS.outer;
  const linkedShell = SHELLS[linkedShellId];
  const connectorLabel = currentNode.connectorLabel ?? CONNECTOR_PAIR.label;
  const connectorAccessible = Boolean(currentNode.connectorTargetId && isConnectorTraversalAllowed(currentNode, currentNode.connectorTargetId, host.rotationState));
  const connectorReadable = Boolean(currentNode.connectorLabel)
    || hasLocalCue(host.episodeDeliveries, (cue) => cue.includes('connector-readable') || cue.includes('shell-bridge'));
  const relationshipReadable = hasVisitedShell(host.episodeDeliveries, SHELL_IDS.outer)
    && hasVisitedShell(host.episodeDeliveries, SHELL_IDS.inner)
    && (connectorReadable || connectorAccessible);

  return {
    currentShellId: currentShell.id,
    currentShellLabel: currentShell.label,
    linkedShellId: linkedShell.id,
    linkedShellLabel: linkedShell.label,
    connectorId: currentNode.connectorTargetId ? `${currentNode.id}::${currentNode.connectorTargetId}` : CONNECTOR_PAIR.id,
    connectorLabel,
    connectorAccessible,
    connectorReadable,
    rotationRequirement: currentNode.connectorRequiredRotation ?? CONNECTOR_PAIR.requiredRotation,
    relationshipReadable
  };
};

const resolveConnectorTraverseLabel = (fromTileId: TileId, toTileId: TileId): string => (
  EDGE_LABELS[`${fromTileId}::${toTileId}`] ?? `${WORLD_NODES[fromTileId].label} to ${WORLD_NODES[toTileId].label}`
);

export class OneShellPlanet3DHost implements RuntimeAdapterHost {
  readonly config: RuntimeAdapterConfig;

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

  get shell(): Planet3DShell {
    return SHELLS[WORLD_NODES[this.currentTileId].shellId];
  }

  get shells(): readonly Planet3DShell[] {
    return Object.values(SHELLS);
  }

  projectObservation(step: number): RuntimeObservationProjection {
    const node = WORLD_NODES[this.currentTileId];
    const traversableTileIds = resolveTraversableTileIds(node, this.rotationState);
    return {
      currentTileLabel: node.label,
      observation: {
        step,
        currentTileId: this.currentTileId,
        heading: resolveHeading(this.rotationState),
        traversableTileIds,
        localCues: [
          ...node.cues,
          `rotation:${this.rotationState}`,
          `shell:${node.shellId}`
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
    const connectorMoveAllowed = isConnectorTraversalAllowed(current, nextTileId, this.rotationState);
    if (!current.neighbors.includes(nextTileId) && !connectorMoveAllowed) {
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
      traversedConnectorLabel: resolveConnectorTraverseLabel(previousTileId, nextTileId)
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
  shell: SHELLS[SHELL_IDS.outer],
  shells: Object.values(SHELLS),
  nodes: WORLD_NODES,
  entryTileId: TILE_IDS.harbor,
  objectiveTileId: TILE_IDS.goal,
  rotationStates: ROTATION_STATES
});

export const oneShellPlanet3DWorld = createOneShellPlanet3DWorld();

export const oneShellPlanet3DTiles = TILE_IDS;
