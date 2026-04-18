export const MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY = '__MAZER_RUNTIME_DIAGNOSTICS__' as const;

export type MenuScenePerformanceMode = 'full' | 'throttled' | 'hidden';

export interface MenuSceneRuntimeTuning {
  diagnosticsPublishIntervalMs: number;
  recentFrameWindow: number;
  heapSampleWindow: number;
  degradeAverageFrameMs: number;
  recoverAverageFrameMs: number;
  degradeSpikeCount: number;
  recoverSpikeCount: number;
  heapGrowthThrottleBytes: number;
  heapGrowthRecoverBytes: number;
  postHiddenRecoveryMs: number;
  spikeFrameMs: number;
  lowPowerHardwareConcurrencyMax: number;
  ambientUpdateIntervalMs: Record<MenuScenePerformanceMode, number>;
  deferredTasksPerFrame: Record<MenuScenePerformanceMode, number>;
}

export interface MenuSceneRuntimeConfig {
  enabled: boolean;
  lowPowerDetected: boolean;
  lowPowerForced: boolean;
  lowPowerActive: boolean;
  hardwareConcurrency: number | null;
  saveData: boolean;
}

export interface MenuSceneFrameWindowSummary {
  count: number;
  averageMs: number;
  worstMs: number;
  spikeCount: number;
  fps: number;
}

export interface MenuSceneRuntimeFeedEntrySnapshot {
  id: string;
  speaker: string;
  kind: string;
  importance: string;
  summary: string;
  slot: number;
}

export interface MenuSceneRuntimeFeedDiagnostics {
  step: number | null;
  signature: string;
  visibleEntryCount: number;
  visibleEntries: MenuSceneRuntimeFeedEntrySnapshot[];
  changeCount: number;
  lastChangedAt: number | null;
}

export interface MenuSceneRuntimeDiagnostics {
  revision: number;
  sceneInstanceId: number;
  updatedAt: number;
  runtimeMs: number;
  visibility: {
    hidden: boolean;
    changeCount: number;
    suspendCount: number;
  };
  performance: {
    mode: MenuScenePerformanceMode;
    averageFrameMs: number;
    recentAverageFrameMs: number;
    recentFrameCount: number;
    worstFrameMs: number;
    worstRecentFrameMs: number;
    spikeCount: number;
    recentSpikeCount: number;
    estimatedFps: number;
    lowPowerDetected: boolean;
    lowPowerForced: boolean;
    lowPowerActive: boolean;
    heapPressureActive: boolean;
    postHiddenRecoveryActive: boolean;
    hardwareConcurrency: number | null;
    saveData: boolean;
  };
  feed: MenuSceneRuntimeFeedDiagnostics;
  resources: {
    activeTweens: number;
    activeTimers: number;
    listenerCount: number;
    listenerBreakdown: {
      sceneUpdate: number;
      sceneShutdown: number;
      scaleResize: number;
      visibilityAttached: boolean;
      installSurfaceAttached: boolean;
    };
    trailSegmentCount: number;
    trailSegmentCap: number;
    intentEntryCount: number;
    intentEntryCap: number;
    deferredVisualTasksRemaining: number;
    deferredTasksPerFrameCap: number;
    background: {
      clouds: number;
      farStars: number;
      nearStars: number;
      twinkles: number;
      veils: number;
      driftMotes: number;
      moving: number;
      movingCap: number;
      signatureCap: number;
    };
    jsHeap?: {
      usedBytes: number;
      totalBytes?: number;
      limitBytes?: number;
    };
  };
}

declare global {
  interface Window {
    __MAZER_RUNTIME_DIAGNOSTICS__?: MenuSceneRuntimeDiagnostics;
    __MAZER_MENU_SCENE_INSTANCE__?: number;
  }
}

const TRUTHY_PARAM_VALUES = new Set(['1', 'true', 'yes', 'on']);

let fallbackSceneInstanceId = 0;

const resolveRuntimeWindow = (): Window | undefined => (
  typeof window === 'undefined' ? undefined : window
);

const normalizeFeedSummary = (value: string): string => value.trim().replace(/\s+/g, ' ');

const buildFeedSignature = (
  entries: readonly MenuSceneRuntimeFeedEntrySnapshot[]
): string => entries
  .map((entry) => [
    entry.speaker,
    entry.kind,
    entry.importance,
    normalizeFeedSummary(entry.summary),
    entry.slot
  ].join('|'))
  .join('||');

const isTruthyParam = (value: string | null | undefined): boolean => (
  value !== null && value !== undefined && TRUTHY_PARAM_VALUES.has(value.toLowerCase())
);

const toSearchParams = (search?: string | URLSearchParams): URLSearchParams => {
  if (search instanceof URLSearchParams) {
    return search;
  }

  if (typeof search !== 'string' || search.length === 0) {
    return new URLSearchParams();
  }

  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
};

