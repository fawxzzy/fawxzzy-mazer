type ShellId = 'outer' | 'middle' | 'core';

// Fallback smoke fixtures only. Canonical proof truth lives in src/topology-proof.

export interface ShellDefinition {
  id: ShellId;
  label: string;
  radius: number;
  thickness: number;
  accent: string;
  fill: string;
}

export interface RouteSegment {
  shellId: ShellId;
  start: number;
  end: number;
  width: number;
  tone: 'main' | 'branch' | 'guide';
  opacity?: number;
}

export interface LandmarkDefinition {
  id: string;
  label: string;
  shellId: ShellId | 'orbit';
  angle: number;
  offset: number;
  tone: 'north' | 'solve' | 'gate' | 'vantage' | 'core';
}

export interface ConnectorDefinition {
  id: string;
  label: string;
  from: ShellId;
  to: ShellId;
  angle: number;
}

export interface FocusDefinition {
  center: { x: number; y: number };
  zoom: number;
  title: string;
  note: string;
}

export type FocusTarget = 'player' | 'objective' | 'landmark' | 'connector';

export interface MarkerDefinition {
  shellId: ShellId;
  angle: number;
  label: string;
  emphasis: number;
}

export interface ObjectiveDefinition {
  shellId: ShellId;
  angle: number;
  label: string;
  visible: boolean;
}

export interface ProofStateDefinition {
  id: string;
  caption: string;
  cameraLabel: string;
  rotationLabel: string;
  status: string;
  cues: readonly string[];
  shellRotations: Record<ShellId, number>;
  player: MarkerDefinition;
  objective: ObjectiveDefinition;
  activeConnectorIds: readonly string[];
  focus: FocusDefinition;
}

export interface SemanticGateDefinition {
  landmarkId: string;
  connectorId: string;
  focusTarget: FocusTarget;
  recoveryStateId?: string;
}

export interface ScenarioDefinition {
  id: string;
  title: string;
  subtitle: string;
  motion: boolean;
  evidence: readonly string[];
  shells: readonly ShellDefinition[];
  routes: readonly RouteSegment[];
  landmarks: readonly LandmarkDefinition[];
  connectors: readonly ConnectorDefinition[];
  states: readonly ProofStateDefinition[];
  humanJudgment: string;
  semanticGate: SemanticGateDefinition;
}

export const STAGE_WIDTH = 1600;
export const STAGE_HEIGHT = 900;
export const STAGE_CENTER = Object.freeze({ x: 800, y: 470 });

const SHELLS: readonly ShellDefinition[] = Object.freeze([
  { id: 'outer', label: 'Outer shell', radius: 286, thickness: 34, accent: '#5fe3ff', fill: 'rgba(23, 57, 74, 0.88)' },
  { id: 'middle', label: 'Middle shell', radius: 204, thickness: 30, accent: '#84ffbe', fill: 'rgba(18, 49, 43, 0.84)' },
  { id: 'core', label: 'Core ring', radius: 126, thickness: 28, accent: '#ffd678', fill: 'rgba(67, 43, 18, 0.88)' }
]);

const SHELL_INDEX = new Map(SHELLS.map((shell) => [shell.id, shell]));
const ZERO_ROTATIONS: Record<ShellId, number> = Object.freeze({ outer: 0, middle: 0, core: 0 });

const pointOnShell = (shellId: ShellId, angle: number, radialOffset = 0) => {
  const shell = SHELL_INDEX.get(shellId);
  if (!shell) {
    throw new Error(`Unknown shell ${shellId}.`);
  }

  const radians = (angle - 90) * (Math.PI / 180);
  const radius = shell.radius + radialOffset;
  return {
    x: STAGE_CENTER.x + (Math.cos(radians) * radius),
    y: STAGE_CENTER.y + (Math.sin(radians) * radius)
  };
};

const focusOnShell = (
  shellId: ShellId,
  angle: number,
  shellRotations: Record<ShellId, number>,
  zoom: number,
  title: string,
  note: string,
  radialOffset = 0
): FocusDefinition => ({
  center: pointOnShell(shellId, angle + shellRotations[shellId], radialOffset),
  zoom,
  title,
  note
});

const createState = (definition: {
  id: string;
  caption: string;
  cameraLabel: string;
  rotationLabel: string;
  status: string;
  cues: readonly string[];
  shellRotations?: Partial<Record<ShellId, number>>;
  player: MarkerDefinition;
  objective: ObjectiveDefinition;
  activeConnectorIds: readonly string[];
  focus: FocusDefinition;
}): ProofStateDefinition => ({
  id: definition.id,
  caption: definition.caption,
  cameraLabel: definition.cameraLabel,
  rotationLabel: definition.rotationLabel,
  status: definition.status,
  cues: definition.cues,
  shellRotations: { ...ZERO_ROTATIONS, ...definition.shellRotations },
  player: definition.player,
  objective: definition.objective,
  activeConnectorIds: definition.activeConnectorIds,
  focus: definition.focus
});

const BASE_CONNECTORS: readonly ConnectorDefinition[] = Object.freeze([
  { id: 'north-lift', label: 'North lift', from: 'outer', to: 'middle', angle: 28 },
  { id: 'east-bridge', label: 'East bridge', from: 'outer', to: 'middle', angle: 104 },
  { id: 'south-lock', label: 'South lock', from: 'middle', to: 'core', angle: 212 },
  { id: 'west-spoke', label: 'West spoke', from: 'outer', to: 'middle', angle: 300 }
]);

