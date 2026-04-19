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
  type WatchPassPreferences
} from '../settings/preferences.ts';

type WatchPassSlideId =
  | 'ios-snapshot'
  | 'ios-active-run'
  | 'android-widget'
  | 'android-progress';
type WatchPassPlatform = 'ios' | 'android';

interface WatchPassSlideDefinition {
  id: WatchPassSlideId;
  platform: WatchPassPlatform;
  title: string;
  subtitle: string;
  surface: 'snapshot-card' | 'active-run-tracker' | 'ambient-tile';
  fixture: 'watching' | 'building' | 'waiting';
}

interface WatchPassPreviewDiagnostics {
  ready: boolean;
  surface: 'watch-pass-preview';
  fixture: string;
  skin: WatchPassPlatform;
  modes: RunProjectionPrivacy[];
  activeSlideId: WatchPassSlideId;
  preferences: WatchPassPreferences;
  events: readonly TelemetryEvent[];
  eventCounts: Record<string, number>;
  renderedSurfaceCount: number;
  receipt: ReturnType<typeof buildTelemetryReceipt>;
}

interface WatchPassPreviewApi extends WatchPassPreviewDiagnostics {
  getDiagnostics: () => WatchPassPreviewDiagnostics;
}

const root = document.querySelector<HTMLDivElement>('#watch-pass-preview-root');
if (!root) {
  throw new Error('Expected #watch-pass-preview-root to exist.');
}

const RUN_ID = 'watch-pass-preview-session';
const CTA_LABEL = 'Watch Pass preview';
const DEVICE_LABEL_BY_PLATFORM: Record<WatchPassPlatform, string> = {
  ios: 'iOS-style surface',
  android: 'Android-style surface'
};
const SLIDES: readonly WatchPassSlideDefinition[] = [
  {
    id: 'ios-snapshot',
    platform: 'ios',
    title: 'Snapshot Card',
    subtitle: 'Reduced lock-screen value without a mini-app shell.',
    surface: 'snapshot-card',
    fixture: 'watching'
  },
  {
    id: 'ios-active-run',
    platform: 'ios',
    title: 'Active-Run Tracker',
    subtitle: 'Live activity framing built only from compact projections.',
    surface: 'active-run-tracker',
    fixture: 'watching'
  },
  {
    id: 'android-widget',
    platform: 'android',
    title: 'Ambient Tile',
    subtitle: 'Widget-like glance surface that stays calm and reduced.',
    surface: 'ambient-tile',
    fixture: 'waiting'
  },
  {
    id: 'android-progress',
    platform: 'android',
    title: 'Progress Tracker',
    subtitle: 'Android progress framing before any native widget plumbing.',
    surface: 'active-run-tracker',
    fixture: 'building'
  }
];
const PACING_LABEL_BY_PRESET: Record<WatchPassPacingPreset, string> = {
  calm: 'calm pacing',
  balanced: 'balanced pacing',
  brisk: 'brisk pacing'
};
const RISK_LEVEL_ORDER = ['low', 'medium', 'high', 'critical'] as const;

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

const describeSurface = (preferences: WatchPassPreferences): string => [
  preferences.privacyMode,
  preferences.reducedMotion ? 'reduced motion' : 'ambient motion',
  preferences.thoughtDensity,
  PACING_LABEL_BY_PRESET[preferences.pacingPreset]
].join(' / ');

const resolveSlideById = (slideId: string | null | undefined): WatchPassSlideDefinition => (
  SLIDES.find((candidate) => candidate.id === slideId) ?? SLIDES[0]
);

const resolveInitialSlide = (params: URLSearchParams): WatchPassSlideDefinition => {
  if (params.get('slide')) {
    return resolveSlideById(params.get('slide'));
  }

  const platform = params.get('platform');
  return SLIDES.find((candidate) => candidate.platform === platform) ?? SLIDES[0];
};

const tuneThought = (
  source: RunProjectionInput,
  preferences: WatchPassPreferences,
  slide: WatchPassSlideDefinition
): string => {
  const base = source.compactThought ?? 'Holding the route while the surface stays readable.';
  if (preferences.thoughtDensity === 'sparse') {
    return `${base.split(/[.!?]/u)[0] ?? base}`.trim();
  }

  return `${base} ${slide.platform === 'ios' ? 'Lock-screen value stays legible during the run.' : 'Widget framing stays compact while progress updates.'}`;
};

