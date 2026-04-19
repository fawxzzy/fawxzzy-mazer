import type { RunProjectionPrivacy } from '../projections/runProjection.ts';
import { buildTelemetryBusinessKpis, buildTelemetryPlayMetrics } from './kpis.ts';
import {
  createTelemetryEventCounts,
  summarizeTelemetrySemantics,
  type TelemetryEvent,
  type TelemetryEventKind,
  type TelemetryMode
} from './schema.ts';

export const EXPERIMENT_PACING_OPTIONS = ['0.7x', '0.8x', '1.0x'] as const;
export const EXPERIMENT_THOUGHT_DENSITY_OPTIONS = ['sparse', 'richer'] as const;
export const EXPERIMENT_FAIL_CARD_TIMING_OPTIONS = ['0.8s', '1.3s', '1.8s'] as const;
export const EXPERIMENT_MEMORY_BEAT_OPTIONS = ['on', 'off'] as const;
export const EXPERIMENT_TRAP_TELEGRAPH_OPTIONS = ['stronger', 'baseline'] as const;

export type ExperimentPacing = (typeof EXPERIMENT_PACING_OPTIONS)[number];
export type ExperimentThoughtDensity = (typeof EXPERIMENT_THOUGHT_DENSITY_OPTIONS)[number];
export type ExperimentFailCardTiming = (typeof EXPERIMENT_FAIL_CARD_TIMING_OPTIONS)[number];
export type ExperimentMemoryBeat = (typeof EXPERIMENT_MEMORY_BEAT_OPTIONS)[number];
export type ExperimentTrapTelegraph = (typeof EXPERIMENT_TRAP_TELEGRAPH_OPTIONS)[number];

export interface ExperimentToggles {
  pacing: ExperimentPacing;
  thoughtDensity: ExperimentThoughtDensity;
  failCardTiming: ExperimentFailCardTiming;
  memoryBeat: ExperimentMemoryBeat;
  trapTelegraph: ExperimentTrapTelegraph;
}

export interface ExperimentToggleInput {
  pacing?: unknown;
  thoughtDensity?: unknown;
  failCardTiming?: unknown;
  memoryBeat?: unknown;
  trapTelegraph?: unknown;
}

export interface ExperimentManifest {
  schemaVersion: 1;
  generatedAt: string;
  kind: 'runtime-observe' | 'edge-live';
  label: string;
  runId?: string | null;
  mazeId?: string | null;
  attemptNo?: number | null;
  variantId: string;
  toggles: ExperimentToggles;
}

export interface TelemetryReceipt extends ExperimentManifest {
  experimentId: string;
  experimentIds: string[];
  mode: TelemetryMode | null;
  privacyMode: RunProjectionPrivacy | null;
  privacyModes: RunProjectionPrivacy[];
  sourceCta: string | null;
  sourceCtas: string[];
  planIds: string[];
  eventCount: number;
  eventCounts: Record<TelemetryEventKind, number>;
  eventKinds: TelemetryEventKind[];
  firstCreatedAt: string | null;
  lastCreatedAt: string | null;
  timingWindows: ReturnType<typeof summarizeTelemetrySemantics>['timingWindows'];
  failToRetryContinuation: ReturnType<typeof summarizeTelemetrySemantics>['failToRetryContinuation'];
  thoughtDwell: ReturnType<typeof summarizeTelemetrySemantics>['thoughtDwell'];
  kpis: ReturnType<typeof buildTelemetryBusinessKpis>;
  playMetrics: ReturnType<typeof buildTelemetryPlayMetrics>;
}

export const DEFAULT_EXPERIMENT_TOGGLES: ExperimentToggles = Object.freeze({
  pacing: '0.8x',
  thoughtDensity: 'sparse',
  failCardTiming: '1.3s',
  memoryBeat: 'on',
  trapTelegraph: 'baseline'
});

const EXPERIMENT_VARIANT_PREFIXES: Record<keyof ExperimentToggles, Record<string, string>> = {
  pacing: {
    '0.7x': 'p70',
    '0.8x': 'p80',
    '1.0x': 'p100'
  },
  thoughtDensity: {
    sparse: 'thought-sparse',
    richer: 'thought-richer'
  },
  failCardTiming: {
    '0.8s': 'fail-08',
    '1.3s': 'fail-13',
    '1.8s': 'fail-18'
  },
  memoryBeat: {
    on: 'memory-on',
    off: 'memory-off'
  },
  trapTelegraph: {
    stronger: 'trap-stronger',
    baseline: 'trap-baseline'
  }
};

