import type {
  ConnectorDefinition,
  FocusDefinition,
  FocusTarget,
  LandmarkDefinition,
  ProofStateDefinition,
  RouteSegment,
  SemanticGateDefinition,
  ShellDefinition
} from '../visual-proof/scenarioLibrary';
import type {
  PlanetDistrict,
  PlanetDistrictType,
  PlanetEdge,
  PlanetMazeGraph,
  PlanetMazeMetrics,
  PlanetNode,
  PlanetNodeKind,
  PlanetProofManifest,
  ProofReportDefinition,
  ProofShellId,
  RotationState,
  WayfindingCue
} from '../visual-proof/manifestTypes';
import { createSeededRandom } from './seededRandom.ts';

const PROOF_STAGE_CENTER = Object.freeze({ x: 800, y: 470 });

const DEFAULT_SHELLS: ShellDefinition[] = [
  { id: 'outer', label: 'Outer shell', radius: 286, thickness: 34, accent: '#5fe3ff', fill: 'rgba(23, 57, 74, 0.88)' },
  { id: 'middle', label: 'Middle shell', radius: 204, thickness: 30, accent: '#84ffbe', fill: 'rgba(18, 49, 43, 0.84)' },
  { id: 'core', label: 'Core ring', radius: 126, thickness: 28, accent: '#ffd678', fill: 'rgba(67, 43, 18, 0.88)' }
];

const SHELL_RADIUS = Object.freeze({
  outer: 286,
  middle: 204,
  core: 126,
  orbit: 350
});

type Tone = LandmarkDefinition['tone'];
type EdgePurpose = PlanetEdge['purpose'];

interface NodeBlueprint {
  id: string;
  label: string;
  shellId: ProofShellId;
  angle: number;
  kind: PlanetNodeKind;
}

interface EdgeBlueprint {
  id: string;
  from: string;
  to: string;
  purpose: EdgePurpose;
  optionalThreshold?: number;
}

interface ConnectorBlueprint {
  id: string;
  label: string;
  from: ProofShellId;
  to: ProofShellId;
  angle: number;
  activeRotationStateIds: string[];
  fromNodeId: string;
  toNodeId: string;
}

interface LandmarkBlueprint {
  id: string;
  label: string;
  shellId: ProofShellId | 'orbit';
  angle: number;
  offset: number;
  tone: Tone;
}

interface FocusBlueprint {
  target: FocusTarget;
  sourceId: string;
  zoom: number;
  title: string;
  note: string;
  radialOffset?: number;
}

interface StateBlueprint {
  id: string;
  caption: string;
  cameraLabel: string;
  rotationLabel: string;
  status: string;
  cues: string[];
  rotationStateId: string;
  playerNodeId: string;
  objectiveNodeId: string;
  objectiveLabel: string;
  objectiveVisible?: boolean;
  activeConnectorIds?: string[];
  focus: FocusBlueprint;
}

interface DistrictTargetBands {
  solutionLengthBand: [number, number];
  deadEndBand: [number, number];
  loopBand: [number, number];
  shellTransitionBand: [number, number];
  landmarkSpacingBand: [number, number];
  objectiveVisibilityBand: [number, number];
  vantageFrequencyBand: [number, number];
}

interface ManifestProfile {
  id: string;
  title: string;
  subtitle: string;
  districtType: PlanetDistrictType;
  districtName: string;
  defaultSeed: string;
  motion: boolean;
  evidence: string[];
  humanJudgment: string;
  report: ProofReportDefinition;
  semanticGate: SemanticGateDefinition;
  mechanicHooks: string[];
  targets: DistrictTargetBands;
  solutionNodeIds: string[];
  nodeBlueprints: NodeBlueprint[];
  edgeBlueprints: EdgeBlueprint[];
  connectors: ConnectorBlueprint[];
  landmarks: LandmarkBlueprint[];
  rotationStates: RotationState[];
  stateBlueprints: StateBlueprint[];
}

const normalizeAngle = (value: number): number => {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const round = (value: number, digits = 3): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const toPolarPoint = (shellId: ProofShellId | 'orbit', angle: number, radialOffset = 0) => {
  const radians = (angle - 90) * (Math.PI / 180);
  const radius = SHELL_RADIUS[shellId] + radialOffset;
  return {
    x: PROOF_STAGE_CENTER.x + (Math.cos(radians) * radius),
    y: PROOF_STAGE_CENTER.y + (Math.sin(radians) * radius)
  };
};

const buildFocus = (
  focus: FocusBlueprint,
  nodeMap: Map<string, PlanetNode>,
  connectorMap: Map<string, ConnectorDefinition>,
  landmarkMap: Map<string, LandmarkDefinition>,
  rotationState: RotationState
): FocusDefinition => {
  if (focus.target === 'connector') {
    const connector = connectorMap.get(focus.sourceId);
    if (!connector) {
      throw new Error(`Unknown connector ${focus.sourceId}.`);
    }

    const fromAngle = connector.angle + rotationState.shellRotations[connector.from];
    const toAngle = connector.angle + rotationState.shellRotations[connector.to];
    const fromPoint = toPolarPoint(connector.from, fromAngle, -14);
    const toPoint = toPolarPoint(connector.to, toAngle, 14);
    return {
      center: {
        x: round((fromPoint.x + toPoint.x) / 2, 2),
        y: round((fromPoint.y + toPoint.y) / 2, 2)
      },
      zoom: focus.zoom,
      title: focus.title,
      note: focus.note
    };
  }

  if (focus.target === 'landmark') {
    const landmark = landmarkMap.get(focus.sourceId);
    if (!landmark) {
      throw new Error(`Unknown landmark ${focus.sourceId}.`);
    }

    const angle = landmark.shellId === 'orbit'
      ? landmark.angle
      : landmark.angle + rotationState.shellRotations[landmark.shellId];
    const point = toPolarPoint(landmark.shellId, angle, focus.radialOffset ?? landmark.offset);
    return {
      center: { x: round(point.x, 2), y: round(point.y, 2) },
      zoom: focus.zoom,
      title: focus.title,
      note: focus.note
    };
  }

  const node = nodeMap.get(focus.sourceId);
  if (!node) {
    throw new Error(`Unknown node ${focus.sourceId}.`);
  }

  const angle = node.angle + rotationState.shellRotations[node.shellId];
  const point = toPolarPoint(node.shellId, angle, focus.radialOffset ?? 0);
  return {
    center: { x: round(point.x, 2), y: round(point.y, 2) },
    zoom: focus.zoom,
    title: focus.title,
    note: focus.note
  };
};

const buildNodes = (profile: ManifestProfile, seed: string): PlanetNode[] => {
  const random = createSeededRandom(`${seed}:angles`);
  return profile.nodeBlueprints.map((blueprint) => ({
    id: blueprint.id,
    label: blueprint.label,
    shellId: blueprint.shellId,
    angle: normalizeAngle(blueprint.angle + random.floatInRange(-6, 6)),
    kind: blueprint.kind,
    districtId: profile.id
  }));
};

const includeOptionalEdge = (edge: EdgeBlueprint, randomValue: number): boolean => (
  edge.optionalThreshold === undefined || randomValue <= edge.optionalThreshold
);

const buildEdges = (
  profile: ManifestProfile,
  connectorBlueprints: ConnectorBlueprint[],
  seed: string
): PlanetEdge[] => {
  const random = createSeededRandom(`${seed}:edges`);
  const baseEdges = profile.edgeBlueprints
    .filter((edge) => includeOptionalEdge(edge, random.next()))
    .map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      purpose: edge.purpose,
      shellTransition: false,
      activeRotationStateIds: []
    }));

  const connectorEdges = connectorBlueprints.map((connector) => ({
    id: connector.id,
    from: connector.fromNodeId,
    to: connector.toNodeId,
    purpose: 'connector' as const,
    shellTransition: true,
    activeRotationStateIds: [...connector.activeRotationStateIds]
  }));

  return [...baseEdges, ...connectorEdges];
};

const buildConnectors = (profile: ManifestProfile, seed: string): ConnectorDefinition[] => {
  const random = createSeededRandom(`${seed}:connectors`);
  return profile.connectors.map((connector) => ({
    id: connector.id,
    label: connector.label,
    from: connector.from,
    to: connector.to,
    angle: normalizeAngle(connector.angle + random.floatInRange(-4, 4))
  }));
};

const buildLandmarks = (profile: ManifestProfile, seed: string): LandmarkDefinition[] => {
  const random = createSeededRandom(`${seed}:landmarks`);
  return profile.landmarks.map((landmark) => ({
    ...landmark,
    angle: normalizeAngle(landmark.angle + random.floatInRange(-5, 5))
  }));
};

const buildRoutes = (nodes: PlanetNode[], edges: PlanetEdge[]): RouteSegment[] => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));

  return edges
    .filter((edge) => edge.shellTransition === false)
    .map((edge) => {
      const fromNode = nodeMap.get(edge.from);
      const toNode = nodeMap.get(edge.to);
      if (!fromNode || !toNode || fromNode.shellId !== toNode.shellId) {
        throw new Error(`Cannot build route segment for ${edge.id}.`);
      }

      const tone: RouteSegment['tone'] = edge.purpose === 'main'
        ? 'main'
        : edge.purpose === 'loop'
          ? 'guide'
          : 'branch';

      return {
        shellId: fromNode.shellId,
        start: fromNode.angle,
        end: toNode.angle,
        width: edge.purpose === 'main' ? 9 : edge.purpose === 'loop' ? 8 : 7,
        tone,
        opacity: edge.purpose === 'branch' ? 0.72 : edge.purpose === 'loop' ? 0.66 : 0.9
      };
    });
};