const tuneFailReason = (
  source: RunProjectionInput,
  preferences: WatchPassPreferences
): string | undefined => {
  if (!source.failReason) {
    return undefined;
  }

  return preferences.thoughtDensity === 'richer'
    ? `${source.failReason} The preview still holds value in reduced form.`
    : source.failReason;
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
  slide: WatchPassSlideDefinition,
  preferences: WatchPassPreferences
): RunProjectionInput => {
  const source = resolveProofSurfaceFixtureInput(slide.fixture);
  const pacing = preferences.pacingPreset === 'calm'
    ? { elapsedScale: 1.16, progressDelta: -9 }
    : preferences.pacingPreset === 'brisk'
      ? { elapsedScale: 0.86, progressDelta: 11 }
      : { elapsedScale: 1, progressDelta: 0 };

  return {
    ...source,
    elapsedMs: Math.max(1_500, Math.round(source.elapsedMs * pacing.elapsedScale)),
    progressPct: round(clamp(source.progressPct + pacing.progressDelta, 0, 100)),
    compactThought: tuneThought(source, preferences, slide),
    failReason: tuneFailReason(source, preferences),
    riskLevel: tuneRiskLevel(source.riskLevel, preferences.pacingPreset),
    updatedAt: new Date().toISOString()
  };
};

const renderSlideSurface = (
  slide: WatchPassSlideDefinition,
  preferences: WatchPassPreferences
): string => {
  const input = tuneProjectionInput(slide, preferences);
  if (slide.surface === 'snapshot-card') {
    return renderSnapshotCardSurface(createSnapshotCardProjection(input, preferences.privacyMode));
  }

  if (slide.surface === 'ambient-tile') {
    return renderAmbientTileSurface(createAmbientTileProjection(input, preferences.privacyMode)).html;
  }

  return renderActiveRunTrackerSurface(createActiveRunTrackerProjection(input, preferences.privacyMode));
};

const renderSurfaceStrip = (preferences: WatchPassPreferences, platform: WatchPassPlatform): string => {
  const surfaceOrder: Array<WatchPassSlideDefinition['surface']> = ['snapshot-card', 'active-run-tracker', 'ambient-tile'];
  return surfaceOrder.map((surface) => {
    const slide = SLIDES.find((candidate) => candidate.surface === surface) ?? SLIDES[0];
    return `
      <article class="watch-pass-surface-strip__card" data-surface="${surface}" data-action="surface-tap">
        <header class="watch-pass-surface-strip__header">
          <span>${surface}</span>
          <span>${DEVICE_LABEL_BY_PLATFORM[platform]}</span>
        </header>
        <div class="proof-device-frame" data-skin="${platform}">
          <div class="proof-device-frame__screen">
            ${renderSlideSurface({ ...slide, platform }, preferences)}
          </div>
        </div>
      </article>
    `;
  }).join('');
};

const eventCountsFromEvents = (events: readonly TelemetryEvent[]): Record<string, number> => (
  events.reduce<Record<string, number>>((counts, event) => {
    counts[event.kind] = (counts[event.kind] ?? 0) + 1;
    return counts;
  }, {})
);

let preferences = mergeWatchPassPreferences(
  readWatchPassPreferences(window.localStorage),
  resolveWatchPassPreferencesFromSearch(window.location.search)
);
let activeSlide = resolveInitialSlide(new URLSearchParams(window.location.search));
let eventSequence = 0;
let autoAdvanceTimer = 0;
let events: TelemetryEvent[] = [];
const surfaceSignalsSeen = new Set<string>();
let quietCtaArmed = false;
let quietCtaReason: 'surface-tap' | 'retry-loop' | 'launch' | null = null;
let surfaceTapCount = 0;
let retryLoopCount = 0;

const resolveExperiment = (value: WatchPassPreferences) => buildExperimentSelection({
  pacing: value.pacingPreset === 'calm'
    ? '0.7x'
    : value.pacingPreset === 'brisk'
      ? '1.0x'
      : '0.8x',
  thoughtDensity: value.thoughtDensity
});