const DENSE_ROUTES: readonly RouteSegment[] = Object.freeze([
  { shellId: 'outer', start: 12, end: 80, width: 10, tone: 'main' },
  { shellId: 'outer', start: 42, end: 122, width: 7, tone: 'branch', opacity: 0.74 },
  { shellId: 'outer', start: 56, end: 156, width: 7, tone: 'branch', opacity: 0.72 },
  { shellId: 'outer', start: 90, end: 176, width: 8, tone: 'guide', opacity: 0.62 },
  { shellId: 'outer', start: 152, end: 236, width: 8, tone: 'main', opacity: 0.9 },
  { shellId: 'outer', start: 208, end: 290, width: 7, tone: 'branch', opacity: 0.66 },
  { shellId: 'outer', start: 262, end: 330, width: 9, tone: 'main' },
  { shellId: 'middle', start: 194, end: 268, width: 8, tone: 'guide', opacity: 0.7 },
  { shellId: 'middle', start: 258, end: 336, width: 8, tone: 'main', opacity: 0.88 },
  { shellId: 'core', start: 286, end: 356, width: 8, tone: 'guide', opacity: 0.7 }
]);

const ROTATION_ROUTES: readonly RouteSegment[] = Object.freeze([
  { shellId: 'outer', start: 18, end: 108, width: 9, tone: 'main' },
  { shellId: 'outer', start: 126, end: 236, width: 8, tone: 'guide', opacity: 0.68 },
  { shellId: 'outer', start: 256, end: 336, width: 8, tone: 'main', opacity: 0.92 },
  { shellId: 'middle', start: 18, end: 96, width: 9, tone: 'main' },
  { shellId: 'middle', start: 124, end: 212, width: 8, tone: 'branch', opacity: 0.72 },
  { shellId: 'middle', start: 232, end: 318, width: 8, tone: 'main', opacity: 0.88 },
  { shellId: 'core', start: 82, end: 154, width: 8, tone: 'guide', opacity: 0.7 }
]);

const CONNECTOR_ROUTES: readonly RouteSegment[] = Object.freeze([
  { shellId: 'outer', start: 298, end: 358, width: 10, tone: 'main' },
  { shellId: 'outer', start: 24, end: 74, width: 8, tone: 'branch', opacity: 0.74 },
  { shellId: 'middle', start: 302, end: 348, width: 9, tone: 'main' },
  { shellId: 'middle', start: 352, end: 34, width: 8, tone: 'guide', opacity: 0.66 },
  { shellId: 'core', start: 330, end: 24, width: 8, tone: 'guide', opacity: 0.74 }
]);

const OBSERVATORY_ROUTES: readonly RouteSegment[] = Object.freeze([
  { shellId: 'outer', start: 34, end: 112, width: 9, tone: 'main' },
  { shellId: 'outer', start: 152, end: 232, width: 8, tone: 'guide', opacity: 0.66 },
  { shellId: 'outer', start: 256, end: 346, width: 9, tone: 'main', opacity: 0.92 },
  { shellId: 'middle', start: 8, end: 62, width: 9, tone: 'branch', opacity: 0.7 },
  { shellId: 'middle', start: 82, end: 160, width: 8, tone: 'main', opacity: 0.88 },
  { shellId: 'middle', start: 208, end: 302, width: 8, tone: 'guide', opacity: 0.66 },
  { shellId: 'core', start: 24, end: 78, width: 8, tone: 'main', opacity: 0.82 },
  { shellId: 'core', start: 136, end: 236, width: 8, tone: 'guide', opacity: 0.66 }
]);

const PROGRESSION_ROUTES: readonly RouteSegment[] = Object.freeze([
  { shellId: 'outer', start: 214, end: 304, width: 9, tone: 'main' },
  { shellId: 'outer', start: 306, end: 360, width: 8, tone: 'guide', opacity: 0.66 },
  { shellId: 'middle', start: 220, end: 294, width: 9, tone: 'main', opacity: 0.88 },
  { shellId: 'middle', start: 298, end: 354, width: 8, tone: 'branch', opacity: 0.68 },
  { shellId: 'core', start: 294, end: 352, width: 8, tone: 'guide', opacity: 0.7 }
]);

const DENSE_LANDMARKS: readonly LandmarkDefinition[] = Object.freeze([
  { id: 'north-arch', label: 'North arch', shellId: 'orbit', angle: 8, offset: 100, tone: 'north' },
  { id: 'branch-fan', label: 'Branch fan', shellId: 'outer', angle: 82, offset: 60, tone: 'solve' },
  { id: 'echo-well', label: 'Echo well', shellId: 'middle', angle: 264, offset: 48, tone: 'gate' }
]);

const ROTATION_LANDMARKS: readonly LandmarkDefinition[] = Object.freeze([
  { id: 'hinge-beacon', label: 'Hinge beacon', shellId: 'orbit', angle: 110, offset: 94, tone: 'north' },
  { id: 'phase-gate', label: 'Phase gate', shellId: 'middle', angle: 36, offset: 54, tone: 'gate' },
  { id: 'core-slit', label: 'Core slit', shellId: 'core', angle: 146, offset: 44, tone: 'core' }
]);

const CONNECTOR_LANDMARKS: readonly LandmarkDefinition[] = Object.freeze([
  { id: 'alignment-rib', label: 'Alignment rib', shellId: 'outer', angle: 320, offset: 52, tone: 'gate' },
  { id: 'bridge-lantern', label: 'Bridge lantern', shellId: 'middle', angle: 332, offset: 48, tone: 'solve' },
  { id: 'bearing-notch', label: 'Bearing notch', shellId: 'orbit', angle: 300, offset: 96, tone: 'north' }
]);