const normalizeToggle = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T => (
  typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? value as T
    : fallback
);

const normalizeBooleanToggle = (value: unknown, fallback: ExperimentMemoryBeat): ExperimentMemoryBeat => {
  if (typeof value === 'boolean') {
    return value ? 'on' : 'off';
  }

  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (['on', 'true', '1', 'yes'].includes(lowered)) {
      return 'on';
    }
    if (['off', 'false', '0', 'no'].includes(lowered)) {
      return 'off';
    }
  }

  return fallback;
};

const collectBoundedUniqueStrings = (values: readonly unknown[], limit = 8): string[] => {
  const collected = new Set<string>();

  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }

    const normalized = value.trim();
    if (normalized.length === 0) {
      continue;
    }

    collected.add(normalized);
    if (collected.size >= limit) {
      break;
    }
  }

  return [...collected];
};

export const normalizeExperimentToggles = (value?: ExperimentToggleInput | null): ExperimentToggles => ({
  pacing: normalizeToggle(value?.pacing, EXPERIMENT_PACING_OPTIONS, DEFAULT_EXPERIMENT_TOGGLES.pacing),
  thoughtDensity: normalizeToggle(value?.thoughtDensity, EXPERIMENT_THOUGHT_DENSITY_OPTIONS, DEFAULT_EXPERIMENT_TOGGLES.thoughtDensity),
  failCardTiming: normalizeToggle(value?.failCardTiming, EXPERIMENT_FAIL_CARD_TIMING_OPTIONS, DEFAULT_EXPERIMENT_TOGGLES.failCardTiming),
  memoryBeat: normalizeBooleanToggle(value?.memoryBeat, DEFAULT_EXPERIMENT_TOGGLES.memoryBeat),
  trapTelegraph: normalizeToggle(value?.trapTelegraph, EXPERIMENT_TRAP_TELEGRAPH_OPTIONS, DEFAULT_EXPERIMENT_TOGGLES.trapTelegraph)
});

export const resolveExperimentVariantId = (toggles: ExperimentToggles): string => [
  EXPERIMENT_VARIANT_PREFIXES.pacing[toggles.pacing],
  EXPERIMENT_VARIANT_PREFIXES.thoughtDensity[toggles.thoughtDensity],
  EXPERIMENT_VARIANT_PREFIXES.failCardTiming[toggles.failCardTiming],
  EXPERIMENT_VARIANT_PREFIXES.memoryBeat[toggles.memoryBeat],
  EXPERIMENT_VARIANT_PREFIXES.trapTelegraph[toggles.trapTelegraph]
].join('-');

export const buildExperimentSelection = (value?: ExperimentToggleInput | null): {
  toggles: ExperimentToggles;
  variantId: string;
} => {
  const toggles = normalizeExperimentToggles(value);
  return {
    toggles,
    variantId: resolveExperimentVariantId(toggles)
  };
};

export const buildExperimentManifest = (options: {
  kind: ExperimentManifest['kind'];
  label: string;
  runId?: string | null;
  mazeId?: string | null;
  attemptNo?: number | null;
  toggles?: ExperimentToggleInput | null;
  generatedAt?: string;
}): ExperimentManifest => {
  const selection = buildExperimentSelection(options.toggles);
  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    kind: options.kind,
    label: options.label,
    runId: options.runId ?? null,
    mazeId: options.mazeId ?? null,
    attemptNo: options.attemptNo ?? null,
    variantId: selection.variantId,
    toggles: selection.toggles
  };
};