const recordEvent = <K extends TelemetryEventKind>(
  kind: K,
  payload: TelemetryEvent<K>['payload']
): void => {
  const experiment = resolveExperiment(preferences);
  events = [
    ...events,
    {
      eventId: `watch-pass-${String(++eventSequence).padStart(4, '0')}`,
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

const armQuietCta = (reason: 'surface-tap' | 'retry-loop' | 'launch'): void => {
  if (quietCtaArmed) {
    return;
  }

  quietCtaArmed = true;
  quietCtaReason = reason;
};

const registerSurfaceTap = (): void => {
  surfaceTapCount += 1;
  if (surfaceTapCount >= 1) {
    armQuietCta('surface-tap');
  }
};

const registerRetryLoop = (): void => {
  retryLoopCount += 1;
  if (retryLoopCount >= 2) {
    armQuietCta('retry-loop');
  }
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

const openPaywall = (): void => {
  const paywallUrl = buildWatchPassUrl('/watch-pass-paywall.html', {
    platform: activeSlide.platform,
    platformFrame: preferences.platformFrame,
    privacy: preferences.privacyMode,
    reducedMotion: preferences.reducedMotion,
    thoughtDensity: preferences.thoughtDensity,
    pacingPreset: preferences.pacingPreset,
    plan: preferences.selectedPlanId ?? 'yearly',
    entitled: preferences.mockEntitled,
    entryPoint: 'watch-pass-preview',
    sourceCta: CTA_LABEL
  });
  window.location.assign(paywallUrl);
};

if (preferences.mockEntitled) {
  armQuietCta('launch');
}

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
        : setting === 'platformFrame'
          ? 'platform_frame'
        : setting === 'reducedMotion'
          ? 'reduced_motion'
          : setting === 'selectedPlanId'
            ? 'selected_plan'
            : setting === 'mockEntitled'
              ? 'mock_entitled'
              : setting,
      previousValue: isInitial ? undefined : previous,
      nextValue: next
    });
  }
};

const emitSurfaceSignal = (slide: WatchPassSlideDefinition): void => {
  const signalKey = `${slide.id}:${preferences.privacyMode}`;
  if (surfaceSignalsSeen.has(signalKey)) {
    return;
  }

  surfaceSignalsSeen.add(signalKey);
  if (slide.id === 'ios-active-run') {
    recordEvent('live_activity_started', {
      surface: 'ios-active-run',
      placement: 'preview-shell'
    });
  }

  if (slide.id === 'android-widget' || slide.id === 'android-progress') {
    recordEvent('widget_configured', {
      surface: slide.id === 'android-widget' ? 'android-widget' : 'android-progress',
      placement: 'preview-shell'
    });
  }
};

const buildReceipt = () => {
  const experiment = resolveExperiment(preferences);
  return buildTelemetryReceipt({
    kind: 'edge-live',
    label: 'watch-pass-preview',
    runId: RUN_ID,
    toggles: experiment.toggles,
    privacyMode: preferences.privacyMode,
    events,
    sessionCount: 1
  });
};

const buildDiagnostics = (): WatchPassPreviewDiagnostics => ({
  ready: true,
  surface: 'watch-pass-preview',
  fixture: activeSlide.fixture,
  skin: activeSlide.platform,
  modes: [preferences.privacyMode],
  activeSlideId: activeSlide.id,
  preferences,
  events,
  eventCounts: eventCountsFromEvents(events),
  renderedSurfaceCount: 3,
  receipt: buildReceipt()
});