export const resolveMenuSceneRuntimeConfig = (
  search?: string | URLSearchParams,
  options: {
    hardwareConcurrency?: number | null;
    saveData?: boolean | null;
    lowPowerHardwareConcurrencyMax?: number;
  } = {}
): MenuSceneRuntimeConfig => {
  const params = toSearchParams(search);
  const enabled = isTruthyParam(params.get('runtimeDiagnostics'))
    || isTruthyParam(params.get('runtime'))
    || isTruthyParam(params.get('soak'));
  const lowPowerForced = isTruthyParam(params.get('lowPower'))
    || (params.get('power') ?? '').toLowerCase() === 'low';
  const hardwareConcurrency = typeof options.hardwareConcurrency === 'number' && Number.isFinite(options.hardwareConcurrency)
    ? options.hardwareConcurrency
    : null;
  const saveData = options.saveData === true;
  const hardwareLimit = Math.max(1, Math.trunc(options.lowPowerHardwareConcurrencyMax ?? 4));
  const lowPowerDetected = saveData
    || (hardwareConcurrency !== null && hardwareConcurrency > 0 && hardwareConcurrency <= hardwareLimit);

  return {
    enabled,
    lowPowerDetected,
    lowPowerForced,
    lowPowerActive: lowPowerForced || lowPowerDetected,
    hardwareConcurrency,
    saveData
  };
};

export const resolveMenuScenePerformanceMode = (
  previousMode: MenuScenePerformanceMode,
  options: {
    hidden: boolean;
    lowPowerActive: boolean;
    recentAverageFrameMs: number;
    recentSpikeCount: number;
    heapPressureActive?: boolean;
    recoveryHoldActive?: boolean;
    tuning: Pick<
      MenuSceneRuntimeTuning,
      'degradeAverageFrameMs'
      | 'recoverAverageFrameMs'
      | 'degradeSpikeCount'
      | 'recoverSpikeCount'
    >;
  }
): MenuScenePerformanceMode => {
  if (options.hidden) {
    return 'hidden';
  }

  if (options.lowPowerActive) {
    return 'throttled';
  }

  if (options.heapPressureActive === true || options.recoveryHoldActive === true) {
    return 'throttled';
  }

  const recentAverageFrameMs = Number.isFinite(options.recentAverageFrameMs)
    ? options.recentAverageFrameMs
    : 0;
  const recentSpikeCount = Number.isFinite(options.recentSpikeCount)
    ? Math.max(0, Math.trunc(options.recentSpikeCount))
    : 0;

  if (previousMode === 'throttled') {
    return recentAverageFrameMs > options.tuning.recoverAverageFrameMs
      || recentSpikeCount > options.tuning.recoverSpikeCount
      ? 'throttled'
      : 'full';
  }

  return recentAverageFrameMs >= options.tuning.degradeAverageFrameMs
    || recentSpikeCount >= options.tuning.degradeSpikeCount
    ? 'throttled'
    : 'full';
};

export const summarizeMenuSceneFrameWindow = (
  frameTimesMs: readonly number[],
  spikeFrameMs: number
): MenuSceneFrameWindowSummary => {
  const count = frameTimesMs.length;
  if (count <= 0) {
    return {
      count: 0,
      averageMs: 0,
      worstMs: 0,
      spikeCount: 0,
      fps: 0
    };
  }

  let totalMs = 0;
  let worstMs = 0;
  let spikeCount = 0;

  for (const sample of frameTimesMs) {
    const safeSample = Number.isFinite(sample) ? Math.max(0, sample) : 0;
    totalMs += safeSample;
    worstMs = Math.max(worstMs, safeSample);
    if (safeSample >= spikeFrameMs) {
      spikeCount += 1;
    }
  }

  const averageMs = totalMs / count;
  return {
    count,
    averageMs: Number(averageMs.toFixed(3)),
    worstMs: Number(worstMs.toFixed(3)),
    spikeCount,
    fps: averageMs > 0 ? Number((1000 / averageMs).toFixed(2)) : 0
  };
};

export const summarizeMenuSceneRuntimeFeed = (options: {
  step?: number | null;
  visibleEntries?: readonly MenuSceneRuntimeFeedEntrySnapshot[] | null;
  previous?: MenuSceneRuntimeFeedDiagnostics | null;
  nowMs: number;
}): MenuSceneRuntimeFeedDiagnostics => {
  const visibleEntries = (options.visibleEntries ?? [])
    .slice()
    .sort((left, right) => left.slot - right.slot)
    .map((entry) => ({
      ...entry,
      summary: normalizeFeedSummary(entry.summary)
    }));
  const signature = buildFeedSignature(visibleEntries);
  const previous = options.previous;
  const changed = signature !== (previous?.signature ?? '');

  return {
    step: Number.isFinite(options.step) ? Math.max(0, Math.trunc(options.step ?? 0)) : null,
    signature,
    visibleEntryCount: visibleEntries.length,
    visibleEntries,
    changeCount: (previous?.changeCount ?? 0) + (changed ? 1 : 0),
    lastChangedAt: changed ? Math.max(0, Math.round(options.nowMs)) : (previous?.lastChangedAt ?? null)
  };
};

export const nextMenuSceneInstanceId = (): number => {
  const runtime = resolveRuntimeWindow();
  if (!runtime) {
    fallbackSceneInstanceId += 1;
    return fallbackSceneInstanceId;
  }

  runtime.__MAZER_MENU_SCENE_INSTANCE__ = (runtime.__MAZER_MENU_SCENE_INSTANCE__ ?? 0) + 1;
  return runtime.__MAZER_MENU_SCENE_INSTANCE__;
};

export const publishMenuSceneRuntimeDiagnostics = (
  diagnostics?: MenuSceneRuntimeDiagnostics
): void => {
  const runtime = resolveRuntimeWindow();
  if (!runtime) {
    return;
  }

  if (!diagnostics) {
    delete runtime[MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY];
    return;
  }

  runtime[MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY] = diagnostics;
};

export const clearMenuSceneRuntimeDiagnostics = (): void => {
  publishMenuSceneRuntimeDiagnostics();
};
