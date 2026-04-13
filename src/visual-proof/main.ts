import visualConfig from '../../playwright.visual.config.json';
import { generateProofManifest } from '../topology-proof/index';
import { loadProofScenario } from './manifestLoader';
import type { PlanetEdge } from './manifestTypes';
import {
  STAGE_CENTER,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type ConnectorDefinition,
  type FocusTarget,
  type LandmarkDefinition,
  type ShellDefinition
} from './scenarioLibrary';
import { buildProofPlayback, type ProofCanaryMutation, type RuntimeProofState } from './proofRuntime';
import { renderTrailMarkup } from './trail/TrailRenderer';
import './styles.css';

interface ProofDiagnostics {
  scenarioId: string;
  stateId: string;
  sourceKind: 'manifest' | 'fallback';
  manifestPath: string | null;
  seed: string | null;
  districtType: string | null;
  canary: string | null;
  caption: string;
  status: string;
  cameraLabel: string;
  rotationLabel: string;
  focusTitle: string;
  focusNote: string;
  cues: string[];
  activeConnectorIds: string[];
  objectiveVisible: boolean;
  playerTileId: string;
  trailHeadTileId: string | null;
  trailHeadMatchesPlayer: boolean;
  currentTargetTileId: string | null;
  goalTileId: string | null;
  goalObservedStep: number | null;
  replanCount: number;
  backtrackCount: number;
  frontierCount: number;
  tilesDiscovered: number;
  totalSteps: number;
  goalReached: boolean;
  solutionOverlayVisible: boolean;
  actionLog: string[];
  semanticGate: {
    focusTarget: FocusTarget;
    landmarkId: string;
    landmarkLabel: string;
    connectorId: string;
    connectorLabel: string;
    connectorState: 'active' | 'inactive';
    recoveryStateId: string | null;
  };
}

interface VisualProofApi {
  ready: boolean;
  scenarioId: string;
  viewportId: string;
  motion: boolean;
  stateIds: string[];
  currentStateId: string;
  setState: (stateId: string) => Promise<ProofDiagnostics>;
  playMotion: () => Promise<void>;
  getDiagnostics: () => ProofDiagnostics;
}

declare global {
  interface Window {
    __MAZER_VISUAL_PROOF__?: VisualProofApi;
  }
}

const LANDMARK_COLORS: Record<LandmarkDefinition['tone'], string> = {
  north: '#7ae7ff',
  solve: '#8dffca',
  gate: '#ffd88e',
  vantage: '#f6b4ff',
  core: '#ff9f87'
};

const FOCUS_TARGET_LABELS: Record<FocusTarget, string> = {
  player: 'Player anchor',
  objective: 'Objective or proxy',
  landmark: 'Landmark anchor',
  connector: 'Shell connector'
};

const ALLOWED_CANARIES = new Set<ProofCanaryMutation>([
  'hide-player',
  'hide-objective',
  'hide-landmark',
  'hide-connector',
  'omniscient-goal-target',
  'trail-head-mismatch',
  'show-solution-overlay'
]);

const proofRoot = document.querySelector<HTMLDivElement>('#visual-proof-root');
if (!proofRoot) {
  throw new Error('Expected #visual-proof-root to exist.');
}

const params = new URLSearchParams(window.location.search);
const requestedScenarioId = params.get('scenario') ?? visualConfig.scenarios[0]?.id ?? 'dense-route-player-visibility';
const viewportId = params.get('viewport') ?? 'adhoc';
const canary = params.get('canary');
if (canary && !ALLOWED_CANARIES.has(canary as ProofCanaryMutation)) {
  throw new Error(`Unknown canary mutation: ${canary}`);
}

const debugSolution = params.get('debugSolution') === 'true' || params.get('debug') === 'solution';
const loadedScenario = await loadProofScenario({
  search: window.location.search,
  fallbackScenarioId: requestedScenarioId
});
const manifest = loadedScenario.manifest ?? generateProofManifest(requestedScenarioId, loadedScenario.source.seed ?? undefined);
const captureConfig = visualConfig.scenarios.find((entry) => entry.id === manifest.scenarioId) ?? visualConfig.scenarios[0];
const playback = buildProofPlayback({
  manifest,
  frameIds: [
    captureConfig?.beforeState ?? 'before',
    ...(captureConfig?.keyframes ?? []),
    captureConfig?.afterState ?? 'after'
  ],
  canary: (canary as ProofCanaryMutation | null) ?? null,
  debugSolution
});
let currentState = playback.stateMap.get(captureConfig?.beforeState ?? playback.stateIds[0]) ?? playback.states[0];
const activeLandmark = manifest.landmarks.find((entry) => entry.id === manifest.proof.semanticGate.landmarkId);
const activeConnector = manifest.connectors.find((entry) => entry.id === manifest.proof.semanticGate.connectorId);

