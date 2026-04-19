import type { RunProjectionPrivacy } from '../projections/runProjection.ts';

export const TELEMETRY_MODES = ['watch', 'play'] as const;
export type TelemetryMode = (typeof TELEMETRY_MODES)[number];

export const TELEMETRY_CONTROL_TYPES = ['keyboard', 'touch', 'restart', 'pause', 'toggle_thoughts'] as const;
export type TelemetryControlType = (typeof TELEMETRY_CONTROL_TYPES)[number];

export const TELEMETRY_CONTROL_ACTION_KINDS = [
  'move_up',
  'move_down',
  'move_left',
  'move_right',
  'pause',
  'restart_attempt',
  'toggle_thoughts'
] as const;
export type TelemetryControlActionKind = (typeof TELEMETRY_CONTROL_ACTION_KINDS)[number];

export const TELEMETRY_CONTROL_ACTION_GROUPS = ['move', 'pause', 'restart', 'toggle_thoughts'] as const;
export type TelemetryControlActionGroup = (typeof TELEMETRY_CONTROL_ACTION_GROUPS)[number];

export const TELEMETRY_EVENT_KINDS = [
  'run_started',
  'run_ended',
  'thought_shown',
  'hazard_entered',
  'memory_recalled',
  'widget_configured',
  'live_activity_started',
  'control_used',
  'paywall_viewed',
  'plan_selected',
  'purchase_completed',
  'purchase_churned',
  'settings_changed',
  'fail_reason'
] as const;

export type TelemetryEventKind = (typeof TELEMETRY_EVENT_KINDS)[number];

export interface TelemetryEventContext {
  runId: string;
  mazeId?: string;
  attemptNo?: number;
  elapsedMs?: number;
  createdAt?: string;
  experimentId?: string;
  privacyMode?: RunProjectionPrivacy;
  mode?: TelemetryMode;
}

export interface TelemetryEventPayloadByKind {
  run_started: {
    phase?: 'pre-roll' | 'build' | 'watch' | 'hold' | 'erase';
    variantId?: string;
    mode?: TelemetryMode;
  };
  run_ended: {
    outcome?: 'failed' | 'cleared' | 'aborted';
    durationMs?: number;
  };
  thought_shown: {
    compactThought: string;
    density?: 'sparse' | 'richer';
  };
  hazard_entered: {
    hazardId?: string;
    telegraphStrength?: 'baseline' | 'stronger';
  };
  memory_recalled: {
    memoryKey?: string;
    recalledFrom?: string;
  };
  widget_configured: {
    surface?: 'watch-pass-preview' | 'watch-pass-setup' | 'android-widget' | 'android-progress' | 'unknown';
    placement?: 'preview-shell' | 'setup-shell' | 'setup-placeholder' | 'manual';
  };
  live_activity_started: {
    surface?: 'watch-pass-preview' | 'watch-pass-setup' | 'ios-active-run' | 'unknown';
    placement?: 'preview-shell' | 'setup-shell' | 'setup-placeholder' | 'manual';
  };
  control_used: {
    control: TelemetryControlType;
    actionKind?: TelemetryControlActionKind;
    source?: 'watch-shell' | 'play-shell' | 'watch-pass-preview' | 'watch-pass-paywall' | 'unknown';
  };
  paywall_viewed: {
    entryPoint?: 'watch-pass-preview' | 'settings-shell' | 'unknown';
    ctaLabel?: string;
    sourceCta?: string;
  };
  plan_selected: {
    planId?: 'monthly' | 'yearly' | 'not-now';
    sourceCta?: string;
    emphasis?: 'regular' | 'emphasized';
  };
  purchase_completed: {
    sku?: string;
    origin?: 'preview-placeholder' | 'store' | 'manual';
    sourceCta?: string;
  };
  purchase_churned: {
    sku?: string;
    reason?: string;
    sourceCta?: string;
  };
  settings_changed: {
    setting: string;
    previousValue?: unknown;
    nextValue: unknown;
    surface?: 'watch-pass-preview' | 'watch-pass-setup' | 'unknown';
    placement?: 'preview-shell' | 'setup-shell' | 'manual';
  };
  fail_reason: {
    failReason: string;
    stage?: string;
  };
}