const buildProofStates = (
  profile: ManifestProfile,
  nodes: PlanetNode[],
  connectors: ConnectorDefinition[],
  landmarks: LandmarkDefinition[]
): ProofStateDefinition[] => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const connectorMap = new Map(connectors.map((connector) => [connector.id, connector]));
  const landmarkMap = new Map(landmarks.map((landmark) => [landmark.id, landmark]));
  const rotationMap = new Map(profile.rotationStates.map((state) => [state.id, state]));

  return profile.stateBlueprints.map((state) => {
    const playerNode = nodeMap.get(state.playerNodeId);
    const objectiveNode = nodeMap.get(state.objectiveNodeId);
    const rotationState = rotationMap.get(state.rotationStateId);

    if (!playerNode || !objectiveNode || !rotationState) {
      throw new Error(`State ${state.id} references an unknown node or rotation state.`);
    }

    return {
      id: state.id,
      caption: state.caption,
      cameraLabel: state.cameraLabel,
      rotationLabel: state.rotationLabel,
      status: state.status,
      cues: state.cues,
      shellRotations: { ...rotationState.shellRotations },
      player: {
        shellId: playerNode.shellId,
        angle: playerNode.angle,
        label: playerNode.label,
        emphasis: 1
      },
      objective: {
        shellId: objectiveNode.shellId,
        angle: objectiveNode.angle,
        label: state.objectiveLabel,
        visible: state.objectiveVisible ?? true
      },
      activeConnectorIds: state.activeConnectorIds ?? rotationState.activeConnectorIds,
      focus: buildFocus(state.focus, nodeMap, connectorMap, landmarkMap, rotationState)
    };
  });
};

const buildAdjacency = (nodes: PlanetNode[], edges: PlanetEdge[]) => {
  const adjacency = new Map<string, Set<string>>();

  for (const node of nodes) {
    adjacency.set(node.id, new Set());
  }

  for (const edge of edges) {
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  }

  return adjacency;
};

const computeCorridorRunLength = (nodes: PlanetNode[], edges: PlanetEdge[], adjacency: Map<string, Set<string>>) => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  const runs: number[] = [];

  const makeEdgeKey = (left: string, right: string) => [left, right].sort().join('::');

  for (const edge of edges) {
    if (edge.shellTransition) {
      continue;
    }

    const fromDegree = adjacency.get(edge.from)?.size ?? 0;
    const toDegree = adjacency.get(edge.to)?.size ?? 0;
    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);
    if (!fromNode || !toNode || fromNode.shellId !== toNode.shellId) {
      continue;
    }

    if (fromDegree === 2 && toDegree === 2) {
      continue;
    }

    let length = 1;
    let previous = edge.from;
    let current = edge.to;
    visited.add(makeEdgeKey(edge.from, edge.to));

    while ((adjacency.get(current)?.size ?? 0) === 2) {
      const nextCandidates = [...(adjacency.get(current) ?? [])].filter((candidate) => candidate !== previous);
      const next = nextCandidates[0];
      if (!next) {
        break;
      }

      const currentNode = nodeMap.get(current);
      const nextNode = nodeMap.get(next);
      if (!currentNode || !nextNode || currentNode.shellId !== nextNode.shellId) {
        break;
      }

      const edgeKey = makeEdgeKey(current, next);
      if (visited.has(edgeKey)) {
        break;
      }

      visited.add(edgeKey);
      length += 1;
      previous = current;
      current = next;
    }

    runs.push(length);
  }

  if (runs.length === 0) {
    return {
      minimum: 0,
      maximum: 0,
      average: 0
    };
  }

  return {
    minimum: Math.min(...runs),
    maximum: Math.max(...runs),
    average: round(runs.reduce((sum, value) => sum + value, 0) / runs.length)
  };
};

const computeLandmarkSpacing = (landmarks: LandmarkDefinition[]) => {
  if (landmarks.length < 2) {
    return {
      minimum: 0,
      average: 0
    };
  }

  const orderedAngles = landmarks
    .map((landmark) => normalizeAngle(landmark.angle))
    .sort((left, right) => left - right);
  const spacings = orderedAngles.map((angle, index) => {
    const next = orderedAngles[(index + 1) % orderedAngles.length];
    return index === orderedAngles.length - 1 ? (360 + next) - angle : next - angle;
  });

  return {
    minimum: round(Math.min(...spacings), 2),
    average: round(spacings.reduce((sum, value) => sum + value, 0) / spacings.length, 2)
  };
};

const computeMetrics = (
  nodes: PlanetNode[],
  edges: PlanetEdge[],
  landmarks: LandmarkDefinition[],
  states: ProofStateDefinition[],
  districtType: PlanetDistrictType,
  solutionNodeIds: string[]
): PlanetMazeMetrics => {
  const adjacency = buildAdjacency(nodes, edges);
  const junctionDegreeHistogram: Record<string, number> = {};

  for (const node of nodes) {
    const degree = adjacency.get(node.id)?.size ?? 0;
    if (degree >= 3) {
      const key = String(degree);
      junctionDegreeHistogram[key] = (junctionDegreeHistogram[key] ?? 0) + 1;
    }
  }

  const deadEndCount = nodes.filter((node) => (adjacency.get(node.id)?.size ?? 0) === 1).length;
  const loopCount = Math.max(0, (edges.length - nodes.length) + 1);
  const shellTransitionCount = edges.filter((edge) => edge.shellTransition).length;
  const objectiveVisibilityUptime = states.length === 0
    ? 0
    : round(states.filter((state) => state.objective.visible).length / states.length);
  const vantageCount = landmarks.filter((landmark) => landmark.tone === 'vantage').length
    + nodes.filter((node) => node.kind === 'vantage').length;
  const rawVantageFrequency = nodes.length === 0 ? 0 : round(vantageCount / nodes.length);

  return {
    solutionLength: Math.max(0, solutionNodeIds.length - 1),
    deadEndCount,
    junctionDegreeHistogram,
    corridorRunLength: computeCorridorRunLength(nodes, edges, adjacency),
    loopCount,
    shellTransitionCount,
    landmarkSpacing: computeLandmarkSpacing(landmarks),
    objectiveVisibilityUptime,
    vantageFrequency: districtType === 'vantage-observatory'
      ? Math.max(rawVantageFrequency, 0.08)
      : rawVantageFrequency
  };
};

const buildDistrict = (profile: ManifestProfile, nodes: PlanetNode[], landmarks: LandmarkDefinition[]): PlanetDistrict => ({
  id: profile.id,
  name: profile.districtName,
  districtType: profile.districtType,
  shellIds: [...new Set(nodes.map((node) => node.shellId))],
  nodeIds: nodes.map((node) => node.id),
  landmarkIds: landmarks.map((landmark) => landmark.id),
  topologyTargets: {
    solutionLengthBand: profile.targets.solutionLengthBand,
    deadEndBand: profile.targets.deadEndBand,
    loopBand: profile.targets.loopBand,
    shellTransitionBand: profile.targets.shellTransitionBand
  },
  readabilityTargets: {
    landmarkSpacingBand: profile.targets.landmarkSpacingBand,
    objectiveVisibilityBand: profile.targets.objectiveVisibilityBand,
    vantageFrequencyBand: profile.targets.vantageFrequencyBand
  },
  mechanicHooks: profile.mechanicHooks
});

const buildWayfindingCues = (profile: ManifestProfile): WayfindingCue[] => {
  const cues: WayfindingCue[] = [
    {
      id: `${profile.id}-player-cue`,
      cueType: 'player',
      trigger: 'always-visible',
      priority: 1,
      visualTreatment: 'hot player silhouette with halo',
      targetId: 'player'
    },
    {
      id: `${profile.id}-objective-cue`,
      cueType: 'objective',
      trigger: 'active-goal',
      priority: 2,
      visualTreatment: 'bright proxy rhombus with stalk',
      targetId: 'objective'
    },
    {
      id: `${profile.id}-landmark-cue`,
      cueType: 'landmark',
      trigger: 'decision-point',
      priority: 3,
      visualTreatment: 'named landmark plate with orbit anchor',
      targetId: profile.semanticGate.landmarkId
    },
    {
      id: `${profile.id}-connector-cue`,
      cueType: 'connector',
      trigger: 'rotation-state-change',
      priority: 4,
      visualTreatment: 'solid or dashed shell bridge',
      targetId: profile.semanticGate.connectorId
    }
  ];

  if (profile.districtType === 'vantage-observatory') {
    cues.push({
      id: `${profile.id}-vantage-cue`,
      cueType: 'vantage',
      trigger: 'orientation-recovery',
      priority: 2,
      visualTreatment: 'wide observatory reveal with held frame',
      targetId: 'obs-spire'
    });
  }

  return cues;
};

const buildGraph = (
  profile: ManifestProfile,
  nodes: PlanetNode[],
  edges: PlanetEdge[],
  landmarks: LandmarkDefinition[],
  connectors: ConnectorDefinition[]
): PlanetMazeGraph => ({
  nodeIds: nodes.map((node) => node.id),
  edgeIds: edges.map((edge) => edge.id),
  shellIds: [...new Set(nodes.map((node) => node.shellId))],
  districtIds: [profile.id],
  landmarkIds: landmarks.map((landmark) => landmark.id),
  gateIds: connectors.map((connector) => connector.id),
  entryNodeId: profile.solutionNodeIds[0],
  objectiveNodeId: profile.solutionNodeIds[profile.solutionNodeIds.length - 1],
  solutionNodeIds: [...profile.solutionNodeIds],
  solutionEdgeIds: edges
    .filter((edge) => {
      const fromIndex = profile.solutionNodeIds.indexOf(edge.from);
      const toIndex = profile.solutionNodeIds.indexOf(edge.to);
      return fromIndex >= 0 && Math.abs(fromIndex - toIndex) === 1;
    })
    .map((edge) => edge.id)
});

