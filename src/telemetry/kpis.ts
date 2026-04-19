import type { RunProjectionPrivacy } from '../projections/runProjection.ts';
import {
  buildFailToRetryContinuationProxy,
  buildThoughtDwellProxy,
  type TelemetryControlActionGroup,
  type TelemetryControlActionKind,
  type TelemetryControlType,
  type TelemetryEvent,
  type TelemetryMode,
  type TelemetryPlayMetrics
} from './schema.ts';

export interface TelemetryBusinessKpiSummary {
  sessionCount: number;
  averageWatchTimeMs: number | null;
  runsWatchedPerSession: number;
  thoughtBoxDwellMs: number | null;
  failToRetryContinuationRate: number | null;
  controlUsedCount: number;
  control_used_count: number;
  controlUsedByControl: Record<TelemetryControlType, number>;
  control_used_by_control: Record<TelemetryControlType, number>;
  controlUsedByAction: Record<TelemetryControlActionGroup, number>;
  control_used_by_action: Record<TelemetryControlActionGroup, number>;
  pauseControlCount: number;
  restartControlCount: number;
  toggleThoughtsControlCount: number;
  widgetConfiguredCount: number;
  widgetAttachRate: number;
  widget_attach_rate: number;
  activeRunStartCount: number;
  activeRunStartRate: number;
  liveActivityStartCount: number;
  liveActivityStartRate: number;
  live_activity_start_rate: number;
  paywallViewCount: number;
  planSelectedCount: number;
  paywallViewToPlanSelectRate: number | null;
  paywall_view_to_plan_select: number | null;
  purchaseCompletedCount: number;
  paywallViewToPurchaseCompletedRate: number | null;
  paywall_view_to_purchase_completed: number | null;
  purchaseChurnedCount: number;
  paywallToPurchaseConversion: number | null;
  watchToPlaySwitchCount: number;
  watchToPlaySwitchRate: number | null;
  watch_to_play_switch_rate: number | null;
  playFailureCount: number;
  playFailToRetryContinuationCount: number;
  playFailToRetryContinuationRate: number | null;
  play_fail_to_retry_continuation_rate: number | null;
  reducedMotionAdoptionRate: number;
  reduced_motion_adoption: number;
  privateModeAdoptionRate: number;
  private_mode_adoption: number;
  privacyModeCounts: Record<RunProjectionPrivacy, number>;
  currentPrivacyMode: RunProjectionPrivacy | null;
}

const round = (value: number): number => Math.round(value * 1000) / 1000;

const toBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  return null;
};

const normalizeSessionKey = (runId: string | undefined): string | null => {
  if (typeof runId !== 'string' || runId.trim().length === 0) {
    return null;
  }

  return runId
    .trim()
    .replace(/-attempt-\d+$/u, '')
    .replace(/-settings$/u, '')
    .replace(/-preview$/u, '');
};

const resolvePrivacyMode = (
  event: TelemetryEvent,
  fallback: RunProjectionPrivacy | null
): RunProjectionPrivacy | null => {
  if (
    event.privacyMode === 'full'
    || event.privacyMode === 'compact'
    || event.privacyMode === 'private'
  ) {
    return event.privacyMode;
  }

  if (event.kind === 'settings_changed') {
    const settingsEvent = event as TelemetryEvent<'settings_changed'>;
    if (
      settingsEvent.payload.setting === 'privacy_mode'
      && (
        settingsEvent.payload.nextValue === 'full'
        || settingsEvent.payload.nextValue === 'compact'
        || settingsEvent.payload.nextValue === 'private'
      )
    ) {
      return settingsEvent.payload.nextValue;
    }
  }

  return fallback;
};

const isSettingsChangedEvent = (
  event: TelemetryEvent
): event is TelemetryEvent<'settings_changed'> => event.kind === 'settings_changed';

const isRunEndedEvent = (
  event: TelemetryEvent
): event is TelemetryEvent<'run_ended'> => event.kind === 'run_ended';

const addSession = (bucket: Set<string>, event: TelemetryEvent): void => {
  const key = normalizeSessionKey(event.runId);
  if (key) {
    bucket.add(key);
  }
};