export interface TelemetryEvent<K extends TelemetryEventKind = TelemetryEventKind> extends TelemetryEventContext {
  eventId?: string;
  kind: K;
  payload: TelemetryEventPayloadByKind[K];
}

export interface TelemetryEventSummary {
  eventCount: number;
  eventCounts: Record<TelemetryEventKind, number>;
  eventKinds: TelemetryEventKind[];
  firstCreatedAt: string | null;
  lastCreatedAt: string | null;
}

export interface TelemetryEventTimingWindow {
  kind: TelemetryEventKind;
  count: number;
  firstCreatedAt: string | null;
  lastCreatedAt: string | null;
  firstElapsedMs: number | null;
  lastElapsedMs: number | null;
  windowMs: number | null;
}

export interface TelemetryContinuationProxy {
  continuationCount: number;
  averageMs: number | null;
  minimumMs: number | null;
  maximumMs: number | null;
}

export interface TelemetryThoughtDwellProxy {
  thoughtCount: number;
  densityPerMinute: number;
  averageDwellMs: number | null;
  maximumDwellMs: number | null;
}

export interface TelemetryPlayMetrics {
  controlUsedCount: number;
  controlUsedByControl: Record<TelemetryControlType, number>;
  controlUsedByAction: Record<TelemetryControlActionGroup, number>;
  watchToPlaySwitchCount: number;
  watchToPlaySwitchRate: number | null;
  playFailureCount: number;
  playFailToRetryContinuationCount: number;
  playFailToRetryContinuationRate: number | null;
}

export interface TelemetrySemanticSummary extends TelemetryEventSummary {
  timingWindows: TelemetryEventTimingWindow[];
  failToRetryContinuation: TelemetryContinuationProxy;
  thoughtDwell: TelemetryThoughtDwellProxy;
}

export const normalizeTelemetryEventKind = (value: unknown): TelemetryEventKind | null => (
  typeof value === 'string' && (TELEMETRY_EVENT_KINDS as readonly string[]).includes(value)
    ? value as TelemetryEventKind
    : null
);

export const isTelemetryEventKind = (value: unknown): value is TelemetryEventKind => (
  normalizeTelemetryEventKind(value) !== null
);

export const createTelemetryEventCounts = (): Record<TelemetryEventKind, number> => (
  Object.fromEntries(TELEMETRY_EVENT_KINDS.map((kind) => [kind, 0])) as Record<TelemetryEventKind, number>
);

export const summarizeTelemetryEvents = (
  events: readonly Pick<TelemetryEvent, 'kind' | 'createdAt'>[]
): TelemetryEventSummary => {
  const eventCounts = createTelemetryEventCounts();
  const eventKinds: TelemetryEventKind[] = [];
  let firstCreatedAt: string | null = null;
  let lastCreatedAt: string | null = null;

  for (const event of events) {
    if (isTelemetryEventKind(event.kind)) {
      eventCounts[event.kind] += 1;
      if (!eventKinds.includes(event.kind)) {
        eventKinds.push(event.kind);
      }
    }

    if (typeof event.createdAt === 'string' && event.createdAt.length > 0) {
      firstCreatedAt ??= event.createdAt;
      lastCreatedAt = event.createdAt;
    }
  }

  return {
    eventCount: events.length,
    eventCounts,
    eventKinds,
    firstCreatedAt,
    lastCreatedAt
  };
};

const round = (value: number): number => Math.round(value * 1000) / 1000;

const resolveEventElapsedMs = (event: Pick<TelemetryEvent, 'elapsedMs'>): number | null => (
  Number.isFinite(event.elapsedMs) ? Math.max(0, Math.round(event.elapsedMs ?? 0)) : null
);