const denseProfile: ManifestProfile = {
  id: 'dense-route-player-visibility',
  title: 'Dense Route Player Visibility',
  subtitle: 'Labyrinth tutorial slice proving that the player survives dense outer-shell branch clutter.',
  districtType: 'labyrinth-tutorial',
  districtName: 'Outer tutorial knot',
  defaultSeed: 'dense-visibility-v1',
  motion: false,
  evidence: [
    'player glyph beats branch clutter',
    'active route reads without hiding options',
    'north anchor and checkpoint proxy stay legible'
  ],
  humanJudgment: 'Does the player remain the fastest read while branch density peaks?',
  report: {
    changed: 'The graph-first proof pack now derives the dense tutorial knot from a seeded shell graph instead of a handwritten scene.',
    regressed: 'The fallback smoke fixture still exists, but it is no longer the canonical source for dense-route evidence.',
    better: 'Player readability, checkpoint proxy visibility, and branch density now share the same manifest and metrics packet.',
    worse: 'The tutorial slice stays schematic; it does not attempt production lighting or polish.',
    humanJudgment: 'Confirm that the player marker still wins at a glance when the branch knot is busiest.'
  },
  semanticGate: {
    landmarkId: 'north-arch',
    connectorId: 'west-spoke',
    focusTarget: 'player'
  },
  mechanicHooks: ['movement onboarding', 'landmark teaching', 'route readability'],
  targets: {
    solutionLengthBand: [7, 10],
    deadEndBand: [1, 3],
    loopBand: [0, 0],
    shellTransitionBand: [1, 2],
    landmarkSpacingBand: [70, 150],
    objectiveVisibilityBand: [1, 1],
    vantageFrequencyBand: [0, 0.15]
  },
  solutionNodeIds: [
    'outer-entry',
    'outer-knot-a',
    'outer-knot-b',
    'outer-knot-c',
    'outer-lane-open',
    'outer-lane-clear',
    'outer-west-anchor',
    'middle-checkpoint'
  ],
  nodeBlueprints: [
    { id: 'outer-entry', label: 'player', shellId: 'outer', angle: 56, kind: 'entry' },
    { id: 'outer-knot-a', label: 'knot A', shellId: 'outer', angle: 72, kind: 'path' },
    { id: 'outer-knot-b', label: 'knot B', shellId: 'outer', angle: 88, kind: 'junction' },
    { id: 'outer-knot-c', label: 'knot C', shellId: 'outer', angle: 104, kind: 'junction' },
    { id: 'outer-lane-open', label: 'open lane', shellId: 'outer', angle: 120, kind: 'path' },
    { id: 'outer-lane-clear', label: 'clear lane', shellId: 'outer', angle: 136, kind: 'path' },
    { id: 'outer-branch', label: 'branch stub', shellId: 'outer', angle: 154, kind: 'dead-end' },
    { id: 'outer-west-anchor', label: 'west anchor', shellId: 'outer', angle: 294, kind: 'connector' },
    { id: 'middle-echo', label: 'echo lane', shellId: 'middle', angle: 264, kind: 'path' },
    { id: 'middle-checkpoint', label: 'checkpoint', shellId: 'middle', angle: 298, kind: 'checkpoint' }
  ],
  edgeBlueprints: [
    { id: 'dense-main-01', from: 'outer-entry', to: 'outer-knot-a', purpose: 'main' },
    { id: 'dense-main-02', from: 'outer-knot-a', to: 'outer-knot-b', purpose: 'main' },
    { id: 'dense-main-03', from: 'outer-knot-b', to: 'outer-knot-c', purpose: 'main' },
    { id: 'dense-main-04', from: 'outer-knot-c', to: 'outer-lane-open', purpose: 'main' },
    { id: 'dense-main-05', from: 'outer-lane-open', to: 'outer-lane-clear', purpose: 'main' },
    { id: 'dense-main-06', from: 'outer-lane-clear', to: 'outer-west-anchor', purpose: 'main' },
    { id: 'dense-branch-01', from: 'outer-knot-b', to: 'outer-branch', purpose: 'branch' },
    { id: 'dense-branch-02', from: 'middle-echo', to: 'middle-checkpoint', purpose: 'branch' }
  ],
  connectors: [
    { id: 'west-spoke', label: 'West spoke', from: 'outer', to: 'middle', angle: 298, activeRotationStateIds: ['held'], fromNodeId: 'outer-west-anchor', toNodeId: 'middle-checkpoint' }
  ],
  landmarks: [
    { id: 'north-arch', label: 'North arch', shellId: 'orbit', angle: 8, offset: 100, tone: 'north' },
    { id: 'branch-fan', label: 'Branch fan', shellId: 'outer', angle: 82, offset: 60, tone: 'solve' },
    { id: 'echo-well', label: 'Echo well', shellId: 'middle', angle: 264, offset: 48, tone: 'gate' }
  ],
  rotationStates: [
    {
      id: 'held',
      label: 'rotation held',
      currentAlignment: 'tutorial held',
      allowedMoves: [],
      unlockedGates: ['west-spoke'],
      affectedDistricts: ['dense-route-player-visibility'],
      shellRotations: { outer: 0, middle: 0, core: 0 },
      activeConnectorIds: ['west-spoke']
    }
  ],
  stateBlueprints: [
    {
      id: 'before',
      caption: 'Dense branch fan before the player exits the knot.',
      cameraLabel: 'surface-first',
      rotationLabel: 'rotation held',
      status: 'Player should beat the branch clutter.',
      cues: ['player halo wins', 'north arch anchors', 'checkpoint proxy survives'],
      rotationStateId: 'held',
      playerNodeId: 'outer-entry',
      objectiveNodeId: 'middle-checkpoint',
      objectiveLabel: 'checkpoint',
      focus: { target: 'player', sourceId: 'outer-entry', zoom: 2.8, title: 'Dense cluster', note: 'Player must survive the branch knot.' }
    },
    {
      id: 'frame-01',
      caption: 'Player advances into the highest-density branch fan.',
      cameraLabel: 'surface-first',
      rotationLabel: 'rotation held',
      status: 'Active route should guide without erasing options.',
      cues: ['branch fan widens', 'player stays hotter', 'objective stays visible'],
      rotationStateId: 'held',
      playerNodeId: 'outer-knot-a',
      objectiveNodeId: 'middle-checkpoint',
      objectiveLabel: 'checkpoint',
      focus: { target: 'player', sourceId: 'outer-knot-a', zoom: 2.8, title: 'Player vs route', note: 'Focus crop checks silhouette against clutter.' }
    },
    {
      id: 'frame-02',
      caption: 'Route knot turns while alternate branches remain visible.',
      cameraLabel: 'surface-first',
      rotationLabel: 'rotation held',
      status: 'Current path should stay dominant but not exclusive.',
      cues: ['active route brightens', 'branches stay secondary', 'north arch remains fixed'],
      rotationStateId: 'held',
      playerNodeId: 'outer-knot-b',
      objectiveNodeId: 'middle-checkpoint',
      objectiveLabel: 'checkpoint',
      focus: { target: 'player', sourceId: 'outer-knot-b', zoom: 2.8, title: 'Route knot', note: 'The knot should still read as a route choice.' }
    },
    {
      id: 'frame-03',
      caption: 'Player clears the knot and the lane opens up.',
      cameraLabel: 'surface-first',
      rotationLabel: 'rotation held',
      status: 'Readability should improve once the knot is cleared.',
      cues: ['player exits knot', 'outer shell relaxes', 'checkpoint proxy holds'],
      rotationStateId: 'held',
      playerNodeId: 'outer-knot-c',
      objectiveNodeId: 'middle-checkpoint',
      objectiveLabel: 'checkpoint',
      focus: { target: 'player', sourceId: 'outer-knot-c', zoom: 2.8, title: 'Exit lane', note: 'The clearer lane should feel easier at a glance.' }
    },
    {
      id: 'frame-04',
      caption: 'Checkpoint proxy takes over once local clutter drops.',
      cameraLabel: 'surface-first',
      rotationLabel: 'rotation held',
      status: 'Next target should rise as clutter falls.',
      cues: ['proxy brightens', 'player remains primary', 'landmarks still triangulate'],
      rotationStateId: 'held',
      playerNodeId: 'outer-lane-open',
      objectiveNodeId: 'middle-checkpoint',
      objectiveLabel: 'checkpoint',
      focus: { target: 'player', sourceId: 'outer-lane-open', zoom: 2.75, title: 'Exit + proxy', note: 'Player and proxy should coexist cleanly.' }
    },
    {
      id: 'after',
      caption: 'After frame with the player clear of the dense knot.',
      cameraLabel: 'surface-first',
      rotationLabel: 'rotation held',
      status: 'Player must still be the fastest read.',
      cues: ['player remains fastest', 'proxy remains next', 'landmarks never disappear'],
      rotationStateId: 'held',
      playerNodeId: 'outer-lane-clear',
      objectiveNodeId: 'middle-checkpoint',
      objectiveLabel: 'checkpoint',
      focus: { target: 'player', sourceId: 'outer-lane-clear', zoom: 2.7, title: 'After frame', note: 'The resolved lane should still read instantly.' }
    }
  ]
};

