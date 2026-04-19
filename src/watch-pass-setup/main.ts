import '../proof-surfaces/styles.css';
import './styles.css';
import {
  createActiveRunTrackerProjection,
  createAmbientTileProjection,
  createSnapshotCardProjection
} from '../projections/surfaceAdapters.ts';
import type { RunProjectionInput, RunProjectionPrivacy } from '../projections/runProjection.ts';
import {
  buildExperimentSelection,
  buildTelemetryReceipt,
  type TelemetryEvent,
  type TelemetryEventKind
} from '../telemetry/index.ts';
import { resolveProofSurfaceFixtureInput } from '../proof-surfaces/fixtures.ts';
import { renderActiveRunTrackerSurface } from '../proof-surfaces/surfaces/activeRunTracker.ts';
import { renderAmbientTileSurface } from '../proof-surfaces/surfaces/ambientTile.ts';
import { renderSnapshotCardSurface } from '../proof-surfaces/surfaces/snapshotCard.ts';
import {
  DEFAULT_WATCH_PASS_PREFERENCES,
  mergeWatchPassPreferences,
  readWatchPassPreferences,
  resolveWatchPassPreferencesFromSearch,
  writeWatchPassPreferences,
  type WatchPassPacingPreset,
  type WatchPassPlatformFrame,
  type WatchPassPreferences
} from '../settings/preferences.ts';

type WatchPassSetupSurfaceId = 'snapshot-card' | 'active-run-tracker' | 'ambient-tile';

interface WatchPassSetupSurfaceDefinition {
  id: WatchPassSetupSurfaceId;
  title: string;
  subtitle: string;
  surface: 'snapshot-card' | 'active-run-tracker' | 'ambient-tile';
  fixture: 'watching' | 'building' | 'waiting';
  eventKind: 'widget_configured' | 'live_activity_started';
  actionLabel: string;
}

interface WatchPassSetupDiagnostics {
  ready: boolean;
  surface: 'watch-pass-setup';
  fixture: string;
  skin: 'ios' | 'android';
  activeSurfaceId: WatchPassSetupSurfaceId;
  modes: RunProjectionPrivacy[];
  preferences: WatchPassPreferences;
  events: readonly TelemetryEvent[];
  eventCounts: Record<string, number>;
  renderedSurfaceCount: number;
  receipt: ReturnType<typeof buildTelemetryReceipt>;
}

interface WatchPassSetupApi extends WatchPassSetupDiagnostics {
  getDiagnostics: () => WatchPassSetupDiagnostics;
}

const root = document.querySelector<HTMLDivElement>('#watch-pass-setup-root');
if (!root) {
  throw new Error('Expected #watch-pass-setup-root to exist.');
}

const RUN_ID = 'watch-pass-setup-session';
const PLATFORM_LABEL_BY_FRAME: Record<WatchPassPlatformFrame, string> = {
  'ios-like': 'iOS-like framing',
  'android-like': 'Android-like framing'
};
const PLATFORM_SKIN_BY_FRAME: Record<WatchPassPlatformFrame, 'ios' | 'android'> = {
  'ios-like': 'ios',
  'android-like': 'android'
};
const PACING_LABEL_BY_PRESET: Record<WatchPassPacingPreset, string> = {
  calm: 'calm pacing',
  balanced: 'balanced pacing',
  brisk: 'brisk pacing'
};
const SETUP_SURFACES: readonly WatchPassSetupSurfaceDefinition[] = [
  {
    id: 'snapshot-card',
    title: 'Snapshot Card',
    subtitle: 'A reduced lock-screen surface that stays legible when the app is not open.',
    surface: 'snapshot-card',
    fixture: 'watching',
    eventKind: 'widget_configured',
    actionLabel: 'Use snapshot card'
  },
  {
    id: 'active-run-tracker',
    title: 'Active-Run Tracker',
    subtitle: 'A live-activity shaped shell that keeps the run visible without adding app chrome.',
    surface: 'active-run-tracker',
    fixture: 'building',
    eventKind: 'live_activity_started',
    actionLabel: 'Use active tracker'
  },
  {
    id: 'ambient-tile',
    title: 'Ambient Tile',
    subtitle: 'A calm widget-style tile for glanceable progress and low-friction return trips.',
    surface: 'ambient-tile',
    fixture: 'waiting',
    eventKind: 'widget_configured',
    actionLabel: 'Use ambient tile'
  }
] as const;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const round = (value: number): number => Math.round(value * 10) / 10;

const escapeHtml = (value: string): string => (
  value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
);

