export function buildFeedTimelineFromRuntimeSamples(samples: unknown[]): {
  sampleCount: number;
  snapshotCount: number;
  uniqueMessageCount: number;
  maxDuplicateStreak: number;
  maxUnchangedRunMs: number;
  visibleEntryCount: {
    max: number;
  };
  topMessages: Array<{
    text: string;
    snapshotCount: number;
  }>;
};

export function buildRuntimeSummary(samples: unknown[]): {
  visibility: {
    hiddenSampleCount: number;
    changeCount: number;
    suspendCount: number;
    epochCount: number;
    epochs: Array<Record<string, unknown>>;
  };
};

export function collectTelemetryEventsFromRuntimeSamples(samples: unknown[]): unknown[];

export function buildTelemetrySummaryFromRuntimeSamples(samples: unknown[]): {
  events: unknown[];
  summary: {
    eventCount: number;
    eventCounts: Record<string, number>;
    timingWindows: Array<Record<string, unknown>>;
    failToRetryContinuation: Record<string, unknown>;
    thoughtDwell: Record<string, unknown>;
  };
  latestProjection: unknown;
};

export function buildRuntimeObserveExperiment(options?: Record<string, unknown>): {
  schemaVersion: 1;
  generatedAt: string;
  kind: 'runtime-observe';
  label: string;
  runId: string | null;
  mazeId: string | null;
  attemptNo: number | null;
  variantId: string;
  toggles: Record<string, unknown>;
};

export function resolveRuntimeObserveBaseUrl(baseUrl: string, label?: string): string;