if (!activeLandmark) {
  throw new Error(`Semantic gate landmark ${manifest.proof.semanticGate.landmarkId} is missing from ${manifest.scenarioId}.`);
}

if (!activeConnector) {
  throw new Error(`Semantic gate connector ${manifest.proof.semanticGate.connectorId} is missing from ${manifest.scenarioId}.`);
}

proofRoot.innerHTML = `
  <main class="proof-app">
    <header class="proof-header">
      <div>
        <h1 class="proof-title">${manifest.title}</h1>
        <p class="proof-subtitle">${manifest.subtitle}</p>
      </div>
      <div class="proof-meta">
        <span class="proof-chip">${viewportId}</span>
        <span class="proof-chip">${manifest.seed}</span>
        <span class="proof-chip">${manifest.districtType}</span>
        <span class="proof-chip" data-tone="${manifest.proof.motion ? 'motion' : 'still'}">${manifest.proof.motion ? 'motion' : 'still'}</span>
      </div>
    </header>
    <section class="proof-content">
      <section class="proof-stage-card">
        <div class="proof-stage-header">
          <div>
            <h2 class="proof-stage-label">Scenario frame</h2>
            <p class="proof-stage-caption" id="proof-stage-caption"></p>
          </div>
          <div class="proof-meta">
            <span class="proof-chip" id="proof-camera-chip"></span>
            <span class="proof-chip" id="proof-rotation-chip"></span>
          </div>
        </div>
        <div class="proof-stage-wrap">
          <div id="proof-stage" class="proof-stage"></div>
        </div>
        <div class="proof-stage-footer">
          <section class="proof-status-card">
            <h3 class="proof-panel-heading">State summary</h3>
            <p class="proof-status-text" id="proof-status-text"></p>
          </section>
          <section class="proof-cues">
            <h3 class="proof-panel-heading">Action log</h3>
            <ul id="proof-cues-list"></ul>
          </section>
        </div>
      </section>
      <aside class="proof-rail">
        <section class="proof-panel proof-evidence">
          <h2 class="proof-panel-heading">Readability gates</h2>
          <ul>${manifest.proof.evidence.map((entry) => `<li>${entry}</li>`).join('')}</ul>
        </section>
        <section id="focus-panel" class="proof-panel">
          <div class="proof-focus-header">
            <h2 class="proof-focus-title" id="proof-focus-title"></h2>
            <span class="proof-chip" id="proof-focus-zoom"></span>
          </div>
          <div class="proof-focus-wrap">
            <div id="proof-focus"></div>
          </div>
          <p class="proof-focus-note" id="proof-focus-note"></p>
        </section>
        <section class="proof-panel">
          <h2 class="proof-panel-heading">Explorer diagnostics</h2>
          <div class="proof-summary-grid">
            <div class="proof-summary-item">
              <span class="proof-summary-term">Player</span>
              <span class="proof-summary-value" id="proof-player-value"></span>
            </div>
            <div class="proof-summary-item">
              <span class="proof-summary-term">Target</span>
              <span class="proof-summary-value" id="proof-objective-value"></span>
            </div>
            <div class="proof-summary-item">
              <span class="proof-summary-term">Trail</span>
              <span class="proof-summary-value" id="proof-trail-value"></span>
            </div>
            <div class="proof-summary-item">
              <span class="proof-summary-term">Goal seen</span>
              <span class="proof-summary-value" id="proof-goal-value"></span>
            </div>
            <div class="proof-summary-item">
              <span class="proof-summary-term">Replans</span>
              <span class="proof-summary-value" id="proof-replan-value"></span>
            </div>
            <div class="proof-summary-item">
              <span class="proof-summary-term">Frontiers</span>
              <span class="proof-summary-value" id="proof-frontier-value"></span>
            </div>
          </div>
          <div class="proof-contract-grid">
            <div class="proof-summary-item">
              <span class="proof-summary-term">Connectors</span>
              <span class="proof-summary-value" id="proof-connector-value"></span>
            </div>
            <div class="proof-summary-item">
              <span class="proof-summary-term">Anchor landmark</span>
              <span class="proof-summary-value" id="proof-landmark-value"></span>
            </div>
            <div class="proof-summary-item">
              <span class="proof-summary-term">Anchor connector</span>
              <span class="proof-summary-value" id="proof-anchor-connector-value"></span>
            </div>
            <div class="proof-summary-item">
              <span class="proof-summary-term">Focus target</span>
              <span class="proof-summary-value" id="proof-focus-target-value"></span>
            </div>
          </div>
          <p class="proof-human-text" id="proof-review-value">${manifest.proof.humanJudgment}</p>
        </section>
      </aside>
    </section>
  </main>
`;

