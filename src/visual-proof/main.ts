import visualConfig from '../../playwright.visual.config.json';
import { loadProofScenario } from './manifestLoader';
import {
  STAGE_CENTER,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type FocusTarget,
  type FocusDefinition,
  type LandmarkDefinition,
  type ProofStateDefinition,
  type RouteSegment,
  type ScenarioDefinition,
  type ShellDefinition
} from './scenarioLibrary';
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

const ROUTE_COLORS: Record<RouteSegment['tone'], string> = {
  main: '#82e8ff',
  branch: '#7fd1b0',
  guide: '#ffd98a'
};

const FOCUS_TARGET_LABELS: Record<FocusTarget, string> = {
  player: 'Player anchor',
  objective: 'Objective or proxy',
  landmark: 'Landmark anchor',
  connector: 'Shell connector'
};

const ALLOWED_CANARIES = new Set([
  'hide-player',
  'hide-objective',
  'hide-landmark',
  'hide-connector'
]);

const proofRoot = document.querySelector<HTMLDivElement>('#visual-proof-root');
if (!proofRoot) {
  throw new Error('Expected #visual-proof-root to exist.');
}

const params = new URLSearchParams(window.location.search);
const requestedScenarioId = params.get('scenario') ?? visualConfig.scenarios[0]?.id ?? 'dense-route-player-visibility';
const viewportId = params.get('viewport') ?? 'adhoc';
const canary = params.get('canary');
if (canary && !ALLOWED_CANARIES.has(canary)) {
  throw new Error(`Unknown canary mutation: ${canary}`);
}
const loadedScenario = await loadProofScenario({
  search: window.location.search,
  fallbackScenarioId: requestedScenarioId
});
const scenario = loadedScenario.definition;
const captureConfig = visualConfig.scenarios.find((entry) => entry.id === scenario.id) ?? visualConfig.scenarios[0];
const stateMap = new Map(scenario.states.map((state) => [state.id, state]));
let currentState = stateMap.get(captureConfig?.beforeState ?? scenario.states[0]?.id ?? 'before') ?? scenario.states[0];
const activeLandmark = scenario.landmarks.find((entry) => entry.id === scenario.semanticGate.landmarkId);
const activeConnector = scenario.connectors.find((entry) => entry.id === scenario.semanticGate.connectorId);

if (!activeLandmark) {
  throw new Error(`Semantic gate landmark ${scenario.semanticGate.landmarkId} is missing from ${scenario.id}.`);
}

if (!activeConnector) {
  throw new Error(`Semantic gate connector ${scenario.semanticGate.connectorId} is missing from ${scenario.id}.`);
}