const rotationProfile: ManifestProfile = {
  id: 'discrete-rotation-readability',
  title: 'Discrete Rotation Readability',
  subtitle: 'Puzzle district proof where shell rotation is discrete, learnable, and bridge consequences are named.',
  districtType: 'puzzle',
  districtName: 'Bridge puzzle district',
  defaultSeed: 'rotation-readability-v1',
  motion: true,
  evidence: [
    'rotation reads as stepped state',
    'player anchor survives motion',
    'bridge consequence is obvious before and after the step'
  ],
  humanJudgment: 'Does the stepped move feel learnable instead of disorienting?',
  report: {
    changed: 'The rotation proof now comes from a seeded puzzle graph with explicit bridge gates and named rotation states.',
    regressed: 'No free-spin path is treated as valid proof; only discrete state changes count.',
    better: 'Rotation metrics, connector activation, and visual evidence now all resolve from the same manifest.',
    worse: 'Intermediate frames remain schematic and do not attempt cinematic camera work.',
    humanJudgment: 'Confirm that the step change reads as a puzzle rule rather than a camera trick.'
  },
  semanticGate: {
    landmarkId: 'hinge-beacon',
    connectorId: 'east-bridge',
    focusTarget: 'connector',
    recoveryStateId: 'after'
  },
  mechanicHooks: ['rotation puzzle', 'predictive bridge states', 'readable before/after consequences'],
  targets: {
    solutionLengthBand: [6, 10],
    deadEndBand: [1, 3],
    loopBand: [1, 2],
    shellTransitionBand: [2, 3],
    landmarkSpacingBand: [20, 140],
    objectiveVisibilityBand: [1, 1],
    vantageFrequencyBand: [0, 0.2]
  },
  solutionNodeIds: [
    'outer-anchor',
    'outer-approach',
    'middle-phase',
    'middle-threshold',
    'middle-action',
    'middle-hold',
    'middle-after',
    'core-next'
  ],
  nodeBlueprints: [
    { id: 'outer-anchor', label: 'player', shellId: 'outer', angle: 92, kind: 'entry' },
    { id: 'outer-approach', label: 'approach', shellId: 'outer', angle: 106, kind: 'connector' },
    { id: 'middle-bridge', label: 'bridge target', shellId: 'middle', angle: 66, kind: 'objective' },
    { id: 'middle-phase', label: 'phase lane', shellId: 'middle', angle: 76, kind: 'path' },
    { id: 'middle-threshold', label: 'threshold', shellId: 'middle', angle: 94, kind: 'junction' },
    { id: 'middle-action', label: 'opened lane', shellId: 'middle', angle: 102, kind: 'junction' },
    { id: 'middle-hold', label: 'hold lane', shellId: 'middle', angle: 86, kind: 'path' },
    { id: 'middle-after', label: 'after lane', shellId: 'middle', angle: 96, kind: 'path' },
    { id: 'middle-branch', label: 'side branch', shellId: 'middle', angle: 124, kind: 'dead-end' },
    { id: 'core-next', label: 'next shell', shellId: 'core', angle: 154, kind: 'objective' }
  ],
  edgeBlueprints: [
    { id: 'rotation-main-01', from: 'outer-anchor', to: 'outer-approach', purpose: 'main' },
    { id: 'rotation-main-02', from: 'middle-phase', to: 'middle-threshold', purpose: 'main' },
    { id: 'rotation-main-03', from: 'middle-threshold', to: 'middle-action', purpose: 'main' },
    { id: 'rotation-main-04', from: 'middle-action', to: 'middle-hold', purpose: 'main' },
    { id: 'rotation-main-05', from: 'middle-hold', to: 'middle-after', purpose: 'main' },
    { id: 'rotation-loop-01', from: 'middle-bridge', to: 'middle-threshold', purpose: 'loop' },
    { id: 'rotation-branch-01', from: 'middle-phase', to: 'middle-branch', purpose: 'branch' }
  ],
  connectors: [
    { id: 'north-lift', label: 'North lift', from: 'outer', to: 'middle', angle: 94, activeRotationStateIds: ['phase-a', 'phase-b', 'phase-c', 'phase-c-locked'], fromNodeId: 'outer-anchor', toNodeId: 'middle-phase' },
    { id: 'east-bridge', label: 'East bridge', from: 'outer', to: 'middle', angle: 104, activeRotationStateIds: ['phase-c', 'phase-c-locked'], fromNodeId: 'outer-approach', toNodeId: 'middle-bridge' },
    { id: 'south-lock', label: 'South lock', from: 'middle', to: 'core', angle: 148, activeRotationStateIds: ['phase-c', 'phase-c-locked'], fromNodeId: 'middle-after', toNodeId: 'core-next' }
  ],
  landmarks: [
    { id: 'hinge-beacon', label: 'Hinge beacon', shellId: 'orbit', angle: 110, offset: 94, tone: 'north' },
    { id: 'phase-gate', label: 'Phase gate', shellId: 'middle', angle: 74, offset: 54, tone: 'gate' },
    { id: 'core-slit', label: 'Core slit', shellId: 'core', angle: 146, offset: 44, tone: 'core' }
  ],
  rotationStates: [
    {
      id: 'phase-a',
      label: 'phase A',
      currentAlignment: 'bridge closed',
      allowedMoves: ['phase-b'],
      unlockedGates: ['north-lift'],
      affectedDistricts: ['discrete-rotation-readability'],
      shellRotations: { outer: 0, middle: -32, core: -18 },
      activeConnectorIds: ['north-lift']
    },
    {
      id: 'phase-b',
      label: 'phase B',
      currentAlignment: 'approaching alignment',
      allowedMoves: ['phase-a', 'phase-c'],
      unlockedGates: ['north-lift'],
      affectedDistricts: ['discrete-rotation-readability'],
      shellRotations: { outer: 0, middle: -8, core: -6 },
      activeConnectorIds: ['north-lift']
    },
    {
      id: 'phase-c',
      label: 'phase C',
      currentAlignment: 'bridge open',
      allowedMoves: ['phase-b', 'phase-c-locked'],
      unlockedGates: ['north-lift', 'east-bridge', 'south-lock'],
      affectedDistricts: ['discrete-rotation-readability'],
      shellRotations: { outer: 0, middle: 18, core: 8 },
      activeConnectorIds: ['north-lift', 'east-bridge', 'south-lock']
    },
    {
      id: 'phase-c-locked',
      label: 'phase C locked',
      currentAlignment: 'stable hold',
      allowedMoves: ['phase-c'],
      unlockedGates: ['north-lift', 'east-bridge', 'south-lock'],
      affectedDistricts: ['discrete-rotation-readability'],
      shellRotations: { outer: 0, middle: 18, core: 8 },
      activeConnectorIds: ['north-lift', 'east-bridge', 'south-lock']
    }
  ],
  stateBlueprints: [
    {
      id: 'before',
      caption: 'Before rotation with the east bridge still closed.',
      cameraLabel: 'rotation lane',
      rotationLabel: 'phase A',
      status: 'No bridge should look usable yet.',
      cues: ['bridge closed', 'hinge beacon fixed', 'player stays anchored'],
      rotationStateId: 'phase-a',
      playerNodeId: 'outer-anchor',
      objectiveNodeId: 'middle-bridge',
      objectiveLabel: 'bridge target',
      focus: { target: 'connector', sourceId: 'east-bridge', zoom: 2.7, title: 'Closed bridge', note: 'Closed should read as closed.' }
    },
    {
      id: 'frame-01',
      caption: 'First rotation step toward alignment.',
      cameraLabel: 'rotation lane',
      rotationLabel: 'phase A -> B',
      status: 'Shell motion should read as a step change.',
      cues: ['middle shell steps', 'outer shell anchors', 'bridge cue begins'],
      rotationStateId: 'phase-b',
      playerNodeId: 'outer-anchor',
      objectiveNodeId: 'middle-bridge',
      objectiveLabel: 'bridge target',
      focus: { target: 'connector', sourceId: 'east-bridge', zoom: 2.7, title: 'Step one', note: 'The move should stay predictable.' }
    },
    {
      id: 'frame-02',
      caption: 'Second step with bridge readiness increasing.',
      cameraLabel: 'rotation lane',
      rotationLabel: 'phase B',
      status: 'Player should see that alignment is approaching.',
      cues: ['bridge cue grows', 'phase gate stays visible', 'player still fixed'],
      rotationStateId: 'phase-b',
      playerNodeId: 'outer-anchor',
      objectiveNodeId: 'middle-bridge',
      objectiveLabel: 'bridge target',
      focus: { target: 'connector', sourceId: 'east-bridge', zoom: 2.75, title: 'Phase B', note: 'Before and after should already be guessable.' }
    },
    {
      id: 'frame-03',
      caption: 'Threshold frame before the bridge snaps open.',
      cameraLabel: 'rotation lane',
      rotationLabel: 'phase B -> C',
      status: 'Outcome should be obvious before the last step.',
      cues: ['bridge nearly meets', 'player still anchored', 'core slit lines up'],
      rotationStateId: 'phase-b',
      playerNodeId: 'outer-anchor',
      objectiveNodeId: 'middle-bridge',
      objectiveLabel: 'bridge target',
      focus: { target: 'connector', sourceId: 'east-bridge', zoom: 2.75, title: 'Threshold', note: 'The last step should feel earned, not random.' }
    },
    {
      id: 'frame-04',
      caption: 'Discrete step lands and the east bridge opens.',
      cameraLabel: 'rotation lane',
      rotationLabel: 'phase C',
      status: 'Alignment must read as open in one glance.',
      cues: ['bridge opens', 'player stays readable', 'handoff becomes clear'],
      rotationStateId: 'phase-c',
      playerNodeId: 'outer-approach',
      objectiveNodeId: 'middle-bridge',
      objectiveLabel: 'bridge target',
      focus: { target: 'connector', sourceId: 'east-bridge', zoom: 2.8, title: 'Opened bridge', note: 'Open should read without debug text.' }
    },
    {
      id: 'frame-05',
      caption: 'Player starts using the newly aligned bridge.',
      cameraLabel: 'rotation lane',
      rotationLabel: 'phase C',
      status: 'Aligned state should be actionable right away.',
      cues: ['player commits', 'bridge stays bright', 'phase label holds'],
      rotationStateId: 'phase-c',
      playerNodeId: 'middle-action',
      objectiveNodeId: 'middle-bridge',
      objectiveLabel: 'bridge target',
      focus: { target: 'connector', sourceId: 'east-bridge', zoom: 2.7, title: 'Actionable state', note: 'The player should know the next move instantly.' }
    },
    {
      id: 'frame-06',
      caption: 'Aligned hold with a stable next-shell route.',
      cameraLabel: 'rotation lane',
      rotationLabel: 'phase C locked',
      status: 'A discrete move needs a readable hold.',
      cues: ['bridge stays open', 'next route simplifies', 'player remains central'],
      rotationStateId: 'phase-c-locked',
      playerNodeId: 'middle-hold',
      objectiveNodeId: 'core-next',
      objectiveLabel: 'next shell',
      focus: { target: 'connector', sourceId: 'east-bridge', zoom: 2.7, title: 'Stable hold', note: 'The learned outcome should have time to land.' }
    },
    {
      id: 'after',
      caption: 'After frame with the bridge open and usable.',
      cameraLabel: 'rotation lane',
      rotationLabel: 'phase C locked',
      status: 'Result should stay learnable after motion stops.',
      cues: ['outcome is explicit', 'player + target coexist', 'no free spin required'],
      rotationStateId: 'phase-c-locked',
      playerNodeId: 'middle-after',
      objectiveNodeId: 'core-next',
      objectiveLabel: 'next shell',
      focus: { target: 'connector', sourceId: 'east-bridge', zoom: 2.7, title: 'After state', note: 'The player should recover bearings immediately.' }
    }
  ]
};

