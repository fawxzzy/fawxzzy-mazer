export function buildSummary(input: {
  samples: unknown[];
  durationSeconds: number;
  lowPower: boolean;
  restartCycles: number;
  restartMode: string;
  completedRestartCycles: number;
  hiddenWindowMs: number;
}): {
  visibility: {
    hiddenSampleCount: number;
    changeCount: number;
    suspendCount: number;
    epochCount: number;
    epochs: Array<Record<string, unknown>>;
  };
  restart: {
    pass: boolean;
  };
};