const stageCaption = document.querySelector<HTMLParagraphElement>('#proof-stage-caption');
const cameraChip = document.querySelector<HTMLSpanElement>('#proof-camera-chip');
const rotationChip = document.querySelector<HTMLSpanElement>('#proof-rotation-chip');
const statusText = document.querySelector<HTMLParagraphElement>('#proof-status-text');
const cuesList = document.querySelector<HTMLUListElement>('#proof-cues-list');
const stageElement = document.querySelector<HTMLDivElement>('#proof-stage');
const focusElement = document.querySelector<HTMLDivElement>('#proof-focus');
const focusTitle = document.querySelector<HTMLHeadingElement>('#proof-focus-title');
const focusZoom = document.querySelector<HTMLSpanElement>('#proof-focus-zoom');
const focusNote = document.querySelector<HTMLParagraphElement>('#proof-focus-note');
const playerValue = document.querySelector<HTMLSpanElement>('#proof-player-value');
const objectiveValue = document.querySelector<HTMLSpanElement>('#proof-objective-value');
const trailValue = document.querySelector<HTMLSpanElement>('#proof-trail-value');
const goalValue = document.querySelector<HTMLSpanElement>('#proof-goal-value');
const replanValue = document.querySelector<HTMLSpanElement>('#proof-replan-value');
const frontierValue = document.querySelector<HTMLSpanElement>('#proof-frontier-value');
const connectorValue = document.querySelector<HTMLSpanElement>('#proof-connector-value');
const reviewValue = document.querySelector<HTMLParagraphElement>('#proof-review-value');
const landmarkValue = document.querySelector<HTMLSpanElement>('#proof-landmark-value');
const anchorConnectorValue = document.querySelector<HTMLSpanElement>('#proof-anchor-connector-value');
const focusTargetValue = document.querySelector<HTMLSpanElement>('#proof-focus-target-value');

if (
  !stageCaption ||
  !cameraChip ||
  !rotationChip ||
  !statusText ||
  !cuesList ||
  !stageElement ||
  !focusElement ||
  !focusTitle ||
  !focusZoom ||
  !focusNote ||
  !playerValue ||
  !objectiveValue ||
  !trailValue ||
  !goalValue ||
  !replanValue ||
  !frontierValue ||
  !connectorValue ||
  !reviewValue ||
  !landmarkValue ||
  !anchorConnectorValue ||
  !focusTargetValue
) {
  throw new Error('Visual proof surface is missing required DOM nodes.');
}

const wait = (ms: number) => new Promise<void>((resolvePromise) => {
  window.setTimeout(resolvePromise, ms);
});

const nodeById = new Map(manifest.nodes.map((node) => [node.id, node]));
const connectorById = new Map(manifest.connectors.map((connector) => [connector.id, connector]));
const edgeById = new Map(manifest.edges.map((edge) => [edge.id, edge]));
const discoveredNodeSet = (state: RuntimeProofState): Set<string> => new Set(state.diagnostics.discoveredNodeIds);

const resolveShell = (shellId: ShellDefinition['id']): ShellDefinition => {
  const shell = manifest.shells.find((entry) => entry.id === shellId);
  if (!shell) {
    throw new Error(`Unknown shell ${shellId}.`);
  }

  return shell;
};

const toPolarPoint = (shell: ShellDefinition, angle: number, radialOffset = 0) => {
  const radians = (angle - 90) * (Math.PI / 180);
  const radius = shell.radius + radialOffset;
  return {
    x: STAGE_CENTER.x + (Math.cos(radians) * radius),
    y: STAGE_CENTER.y + (Math.sin(radians) * radius)
  };
};

const describeArc = (radius: number, startAngle: number, endAngle: number): string => {
  const baseShell = manifest.shells[0];
  const start = toPolarPoint({ ...baseShell, radius }, startAngle);
  const end = toPolarPoint({ ...baseShell, radius }, endAngle);
  const span = (((endAngle - startAngle) % 360) + 360) % 360;
  const largeArcFlag = span > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
};

const resolveNodePoint = (state: RuntimeProofState, tileId: string) => {
  const node = nodeById.get(tileId);
  if (!node) {
    return null;
  }

  const shell = resolveShell(node.shellId);
  const rotatedAngle = node.angle + state.shellRotations[node.shellId];
  return toPolarPoint(shell, rotatedAngle);
};