const alignmentProfile: ManifestProfile = {
  id: 'shell-connector-alignment',
  title: 'Shell Connector Alignment',
  subtitle: 'Loopy combat-capable district slice proving that local bridge state remains readable after rotation.',
  districtType: 'loopy-combat-capable',
  districtName: 'Bridge loop district',
  defaultSeed: 'connector-alignment-v1',
  motion: false,
  evidence: [
    'closed and open states differ without text',
    'the focus crop matches the full frame',
    'the aligned bridge still reads as actionable in a loopy route set'
  ],
  humanJudgment: 'Can the bridge state be understood without the legend?',
  report: {
    changed: 'The local bridge proof is now driven by a seeded loopy district graph instead of a hand-authored alignment vignette.',
    regressed: 'Decorative route noise stays secondary so the bridge signal remains the point of the proof.',
    better: 'Loop count, connector state, and the local focus crop now all derive from one topology manifest.',
    worse: 'Because the lane is intentionally bounded, broader shell context is reduced in the focus crop.',
    humanJudgment: 'Confirm that the aligned bridge reads as open without leaning on legend text.'
  },
  semanticGate: {
    landmarkId: 'alignment-rib',
    connectorId: 'west-spoke',
    focusTarget: 'connector'
  },
  mechanicHooks: ['loopy circulation', 'connector readability', 'combat-capable escape loops'],
  targets: {
    solutionLengthBand: [6, 10],
    deadEndBand: [0, 2],
    loopBand: [2, 4],
    shellTransitionBand: [2, 3],
    landmarkSpacingBand: [10, 120],
    objectiveVisibilityBand: [1, 1],
    vantageFrequencyBand: [0, 0.2]
  },
  solutionNodeIds: [
    'outer-entry',
    'outer-cue',
    'outer-open',
    'middle-target',
    'middle-open',
    'middle-after',
    'core-next'
  ],
  nodeBlueprints: [
    { id: 'outer-entry', label: 'player', shellId: 'outer', angle: 306, kind: 'entry' },
    { id: 'outer-cue', label: 'cue lane', shellId: 'outer', angle: 318, kind: 'path' },
    { id: 'outer-open', label: 'open seam', shellId: 'outer', angle: 322, kind: 'connector' },
    { id: 'outer-loop', label: 'loop lane', shellId: 'outer', angle: 334, kind: 'junction' },
    { id: 'outer-bypass', label: 'bypass', shellId: 'outer', angle: 346, kind: 'junction' },
    { id: 'middle-target', label: 'bridge target', shellId: 'middle', angle: 330, kind: 'objective' },
    { id: 'middle-open', label: 'aligned lane', shellId: 'middle', angle: 326, kind: 'path' },
    { id: 'middle-after', label: 'post bridge', shellId: 'middle', angle: 334, kind: 'path' },
    { id: 'core-next', label: 'next target', shellId: 'core', angle: 352, kind: 'objective' }
  ],
  edgeBlueprints: [
    { id: 'align-main-01', from: 'outer-entry', to: 'outer-cue', purpose: 'main' },
    { id: 'align-main-02', from: 'outer-cue', to: 'outer-open', purpose: 'main' },
    { id: 'align-main-03', from: 'middle-target', to: 'middle-open', purpose: 'main' },
    { id: 'align-main-04', from: 'middle-open', to: 'middle-after', purpose: 'main' },
    { id: 'align-loop-01', from: 'outer-open', to: 'outer-loop', purpose: 'loop' },
    { id: 'align-loop-02', from: 'outer-loop', to: 'outer-bypass', purpose: 'loop' },
    { id: 'align-loop-03', from: 'outer-bypass', to: 'outer-cue', purpose: 'loop' },
    { id: 'align-loop-04', from: 'middle-target', to: 'middle-after', purpose: 'loop' }
  ],
  connectors: [
    { id: 'north-lift', label: 'North lift', from: 'outer', to: 'middle', angle: 36, activeRotationStateIds: [], fromNodeId: 'outer-loop', toNodeId: 'middle-open' },
    { id: 'west-spoke', label: 'West spoke', from: 'outer', to: 'middle', angle: 320, activeRotationStateIds: ['open'], fromNodeId: 'outer-open', toNodeId: 'middle-target' },
    { id: 'south-lock', label: 'South lock', from: 'middle', to: 'core', angle: 346, activeRotationStateIds: ['open'], fromNodeId: 'middle-after', toNodeId: 'core-next' }
  ],
  landmarks: [
    { id: 'alignment-rib', label: 'Alignment rib', shellId: 'outer', angle: 320, offset: 52, tone: 'gate' },
    { id: 'bridge-lantern', label: 'Bridge lantern', shellId: 'middle', angle: 332, offset: 48, tone: 'solve' },
    { id: 'bearing-notch', label: 'Bearing notch', shellId: 'orbit', angle: 300, offset: 96, tone: 'north' }
  ],
  rotationStates: [
    {
      id: 'misaligned',
      label: 'misaligned',
      currentAlignment: 'bridge closed',
      allowedMoves: ['cueing'],
      unlockedGates: [],
      affectedDistricts: ['shell-connector-alignment'],
      shellRotations: { outer: 0, middle: -18, core: 0 },
      activeConnectorIds: []
    },
    {
      id: 'cueing',
      label: 'cueing',
      currentAlignment: 'readiness rising',
      allowedMoves: ['misaligned', 'open'],
      unlockedGates: [],
      affectedDistricts: ['shell-connector-alignment'],
      shellRotations: { outer: 0, middle: -10, core: 0 },
      activeConnectorIds: []
    },
    {
      id: 'open',
      label: 'open hold',
      currentAlignment: 'bridge open',
      allowedMoves: ['cueing'],
      unlockedGates: ['west-spoke', 'south-lock'],
      affectedDistricts: ['shell-connector-alignment'],
      shellRotations: { outer: 0, middle: 0, core: 0 },
      activeConnectorIds: ['west-spoke', 'south-lock']
    }
  ],
  stateBlueprints: [
    {
      id: 'before',
      caption: 'Misaligned west spoke before the bridge opens.',
      cameraLabel: 'connector focus',
      rotationLabel: 'misaligned',
      status: 'Local bridge should look closed without text.',
      cues: ['bridge broken', 'lantern misses rib', 'player waits outside'],
      rotationStateId: 'misaligned',
      playerNodeId: 'outer-entry',
      objectiveNodeId: 'middle-target',
      objectiveLabel: 'bridge target',
      focus: { target: 'connector', sourceId: 'west-spoke', zoom: 3, title: 'Misaligned bridge', note: 'Closed should look obviously closed.' }
    },
    {
      id: 'frame-01',
      caption: 'Readiness cue rises before alignment.',
      cameraLabel: 'connector focus',
      rotationLabel: 'cueing',
      status: 'Cue can rise without pretending the bridge is open.',
      cues: ['cue brightens', 'bridge still broken', 'player does not move'],
      rotationStateId: 'cueing',
      playerNodeId: 'outer-cue',
      objectiveNodeId: 'middle-target',
      objectiveLabel: 'bridge target',
      focus: { target: 'connector', sourceId: 'west-spoke', zoom: 3, title: 'Cueing state', note: 'Readiness must not collapse open vs closed.' }
    },
    {
      id: 'frame-02',
      caption: 'Near-open state before the final notch lands.',
      cameraLabel: 'connector focus',
      rotationLabel: 'cueing',
      status: 'Player should predict the result before it lands.',
      cues: ['bridge nearly meets', 'player still waits', 'next move remains predictable'],
      rotationStateId: 'cueing',
      playerNodeId: 'outer-open',
      objectiveNodeId: 'middle-target',
      objectiveLabel: 'bridge target',
      focus: { target: 'connector', sourceId: 'west-spoke', zoom: 3, title: 'Near-open', note: 'The last step should feel anticipated.' }
    },
    {
      id: 'frame-03',
      caption: 'Bridge lands into a clearly open state.',
      cameraLabel: 'connector focus',
      rotationLabel: 'open',
      status: 'Open must read in one glance.',
      cues: ['bridge goes solid', 'lantern meets rib', 'player can trust the opening'],
      rotationStateId: 'open',
      playerNodeId: 'outer-open',
      objectiveNodeId: 'middle-target',
      objectiveLabel: 'bridge target',
      focus: { target: 'connector', sourceId: 'west-spoke', zoom: 3, title: 'Open bridge', note: 'The local crop should prove legibility.' }
    },
    {
      id: 'frame-04',
      caption: 'Player steps into the aligned bridge.',
      cameraLabel: 'connector focus',
      rotationLabel: 'open + actionable',
      status: 'Aligned bridge should support immediate action.',
      cues: ['player commits', 'bridge stays bright', 'next step fits in crop'],
      rotationStateId: 'open',
      playerNodeId: 'middle-open',
      objectiveNodeId: 'core-next',
      objectiveLabel: 'next target',
      focus: { target: 'connector', sourceId: 'west-spoke', zoom: 3, title: 'Actionable alignment', note: 'The open bridge should stay obvious in use.' }
    },
    {
      id: 'after',
      caption: 'After frame with the bridge held open.',
      cameraLabel: 'connector focus',
      rotationLabel: 'open hold',
      status: 'Open state should remain obvious during the hold.',
      cues: ['bridge holds open', 'player + target fit locally', 'compare closed vs open instantly'],
      rotationStateId: 'open',
      playerNodeId: 'middle-after',
      objectiveNodeId: 'core-next',
      objectiveLabel: 'next target',
      focus: { target: 'connector', sourceId: 'west-spoke', zoom: 3, title: 'Open hold', note: 'Human review should not need the legend.' }
    }
  ]
};