const OBSERVATORY_LANDMARKS: readonly LandmarkDefinition[] = Object.freeze([
  { id: 'obs-spire', label: 'Observatory', shellId: 'outer', angle: 28, offset: 74, tone: 'vantage' },
  { id: 'north-flare', label: 'North flare', shellId: 'orbit', angle: 356, offset: 104, tone: 'north' },
  { id: 'core-vault', label: 'Core vault', shellId: 'core', angle: 192, offset: 50, tone: 'core' }
]);

const PROGRESSION_LANDMARKS: readonly LandmarkDefinition[] = Object.freeze([
  { id: 'checkpoint-node', label: 'Checkpoint', shellId: 'middle', angle: 266, offset: 52, tone: 'solve' },
  { id: 'signal-post', label: 'Signal post', shellId: 'outer', angle: 242, offset: 60, tone: 'gate' },
  { id: 'next-proxy', label: 'Proxy beacon', shellId: 'core', angle: 324, offset: 48, tone: 'core' }
]);

const denseStates = [
  createState({
    id: 'before',
    caption: 'Dense branch fan before the player exits the knot.',
    cameraLabel: 'surface-first',
    rotationLabel: 'rotation held',
    status: 'Player should beat the branch clutter.',
    cues: ['player halo wins', 'north arch anchors', 'checkpoint proxy survives'],
    player: { shellId: 'outer', angle: 58, label: 'player', emphasis: 1 },
    objective: { shellId: 'middle', angle: 298, label: 'checkpoint', visible: true },
    activeConnectorIds: ['west-spoke'],
    focus: focusOnShell('outer', 62, ZERO_ROTATIONS, 2.8, 'Dense cluster', 'Player must survive the branch knot.')
  }),
  createState({
    id: 'frame-01',
    caption: 'Player advances into the highest-density branch fan.',
    cameraLabel: 'surface-first',
    rotationLabel: 'rotation held',
    status: 'Active route should guide without erasing options.',
    cues: ['branch fan widens', 'player stays hotter', 'objective stays visible'],
    player: { shellId: 'outer', angle: 72, label: 'player', emphasis: 1 },
    objective: { shellId: 'middle', angle: 298, label: 'checkpoint', visible: true },
    activeConnectorIds: ['west-spoke'],
    focus: focusOnShell('outer', 74, ZERO_ROTATIONS, 2.8, 'Player vs route', 'Focus crop checks silhouette against clutter.')
  }),
  createState({
    id: 'frame-02',
    caption: 'Route knot turns while alternate branches remain visible.',
    cameraLabel: 'surface-first',
    rotationLabel: 'rotation held',
    status: 'Current path should stay dominant but not exclusive.',
    cues: ['active route brightens', 'branches stay secondary', 'north arch remains fixed'],
    player: { shellId: 'outer', angle: 88, label: 'player', emphasis: 1 },
    objective: { shellId: 'middle', angle: 298, label: 'checkpoint', visible: true },
    activeConnectorIds: ['west-spoke'],
    focus: focusOnShell('outer', 88, ZERO_ROTATIONS, 2.8, 'Route knot', 'The knot should still read as a route choice.')
  }),
  createState({
    id: 'frame-03',
    caption: 'Player clears the knot and the lane opens up.',
    cameraLabel: 'surface-first',
    rotationLabel: 'rotation held',
    status: 'Readability should improve once the knot is cleared.',
    cues: ['player exits knot', 'outer shell relaxes', 'checkpoint proxy holds'],
    player: { shellId: 'outer', angle: 106, label: 'player', emphasis: 1 },
    objective: { shellId: 'middle', angle: 298, label: 'checkpoint', visible: true },
    activeConnectorIds: ['west-spoke'],
    focus: focusOnShell('outer', 104, ZERO_ROTATIONS, 2.8, 'Exit lane', 'The clearer lane should feel easier at a glance.')
  }),
  createState({
    id: 'frame-04',
    caption: 'Checkpoint proxy takes over once local clutter drops.',
    cameraLabel: 'surface-first',
    rotationLabel: 'rotation held',
    status: 'Next target should rise as clutter falls.',
    cues: ['proxy brightens', 'player remains primary', 'landmarks still triangulate'],
    player: { shellId: 'outer', angle: 120, label: 'player', emphasis: 1 },
    objective: { shellId: 'middle', angle: 298, label: 'checkpoint', visible: true },
    activeConnectorIds: ['west-spoke'],
    focus: focusOnShell('outer', 118, ZERO_ROTATIONS, 2.75, 'Exit + proxy', 'Player and proxy should coexist cleanly.')
  }),
  createState({
    id: 'after',
    caption: 'After frame with the player clear of the dense knot.',
    cameraLabel: 'surface-first',
    rotationLabel: 'rotation held',
    status: 'Player must still be the fastest read.',
    cues: ['player remains fastest', 'proxy remains next', 'landmarks never disappear'],
    player: { shellId: 'outer', angle: 134, label: 'player', emphasis: 1 },
    objective: { shellId: 'middle', angle: 298, label: 'checkpoint', visible: true },
    activeConnectorIds: ['west-spoke'],
    focus: focusOnShell('outer', 132, ZERO_ROTATIONS, 2.7, 'After frame', 'The resolved lane should still read instantly.')
  })
] as const;