const renderShellMarkup = (shell: ShellDefinition, state: RuntimeProofState): string => `
  <g>
    <circle cx="${STAGE_CENTER.x}" cy="${STAGE_CENTER.y}" r="${shell.radius}" fill="none" stroke="${shell.fill}" stroke-width="${shell.thickness}" opacity="0.92" />
    <circle cx="${STAGE_CENTER.x}" cy="${STAGE_CENTER.y}" r="${shell.radius}" fill="none" stroke="${shell.accent}" stroke-width="3" opacity="0.72" stroke-dasharray="5 14" />
    <text
      x="${STAGE_CENTER.x}"
      y="${(STAGE_CENTER.y - shell.radius - 20).toFixed(2)}"
      fill="${shell.accent}"
      opacity="0.92"
      font-size="15"
      font-family="Consolas, 'Lucida Console', monospace"
      text-anchor="middle"
      letter-spacing="1.6"
    >${shell.label} :: ${(state.shellRotations[shell.id] >= 0 ? '+' : '') + state.shellRotations[shell.id]}°</text>
  </g>
`;

const renderEdgeMarkup = (edge: PlanetEdge, state: RuntimeProofState): string => {
  if (edge.shellTransition) {
    return '';
  }

  const fromNode = nodeById.get(edge.from);
  const toNode = nodeById.get(edge.to);
  if (!fromNode || !toNode || fromNode.shellId !== toNode.shellId) {
    return '';
  }

  const shell = resolveShell(fromNode.shellId);
  const start = fromNode.angle + state.shellRotations[fromNode.shellId];
  const end = toNode.angle + state.shellRotations[toNode.shellId];
  const discovered = discoveredNodeSet(state).has(edge.from) && discoveredNodeSet(state).has(edge.to);
  const stroke = discovered ? 'rgba(127, 216, 255, 0.78)' : 'rgba(106, 152, 183, 0.26)';
  const strokeWidth = discovered ? 7 : 4;

  return `
    <path
      d="${describeArc(shell.radius, start, end)}"
      fill="none"
      stroke="${stroke}"
      stroke-width="${strokeWidth}"
      stroke-linecap="round"
      opacity="${discovered ? 0.9 : 0.6}"
      vector-effect="non-scaling-stroke"
    />
  `;
};

const renderSolutionOverlayMarkup = (state: RuntimeProofState, surfaceId: 'stage' | 'focus'): string => {
  if (!state.diagnostics.solutionOverlayVisible) {
    return '';
  }

  const parts = manifest.graph.solutionEdgeIds.map((edgeId) => {
    const edge = edgeById.get(edgeId);
    if (!edge) {
      return '';
    }

    if (edge.shellTransition) {
      const connector = connectorById.get(edge.id);
      if (!connector) {
        return '';
      }

      const fromShell = resolveShell(connector.from);
      const toShell = resolveShell(connector.to);
      const fromAngle = connector.angle + state.shellRotations[connector.from];
      const toAngle = connector.angle + state.shellRotations[connector.to];
      const fromPoint = toPolarPoint(fromShell, fromAngle, -(fromShell.thickness / 2));
      const toPoint = toPolarPoint(toShell, toAngle, toShell.thickness / 2);

      return `
        <line
          x1="${fromPoint.x.toFixed(2)}"
          y1="${fromPoint.y.toFixed(2)}"
          x2="${toPoint.x.toFixed(2)}"
          y2="${toPoint.y.toFixed(2)}"
          stroke="#ff5a7a"
          stroke-width="8"
          stroke-linecap="round"
          opacity="0.92"
        />
      `;
    }

    const fromNode = nodeById.get(edge.from);
    const toNode = nodeById.get(edge.to);
    if (!fromNode || !toNode || fromNode.shellId !== toNode.shellId) {
      return '';
    }

    const shell = resolveShell(fromNode.shellId);
    return `
      <path
        d="${describeArc(shell.radius, fromNode.angle + state.shellRotations[fromNode.shellId], toNode.angle + state.shellRotations[toNode.shellId])}"
        fill="none"
        stroke="#ff5a7a"
        stroke-width="9"
        stroke-linecap="round"
        opacity="0.92"
      />
    `;
  }).join('');

  return `
    <g data-testid="${surfaceId}-solution-overlay" aria-label="Solved route overlay">
      ${parts}
    </g>
  `;
};