const createControlTypeCounts = (): Record<TelemetryControlType, number> => ({
  keyboard: 0,
  touch: 0,
  restart: 0,
  pause: 0,
  toggle_thoughts: 0
});

const createControlActionCounts = (): Record<TelemetryControlActionGroup, number> => ({
  move: 0,
  pause: 0,
  restart: 0,
  toggle_thoughts: 0
});

const resolveControlActionGroup = (actionKind: TelemetryControlActionKind | undefined): TelemetryControlActionGroup | null => {
  if (!actionKind) {
    return null;
  }

  if (actionKind === 'pause') {
    return 'pause';
  }

  if (actionKind === 'restart_attempt') {
    return 'restart';
  }

  if (actionKind === 'toggle_thoughts') {
    return 'toggle_thoughts';
  }

  return actionKind.startsWith('move_') ? 'move' : null;
};

const resolveTelemetryMode = (event: TelemetryEvent): TelemetryMode | null => (
  event.mode === 'watch' || event.mode === 'play'
    ? event.mode
    : event.kind === 'settings_changed'
      ? (() => {
          const settingsEvent = event as TelemetryEvent<'settings_changed'>;
          if (
            settingsEvent.payload.setting === 'mode'
            && (settingsEvent.payload.nextValue === 'watch' || settingsEvent.payload.nextValue === 'play')
          ) {
            return settingsEvent.payload.nextValue;
          }

          return null;
        })()
      : null
);