const rotationStates = [
  createState({
    id: 'before',
    caption: 'Before rotation with the east bridge still closed.',
    cameraLabel: 'rotation lane',
    rotationLabel: 'phase A',
    status: 'No bridge should look usable yet.',
    cues: ['bridge closed', 'hinge beacon fixed', 'player stays anchored'],
    shellRotations: { middle: -32, core: -18 },
    player: { shellId: 'outer', angle: 92, label: 'player', emphasis: 1 },
    objective: { shellId: 'middle', angle: 62, label: 'bridge target', visible: true },
    activeConnectorIds: ['north-lift'],
    focus: focusOnShell('middle', 70, { ...ZERO_ROTATIONS, middle: -32, core: -18 }, 2.7, 'Closed bridge', 'Closed should read as closed.')
  }),
  createState({
    id: 'frame-01',
    caption: 'First rotation step toward alignment.',
    cameraLabel: 'rotation lane',
    rotationLabel: 'phase A -> B',
    status: 'Shell motion should read as a step change.',
    cues: ['middle shell steps', 'outer shell anchors', 'bridge cue begins'],
    shellRotations: { middle: -20, core: -12 },
    player: { shellId: 'outer', angle: 92, label: 'player', emphasis: 1 },
    objective: { shellId: 'middle', angle: 62, label: 'bridge target', visible: true },
    activeConnectorIds: ['north-lift'],
    focus: focusOnShell('middle', 76, { ...ZERO_ROTATIONS, middle: -20, core: -12 }, 2.7, 'Step one', 'The move should stay predictable.')
  }),
  createState({
    id: 'frame-02',
    caption: 'Second step with bridge readiness increasing.',
    cameraLabel: 'rotation lane',
    rotationLabel: 'phase B',
    status: 'Player should see that alignment is approaching.',
    cues: ['bridge cue grows', 'phase gate stays visible', 'player still fixed'],
    shellRotations: { middle: -8, core: -6 },
    player: { shellId: 'outer', angle: 92, label: 'player', emphasis: 1 },
    objective: { shellId: 'middle', angle: 62, label: 'bridge target', visible: true },
    activeConnectorIds: ['north-lift'],
    focus: focusOnShell('middle', 84, { ...ZERO_ROTATIONS, middle: -8, core: -6 }, 2.75, 'Phase B', 'Before and after should already be guessable.')
  }),
  createState({
    id: 'frame-03',
    caption: 'Threshold frame before the bridge snaps open.',
    cameraLabel: 'rotation lane',
    rotationLabel: 'phase B -> C',
    status: 'Outcome should be obvious before the last step.',
    cues: ['bridge nearly meets', 'player still anchored', 'core slit lines up'],
    shellRotations: { middle: 6, core: 0 },
    player: { shellId: 'outer', angle: 92, label: 'player', emphasis: 1 },
    objective: { shellId: 'middle', angle: 62, label: 'bridge target', visible: true },
    activeConnectorIds: ['north-lift'],
    focus: focusOnShell('middle', 94, { ...ZERO_ROTATIONS, middle: 6, core: 0 }, 2.75, 'Threshold', 'The last step should feel earned, not random.')
  }),
  createState({
    id: 'frame-04',
    caption: 'Discrete step lands and the east bridge opens.',
    cameraLabel: 'rotation lane',
    rotationLabel: 'phase C',
    status: 'Alignment must read as open in one glance.',
    cues: ['bridge opens', 'player stays readable', 'handoff becomes clear'],
    shellRotations: { middle: 18, core: 8 },
    player: { shellId: 'outer', angle: 96, label: 'player', emphasis: 1 },
    objective: { shellId: 'middle', angle: 66, label: 'bridge target', visible: true },
    activeConnectorIds: ['north-lift', 'east-bridge'],
    focus: focusOnShell('middle', 102, { ...ZERO_ROTATIONS, middle: 18, core: 8 }, 2.8, 'Opened bridge', 'Open should read without debug text.')
  }),
  createState({
    id: 'frame-05',
    caption: 'Player starts using the newly aligned bridge.',
    cameraLabel: 'rotation lane',
    rotationLabel: 'phase C',
    status: 'Aligned state should be actionable right away.',
    cues: ['player commits', 'bridge stays bright', 'phase label holds'],
    shellRotations: { middle: 18, core: 8 },
    player: { shellId: 'outer', angle: 106, label: 'player', emphasis: 1 },
    objective: { shellId: 'middle', angle: 76, label: 'bridge target', visible: true },
    activeConnectorIds: ['north-lift', 'east-bridge'],
    focus: focusOnShell('outer', 106, { ...ZERO_ROTATIONS, middle: 18, core: 8 }, 2.7, 'Actionable state', 'The player should know the next move instantly.')
  }),
  createState({
    id: 'frame-06',
    caption: 'Aligned hold with a stable next-shell route.',
    cameraLabel: 'rotation lane',
    rotationLabel: 'phase C locked',
    status: 'A discrete move needs a readable hold.',
    cues: ['bridge stays open', 'next route simplifies', 'player remains central'],
    shellRotations: { middle: 18, core: 8 },
    player: { shellId: 'middle', angle: 86, label: 'player', emphasis: 1 },
    objective: { shellId: 'core', angle: 144, label: 'next shell', visible: true },
    activeConnectorIds: ['north-lift', 'east-bridge'],
    focus: focusOnShell('middle', 86, { ...ZERO_ROTATIONS, middle: 18, core: 8 }, 2.7, 'Stable hold', 'The learned outcome should have time to land.')
  }),
  createState({
    id: 'after',
    caption: 'After frame with the bridge open and usable.',
    cameraLabel: 'rotation lane',
    rotationLabel: 'phase C locked',
    status: 'Result should stay learnable after motion stops.',
    cues: ['outcome is explicit', 'player + target coexist', 'no free spin required'],
    shellRotations: { middle: 18, core: 8 },
    player: { shellId: 'middle', angle: 96, label: 'player', emphasis: 1 },
    objective: { shellId: 'core', angle: 154, label: 'next shell', visible: true },
    activeConnectorIds: ['north-lift', 'east-bridge'],
    focus: focusOnShell('middle', 96, { ...ZERO_ROTATIONS, middle: 18, core: 8 }, 2.7, 'After state', 'The player should recover bearings immediately.')
  })
] as const;

