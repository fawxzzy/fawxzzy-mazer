import type { HeadingToken, LocalObservation, TileId, VisibleLandmark } from '../agent/types';
import runtimeBenchmarkPackJson from './runtime-benchmark-pack.json';

export type RuntimeBenchmarkDistrictType =
  | 'labyrinth-tutorial'
  | 'puzzle'
  | 'loopy-combat-capable'
  | 'scavenger-checkpoint'
  | 'vantage-observatory';

export type RuntimeBenchmarkMetricName =
  | 'discoveryEfficiency'
  | 'backtrackPressure'
  | 'trapFalsePositiveRate'
  | 'trapFalseNegativeRate'
  | 'wardenPressureExposure'
  | 'itemUsefulnessScore'
  | 'puzzleStateClarityScore';

export interface RuntimeBenchmarkMetricBand {
  min: number;
  max: number;
}

export interface RuntimeBenchmarkCandidateOutcome {
  discoveredTilesDelta: number;
  backtrackDelta: number;
  trapCueCount: number;
  enemyCueCount: number;
  itemCueCount: number;
  puzzleCueCount: number;
  timingCueCount: number;
  localCues: string[];
}

export interface RuntimeBenchmarkCandidateContract {
  tileId: TileId;
  targetKind: 'frontier' | 'goal' | 'backtrack';
  path: TileId[];
  heuristicScore: number;
  visitCount: number;
  unexploredNeighborCount: number;
  trapRisk: number;
  enemyPressure: number;
  itemOpportunity: number;
  puzzleOpportunity: number;
  timingWindow: number;
  outcome: RuntimeBenchmarkCandidateOutcome;
}

export interface RuntimeBenchmarkStepContract {
  tileId: TileId;
  label: string;
  heading: HeadingToken;
  traversableTileIds: TileId[];
  localCues: string[];
  visibleLandmarks: VisibleLandmark[];
  goal: LocalObservation['goal'];
  moveToTileId: TileId | null;
  candidates: RuntimeBenchmarkCandidateContract[];
}

export interface RuntimeBenchmarkScenarioContract {
  id: string;
  label: string;
  districtType: RuntimeBenchmarkDistrictType;
  seed: string;
  variant: string;
  expectedMetricBands: Partial<Record<RuntimeBenchmarkMetricName, RuntimeBenchmarkMetricBand>>;
  steps: RuntimeBenchmarkStepContract[];
}

export interface RuntimeBenchmarkPack {
  schemaVersion: 1;
  packId: string;
  label: string;
  scenarios: RuntimeBenchmarkScenarioContract[];
}

const cloneGoal = (goal: LocalObservation['goal']): LocalObservation['goal'] => (
  goal.visible
    ? { ...goal }
    : { visible: false, tileId: null }
);

const cloneLandmarks = (landmarks: readonly VisibleLandmark[]): VisibleLandmark[] => (
  landmarks.map((landmark) => ({ ...landmark }))
);

const cloneCandidateOutcome = (
  outcome: RuntimeBenchmarkCandidateOutcome
): RuntimeBenchmarkCandidateOutcome => ({
  ...outcome,
  localCues: [...outcome.localCues]
});

const cloneCandidate = (
  candidate: RuntimeBenchmarkCandidateContract
): RuntimeBenchmarkCandidateContract => ({
  ...candidate,
  path: [...candidate.path],
  outcome: cloneCandidateOutcome(candidate.outcome)
});

const cloneStep = (step: RuntimeBenchmarkStepContract): RuntimeBenchmarkStepContract => ({
  ...step,
  traversableTileIds: [...step.traversableTileIds],
  localCues: [...step.localCues],
  visibleLandmarks: cloneLandmarks(step.visibleLandmarks),
  goal: cloneGoal(step.goal),
  moveToTileId: step.moveToTileId ?? null,
  candidates: step.candidates.map(cloneCandidate)
});

const cloneScenario = (
  scenario: RuntimeBenchmarkScenarioContract
): RuntimeBenchmarkScenarioContract => ({
  ...scenario,
  expectedMetricBands: Object.fromEntries(
    Object.entries(scenario.expectedMetricBands).map(([metricName, band]) => [
      metricName,
      band ? { ...band } : band
    ])
  ),
  steps: scenario.steps.map(cloneStep)
});

const runtimeBenchmarkPack = runtimeBenchmarkPackJson as RuntimeBenchmarkPack;

export const getRuntimeBenchmarkPack = (): RuntimeBenchmarkPack => ({
  schemaVersion: runtimeBenchmarkPack.schemaVersion,
  packId: runtimeBenchmarkPack.packId,
  label: runtimeBenchmarkPack.label,
  scenarios: runtimeBenchmarkPack.scenarios.map(cloneScenario)
});

export const getRuntimeBenchmarkScenarioIds = (): string[] => (
  runtimeBenchmarkPack.scenarios.map((scenario) => scenario.id)
);

export const findRuntimeBenchmarkScenarioById = (
  scenarioId: string
): RuntimeBenchmarkScenarioContract | null => {
  const scenario = runtimeBenchmarkPack.scenarios.find((entry) => entry.id === scenarioId);
  return scenario ? cloneScenario(scenario) : null;
};

export const findRuntimeBenchmarkScenarioBySeed = (
  seed: string
): RuntimeBenchmarkScenarioContract | null => {
  const scenario = runtimeBenchmarkPack.scenarios.find((entry) => entry.seed === seed);
  return scenario ? cloneScenario(scenario) : null;
};

export const assertRuntimeBenchmarkScenarioIds = (
  scenarioIds: readonly string[]
): RuntimeBenchmarkScenarioContract[] => scenarioIds.map((scenarioId) => {
  const scenario = findRuntimeBenchmarkScenarioById(scenarioId);
  if (!scenario) {
    throw new Error(`Unknown runtime benchmark scenario id: ${scenarioId}`);
  }

  return scenario;
});