const renderLandmarkMarkup = (
  landmark: LandmarkDefinition,
  state: RuntimeProofState,
  surfaceId: 'stage' | 'focus'
): string => {
  if (canary === 'hide-landmark' && landmark.id === manifest.proof.semanticGate.landmarkId) {
    return '';
  }

  const worldAngle = landmark.shellId === 'orbit'
    ? landmark.angle
    : landmark.angle + state.shellRotations[landmark.shellId];
  const radiusSource = landmark.shellId === 'orbit'
    ? { ...manifest.shells[0], radius: 350 }
    : resolveShell(landmark.shellId);
  const point = toPolarPoint({ ...manifest.shells[0], radius: radiusSource.radius }, worldAngle, landmark.offset);
  const labelWidth = Math.max(92, landmark.label.length * 7.8);
  const fill = LANDMARK_COLORS[landmark.tone];
  const tracked = landmark.id === manifest.proof.semanticGate.landmarkId;
  const testId = tracked ? `data-testid="${surfaceId}-landmark"` : '';
  const emphasisMarkup = tracked
    ? `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="14" fill="none" stroke="rgba(255, 244, 204, 0.9)" stroke-width="2" opacity="0.92" />`
    : '';

  return `
    <g ${testId} data-landmark-id="${landmark.id}" aria-label="Anchor landmark ${landmark.label}">
      ${emphasisMarkup}
      <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="7" fill="${fill}" opacity="0.92" />
      <rect
        x="${(point.x - (labelWidth / 2)).toFixed(2)}"
        y="${(point.y - 12).toFixed(2)}"
        width="${labelWidth.toFixed(2)}"
        height="24"
        rx="12"
        fill="rgba(7, 22, 34, 0.86)"
        stroke="${fill}"
        stroke-width="1"
        opacity="0.9"
      />
      <text
        x="${point.x.toFixed(2)}"
        y="${(point.y + 5).toFixed(2)}"
        fill="#f4fbff"
        font-size="12"
        font-family="Consolas, 'Lucida Console', monospace"
        text-anchor="middle"
      >${landmark.label}</text>
    </g>
  `;
};

const renderConnectorMarkup = (
  state: RuntimeProofState,
  surfaceId: 'stage' | 'focus'
): string => manifest.connectors.map((connector) => {
  if (canary === 'hide-connector' && connector.id === manifest.proof.semanticGate.connectorId) {
    return '';
  }

  const fromShell = resolveShell(connector.from);
  const toShell = resolveShell(connector.to);
  const fromAngle = connector.angle + state.shellRotations[connector.from];
  const toAngle = connector.angle + state.shellRotations[connector.to];
  const fromPoint = toPolarPoint(fromShell, fromAngle, -(fromShell.thickness / 2));
  const toPoint = toPolarPoint(toShell, toAngle, toShell.thickness / 2);
  const active = state.activeConnectorIds.includes(connector.id);
  const tracked = connector.id === manifest.proof.semanticGate.connectorId;
  const stroke = active ? '#ffd98a' : 'rgba(255, 171, 145, 0.46)';
  const width = active ? 10 : 5;
  const dash = active ? '' : '8 8';
  const midpoint = {
    x: (fromPoint.x + toPoint.x) / 2,
    y: (fromPoint.y + toPoint.y) / 2
  };
  const testId = tracked ? `data-testid="${surfaceId}-connector"` : '';
  const emphasisMarkup = tracked
    ? `<circle cx="${midpoint.x.toFixed(2)}" cy="${midpoint.y.toFixed(2)}" r="${active ? 15 : 13}" fill="none" stroke="rgba(255, 244, 204, 0.9)" stroke-width="2" opacity="0.9" />`
    : '';

  return `
    <g
      ${testId}
      data-connector-id="${connector.id}"
      data-connector-state="${active ? 'active' : 'inactive'}"
      aria-label="Anchor connector ${connector.label}"
    >
      ${emphasisMarkup}
      <line
        x1="${fromPoint.x.toFixed(2)}"
        y1="${fromPoint.y.toFixed(2)}"
        x2="${toPoint.x.toFixed(2)}"
        y2="${toPoint.y.toFixed(2)}"
        stroke="${stroke}"
        stroke-width="${width}"
        stroke-linecap="round"
        stroke-dasharray="${dash}"
        opacity="${active ? 0.92 : 0.72}"
      />
      <circle cx="${midpoint.x.toFixed(2)}" cy="${midpoint.y.toFixed(2)}" r="${active ? 8 : 6}" fill="${stroke}" opacity="${active ? 0.96 : 0.62}" />
    </g>
  `;
}).join('');