const connectorStates = [
  createState({
    id: 'before',
    caption: 'Misaligned west spoke before the bridge opens.',
    cameraLabel: 'connector focus',
    rotationLabel: 'misaligned',
    status: 'Local bridge should look closed without text.',
    cues: ['bridge broken', 'lantern misses rib', 'player waits outside'],
    shellRotations: { middle: -18 },
    player: { shellId: 'outer', angle: 306, label: 'player', emphasis: 1 },
    objective: { shellId: 'middle', angle: 330, label: 'bridge target', visible: true },
    activeConnectorIds: [],
    focus: focusOnShell('outer', 314, { ...ZERO_ROTATIONS, middle: -18 }, 3, 'Misaligned bridge', 'Closed should look obviously closed.')
  }),
  createState({
    id: 'frame-01',
    caption: 'Readiness cue rises before alignment.',
    cameraLabel: 'connector focus',
    rotationLabel: 'cueing',
    status: 'Cue can rise without pretending the bridge is open.',
    cues: ['cue brightens', 'bridge still broken', 'player does not move'],
    shellRotations: { middle: -10 },
    player: { shellId: 'outer', angle: 306, label: 'player', emphasis: 1 },
    objective: { shellId: 'middle', angle: 330, label: 'bridge target', visible: true },
    activeConnectorIds: [],
    focus: focusOnShell('outer', 318, { ...ZERO_ROTATIONS, middle: -10 }, 3, 'Cueing state', 'Readiness must not collapse open vs closed.')
  }),
  createState({
    id: 'frame-02',
    caption: 'Near-open state before the final notch lands.',
    cameraLabel: 'connector focus',
    rotationLabel: 'near-open',
    status: 'Player should predict the result before it lands.',
    cues: ['bridge nearly meets', 'player still waits', 'next move remains predictable'],
    shellRotations: { middle: -4 },
    player: { shellId: 'outer', angle: 306, label: 'player', emphasis: 1 },
    objective: { shellId: 'middle', angle: 330, label: 'bridge target', visible: true },
    activeConnectorIds: [],
    focus: focusOnShell('outer', 320, { ...ZERO_ROTATIONS, middle: -4 }, 3, 'Near-open', 'The last step should feel anticipated.')
  }),
  createState({
    id: 'frame-03',
    caption: 'Bridge lands into a clearly open state.',
    cameraLabel: 'connector focus',
    rotationLabel: 'open',
    status: 'Open must read in one glance.',
    cues: ['bridge goes solid', 'lantern meets rib', 'player can trust the opening'],
    shellRotations: { middle: 0 },
    player: { shellId: 'outer', angle: 308, label: 'player', emphasis: 1 },
    objective: { shellId: 'middle', angle: 334, label: 'bridge target', visible: true },
    activeConnectorIds: ['west-spoke'],
    focus: focusOnShell('outer', 322, { ...ZERO_ROTATIONS, middle: 0 }, 3, 'Open bridge', 'The local crop should prove legibility.')
  }),
  createState({
    id: 'frame-04',
    caption: 'Player steps into the aligned bridge.',
    cameraLabel: 'connector focus',
    rotationLabel: 'open + actionable',
    status: 'Aligned bridge should support immediate action.',
    cues: ['player commits', 'bridge stays bright', 'next step fits in crop'],
    shellRotations: { middle: 0 },
    player: { shellId: 'middle', angle: 326, label: 'player', emphasis: 1 },
    objective: { shellId: 'core', angle: 346, label: 'next target', visible: true },
    activeConnectorIds: ['west-spoke'],
    focus: focusOnShell('middle', 326, { ...ZERO_ROTATIONS, middle: 0 }, 3, 'Actionable alignment', 'The open bridge should stay obvious in use.')
  }),
  createState({
    id: 'after',
    caption: 'After frame with the bridge held open.',
    cameraLabel: 'connector focus',
    rotationLabel: 'open hold',
    status: 'Open state should remain obvious during the hold.',
    cues: ['bridge holds open', 'player + target fit locally', 'compare closed vs open instantly'],
    shellRotations: { middle: 0 },
    player: { shellId: 'middle', angle: 334, label: 'player', emphasis: 1 },
    objective: { shellId: 'core', angle: 352, label: 'next target', visible: true },
    activeConnectorIds: ['west-spoke'],
    focus: focusOnShell('middle', 334, { ...ZERO_ROTATIONS, middle: 0 }, 3, 'Open hold', 'Human review should not need the legend.')
  })
] as const;