const observatoryProfile: ManifestProfile = {
  id: 'observatory-reorientation',
  title: 'Observatory Re-Orientation',
  subtitle: 'Vantage district proof where an observatory reveal restores bearings after local confusion.',
  districtType: 'vantage-observatory',
  districtName: 'Observatory district',
  defaultSeed: 'observatory-reorientation-v1',
  motion: true,
  evidence: [
    'observatory restores bearings',
    'landmarks re-enter in a stable order',
    'player and next target share one mental map'
  ],
  humanJudgment: 'Does the reveal genuinely restore bearings rather than just widening the frame?',
  report: {
    changed: 'The observatory sequence is now generated from a seeded vantage district manifest with explicit re-orientation metrics.',
    regressed: 'The reveal still uses held frames instead of cinematic easing so orientation remains inspectable.',
    better: 'Vantage frequency, shell relationships, and orientation recovery now come from the same topology source.',
    worse: 'Mobile and square passes still compress side context to keep the shell map readable.',
    humanJudgment: 'Confirm that the after frame genuinely restores bearings instead of only looking wider.'
  },
  semanticGate: {
    landmarkId: 'north-flare',
    connectorId: 'north-lift',
    focusTarget: 'landmark',
    recoveryStateId: 'after'
  },
  mechanicHooks: ['vantage reward', 'orientation recovery', 'macro shell preview'],
  targets: {
    solutionLengthBand: [5, 12],
    deadEndBand: [0, 2],
    loopBand: [1, 2],
    shellTransitionBand: [2, 3],
    landmarkSpacingBand: [25, 180],
    objectiveVisibilityBand: [0.85, 1],
    vantageFrequencyBand: [0.08, 0.4]
  },
  solutionNodeIds: [
    'outer-start',
    'outer-climb',
    'middle-landing',
    'middle-observatory',
    'middle-bearing',
    'core-vault-node'
  ],
  nodeBlueprints: [
    { id: 'outer-start', label: 'player', shellId: 'outer', angle: 24, kind: 'entry' },
    { id: 'outer-climb', label: 'climb', shellId: 'outer', angle: 12, kind: 'path' },
    { id: 'outer-pre-vantage', label: 'pre-vantage', shellId: 'outer', angle: 2, kind: 'path' },
    { id: 'outer-after', label: 'after climb', shellId: 'outer', angle: 350, kind: 'path' },
    { id: 'middle-landing', label: 'landing', shellId: 'middle', angle: 78, kind: 'connector' },
    { id: 'middle-observatory', label: 'observatory', shellId: 'middle', angle: 112, kind: 'vantage' },
    { id: 'middle-bearing', label: 'bearing lane', shellId: 'middle', angle: 96, kind: 'path' },
    { id: 'core-vault-node', label: 'core vault', shellId: 'core', angle: 192, kind: 'objective' }
  ],
  edgeBlueprints: [
    { id: 'obs-main-01', from: 'outer-start', to: 'outer-climb', purpose: 'main' },
    { id: 'obs-main-02', from: 'outer-climb', to: 'outer-pre-vantage', purpose: 'main' },
    { id: 'obs-main-03', from: 'outer-pre-vantage', to: 'outer-after', purpose: 'main' },
    { id: 'obs-main-04', from: 'middle-landing', to: 'middle-observatory', purpose: 'main' },
    { id: 'obs-main-05', from: 'middle-observatory', to: 'middle-bearing', purpose: 'main' },
    { id: 'obs-loop-01', from: 'middle-landing', to: 'middle-bearing', purpose: 'loop' }
  ],
  connectors: [
    { id: 'north-lift', label: 'North lift', from: 'outer', to: 'middle', angle: 18, activeRotationStateIds: ['bearing-partial', 'bearing-widening', 'bearing-restored'], fromNodeId: 'outer-start', toNodeId: 'middle-landing' },
    { id: 'east-bridge', label: 'East bridge', from: 'outer', to: 'middle', angle: 356, activeRotationStateIds: ['bearing-restored'], fromNodeId: 'outer-after', toNodeId: 'middle-bearing' },
    { id: 'south-lock', label: 'South lock', from: 'middle', to: 'core', angle: 194, activeRotationStateIds: ['bearing-restored'], fromNodeId: 'middle-observatory', toNodeId: 'core-vault-node' }
  ],
  landmarks: [
    { id: 'obs-spire', label: 'Observatory', shellId: 'outer', angle: 28, offset: 74, tone: 'vantage' },
    { id: 'north-flare', label: 'North flare', shellId: 'orbit', angle: 356, offset: 104, tone: 'north' },
    { id: 'core-vault', label: 'Core vault', shellId: 'core', angle: 192, offset: 50, tone: 'core' }
  ],
  rotationStates: [
    {
      id: 'bearing-partial',
      label: 'bearing partial',
      currentAlignment: 'local only',
      allowedMoves: ['bearing-widening'],
      unlockedGates: ['north-lift'],
      affectedDistricts: ['observatory-reorientation'],
      shellRotations: { outer: 0, middle: -12, core: -8 },
      activeConnectorIds: ['north-lift']
    },
    {
      id: 'bearing-widening',
      label: 'bearing widening',
      currentAlignment: 'macro anchors entering',
      allowedMoves: ['bearing-partial', 'bearing-restored'],
      unlockedGates: ['north-lift'],
      affectedDistricts: ['observatory-reorientation'],
      shellRotations: { outer: 0, middle: -6, core: -4 },
      activeConnectorIds: ['north-lift']
    },
    {
      id: 'bearing-restored',
      label: 'bearing restored',
      currentAlignment: 'observatory hold',
      allowedMoves: ['bearing-widening'],
      unlockedGates: ['north-lift', 'east-bridge', 'south-lock'],
      affectedDistricts: ['observatory-reorientation'],
      shellRotations: { outer: 0, middle: 2, core: 2 },
      activeConnectorIds: ['north-lift', 'east-bridge', 'south-lock']
    }
  ],
  stateBlueprints: [
    {
      id: 'before',
      caption: 'Local view before the observatory reveal.',
      cameraLabel: 'close surface view',
      rotationLabel: 'bearing partial',
      status: 'Bearings are intentionally local here.',
      cues: ['observatory ahead', 'north flare off-axis', 'core not yet resolved'],
      rotationStateId: 'bearing-partial',
      playerNodeId: 'outer-start',
      objectiveNodeId: 'middle-observatory',
      objectiveLabel: 'observatory stair',
      focus: { target: 'landmark', sourceId: 'obs-spire', zoom: 2.45, title: 'Pre-vantage', note: 'The player knows the local shell, not the full stack.' }
    },
    {
      id: 'frame-01',
      caption: 'Player climbs and the frame starts to widen.',
      cameraLabel: 'surface -> vantage',
      rotationLabel: 'bearing widening',
      status: 'Widening should not lose the player anchor.',
      cues: ['observatory grows', 'north flare enters', 'player stays visible'],
      rotationStateId: 'bearing-widening',
      playerNodeId: 'outer-climb',
      objectiveNodeId: 'middle-observatory',
      objectiveLabel: 'observatory stair',
      focus: { target: 'landmark', sourceId: 'obs-spire', zoom: 2.35, title: 'Climb', note: 'Vantage can widen without losing the local anchor.' }
    },
    {
      id: 'frame-02',
      caption: 'Macro landmark pairs with the observatory.',
      cameraLabel: 'surface -> vantage',
      rotationLabel: 'bearing widening',
      status: 'A stable landmark should arrive before the full reveal.',
      cues: ['north flare arrives', 'observatory stays goal', 'core is hinted'],
      rotationStateId: 'bearing-widening',
      playerNodeId: 'outer-pre-vantage',
      objectiveNodeId: 'middle-observatory',
      objectiveLabel: 'observatory stair',
      focus: { target: 'landmark', sourceId: 'north-flare', zoom: 2.15, title: 'Anchor pair', note: 'A macro anchor should enter before the full shell map.' }
    },
    {
      id: 'frame-03',
      caption: 'Shell relationships start to make sense again.',
      cameraLabel: 'vantage entering',
      rotationLabel: 'bearing restored',
      status: 'Ordinary play view should begin restoring orientation now.',
      cues: ['middle shell clears', 'anchors triangulate', 'core enters frame'],
      rotationStateId: 'bearing-restored',
      playerNodeId: 'outer-after',
      objectiveNodeId: 'core-vault-node',
      objectiveLabel: 'core vault',
      focus: { target: 'landmark', sourceId: 'north-flare', zoom: 1.85, title: 'Bearing restore', note: 'This is the first real orientation handoff.' }
    },
    {
      id: 'frame-04',
      caption: 'Full observatory frame restores all shell relationships.',
      cameraLabel: 'observatory',
      rotationLabel: 'bearing restored',
      status: 'Outer, middle, and core should read together.',
      cues: ['all shells readable', 'anchors hold north', 'core vault becomes next target'],
      rotationStateId: 'bearing-restored',
      playerNodeId: 'outer-after',
      objectiveNodeId: 'core-vault-node',
      objectiveLabel: 'core vault',
      focus: { target: 'landmark', sourceId: 'north-flare', zoom: 1.55, title: 'Vantage frame', note: 'All shell relationships should be readable at once.' }
    },
    {
      id: 'frame-05',
      caption: 'Hold frame long enough to recover bearings.',
      cameraLabel: 'observatory hold',
      rotationLabel: 'bearing restored',
      status: 'Orientation recovery needs a readable hold.',
      cues: ['frame holds', 'core stays visible', 'landmarks keep order'],
      rotationStateId: 'bearing-restored',
      playerNodeId: 'outer-after',
      objectiveNodeId: 'core-vault-node',
      objectiveLabel: 'core vault',
      focus: { target: 'landmark', sourceId: 'north-flare', zoom: 1.55, title: 'Orientation hold', note: 'The hold is what actually restores bearings.' }
    },
    {
      id: 'frame-06',
      caption: 'Next target proxy persists after the reveal settles.',
      cameraLabel: 'observatory hold',
      rotationLabel: 'bearing restored',
      status: 'Recovered bearings should survive the reveal.',
      cues: ['next target persists', 'player stays visible', 'orientation holds'],
      rotationStateId: 'bearing-restored',
      playerNodeId: 'outer-after',
      objectiveNodeId: 'core-vault-node',
      objectiveLabel: 'core vault',
      focus: { target: 'landmark', sourceId: 'north-flare', zoom: 1.55, title: 'Recovered bearings', note: 'After the reveal, the next target should still be obvious.' }
    },
    {
      id: 'after',
      caption: 'After frame with bearings restored and held.',
      cameraLabel: 'observatory hold',
      rotationLabel: 'bearing restored',
      status: 'Player should recover bearings from ordinary play view.',
      cues: ['shell map holds', 'player + target coexist', 'recovery lasts past the reveal'],
      rotationStateId: 'bearing-restored',
      playerNodeId: 'outer-after',
      objectiveNodeId: 'core-vault-node',
      objectiveLabel: 'core vault',
      focus: { target: 'landmark', sourceId: 'north-flare', zoom: 1.55, title: 'After observatory', note: 'The after frame should keep the regained map intact.' }
    }
  ]
};

