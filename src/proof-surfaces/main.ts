import './styles.css';
import {
  createActiveRunTrackerProjection,
  createAmbientTileProjection,
  createSnapshotCardProjection,
  type ActiveRunTrackerProjection,
  type AmbientTileProjection,
  type SnapshotCardProjection
} from '../projections/surfaceAdapters.ts';
import {
  type RunProjectionPrivacy,
  type RunProjectionState
} from '../projections/runProjection.ts';
import {
  PROOF_SURFACE_FIXTURE_ORDER,
  resolveProofSurfaceFixture,
  resolveProofSurfaceFixtureInput,
  resolveProofSurfaceFixtureLabel
} from './fixtures';
import { renderActiveRunTrackerSurface } from './surfaces/activeRunTracker';
import { renderAmbientTileSurface } from './surfaces/ambientTile';
import { renderSnapshotCardSurface } from './surfaces/snapshotCard';

type ProofSurfaceKind = 'snapshot-card' | 'active-run-tracker' | 'ambient-tile';
type ProofSurfaceSelection = ProofSurfaceKind | 'all';
type ProofSurfaceSkin = 'ios' | 'android';
type ProofSurfaceModeSelection = RunProjectionPrivacy | 'all';

interface ProofSurfaceRouteState {
  surface: ProofSurfaceSelection;
  fixture: RunProjectionState;
  skin: ProofSurfaceSkin;
  modes: RunProjectionPrivacy[];
  pathname: string;
  search: string;
  href: string;
}

interface ProofSurfaceDiagnostics extends ProofSurfaceRouteState {
  ready: boolean;
  renderedSurfaceCount: number;
}

interface ProofSurfaceApi extends ProofSurfaceDiagnostics {
  getDiagnostics: () => ProofSurfaceDiagnostics;
}

declare global {
  interface Window {
    __MAZER_PROOF_SURFACES__?: ProofSurfaceApi;
  }
}

const root = document.querySelector<HTMLDivElement>('#proof-surfaces-root');
if (!root) {
  throw new Error('Expected #proof-surfaces-root to exist.');
}

const PROOF_SURFACE_ORDER: readonly ProofSurfaceKind[] = [
  'snapshot-card',
  'active-run-tracker',
  'ambient-tile'
];

const PROOF_SURFACE_LABELS: Record<ProofSurfaceKind, string> = {
  'snapshot-card': 'Snapshot Card',
  'active-run-tracker': 'Active-Run Tracker',
  'ambient-tile': 'Ambient Tile'
};

const PROOF_MODE_ORDER: readonly RunProjectionPrivacy[] = ['full', 'compact', 'private'];

const resolveSurfaceSelection = (value: string | null): ProofSurfaceSelection => (
  value === 'snapshot-card' || value === 'active-run-tracker' || value === 'ambient-tile' || value === 'all'
    ? value
    : 'all'
);

const resolveSkin = (value: string | null): ProofSurfaceSkin => (
  value === 'android' ? 'android' : 'ios'
);

const resolveModeSelection = (value: string | null): ProofSurfaceModeSelection => (
  value === 'full' || value === 'compact' || value === 'private' || value === 'all'
    ? value
    : 'all'
);

const resolveModes = (selection: ProofSurfaceModeSelection): RunProjectionPrivacy[] => (
  selection === 'all' ? [...PROOF_MODE_ORDER] : [selection]
);

const describeState = (state: ProofSurfaceRouteState): string => [
  state.surface === 'all' ? 'Surface pack' : PROOF_SURFACE_LABELS[state.surface],
  resolveProofSurfaceFixtureLabel(state.fixture),
  state.skin === 'ios' ? 'iOS-like skin' : 'Android-like skin'
].join(' / ');

const extractSurfaceHtml = (rendered: string | { html: string }): string => (
  typeof rendered === 'string' ? rendered : rendered.html
);

const renderSurfaceMarkup = (
  surface: ProofSurfaceKind,
  mode: RunProjectionPrivacy,
  fixture: RunProjectionState
): string => {
  const input = resolveProofSurfaceFixtureInput(fixture);

  if (surface === 'snapshot-card') {
    return extractSurfaceHtml(renderSnapshotCardSurface(createSnapshotCardProjection(input, mode) as SnapshotCardProjection));
  }

  if (surface === 'active-run-tracker') {
    return extractSurfaceHtml(renderActiveRunTrackerSurface(createActiveRunTrackerProjection(input, mode) as ActiveRunTrackerProjection));
  }

  return extractSurfaceHtml(renderAmbientTileSurface(createAmbientTileProjection(input, mode) as AmbientTileProjection));
};