const resolveSurfaceById = (surfaceId: string | null | undefined): WatchPassSetupSurfaceDefinition => (
  SETUP_SURFACES.find((candidate) => candidate.id === surfaceId) ?? SETUP_SURFACES[0]
);

const resolveInitialSurface = (params: URLSearchParams): WatchPassSetupSurfaceDefinition => {
  const surface = params.get('surface');
  return resolveSurfaceById(surface);
};

const resolveExperiment = (value: WatchPassPreferences) => buildExperimentSelection({
  pacing: value.pacingPreset === 'calm'
    ? '0.7x'
    : value.pacingPreset === 'brisk'
      ? '1.0x'
      : '0.8x',
  thoughtDensity: value.thoughtDensity
});

const describePreferences = (preferences: WatchPassPreferences): string => [
  PLATFORM_LABEL_BY_FRAME[preferences.platformFrame],
  preferences.privacyMode,
  preferences.reducedMotion ? 'reduced motion' : 'ambient motion',
  preferences.thoughtDensity,
  PACING_LABEL_BY_PRESET[preferences.pacingPreset]
].join(' / ');

const eventCountsFromEvents = (events: readonly TelemetryEvent[]): Record<string, number> => (
  events.reduce<Record<string, number>>((counts, event) => {
    counts[event.kind] = (counts[event.kind] ?? 0) + 1;
    return counts;
  }, {})
);

const tuneThought = (
  source: RunProjectionInput,
  preferences: WatchPassPreferences,
  surface: WatchPassSetupSurfaceDefinition
): string => {
  const base = source.compactThought ?? 'Keeping the chosen setup readable from the first glance.';
  if (preferences.thoughtDensity === 'sparse') {
    return `${base.split(/[.!?]/u)[0] ?? base}`.trim();
  }

  const surfaceLine = surface.id === 'active-run-tracker'
    ? 'The live-activity framing keeps the run visible without a mini-app shell.'
    : surface.id === 'ambient-tile'
      ? 'The widget tile stays quiet, compact, and easy to trust at a glance.'
      : 'The lock-screen card stays compact and readable in the reduced surface.';

  return `${base} ${surfaceLine}`;
};

const tuneFailReason = (
  source: RunProjectionInput,
  preferences: WatchPassPreferences
): string | undefined => {
  if (!source.failReason) {
    return undefined;
  }

  return preferences.thoughtDensity === 'richer'
    ? `${source.failReason} The setup shell keeps the reduced surface honest.`
    : source.failReason;
};

const tuneRiskLevel = (
  riskLevel: RunProjectionInput['riskLevel'],
  preset: WatchPassPacingPreset
): RunProjectionInput['riskLevel'] => {
  const order = ['low', 'medium', 'high', 'critical'] as const;
  const index = order.indexOf(riskLevel);
  if (index < 0) {
    return 'medium';
  }

  if (preset === 'calm') {
    return order[Math.max(0, index - 1)];
  }

  if (preset === 'brisk') {
    return order[Math.min(order.length - 1, index + 1)];
  }

  return riskLevel;
};

const tuneProjectionInput = (
  surface: WatchPassSetupSurfaceDefinition,
  preferences: WatchPassPreferences
): RunProjectionInput => {
  const source = resolveProofSurfaceFixtureInput(surface.fixture);
  const pacing = preferences.pacingPreset === 'calm'
    ? { elapsedScale: 1.12, progressDelta: -8 }
    : preferences.pacingPreset === 'brisk'
      ? { elapsedScale: 0.88, progressDelta: 10 }
      : { elapsedScale: 1, progressDelta: 0 };

  return {
    ...source,
    elapsedMs: Math.max(1_500, Math.round(source.elapsedMs * pacing.elapsedScale)),
    progressPct: round(clamp(source.progressPct + pacing.progressDelta, 0, 100)),
    compactThought: tuneThought(source, preferences, surface),
    failReason: tuneFailReason(source, preferences),
    riskLevel: tuneRiskLevel(source.riskLevel, preferences.pacingPreset),
    updatedAt: new Date().toISOString()
  };
};

const renderSurfaceProjection = (
  surface: WatchPassSetupSurfaceDefinition,
  preferences: WatchPassPreferences
): string => {
  const input = tuneProjectionInput(surface, preferences);

  if (surface.surface === 'snapshot-card') {
    return renderSnapshotCardSurface(createSnapshotCardProjection(input, preferences.privacyMode));
  }

  if (surface.surface === 'ambient-tile') {
    return renderAmbientTileSurface(createAmbientTileProjection(input, preferences.privacyMode)).html;
  }

  return renderActiveRunTrackerSurface(createActiveRunTrackerProjection(input, preferences.privacyMode));
};