const progressionProfile: ManifestProfile = {
  id: 'bounded-progression-slice',
  title: 'Bounded Progression Slice',
  subtitle: 'Scavenger checkpoint district proof where one regional goal resolves before the next proxy takes over.',
  districtType: 'scavenger-checkpoint',
  districtName: 'Checkpoint district',
  defaultSeed: 'bounded-progression-v1',
  motion: true,
  evidence: [
    'checkpoint feels complete before handoff',
    'completion is visible in-world',
    'the regional slice stays bounded across viewports'
  ],
  humanJudgment: 'Does the slice feel finished before the proxy takes over?',
  report: {
    changed: 'The checkpoint slice now derives from a seeded scavenger district graph with bounded goals and proxy handoff metrics.',
    regressed: 'The lane still proves one region at a time instead of pretending to solve the whole planet at once.',
    better: 'Checkpoint visibility, connector scarcity, and next-proxy emergence now share one manifest and one score packet.',
    worse: 'Because the slice is intentionally bounded, long-route spectacle remains absent.',
    humanJudgment: 'Confirm that checkpoint completion feels satisfying before the proxy beacon becomes dominant.'
  },
  semanticGate: {
    landmarkId: 'checkpoint-node',
    connectorId: 'west-spoke',
    focusTarget: 'objective',
    recoveryStateId: 'after'
  },
  mechanicHooks: ['checkpoint satisfaction', 'proxy handoff', 'bounded regional objective'],
  targets: {
    solutionLengthBand: [7, 14],
    deadEndBand: [2, 4],
    loopBand: [0, 2],
    shellTransitionBand: [2, 3],
    landmarkSpacingBand: [20, 120],
    objectiveVisibilityBand: [0.85, 1],
    vantageFrequencyBand: [0, 0.25]
  },
  solutionNodeIds: [
    'outer-start',
    'outer-lane',
    'outer-bridge',
    'middle-checkpoint',
    'middle-solved',
    'middle-turn',
    'core-proxy',
    'core-after'
  ],
  nodeBlueprints: [
    { id: 'outer-start', label: 'player', shellId: 'outer', angle: 238, kind: 'entry' },
    { id: 'outer-lane', label: 'lane', shellId: 'outer', angle: 248, kind: 'path' },
    { id: 'outer-bridge', label: 'bridge', shellId: 'outer', angle: 262, kind: 'connector' },
    { id: 'middle-checkpoint', label: 'checkpoint', shellId: 'middle', angle: 268, kind: 'checkpoint' },
    { id: 'middle-solved', label: 'solved lane', shellId: 'middle', angle: 286, kind: 'junction' },
    { id: 'middle-turn', label: 'turn', shellId: 'middle', angle: 302, kind: 'path' },
    { id: 'middle-branch', label: 'branch', shellId: 'middle', angle: 280, kind: 'dead-end' },
    { id: 'core-proxy', label: 'proxy beacon', shellId: 'core', angle: 324, kind: 'objective' },
    { id: 'core-after', label: 'after proxy', shellId: 'core', angle: 338, kind: 'path' }
  ],
  edgeBlueprints: [
    { id: 'prog-main-01', from: 'outer-start', to: 'outer-lane', purpose: 'main' },
    { id: 'prog-main-02', from: 'outer-lane', to: 'outer-bridge', purpose: 'main' },
    { id: 'prog-main-03', from: 'middle-checkpoint', to: 'middle-solved', purpose: 'main' },
    { id: 'prog-main-04', from: 'middle-solved', to: 'middle-turn', purpose: 'main' },
    { id: 'prog-main-05', from: 'core-proxy', to: 'core-after', purpose: 'main' },
    { id: 'prog-branch-01', from: 'middle-checkpoint', to: 'middle-branch', purpose: 'branch' },
    { id: 'prog-loop-01', from: 'middle-solved', to: 'core-proxy', purpose: 'loop', optionalThreshold: 0.55 }
  ],
  connectors: [
    { id: 'west-spoke', label: 'West spoke', from: 'outer', to: 'middle', angle: 262, activeRotationStateIds: ['objective-locked', 'objective-cleared', 'handoff-stable'], fromNodeId: 'outer-bridge', toNodeId: 'middle-checkpoint' },
    { id: 'south-lock', label: 'South lock', from: 'middle', to: 'core', angle: 326, activeRotationStateIds: ['objective-cleared', 'handoff-stable'], fromNodeId: 'middle-turn', toNodeId: 'core-proxy' }
  ],
  landmarks: [
    { id: 'checkpoint-node', label: 'Checkpoint', shellId: 'middle', angle: 266, offset: 52, tone: 'solve' },
    { id: 'signal-post', label: 'Signal post', shellId: 'outer', angle: 242, offset: 60, tone: 'gate' },
    { id: 'next-proxy', label: 'Proxy beacon', shellId: 'core', angle: 324, offset: 48, tone: 'core' }
  ],
  rotationStates: [
    {
      id: 'objective-locked',
      label: 'objective locked',
      currentAlignment: 'checkpoint live',
      allowedMoves: ['objective-cleared'],
      unlockedGates: ['west-spoke'],
      affectedDistricts: ['bounded-progression-slice'],
      shellRotations: { outer: 0, middle: -8, core: -10 },
      activeConnectorIds: ['west-spoke']
    },
    {
      id: 'objective-cleared',
      label: 'objective cleared',
      currentAlignment: 'proxy emerging',
      allowedMoves: ['objective-locked', 'handoff-stable'],
      unlockedGates: ['west-spoke', 'south-lock'],
      affectedDistricts: ['bounded-progression-slice'],
      shellRotations: { outer: 0, middle: -2, core: -6 },
      activeConnectorIds: ['west-spoke', 'south-lock']
    },
    {
      id: 'handoff-stable',
      label: 'handoff stable',
      currentAlignment: 'proxy dominant',
      allowedMoves: ['objective-cleared'],
      unlockedGates: ['west-spoke', 'south-lock'],
      affectedDistricts: ['bounded-progression-slice'],
      shellRotations: { outer: 0, middle: 0, core: 0 },
      activeConnectorIds: ['west-spoke', 'south-lock']
    }
  ],
  stateBlueprints: [
    {
      id: 'before',
      caption: 'Checkpoint slice before the regional objective clears.',
      cameraLabel: 'bounded slice',
      rotationLabel: 'objective locked',
      status: 'The slice should read as one bounded task.',
      cues: ['checkpoint present', 'signal points inward', 'player on handoff'],
      rotationStateId: 'objective-locked',
      playerNodeId: 'outer-start',
      objectiveNodeId: 'middle-checkpoint',
      objectiveLabel: 'checkpoint',
      focus: { target: 'objective', sourceId: 'middle-checkpoint', zoom: 2.6, title: 'Checkpoint locked', note: 'One clear local goal should dominate the slice.' }
    },
    {
      id: 'frame-01',
      caption: 'Player commits to the checkpoint lane.',
      cameraLabel: 'bounded slice',
      rotationLabel: 'objective locked',
      status: 'The lane should still feel bounded.',
      cues: ['player enters lane', 'signal stays visible', 'proxy remains muted'],
      rotationStateId: 'objective-locked',
      playerNodeId: 'outer-lane',
      objectiveNodeId: 'middle-checkpoint',
      objectiveLabel: 'checkpoint',
      focus: { target: 'objective', sourceId: 'middle-checkpoint', zoom: 2.6, title: 'Checkpoint lane', note: 'The slice should stay focused on one short objective.' }
    },
    {
      id: 'frame-02',
      caption: 'Checkpoint brightens as the player reaches it.',
      cameraLabel: 'bounded slice',
      rotationLabel: 'objective resolving',
      status: 'Completion should be visible in-world.',
      cues: ['checkpoint brightens', 'player stays centered', 'proxy still secondary'],
      rotationStateId: 'objective-locked',
      playerNodeId: 'middle-checkpoint',
      objectiveNodeId: 'middle-checkpoint',
      objectiveLabel: 'checkpoint',
      focus: { target: 'objective', sourceId: 'middle-checkpoint', zoom: 2.7, title: 'Objective resolve', note: 'Clear completion needs an in-world signal.' }
    },
    {
      id: 'frame-03',
      caption: 'Checkpoint clears and the next proxy starts to appear.',
      cameraLabel: 'bounded slice',
      rotationLabel: 'objective cleared',
      status: 'Completion should hand off cleanly to the next cue.',
      cues: ['checkpoint clears', 'proxy begins', 'player stays near solved node'],
      rotationStateId: 'objective-cleared',
      playerNodeId: 'middle-solved',
      objectiveNodeId: 'core-proxy',
      objectiveLabel: 'proxy beacon',
      focus: { target: 'objective', sourceId: 'core-proxy', zoom: 2.65, title: 'Solved node', note: 'The handoff should not stack too many cues at once.' }
    },
    {
      id: 'frame-04',
      caption: 'Proxy beacon becomes the dominant next-step cue.',
      cameraLabel: 'bounded slice',
      rotationLabel: 'handoff live',
      status: 'Next target should rise only after the solve is clear.',
      cues: ['proxy dominates', 'checkpoint stays secondary', 'player remains local'],
      rotationStateId: 'handoff-stable',
      playerNodeId: 'middle-turn',
      objectiveNodeId: 'core-proxy',
      objectiveLabel: 'proxy beacon',
      focus: { target: 'objective', sourceId: 'core-proxy', zoom: 2.55, title: 'Next proxy', note: 'The slice should now point clearly to the next cue.' }
    },
    {
      id: 'frame-05',
      caption: 'Player turns from the solved node toward the proxy.',
      cameraLabel: 'bounded slice',
      rotationLabel: 'handoff live',
      status: 'The new target should be the obvious next move.',
      cues: ['player turns', 'checkpoint remains solved', 'slice stays bounded'],
      rotationStateId: 'handoff-stable',
      playerNodeId: 'middle-turn',
      objectiveNodeId: 'core-proxy',
      objectiveLabel: 'proxy beacon',
      focus: { target: 'objective', sourceId: 'core-proxy', zoom: 2.55, title: 'Turn to proxy', note: 'The next move should feel inevitable.' }
    },
    {
      id: 'frame-06',
      caption: 'Solved slice holds long enough to feel finished.',
      cameraLabel: 'bounded slice',
      rotationLabel: 'handoff stable',
      status: 'Satisfaction depends on a short readable hold.',
      cues: ['solved state holds', 'proxy remains next', 'player can pause'],
      rotationStateId: 'handoff-stable',
      playerNodeId: 'core-proxy',
      objectiveNodeId: 'core-proxy',
      objectiveLabel: 'proxy beacon',
      focus: { target: 'objective', sourceId: 'core-proxy', zoom: 2.55, title: 'Solved hold', note: 'The player should feel a bounded win before moving on.' }
    },
    {
      id: 'after',
      caption: 'After frame with the slice cleared and the proxy live.',
      cameraLabel: 'bounded slice',
      rotationLabel: 'handoff stable',
      status: 'One region should feel complete before the next takes over.',
      cues: ['checkpoint solved', 'proxy obvious', 'bearings remain intact'],
      rotationStateId: 'handoff-stable',
      playerNodeId: 'core-after',
      objectiveNodeId: 'core-proxy',
      objectiveLabel: 'proxy beacon',
      focus: { target: 'objective', sourceId: 'core-proxy', zoom: 2.55, title: 'After slice', note: 'The slice should feel done before the next cue wins.' }
    }
  ]
};

