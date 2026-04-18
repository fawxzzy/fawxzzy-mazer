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