const render = (): void => {
  const receipt = buildReceipt();
  const eventCounts = eventCountsFromEvents(events);
  root.dataset.motion = preferences.reducedMotion ? 'reduced' : 'full';
  root.innerHTML = `
  <main class="watch-pass-preview" data-platform="${activeSlide.platform}" data-privacy="${preferences.privacyMode}">
      <section class="watch-pass-preview__hero">
        <div class="watch-pass-preview__copy">
          <p class="watch-pass-preview__eyebrow">Business spine preview</p>
          <h1>Watch Pass preview + settings shell</h1>
          <p class="watch-pass-preview__lede">Premium value stays projection-driven here: glance surfaces first, a quiet CTA wakes up after a tap or retry, then the Watch Pass paywall opens next.</p>
          <div class="watch-pass-preview__chips">
            <span>${quietCtaArmed ? 'quiet CTA armed' : 'quiet CTA waiting'}</span>
            <span>${describeSurface(preferences)}</span>
            <span>${preferences.selectedPlanId ?? 'plan: unset'}</span>
            <span>${receipt.experimentId}</span>
          </div>
        </div>
        <aside class="watch-pass-preview__cta">
          <p class="watch-pass-preview__cta-label">Quiet CTA</p>
          <h2>${quietCtaArmed ? CTA_LABEL : 'Pin this outside the app'}</h2>
          <p>${quietCtaArmed
    ? 'The prompt is now ready to open the Watch Pass paywall.'
    : 'The prompt stays quiet until the first tap or the second retry loop.'}</p>
          <button type="button" class="watch-pass-preview__setup" data-action="open-paywall" ${quietCtaArmed ? '' : 'disabled'}>
            ${quietCtaArmed ? 'Open Watch Pass plans' : 'Waiting for a tap'}
          </button>
          <p class="watch-pass-preview__cta-note">${quietCtaReason ?? 'No purchase flow is live yet.'}</p>
        </aside>
      </section>

      <section class="watch-pass-preview__layout">
        <section class="watch-pass-preview__stage">
          <header class="watch-pass-preview__section-header">
            <div>
              <p class="watch-pass-preview__section-eyebrow">Preview carousel</p>
              <h2>${escapeHtml(activeSlide.title)}</h2>
              <p>${escapeHtml(activeSlide.subtitle)}</p>
            </div>
            <div class="watch-pass-preview__controls">
              <button type="button" data-action="previous-slide">Previous</button>
              <button type="button" data-action="next-slide">Next</button>
            </div>
          </header>
          <nav class="watch-pass-preview__slide-picker" aria-label="Preview slides">
            ${SLIDES.map((slide) => `
              <button
                type="button"
                class="watch-pass-preview__slide-chip"
                data-slide="${slide.id}"
                data-active="${slide.id === activeSlide.id}"
              >
                ${escapeHtml(slide.platform)} / ${escapeHtml(slide.title)}
              </button>
            `).join('')}
          </nav>
          <article class="proof-device-frame watch-pass-preview__device" data-skin="${activeSlide.platform}" data-action="surface-tap">
            <div class="proof-device-frame__chrome">
              <span>${DEVICE_LABEL_BY_PLATFORM[activeSlide.platform]}</span>
              <span>${preferences.privacyMode}</span>
            </div>
            <div class="proof-device-frame__screen">
              ${renderSlideSurface(activeSlide, preferences)}
            </div>
          </article>
          <section class="watch-pass-surface-strip" aria-label="Reduced surface strip">
            ${renderSurfaceStrip(preferences, activeSlide.platform)}
          </section>
        </section>

        <aside class="watch-pass-preview__settings">
          <section class="watch-pass-preview__panel">
            <header class="watch-pass-preview__section-header">
              <div>
                <p class="watch-pass-preview__section-eyebrow">Settings shell</p>
                <h2>Preview controls</h2>
              </div>
            </header>
            <form class="watch-pass-preview__form">
              <label>
                <span>Privacy mode</span>
                <select name="privacyMode">
                  ${['full', 'compact', 'private'].map((mode) => `
                    <option value="${mode}" ${preferences.privacyMode === mode ? 'selected' : ''}>${mode}</option>
                  `).join('')}
                </select>
              </label>
              <label class="watch-pass-preview__toggle">
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

          <section class="watch-pass-preview__panel">
            <header class="watch-pass-preview__section-header">
              <div>
                <p class="watch-pass-preview__section-eyebrow">Local business receipt</p>
                <h2>Preview KPI snapshot</h2>
              </div>
            </header>
            <dl class="watch-pass-preview__kpis">
              <div><dt>Events</dt><dd>${receipt.eventCount}</dd></div>
              <div><dt>Runs / session</dt><dd>${receipt.kpis.runsWatchedPerSession}</dd></div>
              <div><dt>Avg watch ms</dt><dd>${receipt.kpis.averageWatchTimeMs ?? 'n/a'}</dd></div>
              <div><dt>Thought dwell</dt><dd>${receipt.kpis.thoughtBoxDwellMs ?? 'n/a'}</dd></div>
              <div><dt>Widget attach rate</dt><dd>${receipt.kpis.widgetAttachRate}</dd></div>
              <div><dt>Live activity rate</dt><dd>${receipt.kpis.liveActivityStartRate}</dd></div>
              <div><dt>Plan selects</dt><dd>${receipt.kpis.planSelectedCount ?? 'n/a'}</dd></div>
              <div><dt>Plan rate</dt><dd>${receipt.kpis.paywallViewToPlanSelectRate ?? 'n/a'}</dd></div>
              <div><dt>Purchase rate</dt><dd>${receipt.kpis.paywallViewToPurchaseCompletedRate ?? 'n/a'}</dd></div>
              <div><dt>Selected plan</dt><dd>${preferences.selectedPlanId ?? 'unset'}</dd></div>
              <div><dt>Paywall conversion</dt><dd>${receipt.kpis.paywallToPurchaseConversion ?? 'n/a'}</dd></div>
              <div><dt>Entitled</dt><dd>${preferences.mockEntitled ? 'yes' : 'no'}</dd></div>
              <div><dt>Private-mode adoption</dt><dd>${receipt.kpis.privateModeAdoptionRate}</dd></div>
            </dl>
            <p class="watch-pass-preview__event-summary">
              ${Object.entries(eventCounts).map(([kind, count]) => `${kind} ${count}`).join(' / ') || 'No events yet.'}
            </p>
          </section>
        </aside>
      </section>
    </main>
  `;

  const api: WatchPassPreviewApi = {
    ...buildDiagnostics(),
    getDiagnostics: () => buildDiagnostics()
  };
  (window as unknown as Record<string, unknown>).__MAZER_PROOF_SURFACES__ = api;
};