const renderSurfacePanel = (
  surface: ProofSurfaceKind,
  routeState: ProofSurfaceRouteState
): string => `
  <section class="proof-surface-panel" data-surface="${surface}" data-testid="proof-surface-panel-${surface}">
    <header class="proof-surface-panel__header">
      <div>
        <p class="proof-surface-panel__eyebrow">Reduced projection surface</p>
        <h2>${PROOF_SURFACE_LABELS[surface]}</h2>
      </div>
      <div class="proof-surface-panel__meta">
        <span>${resolveProofSurfaceFixtureLabel(routeState.fixture)}</span>
        <span>${routeState.skin === 'ios' ? 'iOS-like' : 'Android-like'}</span>
      </div>
    </header>
    <div class="proof-surface-panel__gallery">
      ${routeState.modes.map((mode) => `
        <article
          class="proof-device-frame"
          data-surface="${surface}"
          data-mode="${mode}"
          data-skin="${routeState.skin}"
          data-testid="proof-device-${surface}-${mode}"
        >
          <div class="proof-device-frame__chrome">
            <span class="proof-device-frame__label">${mode}</span>
            <span class="proof-device-frame__fixture">${routeState.fixture}</span>
          </div>
          <div class="proof-device-frame__screen">
            ${renderSurfaceMarkup(surface, mode, routeState.fixture)}
          </div>
        </article>
      `).join('')}
    </div>
  </section>
`;

const buildRouteState = (): ProofSurfaceRouteState => {
  const params = new URLSearchParams(window.location.search);
  const surface = resolveSurfaceSelection(params.get('surface'));
  const fixture = resolveProofSurfaceFixture(params.get('fixture'));
  const skin = resolveSkin(params.get('skin'));
  const modes = resolveModes(resolveModeSelection(params.get('mode')));

  return {
    surface,
    fixture,
    skin,
    modes,
    pathname: window.location.pathname,
    search: window.location.search,
    href: window.location.href
  };
};

const renderApp = (): ProofSurfaceDiagnostics => {
  const routeState = buildRouteState();
  const surfaces = routeState.surface === 'all'
    ? [...PROOF_SURFACE_ORDER]
    : [routeState.surface];

  root.innerHTML = `
    <main class="proof-surface-app" data-skin="${routeState.skin}">
      <header class="proof-surface-app__header">
        <div>
          <p class="proof-surface-app__eyebrow">Wave 5B proof surfaces</p>
          <h1>${routeState.surface === 'all' ? 'Reduced Projection Surface Pack' : PROOF_SURFACE_LABELS[routeState.surface]}</h1>
          <p class="proof-surface-app__subtitle">${describeState(routeState)}</p>
        </div>
        <div class="proof-surface-app__route">
          <span data-testid="proof-route-fixture">${routeState.fixture}</span>
          <span data-testid="proof-route-skin">${routeState.skin}</span>
          <span data-testid="proof-route-modes">${routeState.modes.join(', ')}</span>
        </div>
      </header>
      <nav class="proof-surface-app__fixtures" aria-label="Available lifecycle fixtures">
        ${PROOF_SURFACE_FIXTURE_ORDER.map((fixture) => `
          <span class="proof-fixture-chip" data-active="${fixture === routeState.fixture}">${resolveProofSurfaceFixtureLabel(fixture)}</span>
        `).join('')}
      </nav>
      <section class="proof-surface-app__grid" data-testid="proof-surface-grid">
        ${surfaces.map((surface) => renderSurfacePanel(surface, routeState)).join('')}
      </section>
    </main>
  `;

  return {
    ...routeState,
    ready: true,
    renderedSurfaceCount: surfaces.length
  };
};

const diagnostics = renderApp();

window.__MAZER_PROOF_SURFACES__ = {
  ...diagnostics,
  getDiagnostics: () => ({
    ...buildRouteState(),
    ready: true,
    renderedSurfaceCount: document.querySelectorAll('[data-testid^="proof-surface-panel-"]').length
  })
};
