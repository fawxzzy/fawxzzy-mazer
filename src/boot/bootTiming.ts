export interface BootTimingCheckpoint {
  label: string;
  atMs: number;
  elapsedMs: number;
  deltaMs: number;
}

export interface BootTimingReport {
  enabled: boolean;
  startedAtMs: number;
  finishedAtMs: number;
  totalMs: number;
  checkpoints: BootTimingCheckpoint[];
  summary: string;
}

export const BOOT_TIMING_METRIC_LABELS = {
  preloadStart: 'boot-scene:preload-start',
  createCoreReady: 'menu-scene:create-core-ready',
  deferredVisualSetup: 'menu-scene:deferred-visual-setup',
  firstInteractiveFrame: 'menu-scene:first-interactive-frame'
} as const;

export type BootTimingMetricKey = keyof typeof BOOT_TIMING_METRIC_LABELS;

export interface BootTimingMetricSummary extends BootTimingCheckpoint {
  key: BootTimingMetricKey;
}

export interface BootTimingArtifact {
  schemaVersion: 1;
  createdAt: string;
  totalMs: number;
  summary: string;
  metrics: Record<BootTimingMetricKey, BootTimingMetricSummary | null>;
  checkpoints: BootTimingCheckpoint[];
}

export interface BootTimingArtifactDiff {
  totalMsDelta: number;
  metricDeltas: Record<BootTimingMetricKey, number | null>;
}

interface BootTimingState {
  enabled: boolean;
  startedAtMs?: number;
  marks: Array<{ label: string; atMs: number }>;
  reportLogged: boolean;
}

const DEFAULT_BOOT_TIMING_LABEL = 'boot:start';
export const BOOT_TIMING_WINDOW_KEY = '__MAZER_BOOT_TIMING__' as const;

declare global {
  interface Window {
    __MAZER_BOOT_TIMING__?: BootTimingReport;
  }
}

function createEmptyBootTimingState(): BootTimingState {
  return {
    enabled: false,
    startedAtMs: undefined,
    marks: [],
    reportLogged: false
  };
}

let bootTimingState: BootTimingState = createEmptyBootTimingState();

const resolveBootTimingWindow = (): Window | undefined => (
  typeof window === 'undefined' ? undefined : window
);

const publishBootTimingReport = (report?: BootTimingReport): void => {
  const runtime = resolveBootTimingWindow();
  if (!runtime) {
    return;
  }

  if (!report) {
    delete runtime[BOOT_TIMING_WINDOW_KEY];
    return;
  }

  runtime[BOOT_TIMING_WINDOW_KEY] = report;
};

const now = (overrideNow?: number): number => (
  typeof overrideNow === 'number' && Number.isFinite(overrideNow)
    ? overrideNow
    : typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()
);

const resolveBootTimingEnabled = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const search = typeof window.location?.search === 'string' ? window.location.search : '';
    if (!search) {
      return false;
    }

    const params = new URLSearchParams(search);
    return ['1', 'true', 'yes', 'on'].includes((params.get('bootTiming') ?? params.get('timing') ?? '').toLowerCase());
  } catch {
    return false;
  }
};

export const startBootTiming = (
  label = DEFAULT_BOOT_TIMING_LABEL,
  options: { enabled?: boolean; now?: number } = {}
): BootTimingCheckpoint => {
  bootTimingState = createEmptyBootTimingState();
  publishBootTimingReport();
  bootTimingState.enabled = options.enabled ?? resolveBootTimingEnabled();
  bootTimingState.startedAtMs = now(options.now);
  return markBootTiming(label, options);
};

const composeBootTimingReport = (finishedAtMs: number): BootTimingReport | undefined => {
  if (bootTimingState.startedAtMs === undefined || bootTimingState.marks.length === 0) {
    return undefined;
  }

  const checkpoints = bootTimingState.marks.map((mark, index): BootTimingCheckpoint => {
    const previousAtMs = index > 0
      ? bootTimingState.marks[index - 1]?.atMs ?? bootTimingState.startedAtMs ?? mark.atMs
      : bootTimingState.startedAtMs ?? mark.atMs;
    return {
      label: mark.label,
      atMs: mark.atMs,
      elapsedMs: Math.max(0, mark.atMs - (bootTimingState.startedAtMs ?? mark.atMs)),
      deltaMs: Math.max(0, mark.atMs - previousAtMs)
    };
  });
  const summary = checkpoints
    .map((checkpoint) => `${checkpoint.label} +${checkpoint.deltaMs.toFixed(1)}ms`)
    .join(' | ');

  return {
    enabled: bootTimingState.enabled,
    startedAtMs: bootTimingState.startedAtMs,
    finishedAtMs,
    totalMs: Math.max(0, finishedAtMs - bootTimingState.startedAtMs),
    checkpoints,
    summary
  };
};