const renderPlayerMarkup = (
  state: RuntimeProofState,
  surfaceId: 'stage' | 'focus'
): string => {
  if (canary === 'hide-player') {
    return '';
  }

  const shell = resolveShell(state.player.shellId);
  const angle = state.player.angle + state.shellRotations[state.player.shellId];
  const point = toPolarPoint(shell, angle);
  const nextPoint = toPolarPoint(shell, angle + 6);
  const tangentAngle = Math.atan2(nextPoint.y - point.y, nextPoint.x - point.x) * (180 / Math.PI);
  const outerGlow = 24 + (state.player.emphasis * 6);
  const innerGlow = 13 + (state.player.emphasis * 4);

  return `
    <g
      data-testid="${surfaceId}-player"
      data-player-tile-id="${state.player.tileId}"
      aria-label="Player anchor"
      transform="translate(${point.x.toFixed(2)} ${point.y.toFixed(2)}) rotate(${tangentAngle.toFixed(2)})"
    >
      <circle cx="0" cy="0" r="${outerGlow}" fill="rgba(105, 226, 255, 0.18)" />
      <circle cx="0" cy="0" r="${innerGlow}" fill="rgba(145, 255, 226, 0.22)" />
      <polygon points="0,-20 16,0 0,20 -16,0" fill="#f8fbff" stroke="#71ebff" stroke-width="3" />
      <polygon points="18,0 36,-8 36,8" fill="#ffd88d" opacity="0.95" />
    </g>
  `;
};