const observatoryStates = [
  createState({
    id: 'before',
    caption: 'Local view before the observatory reveal.',
    cameraLabel: 'close surface view',
    rotationLabel: 'bearing partial',
    status: 'Bearings are intentionally local here.',
    cues: ['observatory ahead', 'north flare off-axis', 'core not yet resolved'],
    shellRotations: { middle: -12, core: -8 },
    player: { shellId: 'outer', angle: 24, label: 'player', emphasis: 1 },
    objective: { shellId: 'middle', angle: 112, label: 'observatory stair', visible: true },
    activeConnectorIds: ['north-lift'],
    focus: { center: { x: 940, y: 226 }, zoom: 2.45, title: 'Pre-vantage', note: 'The player knows the local shell, not the full stack.' }
  }),
  createState({
    id: 'frame-01',
    caption: 'Player climbs and the frame starts to widen.',
    cameraLabel: 'surface -> vantage',
    rotationLabel: 'bearing widening',
    status: 'Widening should not lose the player anchor.',
    cues: ['observatory grows', 'north flare enters', 'player stays visible'],
    shellRotations: { middle: -10, core: -6 },
    player: { shellId: 'outer', angle: 16, label: 'player', emphasis: 1 },
    objective: { shellId: 'middle', angle: 112, label: 'observatory stair', visible: true },
    activeConnectorIds: ['north-lift'],
    focus: { center: { x: 960, y: 214 }, zoom: 2.35, title: 'Climb', note: 'Vantage can widen without losing the local anchor.' }
  }),
  createState({
    id: 'frame-02',
    caption: 'Macro landmark pairs with the observatory.',
    cameraLabel: 'surface -> vantage',
    rotationLabel: 'bearing widening',
    status: 'A stable landmark should arrive before the full reveal.',
    cues: ['north flare arrives', 'observatory stays goal', 'core is hinted'],
    shellRotations: { middle: -6, core: -4 },
    player: { shellId: 'outer', angle: 10, label: 'player', emphasis: 1 },
    objective: { shellId: 'middle', angle: 116, label: 'observatory stair', visible: true },
    activeConnectorIds: ['north-lift'],
    focus: { center: { x: 860, y: 202 }, zoom: 2.15, title: 'Anchor pair', note: 'A macro anchor should enter before the full shell map.' }
  }),
  createState({
    id: 'frame-03',
    caption: 'Shell relationships start to make sense again.',
    cameraLabel: 'vantage entering',
    rotationLabel: 'bearing restore',
    status: 'Ordinary play view should begin restoring orientation now.',
    cues: ['middle shell clears', 'anchors triangulate', 'core enters frame'],
    shellRotations: { middle: -2, core: 0 },
    player: { shellId: 'outer', angle: 4, label: 'player', emphasis: 1 },
    objective: { shellId: 'core', angle: 196, label: 'core vault', visible: true },
    activeConnectorIds: ['north-lift'],
    focus: { center: { x: 808, y: 272 }, zoom: 1.85, title: 'Bearing restore', note: 'This is the first real orientation handoff.' }
  }),
  createState({
    id: 'frame-04',
    caption: 'Full observatory frame restores all shell relationships.',
    cameraLabel: 'observatory',
    rotationLabel: 'bearing restored',
    status: 'Outer, middle, and core should read together.',
    cues: ['all shells readable', 'anchors hold north', 'core vault becomes next target'],
    shellRotations: { middle: 2, core: 2 },
    player: { shellId: 'outer', angle: 358, label: 'player', emphasis: 1 },
    objective: { shellId: 'core', angle: 192, label: 'core vault', visible: true },
    activeConnectorIds: ['north-lift', 'east-bridge'],
    focus: { center: { x: 800, y: 360 }, zoom: 1.55, title: 'Vantage frame', note: 'All shell relationships should be readable at once.' }
  }),
  createState({
    id: 'frame-05',
    caption: 'Hold frame long enough to recover bearings.',
    cameraLabel: 'observatory hold',
    rotationLabel: 'bearing restored',
    status: 'Orientation recovery needs a readable hold.',
    cues: ['frame holds', 'core stays visible', 'landmarks keep order'],
    shellRotations: { middle: 2, core: 2 },
    player: { shellId: 'outer', angle: 358, label: 'player', emphasis: 1 },
    objective: { shellId: 'core', angle: 192, label: 'core vault', visible: true },
    activeConnectorIds: ['north-lift', 'east-bridge'],
    focus: { center: { x: 800, y: 360 }, zoom: 1.55, title: 'Orientation hold', note: 'The hold is what actually restores bearings.' }
  }),
  createState({
    id: 'frame-06',
    caption: 'Next target proxy persists after the reveal settles.',
    cameraLabel: 'observatory hold',
    rotationLabel: 'bearing restored',
    status: 'Recovered bearings should survive the reveal.',
    cues: ['next target persists', 'player stays visible', 'orientation holds'],
    shellRotations: { middle: 2, core: 2 },
    player: { shellId: 'outer', angle: 352, label: 'player', emphasis: 1 },
    objective: { shellId: 'core', angle: 188, label: 'core vault', visible: true },
    activeConnectorIds: ['north-lift', 'east-bridge'],
    focus: { center: { x: 800, y: 360 }, zoom: 1.55, title: 'Recovered bearings', note: 'After the reveal, the next target should still be obvious.' }
  }),
  createState({
    id: 'after',
    caption: 'After frame with bearings restored and held.',
    cameraLabel: 'observatory hold',
    rotationLabel: 'bearing restored',
    status: 'Player should recover bearings from ordinary play view.',
    cues: ['shell map holds', 'player + target coexist', 'recovery lasts past the reveal'],
    shellRotations: { middle: 2, core: 2 },
    player: { shellId: 'outer', angle: 346, label: 'player', emphasis: 1 },
    objective: { shellId: 'core', angle: 184, label: 'core vault', visible: true },
    activeConnectorIds: ['north-lift', 'east-bridge'],
    focus: { center: { x: 800, y: 360 }, zoom: 1.55, title: 'After observatory', note: 'The after frame should keep the regained map intact.' }
  })
] as const;