export const buildTelemetryReceipt = (options: {
  kind: ExperimentManifest['kind'];
  label: string;
  runId?: string | null;
  mazeId?: string | null;
  attemptNo?: number | null;
  toggles?: ExperimentToggleInput | null;
  events?: readonly TelemetryEvent[];
  mode?: TelemetryMode | null;
  privacyMode?: RunProjectionPrivacy | null;
  experimentIds?: readonly string[] | null;
  sessionCount?: number | null;
  generatedAt?: string;
}): TelemetryReceipt => {
  const manifest = buildExperimentManifest(options);
  const summary = summarizeTelemetrySemantics(options.events ?? []);
  const eventModes = [...new Set((options.events ?? [])
    .flatMap((event) => {
      if (event.mode === 'watch' || event.mode === 'play') {
        return [event.mode];
      }

      if (event.kind === 'settings_changed') {
        const payload = event as TelemetryEvent<'settings_changed'>;
        if (payload.payload.setting === 'mode' && (payload.payload.nextValue === 'watch' || payload.payload.nextValue === 'play')) {
          return [payload.payload.nextValue];
        }
      }

      return [];
    })
    .filter((value): value is TelemetryMode => value === 'watch' || value === 'play'))];
  const eventExperimentIds = (options.events ?? [])
    .flatMap((event) => {
      const payloadVariantId = event.kind === 'run_started'
        ? (event as TelemetryEvent<'run_started'>).payload.variantId
        : undefined;
      return [event.experimentId, payloadVariantId].filter((value): value is string => (
        typeof value === 'string' && value.trim().length > 0
      ));
    });
  const eventSourceCtas = collectBoundedUniqueStrings((options.events ?? []).flatMap((event) => {
    if (event.kind === 'paywall_viewed') {
      const payload = event as TelemetryEvent<'paywall_viewed'>;
      return [payload.payload.sourceCta ?? payload.payload.ctaLabel];
    }

    if (event.kind === 'plan_selected') {
      const payload = event as TelemetryEvent<'plan_selected'>;
      return [payload.payload.sourceCta];
    }

    if (event.kind === 'purchase_completed') {
      const payload = event as TelemetryEvent<'purchase_completed'>;
      return [payload.payload.sourceCta];
    }

    if (event.kind === 'purchase_churned') {
      const payload = event as TelemetryEvent<'purchase_churned'>;
      return [payload.payload.sourceCta];
    }

    return [];
  }));
  const planIds = collectBoundedUniqueStrings((options.events ?? []).flatMap((event) => (
    event.kind === 'plan_selected'
      ? [(event as TelemetryEvent<'plan_selected'>).payload.planId]
      : []
  )));
  const experimentIds = [...new Set([
    manifest.variantId,
    ...(options.experimentIds ?? []),
    ...eventExperimentIds
  ])];
  const privacyModes = [...new Set((options.events ?? [])
    .flatMap((event) => {
      const settingsEvent = event.kind === 'settings_changed'
        ? event as TelemetryEvent<'settings_changed'>
        : null;
      const payloadPrivacyMode = settingsEvent
        && settingsEvent.payload.setting === 'privacy_mode'
        && (
          settingsEvent.payload.nextValue === 'full'
          || settingsEvent.payload.nextValue === 'compact'
          || settingsEvent.payload.nextValue === 'private'
        )
        ? settingsEvent.payload.nextValue
        : null;
      return [event.privacyMode, payloadPrivacyMode, options.privacyMode]
        .filter((value): value is RunProjectionPrivacy => (
          value === 'full' || value === 'compact' || value === 'private'
        ));
      }))];
  const privacyMode = options.privacyMode ?? privacyModes.at(-1) ?? null;
  const mode = options.mode ?? eventModes.at(-1) ?? null;

  const kpis = buildTelemetryBusinessKpis(options.events ?? [], {
    privacyMode,
    sessionCount: options.sessionCount
  });

  return {
    ...manifest,
    experimentId: manifest.variantId,
    experimentIds,
    mode,
    privacyMode,
    privacyModes,
    sourceCta: eventSourceCtas[0] ?? null,
    sourceCtas: eventSourceCtas,
    planIds,
    eventCount: summary.eventCount,
    eventCounts: summary.eventCounts ?? createTelemetryEventCounts(),
    eventKinds: summary.eventKinds,
    firstCreatedAt: summary.firstCreatedAt,
    lastCreatedAt: summary.lastCreatedAt,
    timingWindows: summary.timingWindows,
    failToRetryContinuation: summary.failToRetryContinuation,
    thoughtDwell: summary.thoughtDwell,
    kpis,
    playMetrics: buildTelemetryPlayMetrics(kpis)
  };
};