const buildModeContinuationProxy = (
  events: readonly TelemetryEvent[],
  mode: TelemetryMode
): ReturnType<typeof buildFailToRetryContinuationProxy> => {
  const durations: number[] = [];
  const failures = events.filter((event) => resolveTelemetryMode(event) === mode && (
    event.kind === 'fail_reason' || (
      event.kind === 'run_ended'
      && 'outcome' in event.payload
      && event.payload.outcome === 'failed'
    )
  ));
  const starts = events.filter((event) => resolveTelemetryMode(event) === mode && event.kind === 'run_started');

  for (const failure of failures) {
    const failureElapsedMs = Number.isFinite(failure.elapsedMs) ? Math.max(0, Math.round(failure.elapsedMs ?? 0)) : null;
    if (failureElapsedMs === null) {
      continue;
    }

    const nextStart = starts.find((candidate) => {
      const startElapsedMs = Number.isFinite(candidate.elapsedMs) ? Math.max(0, Math.round(candidate.elapsedMs ?? 0)) : null;
      return startElapsedMs !== null && startElapsedMs > failureElapsedMs;
    });
    const nextStartElapsedMs = nextStart && Number.isFinite(nextStart.elapsedMs)
      ? Math.max(0, Math.round(nextStart.elapsedMs ?? 0))
      : null;
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

  const round = (value: number): number => Math.round(value * 1000) / 1000;
  return {
    continuationCount: durations.length,
    averageMs: round(durations.reduce((total, value) => total + value, 0) / durations.length),
    minimumMs: Math.min(...durations),
    maximumMs: Math.max(...durations)
  };
};

export const buildTelemetryBusinessKpis = (
  events: readonly TelemetryEvent[],
  options: {
    sessionCount?: number | null;
    privacyMode?: RunProjectionPrivacy | null;
  } = {}
): TelemetryBusinessKpiSummary => {
  const derivedSessions = new Set<string>();
  const widgetSessions = new Set<string>();
  const activeRunSessions = new Set<string>();
  const liveActivitySessions = new Set<string>();
  const paywallSessions = new Set<string>();
  const planSelectedSessions = new Set<string>();
  const purchaseSessions = new Set<string>();
  const reducedMotionSessions = new Set<string>();
  const privateModeSessions = new Set<string>();
  const watchModeSessions = new Set<string>();
  const failureKeys = new Set<string>();
  const playFailureKeys = new Set<string>();
  const controlUsedByControl = createControlTypeCounts();
  const controlUsedByAction = createControlActionCounts();
  let watchToPlaySwitchCount = 0;
  const watchDurations: number[] = [];
  const privacyModeCounts: Record<RunProjectionPrivacy, number> = {
    full: 0,
    compact: 0,
    private: 0
  };

  let currentPrivacyMode = options.privacyMode ?? null;

  for (const event of events) {
    addSession(derivedSessions, event);

    const privacyMode = resolvePrivacyMode(event, currentPrivacyMode);
    if (privacyMode) {
      privacyModeCounts[privacyMode] += 1;
      currentPrivacyMode = privacyMode;
      if (privacyMode === 'private') {
        addSession(privateModeSessions, event);
      }
    }

    if (event.kind === 'run_started') {
      addSession(activeRunSessions, event);
    }

    if (event.kind === 'widget_configured') {
      addSession(widgetSessions, event);
    }

    if (event.kind === 'live_activity_started') {
      addSession(liveActivitySessions, event);
    }

    if (event.kind === 'control_used') {
      const controlEvent = event as TelemetryEvent<'control_used'>;
      controlUsedByControl[controlEvent.payload.control] += 1;
      const actionGroup = resolveControlActionGroup(controlEvent.payload.actionKind);
      if (actionGroup) {
        controlUsedByAction[actionGroup] += 1;
      }
    }

    if (event.kind === 'paywall_viewed') {
      addSession(paywallSessions, event);
    }

    if (event.kind === 'plan_selected') {
      addSession(planSelectedSessions, event);
    }

    if (event.kind === 'purchase_completed') {
      addSession(purchaseSessions, event);
    }

    if (isSettingsChangedEvent(event)) {
      if (event.payload.setting === 'reduced_motion' && toBoolean(event.payload.nextValue) === true) {
        addSession(reducedMotionSessions, event);
      }

      if (event.payload.setting === 'privacy_mode' && event.payload.nextValue === 'private') {
        addSession(privateModeSessions, event);
      }

      if (
        event.payload.setting === 'mode'
        && event.payload.previousValue === 'watch'
        && event.payload.nextValue === 'play'
      ) {
        watchToPlaySwitchCount += 1;
      }
    }

    const telemetryMode = resolveTelemetryMode(event);
    if (telemetryMode === 'watch') {
      addSession(watchModeSessions, event);
    }

    if (isRunEndedEvent(event) && event.payload.outcome === 'failed' && typeof event.runId === 'string') {
      failureKeys.add(`${event.runId}|${event.attemptNo ?? 0}`);
      if (telemetryMode === 'play') {
        playFailureKeys.add(`${event.runId}|${event.attemptNo ?? 0}`);
      }
    }

    if (event.kind === 'fail_reason' && typeof event.runId === 'string') {
      failureKeys.add(`${event.runId}|${event.attemptNo ?? 0}`);
      if (telemetryMode === 'play') {
        playFailureKeys.add(`${event.runId}|${event.attemptNo ?? 0}`);
      }
    }

    if (isRunEndedEvent(event) && Number.isFinite(event.payload.durationMs)) {
      watchDurations.push(Math.max(0, Math.round(event.payload.durationMs ?? 0)));
    }
  }

  const sessionCount = Math.max(
    1,
    Math.trunc(
      Number.isFinite(options.sessionCount)
        ? options.sessionCount ?? 1
        : derivedSessions.size > 0
          ? derivedSessions.size
          : 1
    )
  );
  const thoughtDwell = buildThoughtDwellProxy(events);
  const continuation = buildFailToRetryContinuationProxy(events);
  const playContinuation = buildModeContinuationProxy(events, 'play');
  const paywallViewCount = events.filter((event) => event.kind === 'paywall_viewed').length;
  const planSelectedCount = events.filter((event) => event.kind === 'plan_selected').length;
  const purchaseCompletedCount = events.filter((event) => event.kind === 'purchase_completed').length;
  const purchaseChurnedCount = events.filter((event) => event.kind === 'purchase_churned').length;
  const controlUsedCount = events.filter((event) => event.kind === 'control_used').length;
  const widgetConfiguredCount = events.filter((event) => event.kind === 'widget_configured').length;
  const activeRunStartCount = events.filter((event) => event.kind === 'run_started').length;
  const liveActivityStartCount = events.filter((event) => event.kind === 'live_activity_started').length;
  const playFailureCount = playFailureKeys.size;
  const playFailToRetryContinuationCount = playContinuation.continuationCount;

  return {
    sessionCount,
    averageWatchTimeMs: watchDurations.length > 0
      ? round(watchDurations.reduce((total, value) => total + value, 0) / watchDurations.length)
      : null,
    runsWatchedPerSession: round(activeRunStartCount / sessionCount),
    thoughtBoxDwellMs: thoughtDwell.averageDwellMs,
    failToRetryContinuationRate: failureKeys.size > 0
      ? round(continuation.continuationCount / failureKeys.size)
      : null,
    controlUsedCount,
    control_used_count: controlUsedCount,
    controlUsedByControl,
    control_used_by_control: controlUsedByControl,
    controlUsedByAction,
    control_used_by_action: controlUsedByAction,
    pauseControlCount: controlUsedByAction.pause,
    restartControlCount: controlUsedByAction.restart,
    toggleThoughtsControlCount: controlUsedByAction.toggle_thoughts,
    widgetConfiguredCount,
    widgetAttachRate: round(widgetSessions.size / sessionCount),
    widget_attach_rate: round(widgetSessions.size / sessionCount),
    activeRunStartCount,
    activeRunStartRate: round(activeRunSessions.size / sessionCount),
    liveActivityStartCount,
    liveActivityStartRate: round(liveActivitySessions.size / sessionCount),
    live_activity_start_rate: round(liveActivitySessions.size / sessionCount),
    paywallViewCount,
    planSelectedCount,
    paywallViewToPlanSelectRate: paywallSessions.size > 0
      ? round(planSelectedSessions.size / paywallSessions.size)
      : null,
    paywall_view_to_plan_select: paywallSessions.size > 0
      ? round(planSelectedSessions.size / paywallSessions.size)
      : null,
    purchaseCompletedCount,
    paywallViewToPurchaseCompletedRate: paywallSessions.size > 0
      ? round(purchaseSessions.size / paywallSessions.size)
      : null,
    paywall_view_to_purchase_completed: paywallSessions.size > 0
      ? round(purchaseSessions.size / paywallSessions.size)
      : null,
    purchaseChurnedCount,
    paywallToPurchaseConversion: paywallSessions.size > 0
      ? round(purchaseSessions.size / paywallSessions.size)
      : null,
    watchToPlaySwitchCount,
    watchToPlaySwitchRate: watchModeSessions.size > 0
      ? round(watchToPlaySwitchCount / watchModeSessions.size)
      : null,
    watch_to_play_switch_rate: watchModeSessions.size > 0
      ? round(watchToPlaySwitchCount / watchModeSessions.size)
      : null,
    playFailureCount,
    playFailToRetryContinuationCount,
    playFailToRetryContinuationRate: playFailureCount > 0
      ? round(playFailToRetryContinuationCount / playFailureCount)
      : null,
    play_fail_to_retry_continuation_rate: playFailureCount > 0
      ? round(playFailToRetryContinuationCount / playFailureCount)
      : null,
    reducedMotionAdoptionRate: round(reducedMotionSessions.size / sessionCount),
    reduced_motion_adoption: round(reducedMotionSessions.size / sessionCount),
    privateModeAdoptionRate: round(privateModeSessions.size / sessionCount),
    private_mode_adoption: round(privateModeSessions.size / sessionCount),
    privacyModeCounts,
    currentPrivacyMode
  };
};

export const buildTelemetryPlayMetrics = (
  kpis: TelemetryBusinessKpiSummary
): TelemetryPlayMetrics => ({
  controlUsedCount: kpis.controlUsedCount,
  controlUsedByControl: kpis.controlUsedByControl,
  controlUsedByAction: kpis.controlUsedByAction,
  watchToPlaySwitchCount: kpis.watchToPlaySwitchCount,
  watchToPlaySwitchRate: kpis.watchToPlaySwitchRate,
  playFailureCount: kpis.playFailureCount,
  playFailToRetryContinuationCount: kpis.playFailToRetryContinuationCount,
  playFailToRetryContinuationRate: kpis.playFailToRetryContinuationRate
});