const progressionStates = [
  createState({
    id: 'before',
    caption: 'Checkpoint slice before the regional objective clears.',
    cameraLabel: 'bounded slice',
    rotationLabel: 'objective locked',
    status: 'The slice should read as one bounded task.',
    cues: ['checkpoint present', 'signal points inward', 'player on handoff'],
    shellRotations: { middle: -8, core: -10 },
    player: { shellId: 'outer', angle: 238, label: 'player', emphasis: 1 },
    objective: { shellId: 'middle', angle: 268, label: 'checkpoint', visible: true },
    activeConnectorIds: ['west-spoke'],
    focus: focusOnShell('middle', 266, { ...ZERO_ROTATIONS, middle: -8, core: -10 }, 2.6, 'Checkpoint locked', 'One clear local goal should dominate the slice.')
  }),
  createState({
    id: 'frame-01',
    caption: 'Player commits to the checkpoint lane.',
    cameraLabel: 'bounded slice',
    rotationLabel: 'objective locked',
    status: 'The lane should still feel bounded.',
    cues: ['player enters lane', 'signal stays visible', 'proxy remains muted'],
    shellRotations: { middle: -6, core: -10 },
    player: { shellId: 'outer', angle: 248, label: 'player', emphasis: 1 },
    objective: { shellId: 'middle', angle: 272, label: 'checkpoint', visible: true },
    activeConnectorIds: ['west-spoke'],
    focus: focusOnShell('middle', 270, { ...ZERO_ROTATIONS, middle: -6, core: -10 }, 2.6, 'Checkpoint lane', 'The slice should stay focused on one short objective.')
  }),
  createState({
    id: 'frame-02',
    caption: 'Checkpoint brightens as the player reaches it.',
    cameraLabel: 'bounded slice',
    rotationLabel: 'objective resolving',
    status: 'Completion should be visible in-world.',
    cues: ['checkpoint brightens', 'player stays centered', 'proxy still secondary'],
    shellRotations: { middle: -4, core: -8 },
    player: { shellId: 'middle', angle: 264, label: 'player', emphasis: 1 },
    objective: { shellId: 'middle', angle: 274, label: 'checkpoint', visible: true },
    activeConnectorIds: ['west-spoke'],
    focus: focusOnShell('middle', 272, { ...ZERO_ROTATIONS, middle: -4, core: -8 }, 2.7, 'Objective resolve', 'Clear completion needs an in-world signal.')
  }),
  createState({
    id: 'frame-03',
    caption: 'Checkpoint clears and the next proxy starts to appear.',
    cameraLabel: 'bounded slice',
    rotationLabel: 'objective cleared',
    status: 'Completion should hand off cleanly to the next cue.',
    cues: ['checkpoint clears', 'proxy begins', 'player stays near solved node'],
    shellRotations: { middle: -2, core: -6 },
    player: { shellId: 'middle', angle: 276, label: 'player', emphasis: 1 },
    objective: { shellId: 'core', angle: 324, label: 'proxy beacon', visible: true },
    activeConnectorIds: ['west-spoke', 'south-lock'],
    focus: focusOnShell('middle', 278, { ...ZERO_ROTATIONS, middle: -2, core: -6 }, 2.65, 'Solved node', 'The handoff should not stack too many cues at once.')
  }),
  createState({
    id: 'frame-04',
    caption: 'Proxy beacon becomes the dominant next-step cue.',
    cameraLabel: 'bounded slice',
    rotationLabel: 'handoff live',
    status: 'Next target should rise only after the solve is clear.',
    cues: ['proxy dominates', 'checkpoint stays secondary', 'player remains local'],
    shellRotations: { middle: 0, core: -2 },
    player: { shellId: 'middle', angle: 286, label: 'player', emphasis: 1 },
    objective: { shellId: 'core', angle: 330, label: 'proxy beacon', visible: true },
    activeConnectorIds: ['west-spoke', 'south-lock'],
    focus: focusOnShell('core', 330, { ...ZERO_ROTATIONS, middle: 0, core: -2 }, 2.55, 'Next proxy', 'The slice should now point clearly to the next cue.')
  }),
  createState({
    id: 'frame-05',
    caption: 'Player turns from the solved node toward the proxy.',
    cameraLabel: 'bounded slice',
    rotationLabel: 'handoff live',
    status: 'The new target should be the obvious next move.',
    cues: ['player turns', 'checkpoint remains solved', 'slice stays bounded'],
    shellRotations: { middle: 0, core: 0 },
    player: { shellId: 'middle', angle: 296, label: 'player', emphasis: 1 },
    objective: { shellId: 'core', angle: 334, label: 'proxy beacon', visible: true },
    activeConnectorIds: ['west-spoke', 'south-lock'],
    focus: focusOnShell('middle', 300, { ...ZERO_ROTATIONS, middle: 0, core: 0 }, 2.55, 'Turn to proxy', 'The next move should feel inevitable.')
  }),
  createState({
    id: 'frame-06',
    caption: 'Solved slice holds long enough to feel finished.',
    cameraLabel: 'bounded slice',
    rotationLabel: 'handoff stable',
    status: 'Satisfaction depends on a short readable hold.',
    cues: ['solved state holds', 'proxy remains next', 'player can pause'],
    shellRotations: { middle: 0, core: 0 },
    player: { shellId: 'middle', angle: 302, label: 'player', emphasis: 1 },
    objective: { shellId: 'core', angle: 338, label: 'proxy beacon', visible: true },
    activeConnectorIds: ['west-spoke', 'south-lock'],
    focus: focusOnShell('middle', 302, { ...ZERO_ROTATIONS, middle: 0, core: 0 }, 2.55, 'Solved hold', 'The player should feel a bounded win before moving on.')
  }),
  createState({
    id: 'after',
    caption: 'After frame with the slice cleared and the proxy live.',
    cameraLabel: 'bounded slice',
    rotationLabel: 'handoff stable',
    status: 'One region should feel complete before the next takes over.',
    cues: ['checkpoint solved', 'proxy obvious', 'bearings remain intact'],
    shellRotations: { middle: 0, core: 0 },
    player: { shellId: 'middle', angle: 308, label: 'player', emphasis: 1 },
    objective: { shellId: 'core', angle: 342, label: 'proxy beacon', visible: true },
    activeConnectorIds: ['west-spoke', 'south-lock'],
    focus: focusOnShell('middle', 306, { ...ZERO_ROTATIONS, middle: 0, core: 0 }, 2.55, 'After slice', 'The slice should feel done before the next cue wins.')
  })
] as const;