const renderSurfaceCard = (
  surface: WatchPassSetupSurfaceDefinition,
  preferences: WatchPassPreferences,
  activeSurfaceId: WatchPassSetupSurfaceId
): string => {
  const selected = surface.id === activeSurfaceId;
  const skin = PLATFORM_SKIN_BY_FRAME[preferences.platformFrame];
  return `
    <article class="watch-pass-setup__surface-card" data-surface="${surface.id}" data-active="${selected}">
      <header class="watch-pass-setup__surface-header">
        <div>
          <p class="watch-pass-setup__surface-eyebrow">${surface.eventKind}</p>
          <h3>${escapeHtml(surface.title)}</h3>
          <p>${escapeHtml(surface.subtitle)}</p>
        </div>
        <button type="button" class="watch-pass-setup__surface-action" data-action="select-surface" data-surface="${surface.id}">
          ${escapeHtml(surface.actionLabel)}
        </button>
      </header>
      <div class="proof-device-frame watch-pass-setup__device" data-skin="${skin}">
        <div class="proof-device-frame__chrome">
          <span>${escapeHtml(PLATFORM_LABEL_BY_FRAME[preferences.platformFrame])}</span>
          <span>${escapeHtml(preferences.privacyMode)}</span>
        </div>
        <div class="proof-device-frame__screen">
          ${renderSurfaceProjection(surface, preferences)}
        </div>
      </div>
      <footer class="watch-pass-setup__surface-footer">
        <span>${escapeHtml(surface.id === activeSurfaceId ? 'Selected setup' : 'Ready to preview')}</span>
        <span>${escapeHtml(describePreferences(preferences))}</span>
      </footer>
    </article>
  `;
};

const buildReceipt = (preferences: WatchPassPreferences, events: readonly TelemetryEvent[]) => {
  const experiment = resolveExperiment(preferences);
  return buildTelemetryReceipt({
    kind: 'edge-live',
    label: 'watch-pass-setup',
    runId: RUN_ID,
    toggles: {
      pacing: experiment.toggles.pacing,
      thoughtDensity: experiment.toggles.thoughtDensity,
      failCardTiming: experiment.toggles.failCardTiming,
      memoryBeat: experiment.toggles.memoryBeat,
      trapTelegraph: experiment.toggles.trapTelegraph
    },
    privacyMode: preferences.privacyMode,
    events,
    sessionCount: 1
  });
};

let preferences = mergeWatchPassPreferences(
  readWatchPassPreferences(window.localStorage),
  resolveWatchPassPreferencesFromSearch(window.location.search)
);
let activeSurface = resolveInitialSurface(new URLSearchParams(window.location.search));
let eventSequence = 0;
let events: TelemetryEvent[] = [];
const surfaceSignalsSeen = new Set<string>();

const recordEvent = <K extends TelemetryEventKind>(
  kind: K,
  payload: TelemetryEvent<K>['payload']
): void => {
  const experiment = resolveExperiment(preferences);
  events = [
    ...events,
    {
      eventId: `watch-pass-setup-${String(++eventSequence).padStart(4, '0')}`,
      kind,
      runId: RUN_ID,
      elapsedMs: eventSequence * 1000,
      createdAt: new Date().toISOString(),
      experimentId: experiment.variantId,
      privacyMode: preferences.privacyMode,
      payload
    }
  ].slice(-128);
};

const emitSettingsChanged = (
  previousValue: WatchPassPreferences,
  nextValue: WatchPassPreferences,
  isInitial = false
): void => {
  const pairs: Array<[keyof WatchPassPreferences, unknown, unknown]> = [
    ['platformFrame', previousValue.platformFrame, nextValue.platformFrame],
    ['privacyMode', previousValue.privacyMode, nextValue.privacyMode],
    ['reducedMotion', previousValue.reducedMotion, nextValue.reducedMotion],
    ['thoughtDensity', previousValue.thoughtDensity, nextValue.thoughtDensity],
    ['pacingPreset', previousValue.pacingPreset, nextValue.pacingPreset],
    ['selectedPlanId', previousValue.selectedPlanId, nextValue.selectedPlanId],
    ['mockEntitled', previousValue.mockEntitled, nextValue.mockEntitled]
  ];

  for (const [setting, previous, next] of pairs) {
    if (!isInitial && previous === next) {
      continue;
    }

    recordEvent('settings_changed', {
      setting: setting === 'privacyMode'
        ? 'privacy_mode'
        : setting === 'reducedMotion'
          ? 'reduced_motion'
          : setting === 'platformFrame'
            ? 'platform_frame'
            : setting === 'selectedPlanId'
              ? 'selected_plan_id'
              : setting === 'mockEntitled'
                ? 'mock_entitled'
                : setting,
      previousValue: isInitial ? undefined : previous,
      nextValue: next,
      surface: 'watch-pass-setup',
      placement: 'setup-shell'
    });
  }
};

