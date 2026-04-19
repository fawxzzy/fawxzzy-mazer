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
  type WatchPassPlanId,
  type WatchPassPreferences
} from '../settings/preferences.ts';

type WatchPassPaywallSurfaceId = 'snapshot-card' | 'active-run-tracker' | 'ambient-tile';
type WatchPassPlatform = 'ios' | 'android';
type PaywallEntryPoint = 'watch-pass-preview' | 'settings-shell' | 'unknown';

interface WatchPassPaywallSurfaceDefinition {
  id: WatchPassPaywallSurfaceId;
  title: string;
  subtitle: string;
  surface: WatchPassPaywallSurfaceId;
  fixture: 'watching' | 'building' | 'waiting';
  platform: WatchPassPlatform;
}

interface WatchPassPaywallDiagnostics {
  ready: boolean;
  surface: 'watch-pass-paywall';
  fixture: string;
  skin: WatchPassPlatform;
  activeSurfaceId: WatchPassPaywallSurfaceId;
  modes: RunProjectionPrivacy[];
  preferences: WatchPassPreferences;
  events: readonly TelemetryEvent[];
  eventCounts: Record<string, number>;
  renderedSurfaceCount: number;
  receipt: ReturnType<typeof buildTelemetryReceipt>;
}

interface WatchPassPaywallApi extends WatchPassPaywallDiagnostics {
  getDiagnostics: () => WatchPassPaywallDiagnostics;
}

const root = document.querySelector<HTMLDivElement>('#watch-pass-paywall-root');
if (!root) {
  throw new Error('Expected #watch-pass-paywall-root to exist.');
}

const RUN_ID = 'watch-pass-paywall-session';
const CTA_LABEL = 'Watch Pass preview';
const DEVICE_LABEL_BY_PLATFORM: Record<WatchPassPlatform, string> = {
  ios: 'iOS-style surface',
  android: 'Android-style surface'
};
const PLAN_COPY: Record<WatchPassPlanId, { title: string; detail: string; emphasis: 'regular' | 'emphasized'; cta: string }> = {
  monthly: {
    title: 'Monthly',
    detail: 'Try Watch Pass with a lighter commitment.',
    emphasis: 'regular',
    cta: 'Choose monthly'
  },
  yearly: {
    title: 'Yearly',
    detail: 'Best value when the reduced surfaces become part of the routine.',
    emphasis: 'emphasized',
    cta: 'Choose yearly'
  },
  'not-now': {
    title: 'Not now',
    detail: 'Keep watching a few more runs before committing.',
    emphasis: 'regular',
    cta: 'Not now'
  }
};
const PACING_LABEL_BY_PRESET: Record<WatchPassPacingPreset, string> = {
  calm: 'calm pacing',
  balanced: 'balanced pacing',
  brisk: 'brisk pacing'
};
const RISK_LEVEL_ORDER = ['low', 'medium', 'high', 'critical'] as const;
const SURFACES: readonly WatchPassPaywallSurfaceDefinition[] = [
  {
    id: 'snapshot-card',
    title: 'Snapshot Card',
    subtitle: 'Lock-screen glance value without a mini-app shell.',
    surface: 'snapshot-card',
    fixture: 'watching',
    platform: 'ios'
  },
  {
    id: 'active-run-tracker',
    title: 'Active-Run Tracker',
    subtitle: 'Live-activity framing from the same reduced projections.',
    surface: 'active-run-tracker',
    fixture: 'building',
    platform: 'ios'
  },
  {
    id: 'ambient-tile',
    title: 'Ambient Tile',
    subtitle: 'Android-style widget value kept quiet and compact.',
    surface: 'ambient-tile',
    fixture: 'waiting',
    platform: 'android'
  }
];

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

const resolveSurfaceById = (surfaceId: string | null | undefined): WatchPassPaywallSurfaceDefinition => (
  SURFACES.find((candidate) => candidate.id === surfaceId) ?? SURFACES[0]
);

const resolveEntryPoint = (value: string | null): PaywallEntryPoint => (
  value === 'watch-pass-preview' || value === 'settings-shell' ? value : 'unknown'
);