const scheduleAutoAdvance = (): void => {
  if (autoAdvanceTimer) {
    window.clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = 0;
  }

  if (preferences.reducedMotion) {
    return;
  }

  autoAdvanceTimer = window.setTimeout(() => {
    const currentIndex = SLIDES.findIndex((slide) => slide.id === activeSlide.id);
    const nextSlide = SLIDES[(currentIndex + 1) % SLIDES.length];
    selectSlide(nextSlide.id);
  }, 5000);
};

const selectSlide = (slideId: WatchPassSlideId): void => {
  activeSlide = resolveSlideById(slideId);
  emitSurfaceSignal(activeSlide);
  render();
  scheduleAutoAdvance();
};

const applyPreferences = (nextValue: Partial<WatchPassPreferences>): void => {
  const previous = preferences;
  preferences = writeWatchPassPreferences(
    window.localStorage,
    mergeWatchPassPreferences(preferences, nextValue)
  );
  emitSettingsChanged(previous, preferences);
  emitSurfaceSignal(activeSlide);
  render();
  scheduleAutoAdvance();
};

root.addEventListener('click', (event) => {
  const target = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-action],[data-slide]') : null;
  if (!target) {
    return;
  }

  const slideId = target.dataset.slide as WatchPassSlideId | undefined;
  if (slideId) {
    registerSurfaceTap();
    selectSlide(slideId);
    return;
  }

  if (target.dataset.action === 'surface-tap') {
    registerSurfaceTap();
    render();
    return;
  }

  if (target.dataset.action === 'previous-slide') {
    registerRetryLoop();
    const currentIndex = SLIDES.findIndex((slide) => slide.id === activeSlide.id);
    const nextSlide = SLIDES[(currentIndex - 1 + SLIDES.length) % SLIDES.length];
    selectSlide(nextSlide.id);
    return;
  }

  if (target.dataset.action === 'next-slide') {
    registerRetryLoop();
    const currentIndex = SLIDES.findIndex((slide) => slide.id === activeSlide.id);
    const nextSlide = SLIDES[(currentIndex + 1) % SLIDES.length];
    selectSlide(nextSlide.id);
    return;
  }

  if (target.dataset.action === 'open-paywall') {
    if (!quietCtaArmed) {
      return;
    }

    openPaywall();
  }
});

root.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
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

recordEvent('paywall_viewed', {
  entryPoint: 'watch-pass-preview',
  ctaLabel: CTA_LABEL,
  sourceCta: CTA_LABEL
});
emitSettingsChanged(DEFAULT_WATCH_PASS_PREFERENCES, preferences, true);
emitSurfaceSignal(activeSlide);
render();
scheduleAutoAdvance();