const emitSurfaceSignal = (surface: WatchPassSetupSurfaceDefinition): void => {
  const signalKey = [
    surface.id,
    preferences.platformFrame,
    preferences.privacyMode,
    preferences.reducedMotion,
    preferences.thoughtDensity,
    preferences.pacingPreset
  ].join(':');

  if (surfaceSignalsSeen.has(signalKey)) {
    return;
  }

  surfaceSignalsSeen.add(signalKey);
  recordEvent(surface.eventKind, {
    surface: 'watch-pass-setup',
    placement: 'setup-shell'
  });
};

const buildDiagnostics = (): WatchPassSetupDiagnostics => ({
  ready: true,
  surface: 'watch-pass-setup',
  fixture: activeSurface.fixture,
  skin: PLATFORM_SKIN_BY_FRAME[preferences.platformFrame],
  activeSurfaceId: activeSurface.id,
  modes: [preferences.privacyMode],
  preferences,
  events,
  eventCounts: eventCountsFromEvents(events),
  renderedSurfaceCount: SETUP_SURFACES.length,
  receipt: buildReceipt(preferences, events)
});

const render = (): void => {
  const receipt = buildReceipt(preferences, events);
  const eventCounts = eventCountsFromEvents(events);
  root.dataset.motion = preferences.reducedMotion ? 'reduced' : 'full';
  root.innerHTML = `
    <main class="watch-pass-setup" data-frame="${preferences.platformFrame}" data-privacy="${preferences.privacyMode}">
      <section class="watch-pass-setup__hero">
        <div class="watch-pass-setup__copy">
          <p class="watch-pass-setup__eyebrow">Post-purchase setup shell</p>
          <h1>Watch Pass setup</h1>
          <p class="watch-pass-setup__lede">
            Configure the reduced surfaces first, keep the preview local, and reflect every choice immediately in the same projection path.
          </p>
          <div class="watch-pass-setup__chips">
            <span>${escapeHtml(PLATFORM_LABEL_BY_FRAME[preferences.platformFrame])}</span>
            <span>${escapeHtml(describePreferences(preferences))}</span>
            <span>${escapeHtml(activeSurface.title)}</span>
          </div>
        </div>
        <aside class="watch-pass-setup__summary">
          <p class="watch-pass-setup__summary-label">Current setup</p>
          <h2>${escapeHtml(activeSurface.title)}</h2>
          <p>${escapeHtml(activeSurface.subtitle)}</p>
          <button type="button" class="watch-pass-setup__surface-action" data-action="select-surface" data-surface="${activeSurface.id}">
            ${escapeHtml(activeSurface.actionLabel)}
          </button>
          <p class="watch-pass-setup__summary-note">All telemetry stays local-first. No store SDK or renderer-specific plumbing is involved.</p>
        </aside>
      </section>

      <section class="watch-pass-setup__layout">
        <section class="watch-pass-setup__stage">
          <header class="watch-pass-setup__section-header">
            <div>
              <p class="watch-pass-setup__section-eyebrow">Surface setup</p>
              <h2>Preview the reduced surfaces</h2>
              <p>Choose a surface step, then adjust framing, privacy, motion, density, and pacing on the right.</p>
            </div>
          </header>
          <div class="watch-pass-setup__surface-grid">
            ${SETUP_SURFACES.map((surface) => renderSurfaceCard(surface, preferences, activeSurface.id)).join('')}
          </div>
        </section>

        <aside class="watch-pass-setup__settings">
          <section class="watch-pass-setup__panel">
            <header class="watch-pass-setup__section-header">
              <div>
                <p class="watch-pass-setup__section-eyebrow">Local controls</p>
                <h2>Setup preferences</h2>
              </div>
            </header>
            <form class="watch-pass-setup__form">
              <label>
                <span>Platform framing</span>
                <select name="platformFrame">
                  ${['ios-like', 'android-like'].map((frame) => `
                    <option value="${frame}" ${preferences.platformFrame === frame ? 'selected' : ''}>${frame}</option>
                  `).join('')}
                </select>
              </label>
              <label>
                <span>Privacy mode</span>
                <select name="privacyMode">
                  ${['full', 'compact', 'private'].map((mode) => `
                    <option value="${mode}" ${preferences.privacyMode === mode ? 'selected' : ''}>${mode}</option>
                  `).join('')}
                </select>
              </label>
              <label class="watch-pass-setup__toggle">
                <span>Reduced motion</span>
                <input type="checkbox" name="reducedMotion" ${preferences.reducedMotion ? 'checked' : ''} />
              </label>
              <label>
                <span>Thought density</span>
                <select name="thoughtDensity">
                  ${['sparse', 'richer'].map((mode) => `
                    <option value="${mode}" ${preferences.thoughtDensity === mode ? 'selected' : ''}>${mode}</option>
                  `).join('')}
                </select>
              </label>
              <label>
                <span>Pacing preset</span>
                <select name="pacingPreset">
                  ${['calm', 'balanced', 'brisk'].map((mode) => `
                    <option value="${mode}" ${preferences.pacingPreset === mode ? 'selected' : ''}>${mode}</option>
                  `).join('')}
                </select>
              </label>
            </form>
          </section>

          <section class="watch-pass-setup__panel">
            <header class="watch-pass-setup__section-header">
              <div>
                <p class="watch-pass-setup__section-eyebrow">Local receipt</p>
                <h2>Setup KPI snapshot</h2>
              </div>
            </header>
            <dl class="watch-pass-setup__kpis">
              <div><dt>Events</dt><dd>${receipt.eventCount}</dd></div>
              <div><dt>Widget attach</dt><dd>${receipt.kpis.widgetAttachRate}</dd></div>
              <div><dt>Live activity</dt><dd>${receipt.kpis.liveActivityStartRate}</dd></div>
              <div><dt>Reduced motion</dt><dd>${receipt.kpis.reducedMotionAdoptionRate}</dd></div>
              <div><dt>Private mode</dt><dd>${receipt.kpis.privateModeAdoptionRate}</dd></div>
              <div><dt>Settings changes</dt><dd>${eventCounts.settings_changed ?? 0}</dd></div>
            </dl>
            <p class="watch-pass-setup__event-summary">
              ${Object.entries(eventCounts).map(([kind, count]) => `${kind} ${count}`).join(' / ') || 'No events yet.'}
            </p>
          </section>
        </aside>
      </section>
    </main>
  `;

  const api: WatchPassSetupApi = {
    ...buildDiagnostics(),
    getDiagnostics: () => buildDiagnostics()
  };
  (window as unknown as Record<string, unknown>).__MAZER_PROOF_SURFACES__ = api;
};