const describePreferences = (preferences: WatchPassPreferences): string => [
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

const resolveExperiment = (value: WatchPassPreferences) => buildExperimentSelection({
  pacing: value.pacingPreset === 'calm'
    ? '0.7x'
    : value.pacingPreset === 'brisk'
      ? '1.0x'
      : '0.8x',
  thoughtDensity: value.thoughtDensity
});

const tuneThought = (
  source: RunProjectionInput,
  preferences: WatchPassPreferences,
  surface: WatchPassPaywallSurfaceDefinition
): string => {
  const base = source.compactThought ?? 'Reduced value stays legible after the fail and retry moment.';
  if (preferences.thoughtDensity === 'sparse') {
    return `${base.split(/[.!?]/u)[0] ?? base}`.trim();
  }

  return `${base} ${surface.platform === 'ios'
    ? 'The shell previews lock-screen and live-activity value before setup.'
    : 'The shell previews a calm Android-style tile before any native widget work.'}`;
};

const tuneRiskLevel = (
  riskLevel: RunProjectionInput['riskLevel'],
  preset: WatchPassPacingPreset
): RunProjectionInput['riskLevel'] => {
  const index = RISK_LEVEL_ORDER.indexOf(riskLevel);
  if (index < 0) {
    return 'medium';
  }

  if (preset === 'calm') {
    return RISK_LEVEL_ORDER[Math.max(0, index - 1)];
  }

  if (preset === 'brisk') {
    return RISK_LEVEL_ORDER[Math.min(RISK_LEVEL_ORDER.length - 1, index + 1)];
  }

  return riskLevel;
};

const tuneProjectionInput = (
  surface: WatchPassPaywallSurfaceDefinition,
  preferences: WatchPassPreferences
): RunProjectionInput => {
  const source = resolveProofSurfaceFixtureInput(surface.fixture);
  const pacing = preferences.pacingPreset === 'calm'
    ? { elapsedScale: 1.14, progressDelta: -7 }
    : preferences.pacingPreset === 'brisk'
      ? { elapsedScale: 0.88, progressDelta: 9 }
      : { elapsedScale: 1, progressDelta: 0 };

  return {
    ...source,
    elapsedMs: Math.max(1_500, Math.round(source.elapsedMs * pacing.elapsedScale)),
    progressPct: round(clamp(source.progressPct + pacing.progressDelta, 0, 100)),
    compactThought: tuneThought(source, preferences, surface),
    riskLevel: tuneRiskLevel(source.riskLevel, preferences.pacingPreset),
    updatedAt: new Date().toISOString()
  };
};

const renderSurface = (
  surface: WatchPassPaywallSurfaceDefinition,
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

const buildWatchPassUrl = (pathname: string, params: Record<string, string | boolean | null | undefined>): string => {
  const url = new URL(pathname, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') {
      continue;
    }
    url.searchParams.set(key, typeof value === 'boolean' ? String(value) : value);
  }
  return url.toString();
};

const entryParams = new URLSearchParams(window.location.search);
const entryPoint = resolveEntryPoint(entryParams.get('entryPoint'));
const sourceCta = entryParams.get('sourceCta')?.trim() || CTA_LABEL;
let preferences = writeWatchPassPreferences(
  window.localStorage,
  mergeWatchPassPreferences(
    readWatchPassPreferences(window.localStorage),
    resolveWatchPassPreferencesFromSearch(window.location.search)
  )
);
let activeSurface = resolveSurfaceById(entryParams.get('surface'));
let eventSequence = 0;
let events: TelemetryEvent[] = [];
const seenPlanSelections = new Set<WatchPassPlanId>();

const recordEvent = <K extends TelemetryEventKind>(
  kind: K,
  payload: TelemetryEvent<K>['payload']
): void => {
  const experiment = resolveExperiment(preferences);
  events = [
    ...events,
    {
      eventId: `watch-pass-paywall-${String(++eventSequence).padStart(4, '0')}`,
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
    ['selectedPlanId', previousValue.selectedPlanId, nextValue.selectedPlanId],
    ['mockEntitled', previousValue.mockEntitled, nextValue.mockEntitled]
  ];

  for (const [setting, previous, next] of pairs) {
    if (!isInitial && previous === next) {
      continue;
    }

    recordEvent('settings_changed', {
      setting: setting === 'platformFrame'
        ? 'platform_frame'
        : setting === 'selectedPlanId'
          ? 'selected_plan_id'
          : 'mock_entitled',
      previousValue: isInitial ? undefined : previous,
      nextValue: next
    });
  }
};

const selectPlan = (planId: WatchPassPlanId): void => {
  const previous = preferences;
  preferences = writeWatchPassPreferences(
    window.localStorage,
    mergeWatchPassPreferences(preferences, { selectedPlanId: planId })
  );
  emitSettingsChanged(previous, preferences);

  if (!seenPlanSelections.has(planId)) {
    seenPlanSelections.add(planId);
    recordEvent('plan_selected', {
      planId,
      sourceCta,
      emphasis: PLAN_COPY[planId].emphasis
    });
  }

  render();
};

const buildReceipt = (): ReturnType<typeof buildTelemetryReceipt> => {
  const experiment = resolveExperiment(preferences);
  return buildTelemetryReceipt({
    kind: 'edge-live',
    label: 'watch-pass-paywall',
    runId: RUN_ID,
    toggles: experiment.toggles,
    privacyMode: preferences.privacyMode,
    events,
    sessionCount: 1
  });
};

const buildDiagnostics = (): WatchPassPaywallDiagnostics => ({
  ready: true,
  surface: 'watch-pass-paywall',
  fixture: activeSurface.fixture,
  skin: activeSurface.platform,
  activeSurfaceId: activeSurface.id,
  modes: [preferences.privacyMode],
  preferences,
  events,
  eventCounts: eventCountsFromEvents(events),
  renderedSurfaceCount: SURFACES.length,
  receipt: buildReceipt()
});

const openSetup = (): void => {
  window.location.assign(buildWatchPassUrl('/watch-pass-setup.html', {
    surface: activeSurface.id,
    platformFrame: preferences.platformFrame,
    privacy: preferences.privacyMode,
    reducedMotion: preferences.reducedMotion,
    thoughtDensity: preferences.thoughtDensity,
    pacingPreset: preferences.pacingPreset,
    selectedPlanId: preferences.selectedPlanId,
    entitled: preferences.mockEntitled
  }));
};

const confirmPurchase = (): void => {
  const selectedPlan = preferences.selectedPlanId ?? 'yearly';
  if (selectedPlan === 'not-now') {
    recordEvent('purchase_churned', {
      sku: 'watch-pass-not-now',
      reason: 'not-now',
      sourceCta
    });
    render();
    return;
  }

  const previous = preferences;
  preferences = writeWatchPassPreferences(
    window.localStorage,
    mergeWatchPassPreferences(preferences, { mockEntitled: true })
  );
  emitSettingsChanged(previous, preferences);
  recordEvent('purchase_completed', {
    sku: `watch-pass-${selectedPlan}`,
    origin: 'preview-placeholder',
    sourceCta
  });
  render();
  openSetup();
};

const emitInitialPlanSelection = (): void => {
  const selectedPlan = preferences.selectedPlanId;
  if (!selectedPlan) {
    return;
  }

  seenPlanSelections.add(selectedPlan);
  recordEvent('plan_selected', {
    planId: selectedPlan,
    sourceCta,
    emphasis: PLAN_COPY[selectedPlan].emphasis
  });
};

const render = (): void => {
  const receipt = buildReceipt();
  const eventCounts = eventCountsFromEvents(events);
  root.innerHTML = `
    <main class="watch-pass-paywall" data-platform="${activeSurface.platform}" data-plan="${preferences.selectedPlanId ?? 'unset'}">
      <section class="watch-pass-paywall__hero">
        <div class="watch-pass-paywall__copy">
          <p class="watch-pass-paywall__eyebrow">Free to premium shell</p>
          <h1>Watch Pass plans</h1>
          <p class="watch-pass-paywall__lede">After a tap or fail-and-retry beat, the value stays reduced: preview the surfaces, choose a plan, and continue into setup without leaving the local shell.</p>
          <div class="watch-pass-paywall__chips">
            <span>${escapeHtml(sourceCta)}</span>
            <span>${escapeHtml(describePreferences(preferences))}</span>
            <span>${escapeHtml(receipt.experimentId)}</span>
          </div>
        </div>
        <aside class="watch-pass-paywall__summary">
          <p class="watch-pass-paywall__summary-label">Entry point</p>
          <h2>${escapeHtml(entryPoint)}</h2>
          <p>${escapeHtml(activeSurface.title)} is active in the proof shell while the plans stay local-first.</p>
          <button type="button" class="watch-pass-paywall__purchase" data-action="confirm-purchase">
            ${preferences.selectedPlanId === 'not-now' ? 'Keep watching for now' : 'Continue to setup'}
          </button>
          <p class="watch-pass-paywall__summary-note">No billing SDK is installed. Purchase is a stubbed entitlement transition only.</p>
        </aside>
      </section>

      <section class="watch-pass-paywall__layout">
        <section class="watch-pass-paywall__stage">
          <header class="watch-pass-paywall__section-header">
            <div>
              <p class="watch-pass-paywall__section-eyebrow">Premium surface carousel</p>
              <h2>${escapeHtml(activeSurface.title)}</h2>
              <p>${escapeHtml(activeSurface.subtitle)}</p>
            </div>
          </header>
          <div class="watch-pass-paywall__surface-grid">
            ${SURFACES.map((surface) => `
              <article class="watch-pass-paywall__surface-card" data-active="${surface.id === activeSurface.id}">
                <header class="watch-pass-paywall__surface-header">
                  <div>
                    <p class="watch-pass-paywall__surface-eyebrow">${escapeHtml(surface.id)}</p>
                    <h3>${escapeHtml(surface.title)}</h3>
                    <p>${escapeHtml(surface.subtitle)}</p>
                  </div>
                  <button type="button" class="watch-pass-paywall__surface-action" data-action="select-surface" data-surface="${surface.id}">
                    Preview
                  </button>
                </header>
                <div class="proof-device-frame" data-skin="${surface.platform}">
                  <div class="proof-device-frame__chrome">
                    <span>${escapeHtml(DEVICE_LABEL_BY_PLATFORM[surface.platform])}</span>
                    <span>${escapeHtml(preferences.privacyMode)}</span>
                  </div>
                  <div class="proof-device-frame__screen">
                    ${renderSurface(surface, preferences)}
                  </div>
                </div>
              </article>
            `).join('')}
          </div>
        </section>

        <aside class="watch-pass-paywall__plans">
          <section class="watch-pass-paywall__panel">
            <header class="watch-pass-paywall__section-header">
              <div>
                <p class="watch-pass-paywall__section-eyebrow">Plan choices</p>
                <h2>Choose the next step</h2>
              </div>
            </header>
            <div class="watch-pass-paywall__plan-list">
              ${(['monthly', 'yearly', 'not-now'] as const).map((planId) => `
                <button
                  type="button"
                  class="watch-pass-paywall__plan-card"
                  data-action="select-plan"
                  data-plan="${planId}"
                  data-active="${preferences.selectedPlanId === planId}"
                  data-emphasis="${PLAN_COPY[planId].emphasis}"
                >
                  <span class="watch-pass-paywall__plan-title">${escapeHtml(PLAN_COPY[planId].title)}</span>
                  <span class="watch-pass-paywall__plan-detail">${escapeHtml(PLAN_COPY[planId].detail)}</span>
                  <span class="watch-pass-paywall__plan-cta">${escapeHtml(PLAN_COPY[planId].cta)}</span>
                </button>
              `).join('')}
            </div>
          </section>

          <section class="watch-pass-paywall__panel">
            <header class="watch-pass-paywall__section-header">
              <div>
                <p class="watch-pass-paywall__section-eyebrow">Receipt snapshot</p>
                <h2>Local funnel metrics</h2>
              </div>
            </header>
            <dl class="watch-pass-paywall__kpis">
              <div><dt>Events</dt><dd>${receipt.eventCount}</dd></div>
              <div><dt>Plan selects</dt><dd>${receipt.kpis.planSelectedCount}</dd></div>
              <div><dt>Plan rate</dt><dd>${receipt.kpis.paywallViewToPlanSelectRate ?? 'n/a'}</dd></div>
              <div><dt>Purchase rate</dt><dd>${receipt.kpis.paywallViewToPurchaseCompletedRate ?? 'n/a'}</dd></div>
              <div><dt>Selected plan</dt><dd>${preferences.selectedPlanId ?? 'unset'}</dd></div>
              <div><dt>Entitled</dt><dd>${preferences.mockEntitled ? 'yes' : 'no'}</dd></div>
            </dl>
            <p class="watch-pass-paywall__event-summary">
              ${Object.entries(eventCounts).map(([kind, count]) => `${kind} ${count}`).join(' / ') || 'No events yet.'}
            </p>
          </section>
        </aside>
      </section>
    </main>
  `;

  const api: WatchPassPaywallApi = {
    ...buildDiagnostics(),
    getDiagnostics: () => buildDiagnostics()
  };
  (window as unknown as Record<string, unknown>).__MAZER_PROOF_SURFACES__ = api;
};

root.addEventListener('click', (event) => {
  const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-action]') : null;
  if (!target) {
    return;
  }

  if (target.dataset.action === 'select-surface') {
    activeSurface = resolveSurfaceById(target.dataset.surface);
    render();
    return;
  }

  if (target.dataset.action === 'select-plan') {
    selectPlan((target.dataset.plan as WatchPassPlanId | undefined) ?? 'yearly');
    return;
  }

  if (target.dataset.action === 'confirm-purchase') {
    confirmPurchase();
  }
});

recordEvent('paywall_viewed', {
  entryPoint,
  ctaLabel: CTA_LABEL,
  sourceCta
});
emitInitialPlanSelection();
emitSettingsChanged(DEFAULT_WATCH_PASS_PREFERENCES, preferences, true);
render();