proofRoot.innerHTML = `
  <main class="proof-app">
    <header class="proof-header">
      <div>
        <h1 class="proof-title">${scenario.title}</h1>
        <p class="proof-subtitle">${scenario.subtitle}</p>
      </div>
      <div class="proof-meta">
        <span class="proof-chip">${viewportId}</span>
        <span class="proof-chip">${loadedScenario.source.seed ?? captureConfig?.seed ?? 'seedless'}</span>
        ${loadedScenario.source.districtType ? `<span class="proof-chip">${loadedScenario.source.districtType}</span>` : ''}
        <span class="proof-chip" data-tone="${scenario.motion ? 'motion' : 'still'}">${scenario.motion ? 'motion' : 'still'}</span>
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
            <h3 class="proof-panel-heading">Machine cues</h3>
            <ul id="proof-cues-list"></ul>
          </section>
        </div>
      </section>
      <aside class="proof-rail">
        <section class="proof-panel proof-evidence">
          <h2 class="proof-panel-heading">Readability gates</h2>
          <ul>${scenario.evidence.map((entry) => `<li>${entry}</li>`).join('')}</ul>
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
          <h2 class="proof-panel-heading">Snapshot diagnostics</h2>
          <div class="proof-summary-grid">
            <div class="proof-summary-item">
              <span class="proof-summary-term">Player</span>
              <span class="proof-summary-value" id="proof-player-value"></span>
            </div>
            <div class="proof-summary-item">
              <span class="proof-summary-term">Objective</span>
              <span class="proof-summary-value" id="proof-objective-value"></span>
            </div>
            <div class="proof-summary-item">
              <span class="proof-summary-term">Connectors</span>
              <span class="proof-summary-value" id="proof-connector-value"></span>
            </div>
            <div class="proof-summary-item">
              <span class="proof-summary-term">Human review</span>
              <span class="proof-summary-value" id="proof-review-value"></span>
            </div>
          </div>
          <div class="proof-contract-grid">
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
            <div class="proof-summary-item">
              <span class="proof-summary-term">Recovery gate</span>
              <span class="proof-summary-value" id="proof-recovery-value"></span>
            </div>
          </div>
          <p class="proof-human-text">${scenario.humanJudgment}</p>
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
const connectorValue = document.querySelector<HTMLSpanElement>('#proof-connector-value');
const reviewValue = document.querySelector<HTMLSpanElement>('#proof-review-value');
const landmarkValue = document.querySelector<HTMLSpanElement>('#proof-landmark-value');
const anchorConnectorValue = document.querySelector<HTMLSpanElement>('#proof-anchor-connector-value');
const focusTargetValue = document.querySelector<HTMLSpanElement>('#proof-focus-target-value');
const recoveryValue = document.querySelector<HTMLSpanElement>('#proof-recovery-value');

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
  !connectorValue ||
  !reviewValue ||
  !landmarkValue ||
  !anchorConnectorValue ||
  !focusTargetValue ||
  !recoveryValue
) {
  throw new Error('Visual proof surface is missing required DOM nodes.');
}

const wait = (ms: number) => new Promise<void>((resolvePromise) => {
  window.setTimeout(resolvePromise, ms);
});

const resolveShell = (definition: ScenarioDefinition, shellId: string): ShellDefinition => {
  const shell = definition.shells.find((entry) => entry.id === shellId);
  if (!shell) {
    throw new Error(`Unknown shell ${shellId}`);
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
  const baseShell = scenario.shells[0];
  const start = toPolarPoint({ ...baseShell, radius }, startAngle);
  const end = toPolarPoint({ ...baseShell, radius }, endAngle);
  const span = (((endAngle - startAngle) % 360) + 360) % 360;
  const largeArcFlag = span > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
};

const renderRouteMarkup = (definition: ScenarioDefinition, route: RouteSegment, state: ProofStateDefinition): string => {
  const shell = resolveShell(definition, route.shellId);
  const rotation = state.shellRotations[route.shellId];
  const stroke = ROUTE_COLORS[route.tone];
  const opacity = route.opacity ?? (route.tone === 'main' ? 0.94 : route.tone === 'branch' ? 0.72 : 0.68);
  return `
    <path
      d="${describeArc(shell.radius, route.start + rotation, route.end + rotation)}"
      fill="none"
      stroke="${stroke}"
      stroke-width="${route.width}"
      stroke-linecap="round"
      opacity="${opacity}"
      vector-effect="non-scaling-stroke"
    />
  `;
};

const renderLandmarkMarkup = (
  definition: ScenarioDefinition,
  landmark: LandmarkDefinition,
  state: ProofStateDefinition,
  surfaceId: 'stage' | 'focus'
): string => {
  if (canary === 'hide-landmark' && landmark.id === definition.semanticGate.landmarkId) {
    return '';
  }

  const worldAngle = landmark.shellId === 'orbit'
    ? landmark.angle
    : landmark.angle + state.shellRotations[landmark.shellId];
  const radiusSource = landmark.shellId === 'orbit'
    ? { radius: 350 }
    : resolveShell(definition, landmark.shellId);
  const point = toPolarPoint({ ...scenario.shells[0], radius: radiusSource.radius }, worldAngle, landmark.offset);
  const labelWidth = Math.max(92, landmark.label.length * 7.8);
  const fill = LANDMARK_COLORS[landmark.tone];
  const tracked = landmark.id === definition.semanticGate.landmarkId;
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
  definition: ScenarioDefinition,
  state: ProofStateDefinition,
  surfaceId: 'stage' | 'focus'
): string => definition.connectors.map((connector) => {
  if (canary === 'hide-connector' && connector.id === definition.semanticGate.connectorId) {
    return '';
  }

  const fromShell = resolveShell(definition, connector.from);
  const toShell = resolveShell(definition, connector.to);
  const fromAngle = connector.angle + state.shellRotations[connector.from];
  const toAngle = connector.angle + state.shellRotations[connector.to];
  const fromPoint = toPolarPoint(fromShell, fromAngle, -(fromShell.thickness / 2));
  const toPoint = toPolarPoint(toShell, toAngle, toShell.thickness / 2);
  const active = state.activeConnectorIds.includes(connector.id);
  const tracked = connector.id === definition.semanticGate.connectorId;
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
  definition: ScenarioDefinition,
  state: ProofStateDefinition,
  surfaceId: 'stage' | 'focus'
): string => {
  if (canary === 'hide-player') {
    return '';
  }

  const shell = resolveShell(definition, state.player.shellId);
  const angle = state.player.angle + state.shellRotations[state.player.shellId];
  const point = toPolarPoint(shell, angle);
  const nextPoint = toPolarPoint(shell, angle + 6);
  const tangentAngle = Math.atan2(nextPoint.y - point.y, nextPoint.x - point.x) * (180 / Math.PI);
  const outerGlow = 24 + (state.player.emphasis * 6);
  const innerGlow = 13 + (state.player.emphasis * 4);

  return `
    <g
      data-testid="${surfaceId}-player"
      data-player-shell="${state.player.shellId}"
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
  definition: ScenarioDefinition,
  state: ProofStateDefinition,
  surfaceId: 'stage' | 'focus'
): string => {
  if (canary === 'hide-objective') {
    return '';
  }

  if (!state.objective.visible) {
    return '';
  }

  const shell = resolveShell(definition, state.objective.shellId);
  const angle = state.objective.angle + state.shellRotations[state.objective.shellId];
  const point = toPolarPoint(shell, angle);

  return `
    <g
      data-testid="${surfaceId}-objective"
      data-objective-label="${state.objective.label}"
      data-objective-shell="${state.objective.shellId}"
      aria-label="Active objective ${state.objective.label}"
    >
      <line x1="${point.x.toFixed(2)}" y1="${(point.y - 34).toFixed(2)}" x2="${point.x.toFixed(2)}" y2="${(point.y - 8).toFixed(2)}" stroke="#ffd98a" stroke-width="4" stroke-linecap="round" opacity="0.94" />
      <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="18" fill="rgba(255, 216, 142, 0.22)" />
      <polygon
        points="${point.x.toFixed(2)},${(point.y - 18).toFixed(2)} ${(point.x + 16).toFixed(2)},${point.y.toFixed(2)} ${point.x.toFixed(2)},${(point.y + 18).toFixed(2)} ${(point.x - 16).toFixed(2)},${point.y.toFixed(2)}"
        fill="#ffd98a"
        stroke="#fff3d7"
        stroke-width="3"
      />
    </g>
  `;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const resolveViewBox = (focus: FocusDefinition | undefined): string => {
  if (!focus) {
    return `0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`;
  }

  const width = STAGE_WIDTH / focus.zoom;
  const height = STAGE_HEIGHT / focus.zoom;
  const left = clamp(focus.center.x - (width / 2), 0, STAGE_WIDTH - width);
  const top = clamp(focus.center.y - (height / 2), 0, STAGE_HEIGHT - height);
  return `${left.toFixed(2)} ${top.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)}`;
};

const renderShellMarkup = (shell: ShellDefinition, state: ProofStateDefinition): string => `
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

const renderSvg = (
  definition: ScenarioDefinition,
  state: ProofStateDefinition,
  surfaceId: 'stage' | 'focus',
  focus?: FocusDefinition
): string => `
  <svg viewBox="${resolveViewBox(focus)}" role="img" aria-label="${definition.title} ${state.caption}">
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
    ${definition.shells.map((shell) => renderShellMarkup(shell, state)).join('')}
    ${definition.routes.map((route) => renderRouteMarkup(definition, route, state)).join('')}
    ${renderConnectorMarkup(definition, state, surfaceId)}
    ${definition.landmarks.map((landmark) => renderLandmarkMarkup(definition, landmark, state, surfaceId)).join('')}
    ${renderObjectiveMarkup(definition, state, surfaceId)}
    ${renderPlayerMarkup(definition, state, surfaceId)}
    <g>
      <rect x="60" y="64" width="312" height="92" rx="18" fill="rgba(7, 22, 34, 0.84)" stroke="rgba(135, 214, 255, 0.16)" />
      <text x="84" y="96" fill="#f2fbff" font-size="17" font-family="'Trebuchet MS', 'Segoe UI', sans-serif">Camera :: ${state.cameraLabel}</text>
      <text x="84" y="126" fill="#d1f0ff" font-size="15" font-family="Consolas, 'Lucida Console', monospace">${state.rotationLabel}</text>
    </g>
  </svg>
`;

const renderState = (state: ProofStateDefinition): void => {
  currentState = state;
  stageCaption.textContent = state.caption;
  cameraChip.textContent = state.cameraLabel;
  rotationChip.textContent = state.rotationLabel;
  statusText.textContent = state.status;
  cuesList.innerHTML = state.cues.map((cue) => `<li>${cue}</li>`).join('');
  stageElement.innerHTML = renderSvg(scenario, state, 'stage');
  focusElement.innerHTML = renderSvg(scenario, state, 'focus', state.focus);
  focusTitle.textContent = state.focus.title;
  focusZoom.textContent = `${state.focus.zoom.toFixed(2)}x`;
  focusNote.textContent = state.focus.note;
  playerValue.textContent = `${state.player.shellId} @ ${(state.player.angle + state.shellRotations[state.player.shellId]).toFixed(0)}°`;
  objectiveValue.textContent = `${state.objective.label} on ${state.objective.shellId}`;
  connectorValue.textContent = state.activeConnectorIds.length > 0 ? state.activeConnectorIds.join(', ') : 'none active';
  reviewValue.textContent = scenario.humanJudgment;
  landmarkValue.textContent = activeLandmark.label;
  anchorConnectorValue.textContent = `${activeConnector.label} (${state.activeConnectorIds.includes(activeConnector.id) ? 'active' : 'inactive'})`;
  focusTargetValue.textContent = FOCUS_TARGET_LABELS[scenario.semanticGate.focusTarget];
  recoveryValue.textContent = scenario.semanticGate.recoveryStateId ?? 'still-only scenario';
};

const getDiagnostics = (): ProofDiagnostics => ({
  scenarioId: scenario.id,
  stateId: currentState.id,
  sourceKind: loadedScenario.source.kind,
  manifestPath: loadedScenario.source.manifestPath,
  seed: loadedScenario.source.seed ?? captureConfig?.seed ?? null,
  districtType: loadedScenario.source.districtType,
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
  semanticGate: {
    focusTarget: scenario.semanticGate.focusTarget,
    landmarkId: activeLandmark.id,
    landmarkLabel: activeLandmark.label,
    connectorId: activeConnector.id,
    connectorLabel: activeConnector.label,
    connectorState: currentState.activeConnectorIds.includes(activeConnector.id) ? 'active' : 'inactive',
    recoveryStateId: scenario.semanticGate.recoveryStateId ?? null
  }
});

const setState = async (stateId: string): Promise<ProofDiagnostics> => {
  renderState(stateMap.get(stateId) ?? scenario.states[0]);
  await wait(90);
  return getDiagnostics();
};

const playMotion = async (): Promise<void> => {
  const keyframes = captureConfig?.keyframes ?? scenario.states.map((state) => state.id);
  for (const [index, stateId] of keyframes.entries()) {
    await setState(stateId);
    await wait(index === 0 || index === keyframes.length - 1 ? 180 : 140);
  }
};

renderState(currentState);

window.__MAZER_VISUAL_PROOF__ = {
  ready: true,
  scenarioId: scenario.id,
  viewportId,
  motion: scenario.motion,
  stateIds: scenario.states.map((state) => state.id),
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