export const markBootTiming = (
  label: string,
  options: { now?: number } = {}
): BootTimingCheckpoint => {
  if (bootTimingState.startedAtMs === undefined) {
    startBootTiming(DEFAULT_BOOT_TIMING_LABEL, { now: options.now });
  }

  const atMs = now(options.now);
  const previousAtMs = bootTimingState.marks.at(-1)?.atMs ?? bootTimingState.startedAtMs ?? atMs;
  const checkpoint: BootTimingCheckpoint = {
    label,
    atMs,
    elapsedMs: Math.max(0, atMs - (bootTimingState.startedAtMs ?? atMs)),
    deltaMs: Math.max(0, atMs - previousAtMs)
  };

  bootTimingState.marks.push({ label, atMs });
  publishBootTimingReport(composeBootTimingReport(atMs));

  return checkpoint;
};

export const buildBootTimingReport = (
  options: { now?: number } = {}
): BootTimingReport | undefined => {
  const finishedAtMs = now(options.now);
  const report = composeBootTimingReport(finishedAtMs);
  publishBootTimingReport(report);
  return report;
};

export const resolveBootTimingMetrics = (
  report: BootTimingReport | undefined
): Record<BootTimingMetricKey, BootTimingMetricSummary | null> => {
  const metrics = {} as Record<BootTimingMetricKey, BootTimingMetricSummary | null>;
  const checkpoints = report?.checkpoints ?? [];

  (Object.entries(BOOT_TIMING_METRIC_LABELS) as Array<[BootTimingMetricKey, string]>).forEach(([key, label]) => {
    const checkpoint = checkpoints.find((entry) => entry.label === label);
    metrics[key] = checkpoint ? { key, ...checkpoint } : null;
  });

  return metrics;
};

export const createBootTimingArtifact = (
  report: BootTimingReport | undefined,
  options: { createdAt?: string } = {}
): BootTimingArtifact | undefined => {
  if (!report) {
    return undefined;
  }

  return {
    schemaVersion: 1,
    createdAt: options.createdAt ?? new Date().toISOString(),
    totalMs: report.totalMs,
    summary: report.summary,
    metrics: resolveBootTimingMetrics(report),
    checkpoints: report.checkpoints
  };
};

export const diffBootTimingArtifacts = (
  before: BootTimingArtifact | undefined,
  after: BootTimingArtifact | undefined
): BootTimingArtifactDiff | undefined => {
  if (!before || !after) {
    return undefined;
  }

  const metricDeltas = {} as Record<BootTimingMetricKey, number | null>;
  (Object.keys(BOOT_TIMING_METRIC_LABELS) as BootTimingMetricKey[]).forEach((key) => {
    const beforeMetric = before.metrics[key];
    const afterMetric = after.metrics[key];
    metricDeltas[key] = beforeMetric && afterMetric
      ? Number((afterMetric.elapsedMs - beforeMetric.elapsedMs).toFixed(1))
      : null;
  });

  return {
    totalMsDelta: Number((after.totalMs - before.totalMs).toFixed(1)),
    metricDeltas
  };
};

export const logBootTimingReport = (
  label = 'Mazer boot timing',
  options: { now?: number } = {}
): BootTimingReport | undefined => {
  const report = buildBootTimingReport(options);
  if (!report || !report.enabled || bootTimingState.reportLogged) {
    return report;
  }

  bootTimingState.reportLogged = true;
  console.info(`[${label}] ${report.summary}`);
  console.table(
    report.checkpoints.map((checkpoint) => ({
      stage: checkpoint.label,
      elapsedMs: Number(checkpoint.elapsedMs.toFixed(1)),
      deltaMs: Number(checkpoint.deltaMs.toFixed(1))
    }))
  );

  return report;
};

export const resetBootTimingForTests = (): void => {
  bootTimingState = createEmptyBootTimingState();
  publishBootTimingReport();
};