const selectSurface = (surfaceId: WatchPassSetupSurfaceId): void => {
  activeSurface = resolveSurfaceById(surfaceId);
  emitSurfaceSignal(activeSurface);
  render();
};

const applyPreferences = (nextValue: Partial<WatchPassPreferences>): void => {
  const previous = preferences;
  preferences = writeWatchPassPreferences(
    window.localStorage,
    mergeWatchPassPreferences(preferences, nextValue)
  );
  emitSettingsChanged(previous, preferences);
  emitSurfaceSignal(activeSurface);
  render();
};

root.addEventListener('click', (event) => {
  const target = event.target instanceof HTMLElement
    ? event.target.closest<HTMLElement>('[data-action],[data-surface]')
    : null;
  if (!target) {
    return;
  }

  const surfaceId = target.dataset.surface as WatchPassSetupSurfaceId | undefined;
  if (surfaceId && target.dataset.action === 'select-surface') {
    selectSurface(surfaceId);
  }
});

root.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
    return;
  }

  if (target.name === 'platformFrame') {
    applyPreferences({ platformFrame: target.value as WatchPassPlatformFrame });
    return;
  }

  if (target.name === 'privacyMode') {
    applyPreferences({ privacyMode: target.value as RunProjectionPrivacy });
    return;
  }

  if (target.name === 'reducedMotion' && target instanceof HTMLInputElement) {
    applyPreferences({ reducedMotion: target.checked });
    return;
  }

  if (target.name === 'thoughtDensity') {
    applyPreferences({ thoughtDensity: target.value as WatchPassPreferences['thoughtDensity'] });
    return;
  }

  if (target.name === 'pacingPreset') {
    applyPreferences({ pacingPreset: target.value as WatchPassPreferences['pacingPreset'] });
  }
});

emitSettingsChanged(DEFAULT_WATCH_PASS_PREFERENCES, preferences, true);
emitSurfaceSignal(activeSurface);
render();