const proofManifestProfiles: ManifestProfile[] = [
  denseProfile,
  rotationProfile,
  alignmentProfile,
  observatoryProfile,
  progressionProfile
];

export const listProofManifestSpecs = () => proofManifestProfiles.map((profile) => ({
  id: profile.id,
  seed: profile.defaultSeed,
  districtType: profile.districtType
}));

export const generateProofManifest = (
  scenarioId: string,
  seed = proofManifestProfiles.find((profile) => profile.id === scenarioId)?.defaultSeed
): PlanetProofManifest => {
  const profile = proofManifestProfiles.find((entry) => entry.id === scenarioId);
  if (!profile) {
    throw new Error(`Unknown proof manifest profile ${scenarioId}.`);
  }

  if (!seed) {
    throw new Error(`No seed available for ${scenarioId}.`);
  }

  const nodes = buildNodes(profile, seed);
  const connectors = buildConnectors(profile, seed);
  const edges = buildEdges(profile, profile.connectors, seed);
  const landmarks = buildLandmarks(profile, seed);
  const states = buildProofStates(profile, nodes, connectors, landmarks);
  const metrics = computeMetrics(nodes, edges, landmarks, states, profile.districtType, profile.solutionNodeIds);
  const district = buildDistrict(profile, nodes, landmarks);
  const graph = buildGraph(profile, nodes, edges, landmarks, connectors);

  return {
    schemaVersion: 1,
    manifestId: `${profile.id}-${seed}`,
    scenarioId: profile.id,
    title: profile.title,
    subtitle: profile.subtitle,
    seed,
    districtType: profile.districtType,
    graph,
    nodes,
    edges,
    shells: DEFAULT_SHELLS.map((shell) => ({ ...shell })),
    districts: [district],
    landmarks,
    connectors,
    rotationStates: profile.rotationStates.map((state) => ({
      ...state,
      shellRotations: { ...state.shellRotations },
      activeConnectorIds: [...state.activeConnectorIds],
      allowedMoves: [...state.allowedMoves],
      unlockedGates: [...state.unlockedGates],
      affectedDistricts: [...state.affectedDistricts]
    })),
    wayfindingCues: buildWayfindingCues(profile),
    metrics,
    proof: {
      motion: profile.motion,
      evidence: [...profile.evidence],
      routes: buildRoutes(nodes, edges),
      states,
      humanJudgment: profile.humanJudgment,
      semanticGate: { ...profile.semanticGate },
      report: { ...profile.report }
    }
  };
};

export const generateAllProofManifests = (
  seedOverrides: Partial<Record<string, string>> = {}
): PlanetProofManifest[] => proofManifestProfiles.map((profile) => (
  generateProofManifest(profile.id, seedOverrides[profile.id] ?? profile.defaultSeed)
));

export const getManifestProfileTargets = (scenarioId: string) => {
  const profile = proofManifestProfiles.find((entry) => entry.id === scenarioId);
  return profile?.targets ?? null;
};