export const buildTelemetryEventTimingWindows = (
  events: readonly TelemetryEvent[]
): TelemetryEventTimingWindow[] => TELEMETRY_EVENT_KINDS.map((kind) => {
  const matches = events.filter((event) => event.kind === kind);
  const first = matches[0] ?? null;
  const last = matches.at(-1) ?? null;
  const firstElapsedMs = first ? resolveEventElapsedMs(first) : null;
  const lastElapsedMs = last ? resolveEventElapsedMs(last) : null;

  return {
    kind,
    count: matches.length,
    firstCreatedAt: first?.createdAt ?? null,
    lastCreatedAt: last?.createdAt ?? null,
    firstElapsedMs,
    lastElapsedMs,
    windowMs: firstElapsedMs !== null && lastElapsedMs !== null
      ? Math.max(0, lastElapsedMs - firstElapsedMs)
      : null
  };
}).filter((window) => window.count > 0);

export const buildFailToRetryContinuationProxy = (
  events: readonly TelemetryEvent[]
): TelemetryContinuationProxy => {
  const durations: number[] = [];
  const failures = events.filter((event) => event.kind === 'fail_reason' || (
    event.kind === 'run_ended'
    && 'outcome' in event.payload
    && event.payload.outcome === 'failed'
  ));
  const starts = events.filter((event) => event.kind === 'run_started');

  for (const failure of failures) {
    const failureElapsedMs = resolveEventElapsedMs(failure);
    if (failureElapsedMs === null) {
      continue;
    }

    const nextStart = starts.find((candidate) => {
      const startElapsedMs = resolveEventElapsedMs(candidate);
      return startElapsedMs !== null && startElapsedMs > failureElapsedMs;
    });
    const nextStartElapsedMs = nextStart ? resolveEventElapsedMs(nextStart) : null;
    if (nextStartElapsedMs === null) {
      continue;
    }

    durations.push(Math.max(0, nextStartElapsedMs - failureElapsedMs));
  }

  if (durations.length === 0) {
    return {
      continuationCount: 0,
      averageMs: null,
      minimumMs: null,
      maximumMs: null
    };
  }

  return {
    continuationCount: durations.length,
    averageMs: round(durations.reduce((total, value) => total + value, 0) / durations.length),
    minimumMs: Math.min(...durations),
    maximumMs: Math.max(...durations)
  };
};

export const buildThoughtDwellProxy = (
  events: readonly TelemetryEvent[]
): TelemetryThoughtDwellProxy => {
  const thoughts = events.filter((event) => event.kind === 'thought_shown');
  const firstElapsedMs = thoughts[0] ? resolveEventElapsedMs(thoughts[0]) : null;
  const lastElapsedMs = thoughts.at(-1) ? resolveEventElapsedMs(thoughts.at(-1)!) : null;
  const durationMinutes = firstElapsedMs !== null && lastElapsedMs !== null && lastElapsedMs > firstElapsedMs
    ? (lastElapsedMs - firstElapsedMs) / 60_000
    : 0;
  const dwells: number[] = [];

  for (let index = 1; index < thoughts.length; index += 1) {
    const previous = resolveEventElapsedMs(thoughts[index - 1]);
    const current = resolveEventElapsedMs(thoughts[index]);
    if (previous === null || current === null) {
      continue;
    }

    dwells.push(Math.max(0, current - previous));
  }

  return {
    thoughtCount: thoughts.length,
    densityPerMinute: durationMinutes > 0 ? round(thoughts.length / durationMinutes) : thoughts.length,
    averageDwellMs: dwells.length > 0 ? round(dwells.reduce((total, value) => total + value, 0) / dwells.length) : null,
    maximumDwellMs: dwells.length > 0 ? Math.max(...dwells) : null
  };
};

export const summarizeTelemetrySemantics = (
  events: readonly TelemetryEvent[]
): TelemetrySemanticSummary => {
  const summary = summarizeTelemetryEvents(events);

  return {
    ...summary,
    timingWindows: buildTelemetryEventTimingWindows(events),
    failToRetryContinuation: buildFailToRetryContinuationProxy(events),
    thoughtDwell: buildThoughtDwellProxy(events)
  };
};