export const scenarioLibrary: readonly ScenarioDefinition[] = Object.freeze([
  {
    id: 'dense-route-player-visibility',
    title: 'Dense Route Player Visibility',
    subtitle: 'Crowded outer-shell pathing with the player glyph held brighter than every branch line.',
    motion: false,
    evidence: ['player glyph beats branch clutter', 'active route reads without hiding options', 'focus crop tells the same story'],
    shells: SHELLS,
    routes: DENSE_ROUTES,
    landmarks: DENSE_LANDMARKS,
    connectors: BASE_CONNECTORS,
    states: denseStates,
    humanJudgment: 'Does the player remain the fastest read while branches still feel available?',
    semanticGate: {
      landmarkId: 'north-arch',
      connectorId: 'west-spoke',
      focusTarget: 'player'
    }
  },
  {
    id: 'discrete-rotation-readability',
    title: 'Discrete Rotation Readability',
    subtitle: 'Step-based shell rotation with explicit before/after bridge consequences.',
    motion: true,
    evidence: ['rotation reads as stepped state', 'player anchor survives motion', 'open bridge is obvious in stills and video'],
    shells: SHELLS,
    routes: ROTATION_ROUTES,
    landmarks: ROTATION_LANDMARKS,
    connectors: BASE_CONNECTORS,
    states: rotationStates,
    humanJudgment: 'Does the stepped move feel learnable instead of disorienting?',
    semanticGate: {
      landmarkId: 'hinge-beacon',
      connectorId: 'east-bridge',
      focusTarget: 'connector',
      recoveryStateId: 'after'
    }
  },
  {
    id: 'shell-connector-alignment',
    title: 'Shell Connector Alignment',
    subtitle: 'Local focus proof for misaligned versus aligned shell bridges.',
    motion: false,
    evidence: ['closed and open states differ without text', 'focus crop matches the full frame', 'aligned bridge looks actionable'],
    shells: SHELLS,
    routes: CONNECTOR_ROUTES,
    landmarks: CONNECTOR_LANDMARKS,
    connectors: BASE_CONNECTORS,
    states: connectorStates,
    humanJudgment: 'Can the bridge state be understood without the legend?',
    semanticGate: {
      landmarkId: 'alignment-rib',
      connectorId: 'west-spoke',
      focusTarget: 'connector'
    }
  },
  {
    id: 'observatory-reorientation',
    title: 'Observatory Re-Orientation',
    subtitle: 'Vantage reveal proving that shell relationships become readable again after local confusion.',
    motion: true,
    evidence: ['observatory restores bearings', 'landmarks re-enter in a stable order', 'player and next target share one mental map'],
    shells: SHELLS,
    routes: OBSERVATORY_ROUTES,
    landmarks: OBSERVATORY_LANDMARKS,
    connectors: BASE_CONNECTORS,
    states: observatoryStates,
    humanJudgment: 'Does the reveal genuinely restore bearings rather than just widening the frame?',
    semanticGate: {
      landmarkId: 'north-flare',
      connectorId: 'north-lift',
      focusTarget: 'landmark',
      recoveryStateId: 'after'
    }
  },
  {
    id: 'bounded-progression-slice',
    title: 'Bounded Progression Slice',
    subtitle: 'Short regional loop proving checkpoint satisfaction and next-proxy handoff.',
    motion: true,
    evidence: ['checkpoint feels complete before handoff', 'completion is visible in-world', 'slice stays bounded across viewports'],
    shells: SHELLS,
    routes: PROGRESSION_ROUTES,
    landmarks: PROGRESSION_LANDMARKS,
    connectors: BASE_CONNECTORS,
    states: progressionStates,
    humanJudgment: 'Does the slice feel finished before the proxy takes over?',
    semanticGate: {
      landmarkId: 'checkpoint-node',
      connectorId: 'west-spoke',
      focusTarget: 'objective',
      recoveryStateId: 'after'
    }
  }
]);

export const getScenarioDefinition = (scenarioId: string): ScenarioDefinition => (
  scenarioLibrary.find((scenario) => scenario.id === scenarioId) ?? scenarioLibrary[0]
);

export const listScenarioIds = (): string[] => scenarioLibrary.map((scenario) => scenario.id);
