export interface PlaybookTuningWeights {
  frontierValue: number;
  backtrackUrgency: number;
  trapSuspicion: number;
  enemyRisk: number;
  itemValue: number;
  puzzleValue: number;
  rotationTiming: number;
}

const clampWeight = (value: number): number => Number(Math.min(1.6, Math.max(0.4, value)).toFixed(4));

export const createDefaultPlaybookTuningWeights = (): PlaybookTuningWeights => ({
  frontierValue: 1,
  backtrackUrgency: 1,
  trapSuspicion: 1,
  enemyRisk: 1,
  itemValue: 1,
  puzzleValue: 1,
  rotationTiming: 1
});

export const normalizePlaybookTuningWeights = (
  weights: Partial<PlaybookTuningWeights> | null | undefined
): PlaybookTuningWeights => {
  const defaults = createDefaultPlaybookTuningWeights();

  return {
    frontierValue: clampWeight(weights?.frontierValue ?? defaults.frontierValue),
    backtrackUrgency: clampWeight(weights?.backtrackUrgency ?? defaults.backtrackUrgency),
    trapSuspicion: clampWeight(weights?.trapSuspicion ?? defaults.trapSuspicion),
    enemyRisk: clampWeight(weights?.enemyRisk ?? defaults.enemyRisk),
    itemValue: clampWeight(weights?.itemValue ?? defaults.itemValue),
    puzzleValue: clampWeight(weights?.puzzleValue ?? defaults.puzzleValue),
    rotationTiming: clampWeight(weights?.rotationTiming ?? defaults.rotationTiming)
  };
};