const renderObjectiveMarkup = (
  state: RuntimeProofState,
  surfaceId: 'stage' | 'focus'
): string => {
  if (canary === 'hide-objective' || !state.objective.visible || !state.objective.tileId) {
    return '';
  }

  const shell = resolveShell(state.objective.shellId);
  const angle = state.objective.angle + state.shellRotations[state.objective.shellId];
  const point = toPolarPoint(shell, angle);
  const fill = state.objective.kind === 'goal' ? '#ffd98a' : '#9ef7be';
  const stroke = state.objective.kind === 'goal' ? '#fff3d7' : '#e7fff0';

  return `
    <g
      data-testid="${surfaceId}-objective"
      data-objective-tile-id="${state.objective.tileId}"
      data-objective-kind="${state.objective.kind}"
      aria-label="Active objective ${state.objective.label}"
    >
      <line x1="${point.x.toFixed(2)}" y1="${(point.y - 34).toFixed(2)}" x2="${point.x.toFixed(2)}" y2="${(point.y - 8).toFixed(2)}" stroke="${fill}" stroke-width="4" stroke-linecap="round" opacity="0.94" />
      <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="18" fill="${state.objective.kind === 'goal' ? 'rgba(255, 216, 142, 0.22)' : 'rgba(158, 247, 190, 0.22)'}" />
      <polygon
        points="${point.x.toFixed(2)},${(point.y - 18).toFixed(2)} ${(point.x + 16).toFixed(2)},${point.y.toFixed(2)} ${point.x.toFixed(2)},${(point.y + 18).toFixed(2)} ${(point.x - 16).toFixed(2)},${point.y.toFixed(2)}"
        fill="${fill}"
        stroke="${stroke}"
        stroke-width="3"
      />
    </g>
  `;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const resolveConnectorPoint = (connector: ConnectorDefinition, state: RuntimeProofState) => {
  const fromShell = resolveShell(connector.from);
  const toShell = resolveShell(connector.to);
  const fromAngle = connector.angle + state.shellRotations[connector.from];
  const toAngle = connector.angle + state.shellRotations[connector.to];
  const fromPoint = toPolarPoint(fromShell, fromAngle, -(fromShell.thickness / 2));
  const toPoint = toPolarPoint(toShell, toAngle, toShell.thickness / 2);
  return {
    x: (fromPoint.x + toPoint.x) / 2,
    y: (fromPoint.y + toPoint.y) / 2
  };
};

const resolveFocusCenter = (state: RuntimeProofState) => {
  if (state.focus.target === 'objective' && state.objective.tileId) {
    return resolveNodePoint(state, state.objective.tileId) ?? resolveNodePoint(state, state.player.tileId) ?? STAGE_CENTER;
  }

  if (state.focus.target === 'landmark') {
    const landmark = activeLandmark;
    const worldAngle = landmark.shellId === 'orbit'
      ? landmark.angle
      : landmark.angle + state.shellRotations[landmark.shellId];
    const radiusSource = landmark.shellId === 'orbit'
      ? { ...manifest.shells[0], radius: 350 }
      : resolveShell(landmark.shellId);
    return toPolarPoint({ ...manifest.shells[0], radius: radiusSource.radius }, worldAngle, landmark.offset);
  }

  if (state.focus.target === 'connector') {
    return resolveConnectorPoint(activeConnector, state);
  }

  return resolveNodePoint(state, state.player.tileId) ?? STAGE_CENTER;
};

const resolveViewBox = (state: RuntimeProofState): string => {
  const center = resolveFocusCenter(state);
  const width = STAGE_WIDTH / state.focus.zoom;
  const height = STAGE_HEIGHT / state.focus.zoom;
  const left = clamp(center.x - (width / 2), 0, STAGE_WIDTH - width);
  const top = clamp(center.y - (height / 2), 0, STAGE_HEIGHT - height);
  return `${left.toFixed(2)} ${top.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)}`;
};

const renderSvg = (
  state: RuntimeProofState,
  surfaceId: 'stage' | 'focus'
): string => `
  <svg viewBox="${surfaceId === 'focus' ? resolveViewBox(state) : `0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`}" role="img" aria-label="${manifest.title} ${state.caption}">
    <rect x="0" y="0" width="${STAGE_WIDTH}" height="${STAGE_HEIGHT}" fill="rgba(6, 15, 24, 0.94)" />
    <circle cx="${STAGE_CENTER.x}" cy="${STAGE_CENTER.y}" r="372" fill="rgba(129, 237, 255, 0.08)" />
    <circle cx="${STAGE_CENTER.x}" cy="${STAGE_CENTER.y}" r="154" fill="rgba(255, 215, 135, 0.14)" />
    <g opacity="0.2">
      <circle cx="${STAGE_CENTER.x}" cy="${STAGE_CENTER.y}" r="360" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1" />
      <circle cx="${STAGE_CENTER.x}" cy="${STAGE_CENTER.y}" r="300" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
      <circle cx="${STAGE_CENTER.x}" cy="${STAGE_CENTER.y}" r="220" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
      <line x1="${STAGE_CENTER.x - 390}" y1="${STAGE_CENTER.y}" x2="${STAGE_CENTER.x + 390}" y2="${STAGE_CENTER.y}" stroke="rgba(255,255,255,0.06)" stroke-width="1" />
      <line x1="${STAGE_CENTER.x}" y1="${STAGE_CENTER.y - 390}" x2="${STAGE_CENTER.x}" y2="${STAGE_CENTER.y + 390}" stroke="rgba(255,255,255,0.06)" stroke-width="1" />
    </g>
    ${manifest.shells.map((shell) => renderShellMarkup(shell, state)).join('')}
    ${manifest.edges.map((edge) => renderEdgeMarkup(edge, state)).join('')}
    ${renderSolutionOverlayMarkup(state, surfaceId)}
    ${renderConnectorMarkup(state, surfaceId)}
    ${manifest.landmarks.map((landmark) => renderLandmarkMarkup(landmark, state, surfaceId)).join('')}
    ${renderTrailMarkup(state.trail, (tileId) => resolveNodePoint(state, tileId), {
      stroke: '#9de8ff',
      strokeWidth: 7,
      tailFill: 'rgba(129, 237, 255, 0.34)',
      headFill: '#f8fbff',
      opacity: 0.94
    })}
    ${renderObjectiveMarkup(state, surfaceId)}
    ${renderPlayerMarkup(state, surfaceId)}
    <g>
      <rect x="60" y="64" width="352" height="104" rx="18" fill="rgba(7, 22, 34, 0.84)" stroke="rgba(135, 214, 255, 0.16)" />
      <text x="84" y="96" fill="#f2fbff" font-size="17" font-family="'Trebuchet MS', 'Segoe UI', sans-serif">Camera :: ${state.cameraLabel}</text>
      <text x="84" y="126" fill="#d1f0ff" font-size="15" font-family="Consolas, 'Lucida Console', monospace">${state.rotationLabel}</text>
      <text x="84" y="152" fill="#d1f0ff" font-size="15" font-family="Consolas, 'Lucida Console', monospace">Trail :: ${state.diagnostics.trailHeadMatchesPlayer ? 'locked' : 'mismatch'}</text>
    </g>
  </svg>
`;

const renderState = (state: RuntimeProofState): void => {
  currentState = state;
  stageCaption.textContent = state.caption;
  cameraChip.textContent = state.cameraLabel;
  rotationChip.textContent = state.rotationLabel;
  statusText.textContent = state.status;
  cuesList.innerHTML = state.diagnostics.actionLog.map((cue) => `<li>${cue}</li>`).join('');
  stageElement.innerHTML = renderSvg(state, 'stage');
  focusElement.innerHTML = renderSvg(state, 'focus');
  focusTitle.textContent = state.focus.title;
  focusZoom.textContent = `${state.focus.zoom.toFixed(2)}x`;
  focusNote.textContent = state.focus.note;
  playerValue.textContent = `${state.player.label} (${state.player.tileId})`;
  objectiveValue.textContent = state.objective.visible
    ? `${state.objective.kind}: ${state.objective.label}`
    : 'No current target';
  trailValue.textContent = `${state.diagnostics.trailHeadTileId ?? 'none'} / ${state.trail.committedTileCount} commits`;
  goalValue.textContent = state.diagnostics.goalObservedStep === null
    ? 'Not yet observed'
    : `Step ${state.diagnostics.goalObservedStep}`;
  replanValue.textContent = `${state.diagnostics.replanCount} replans / ${state.diagnostics.backtrackCount} backtracks`;
  frontierValue.textContent = `${state.diagnostics.frontierCount} selections / ${state.diagnostics.tilesDiscovered} tiles`;
  connectorValue.textContent = state.activeConnectorIds.length > 0 ? state.activeConnectorIds.join(', ') : 'none active';
  reviewValue.textContent = manifest.proof.humanJudgment;
  landmarkValue.textContent = activeLandmark.label;
  anchorConnectorValue.textContent = `${activeConnector.label} (${state.activeConnectorIds.includes(activeConnector.id) ? 'active' : 'inactive'})`;
  focusTargetValue.textContent = FOCUS_TARGET_LABELS[manifest.proof.semanticGate.focusTarget];
};

const getDiagnostics = (): ProofDiagnostics => ({
  scenarioId: manifest.scenarioId,
  stateId: currentState.id,
  sourceKind: loadedScenario.source.kind,
  manifestPath: loadedScenario.source.manifestPath,
  seed: manifest.seed,
  districtType: manifest.districtType,
  canary,
  caption: currentState.caption,
  status: currentState.status,
  cameraLabel: currentState.cameraLabel,
  rotationLabel: currentState.rotationLabel,
  focusTitle: currentState.focus.title,
  focusNote: currentState.focus.note,
  cues: [...currentState.cues],
  activeConnectorIds: [...currentState.activeConnectorIds],
  objectiveVisible: currentState.objective.visible,
  playerTileId: currentState.player.tileId,
  trailHeadTileId: currentState.diagnostics.trailHeadTileId,
  trailHeadMatchesPlayer: currentState.diagnostics.trailHeadMatchesPlayer,
  currentTargetTileId: currentState.diagnostics.currentTargetTileId,
  goalTileId: currentState.diagnostics.goalTileId,
  goalObservedStep: currentState.diagnostics.goalObservedStep,
  replanCount: currentState.diagnostics.replanCount,
  backtrackCount: currentState.diagnostics.backtrackCount,
  frontierCount: currentState.diagnostics.frontierCount,
  tilesDiscovered: currentState.diagnostics.tilesDiscovered,
  totalSteps: playback.totalSteps,
  goalReached: playback.goalReached,
  solutionOverlayVisible: currentState.diagnostics.solutionOverlayVisible,
  actionLog: [...currentState.diagnostics.actionLog],
  semanticGate: {
    focusTarget: manifest.proof.semanticGate.focusTarget,
    landmarkId: activeLandmark.id,
    landmarkLabel: activeLandmark.label,
    connectorId: activeConnector.id,
    connectorLabel: activeConnector.label,
    connectorState: currentState.activeConnectorIds.includes(activeConnector.id) ? 'active' : 'inactive',
    recoveryStateId: manifest.proof.semanticGate.recoveryStateId ?? null
  }
});

const setState = async (stateId: string): Promise<ProofDiagnostics> => {
  renderState(playback.stateMap.get(stateId) ?? playback.states[0]);
  await wait(90);
  return getDiagnostics();
};

const playMotion = async (): Promise<void> => {
  const keyframes = captureConfig?.keyframes ?? playback.stateIds;
  for (const [index, stateId] of keyframes.entries()) {
    await setState(stateId);
    await wait(index === 0 || index === keyframes.length - 1 ? 180 : 140);
  }
};

renderState(currentState);

window.__MAZER_VISUAL_PROOF__ = {
  ready: true,
  scenarioId: manifest.scenarioId,
  viewportId,
  motion: manifest.proof.motion,
  stateIds: playback.stateIds,
  currentStateId: currentState.id,
  setState: async (stateId: string) => {
    const diagnostics = await setState(stateId);
    if (window.__MAZER_VISUAL_PROOF__) {
      window.__MAZER_VISUAL_PROOF__.currentStateId = currentState.id;
    }
    return diagnostics;
  },
  playMotion: async () => {
    await playMotion();
    if (window.__MAZER_VISUAL_PROOF__) {
      window.__MAZER_VISUAL_PROOF__.currentStateId = currentState.id;
    }
  },
  getDiagnostics: () => getDiagnostics()
};
