import { RuntimeAdapterBridge, type RuntimeAdapterHost, type RuntimeEpisodeDelivery, type RuntimeIntentDelivery, type RuntimeMoveApplication, type RuntimeObservationProjection, type RuntimeTrailDelivery } from '../adapters';
import type { ExplorerSnapshot, HeadingToken, LocalObservation, PolicyActionCandidate, PolicyCandidateSignalMap, PolicyEpisode, PolicyScorer, PolicyScorerInput, TileId, VisibleLandmark } from '../agent/types';
import { createRuntimeEpisodeReplayHost, type RuntimeEpisodeLog, type RuntimeEpisodeLogEntry } from '../logging';
import { PlaybookPatternScorer, type PlaybookTuningWeights } from '../playbook';
import {
  assertRuntimeBenchmarkScenarioIds,
  getRuntimeBenchmarkPack,
  type RuntimeBenchmarkCandidateContract,
  type RuntimeBenchmarkDistrictType,
  type RuntimeBenchmarkMetricBand,
  type RuntimeBenchmarkMetricName,
  type RuntimeBenchmarkScenarioContract,
  type RuntimeBenchmarkStepContract
} from './RuntimeBenchmarkPack';

export type RuntimeEvalFocus = 'trap' | 'warden' | 'item' | 'puzzle' | 'rotation';

export interface RuntimeEvalScenarioStepSpec {
  tileId: TileId;
  label: string;
  heading: HeadingToken;
  traversableTileIds: readonly TileId[];
  localCues: readonly string[];
  visibleLandmarks: readonly VisibleLandmark[];
  goal: LocalObservation['goal'];
  candidateSignals?: PolicyCandidateSignalMap;
  moveToTileId: TileId | null;
  traversedConnectorId?: string | null;
  traversedConnectorLabel?: string | null;
}

export interface RuntimeEvalScenarioSpec {
  id: string;
  focus: RuntimeEvalFocus;
  districtType: RuntimeBenchmarkDistrictType;
  seed: string;
  startTileId: TileId;
  startHeading: HeadingToken;
  intentCanary?: string | null;
  preferredNextTileIds: readonly (TileId | null)[];
  steps: readonly RuntimeEvalScenarioStepSpec[];
}

export interface RuntimeEvalStepSummary {
  step: number;
  currentTileId: TileId;
  targetKind: PolicyEpisode['chosenAction']['targetKind'];
  targetTileId: TileId | null;
  nextTileId: TileId | null;
  selectedCandidateId: string | null;
  candidateCount: number;
  reason: string;
  discoveredTilesDelta: number;
  backtrackDelta: number;
  trapRisk: number;
  predictedTrap: boolean;
  actualTrap: boolean;
  trapCueCount: number;
  enemyPressure: number;
  predictedEnemyPressure: number;
  actualEnemy: boolean;
  enemyCueCount: number;
  itemOpportunity: number;
  predictedItemOpportunity: number;
  actualItem: boolean;
  itemCueCount: number;
  puzzleOpportunity: number;
  predictedPuzzleOpportunity: number;
  actualPuzzle: boolean;
  puzzleCueCount: number;
};

export interface RuntimeEvalMetricSummary {
  discoveryEfficiency: number;
  backtrackPressure: number;
  trapFalsePositiveRate: number;
  trapFalseNegativeRate: number;
  wardenPressureExposure: number;
  itemUsefulnessScore: number;
  puzzleStateClarityScore: number;
}

export interface RuntimeEvalSupportSummary {
  rowsEvaluated: number;
  discoverySamples: number;
  backtrackSamples: number;
  trapPredictedPositiveCount: number;
  trapActualPositiveCount: number;
  trapFalsePositiveCount: number;
  trapFalseNegativeCount: number;
  wardenExposureSamples: number;
  itemPositiveSamples: number;
  puzzlePositiveSamples: number;
}

export interface RuntimeEvalLogSummary {
  stepCount: number;
  rowsEvaluated: number;
  metrics: RuntimeEvalMetricSummary;
  support: RuntimeEvalSupportSummary;
  stepSummaries: readonly RuntimeEvalStepSummary[];
}

export interface RuntimeEvalScenarioSummary {
  summaryId: string;
  runId: string;
  scenarioId: string;
  focus: RuntimeEvalFocus;
  districtType: RuntimeBenchmarkDistrictType;
  seed: string;
  startTileId: TileId;
  startHeading: HeadingToken;
  replayVerified: boolean;
  metrics: RuntimeEvalMetricSummary;
  log: {
    source: RuntimeEpisodeLog['source'];
    stepCount: number;
  };
  evaluation: RuntimeEvalLogSummary;
  expectedMetricBands: Partial<Record<RuntimeBenchmarkMetricName, RuntimeBenchmarkMetricBand>>;
  metricBandValidation: {
    passed: boolean;
    failures: string[];
  };
}

export interface RuntimeEvalSuiteSummary {
  schemaVersion: 1;
  suiteId: string;
  benchmarkPackId: string;
  summaryId: string;
  runId: string;
  generatedAt: string;
  scenarioCount: number;
  scenarioIds: readonly string[];
  replayIntegrity: {
    verifiedScenarioCount: number;
    failedScenarioCount: number;
    allScenariosVerified: boolean;
  };
  metrics: RuntimeEvalMetricSummary;
  support: RuntimeEvalSupportSummary;
  metricBandValidation: {
    passedScenarioCount: number;
    failedScenarioCount: number;
    allScenariosWithinBands: boolean;
  };
  scenarioSummaries: readonly RuntimeEvalScenarioSummary[];
}

export interface RuntimeEvalSuiteOptions {
  tuningWeights?: Partial<PlaybookTuningWeights> | null;
  scenarioIds?: readonly string[] | null;
}

const TRAP_THRESHOLD = 0.6;

const clamp01 = (value: number): number => Number(Math.min(1, Math.max(0, value)).toFixed(4));

const average = (values: readonly number[]): number => (
  values.length === 0
    ? 0
    : Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4))
);

const digestText = (input: string): string => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `eval-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const cloneLandmarks = (landmarks: readonly VisibleLandmark[]): VisibleLandmark[] => landmarks.map((landmark) => ({ ...landmark }));

const cloneCandidateSignals = (
  candidateSignals: PolicyCandidateSignalMap | undefined
): PolicyCandidateSignalMap | undefined => (
  candidateSignals
    ? Object.fromEntries(
        Object.entries(candidateSignals).map(([tileId, features]) => [
          tileId,
          features ? { ...features } : features
        ])
      )
    : undefined
);

const cloneStepSpec = (step: RuntimeEvalScenarioStepSpec): RuntimeEvalScenarioStepSpec => ({
  ...step,
  traversableTileIds: [...step.traversableTileIds],
  localCues: [...step.localCues],
  visibleLandmarks: cloneLandmarks(step.visibleLandmarks),
  goal: { ...step.goal },
  candidateSignals: cloneCandidateSignals(step.candidateSignals),
  traversedConnectorId: step.traversedConnectorId ?? null,
  traversedConnectorLabel: step.traversedConnectorLabel ?? null
});

const cloneEpisode = (episode: PolicyEpisode): PolicyEpisode => ({
  ...episode,
  observation: { ...episode.observation },
  candidates: episode.candidates.map((candidate) => ({
    ...candidate,
    path: [...candidate.path],
    features: { ...candidate.features }
  })),
  chosenAction: { ...episode.chosenAction },
  outcome: episode.outcome
    ? {
        ...episode.outcome,
        localCues: [...episode.outcome.localCues]
      }
    : null
});

const cloneStepResult = (entry: RuntimeEpisodeLogEntry): RuntimeEpisodeLogEntry => ({
  ...entry,
  observation: {
    ...entry.observation,
    observation: {
      ...entry.observation.observation,
      traversableTileIds: [...entry.observation.observation.traversableTileIds],
      localCues: [...entry.observation.observation.localCues],
      visibleLandmarks: cloneLandmarks(entry.observation.observation.visibleLandmarks),
      candidateSignals: cloneCandidateSignals(entry.observation.observation.candidateSignals)
    }
  },
  decision: {
    ...entry.decision,
    path: [...entry.decision.path]
  },
  snapshot: {
    ...entry.snapshot,
    counters: { ...entry.snapshot.counters },
    discoveredNodeIds: [...entry.snapshot.discoveredNodeIds],
    frontierIds: [...entry.snapshot.frontierIds],
    observedLandmarkIds: [...entry.snapshot.observedLandmarkIds],
    observedCues: [...entry.snapshot.observedCues]
  },
  trail: {
    ...entry.trail,
    trailTailTileIds: [...entry.trail.trailTailTileIds],
    occupancyHistory: [...entry.trail.occupancyHistory]
  },
  move: entry.move
    ? {
        ...entry.move
      }
    : null,
  intent: {
    ...entry.intent,
    sourceState: {
      ...entry.intent.sourceState,
      visibleLandmarks: entry.intent.sourceState.visibleLandmarks.map((landmark) => ({ ...landmark })),
      observedLandmarkIds: [...entry.intent.sourceState.observedLandmarkIds],
      localCues: [...entry.intent.sourceState.localCues],
      traversableTileIds: [...entry.intent.sourceState.traversableTileIds]
    },
    sourceStates: entry.intent.sourceStates.map((state) => ({
      ...state,
      visibleLandmarks: state.visibleLandmarks.map((landmark) => ({ ...landmark })),
      observedLandmarkIds: [...state.observedLandmarkIds],
      localCues: [...state.localCues],
      traversableTileIds: [...state.traversableTileIds]
    })),
    bus: {
      ...entry.intent.bus,
      records: entry.intent.bus.records.map((record) => ({
        ...record,
        anchor: record.anchor ? { ...record.anchor } : undefined
      }))
    },
    emittedAtStep: entry.intent.emittedAtStep.map((record) => ({
      ...record,
      anchor: record.anchor ? { ...record.anchor } : undefined
    }))
  },
  episodes: {
    ...entry.episodes,
    episodes: entry.episodes.episodes.map(cloneEpisode),
    latestEpisode: entry.episodes.latestEpisode ? cloneEpisode(entry.episodes.latestEpisode) : null
  }
});

const selectCandidate = (episode: PolicyEpisode): PolicyActionCandidate | null => (
  (episode.chosenCandidateId
    ? episode.candidates.find((candidate) => candidate.id === episode.chosenCandidateId) ?? null
    : episode.candidates[0] ?? null)
);

const buildStepSummary = (
  currentEntry: RuntimeEpisodeLogEntry,
  outcomeEntry: RuntimeEpisodeLogEntry
): RuntimeEvalStepSummary | null => {
  const episode = outcomeEntry.episodes.latestEpisode;
  if (!episode || episode.step !== currentEntry.step) {
    return null;
  }

  const candidate = selectCandidate(episode);
  const outcome = episode.outcome;
  if (!outcome) {
    return null;
  }

  const trapRisk = candidate?.features.trapRisk ?? 0;
  const enemyPressure = candidate?.features.enemyPressure ?? 0;
  const itemOpportunity = candidate?.features.itemOpportunity ?? 0;
  const puzzleOpportunity = candidate?.features.puzzleOpportunity ?? 0;
  const actualTrap = outcome.trapCueCount > 0;
  const actualEnemy = outcome.enemyCueCount > 0;
  const actualItem = outcome.itemCueCount > 0;
  const actualPuzzle = outcome.puzzleCueCount > 0;

  return {
    step: episode.step,
    currentTileId: episode.currentTileId,
    targetKind: episode.chosenAction.targetKind,
    targetTileId: episode.chosenAction.targetTileId,
    nextTileId: episode.chosenAction.nextTileId,
    selectedCandidateId: episode.chosenCandidateId,
    candidateCount: episode.candidates.length,
    reason: episode.chosenAction.reason,
    discoveredTilesDelta: outcome.discoveredTilesDelta,
    backtrackDelta: outcome.backtrackDelta,
    trapRisk,
    predictedTrap: trapRisk >= TRAP_THRESHOLD,
    actualTrap,
    trapCueCount: outcome.trapCueCount,
    enemyPressure,
    predictedEnemyPressure: enemyPressure,
    actualEnemy,
    enemyCueCount: outcome.enemyCueCount,
    itemOpportunity,
    predictedItemOpportunity: itemOpportunity,
    actualItem,
    itemCueCount: outcome.itemCueCount,
    puzzleOpportunity,
    predictedPuzzleOpportunity: puzzleOpportunity,
    actualPuzzle,
    puzzleCueCount: outcome.puzzleCueCount
  };
};

const summarizeRows = (stepSummaries: readonly RuntimeEvalStepSummary[]): RuntimeEvalLogSummary => {
  const discoverySamples = stepSummaries.map((row) => (
    row.discoveredTilesDelta > 0
      ? row.discoveredTilesDelta
      : row.targetKind === 'frontier'
        ? 1
        : 0
  ));
  const backtrackSamples = stepSummaries.map((row) => row.backtrackDelta);
  const trapPredictedPositiveCount = stepSummaries.filter((row) => row.predictedTrap).length;
  const trapActualPositiveCount = stepSummaries.filter((row) => row.actualTrap).length;
  const trapFalsePositiveCount = stepSummaries.filter((row) => row.predictedTrap && !row.actualTrap).length;
  const trapFalseNegativeCount = stepSummaries.filter((row) => !row.predictedTrap && row.actualTrap).length;
  const wardenExposureSamples = stepSummaries.map((row) => Math.max(row.predictedEnemyPressure, row.actualEnemy ? 1 : 0));
  const itemPositiveRows = stepSummaries.filter((row) => row.actualItem);
  const puzzlePositiveRows = stepSummaries.filter((row) => row.actualPuzzle);

  const metrics: RuntimeEvalMetricSummary = {
    discoveryEfficiency: clamp01(average(discoverySamples)),
    backtrackPressure: clamp01(average(backtrackSamples)),
    trapFalsePositiveRate: trapPredictedPositiveCount > 0
      ? clamp01(trapFalsePositiveCount / trapPredictedPositiveCount)
      : 0,
    trapFalseNegativeRate: trapActualPositiveCount > 0
      ? clamp01(trapFalseNegativeCount / trapActualPositiveCount)
      : 0,
    wardenPressureExposure: clamp01(average(wardenExposureSamples)),
    itemUsefulnessScore: itemPositiveRows.length > 0
      ? clamp01(average(itemPositiveRows.map((row) => row.predictedItemOpportunity)))
      : 0,
    puzzleStateClarityScore: puzzlePositiveRows.length > 0
      ? clamp01(average(puzzlePositiveRows.map((row) => row.predictedPuzzleOpportunity)))
      : 0
  };

  return {
    stepCount: stepSummaries.length + 1,
    rowsEvaluated: stepSummaries.length,
    metrics,
    support: {
      rowsEvaluated: stepSummaries.length,
      discoverySamples: discoverySamples.reduce((sum, value) => sum + value, 0),
      backtrackSamples: backtrackSamples.reduce((sum, value) => sum + value, 0),
      trapPredictedPositiveCount,
      trapActualPositiveCount,
      trapFalsePositiveCount,
      trapFalseNegativeCount,
      wardenExposureSamples: wardenExposureSamples.length,
      itemPositiveSamples: itemPositiveRows.length,
      puzzlePositiveSamples: puzzlePositiveRows.length
    },
    stepSummaries
  };
};

const buildRuntimeEvalLogSummary = (log: RuntimeEpisodeLog): RuntimeEvalLogSummary => {
  const clonedEntries = log.entries.map(cloneStepResult);
  const rows: RuntimeEvalStepSummary[] = [];

  for (let index = 0; index < clonedEntries.length - 1; index += 1) {
    const currentEntry = clonedEntries[index];
    const outcomeEntry = clonedEntries[index + 1];
    const summary = buildStepSummary(currentEntry, outcomeEntry);
    if (summary) {
      rows.push(summary);
    }
  }

  return summarizeRows(rows);
};

class DeterministicEvalPolicyScorer implements PolicyScorer {
  readonly id = 'deterministic-eval';
  private readonly preferredNextTileIds: ReadonlyMap<number, TileId | null>;

  constructor(preferredNextTileIds: ReadonlyMap<number, TileId | null>) {
    this.preferredNextTileIds = preferredNextTileIds;
  }

  scoreCandidates(input: PolicyScorerInput): ReadonlyMap<string, number> {
    const preferredTileId = this.preferredNextTileIds.get(input.step) ?? null;
    const scores = new Map<string, number>();

    for (const candidate of input.candidates) {
      const advisoryScore = (
        candidate.features.trapRisk
        + candidate.features.enemyPressure
        + candidate.features.itemOpportunity
        + candidate.features.puzzleOpportunity
        + candidate.features.timingWindow
      );
      const preferredBonus = preferredTileId && candidate.targetTileId === preferredTileId ? 10 : 0;
      scores.set(candidate.id, Number((preferredBonus + advisoryScore).toFixed(4)));
    }

    return scores;
  }
}

class DeterministicEvalHost implements RuntimeAdapterHost {
  readonly config: RuntimeAdapterHost['config'];

  readonly trailDeliveries: RuntimeTrailDelivery[] = [];

  readonly intentDeliveries: RuntimeIntentDelivery[] = [];

  readonly episodeDeliveries: RuntimeEpisodeDelivery[] = [];

  currentTileId: TileId;

  #activeStepIndex = 0;

  #activeStep: RuntimeEvalScenarioStepSpec | null = null;

  readonly #tileLabels = new Map<TileId, string>();
  private readonly scenario: RuntimeEvalScenarioSpec;

  constructor(scenario: RuntimeEvalScenarioSpec) {
    this.scenario = scenario;
    this.config = {
      seed: scenario.seed,
      startTileId: scenario.startTileId,
      startHeading: scenario.startHeading,
      intentCanary: scenario.intentCanary ?? null
    };
    this.currentTileId = scenario.startTileId;

    for (const step of scenario.steps) {
      this.#tileLabels.set(step.tileId, step.label);
      if (step.moveToTileId) {
        this.#tileLabels.set(step.moveToTileId, this.#tileLabels.get(step.moveToTileId) ?? step.moveToTileId);
      }
    }
  }

  projectObservation(step: number): RuntimeObservationProjection {
    if (step !== this.#activeStepIndex) {
      throw new Error(`Eval scenario ${this.scenario.id} expected step ${this.#activeStepIndex}, received ${step}.`);
    }

    const spec = this.scenario.steps[step];
    if (!spec) {
      throw new Error(`Eval scenario ${this.scenario.id} has no step spec for step ${step}.`);
    }

    if (spec.tileId !== this.currentTileId) {
      throw new Error(
        `Eval scenario ${this.scenario.id} expected tile ${this.currentTileId} to match step ${step} tile ${spec.tileId}.`
      );
    }

    this.#activeStep = spec;

    return {
      currentTileLabel: spec.label,
      observation: {
        step,
        currentTileId: spec.tileId,
        heading: spec.heading,
        traversableTileIds: [...spec.traversableTileIds],
        localCues: [...spec.localCues],
        visibleLandmarks: cloneLandmarks(spec.visibleLandmarks),
        goal: { ...spec.goal },
        candidateSignals: cloneCandidateSignals(spec.candidateSignals)
      }
    };
  }

  applyLegalMove(nextTileId: TileId): RuntimeMoveApplication {
    const step = this.#requireActiveStep();
    const expectedNextTileId = step.moveToTileId;
    if (expectedNextTileId === null) {
      throw new Error(`Eval scenario ${this.scenario.id} does not expect a committed move at step ${this.#activeStepIndex}.`);
    }

    if (nextTileId !== expectedNextTileId) {
      throw new Error(
        `Eval scenario ${this.scenario.id} expected committed move ${expectedNextTileId} at step ${this.#activeStepIndex}, received ${nextTileId}.`
      );
    }

    this.currentTileId = nextTileId;

    return {
      currentTileId: nextTileId,
      traversedConnectorId: step.traversedConnectorId ?? null,
      traversedConnectorLabel: step.traversedConnectorLabel ?? null
    };
  }

  receiveTrailUpdate(delivery: RuntimeTrailDelivery): void {
    this.trailDeliveries.push({ ...delivery });

    if (delivery.step !== this.#activeStepIndex) {
      throw new Error(
        `Eval scenario ${this.scenario.id} trail delivery step ${delivery.step} does not match active step ${this.#activeStepIndex}.`
      );
    }
  }

  receiveIntentDelivery(delivery: RuntimeIntentDelivery): void {
    this.intentDeliveries.push({
      ...delivery,
      sourceState: {
        ...delivery.sourceState,
        visibleLandmarks: delivery.sourceState.visibleLandmarks.map((landmark) => ({ ...landmark })),
        observedLandmarkIds: [...delivery.sourceState.observedLandmarkIds],
        localCues: [...delivery.sourceState.localCues],
        traversableTileIds: [...delivery.sourceState.traversableTileIds]
      }
    });
  }

  receiveEpisodeLog(delivery: RuntimeEpisodeDelivery): void {
    this.episodeDeliveries.push({
      ...delivery,
      episodes: delivery.episodes.map(cloneEpisode),
      latestEpisode: delivery.latestEpisode ? cloneEpisode(delivery.latestEpisode) : null
    });
    this.#activeStep = null;
    this.#activeStepIndex += 1;
  }

  describeTile(tileId: TileId) {
    return {
      id: tileId,
      label: this.#tileLabels.get(tileId) ?? tileId
    };
  }

  #requireActiveStep(): RuntimeEvalScenarioStepSpec {
    if (!this.#activeStep) {
      throw new Error(`Eval scenario ${this.scenario.id} has no active step to validate.`);
    }

    return this.#activeStep;
  }
}

const makeStep = (step: RuntimeEvalScenarioStepSpec): RuntimeEvalScenarioStepSpec => cloneStepSpec(step);

const resolveScenarioFocus = (scenario: RuntimeBenchmarkScenarioContract): RuntimeEvalFocus => {
  switch (scenario.variant) {
    case 'trap-inference':
      return 'trap';
    case 'warden-pressure':
      return 'warden';
    case 'item-usefulness':
      return 'item';
    case 'puzzle-visibility':
      return 'puzzle';
    case 'rotation-timing':
      return 'rotation';
    default:
      return 'puzzle';
  }
};

const buildCandidateSignals = (
  candidates: readonly RuntimeBenchmarkCandidateContract[]
): PolicyCandidateSignalMap => Object.fromEntries(
  candidates.map((candidate) => [
    candidate.tileId,
    {
      trapRisk: candidate.trapRisk,
      enemyPressure: candidate.enemyPressure,
      itemOpportunity: candidate.itemOpportunity,
      puzzleOpportunity: candidate.puzzleOpportunity,
      timingWindow: candidate.timingWindow
    }
  ])
);

const toRuntimeEvalStepSpec = (
  step: RuntimeBenchmarkStepContract
): RuntimeEvalScenarioStepSpec => makeStep({
  tileId: step.tileId,
  label: step.label,
  heading: step.heading,
  traversableTileIds: [...step.traversableTileIds],
  localCues: [...step.localCues],
  visibleLandmarks: cloneLandmarks(step.visibleLandmarks),
  goal: { ...step.goal },
  candidateSignals: buildCandidateSignals(step.candidates),
  moveToTileId: step.moveToTileId
});

const toRuntimeEvalScenarioSpec = (
  scenario: RuntimeBenchmarkScenarioContract
): RuntimeEvalScenarioSpec => {
  const replaySteps = scenario.steps.map((step) => toRuntimeEvalStepSpec(step));
  const lastStep = scenario.steps.at(-1);
  const lastCandidateOutcome = lastStep?.candidates.at(-1)?.outcome ?? null;

  if (lastStep) {
    replaySteps.push(makeStep({
      tileId: lastStep.moveToTileId ?? lastStep.tileId,
      label: `${lastStep.label} Terminal`,
      heading: lastStep.heading,
      traversableTileIds: [],
      localCues: lastCandidateOutcome?.localCues ?? [...lastStep.localCues],
      visibleLandmarks: cloneLandmarks(lastStep.visibleLandmarks),
      goal: { ...lastStep.goal },
      candidateSignals: {},
      moveToTileId: null
    }));
  }

  return {
    id: scenario.id,
    focus: resolveScenarioFocus(scenario),
    districtType: scenario.districtType,
    seed: scenario.seed,
    startTileId: scenario.steps[0]?.tileId ?? 'start',
    startHeading: scenario.steps[0]?.heading ?? 'north',
    intentCanary: `${scenario.id}-benchmark`,
    preferredNextTileIds: [...scenario.steps.map((step) => step.moveToTileId ?? null), null],
    steps: replaySteps
  };
};

const buildBenchmarkSnapshot = (
  scenario: RuntimeBenchmarkScenarioContract,
  stepIndex: number,
  step: RuntimeBenchmarkStepContract
): ExplorerSnapshot => ({
  seed: scenario.seed,
  currentTileId: step.tileId,
  currentHeading: step.heading,
  mode: step.goal.visible ? 'goal' : 'explore',
  counters: {
    replanCount: stepIndex,
    backtrackCount: step.candidates.some((candidate) => candidate.targetKind === 'backtrack') ? 1 : 0,
    frontierCount: step.traversableTileIds.length,
    goalObservedStep: step.goal.visible ? stepIndex : null,
    tilesDiscovered: stepIndex + 1
  },
  discoveredNodeIds: Array.from(new Set([
    ...scenario.steps.slice(0, stepIndex + 1).map((entry) => entry.tileId),
    ...step.traversableTileIds
  ])),
  frontierIds: [...step.traversableTileIds],
  goalTileId: step.goal.tileId ?? null,
  observedLandmarkIds: step.visibleLandmarks.map((landmark) => landmark.id),
  observedCues: [...step.localCues]
});

const buildPolicyCandidate = (
  scenario: RuntimeBenchmarkScenarioContract,
  stepIndex: number,
  step: RuntimeBenchmarkStepContract,
  candidate: RuntimeBenchmarkCandidateContract
): PolicyActionCandidate => ({
  id: `${scenario.id}:step-${stepIndex}:${candidate.targetKind}:${candidate.tileId}`,
  targetKind: candidate.targetKind,
  targetTileId: candidate.tileId,
  path: [...candidate.path],
  nextTileId: candidate.path.length > 1 ? candidate.path[1] ?? candidate.tileId : candidate.tileId,
  reason: 'benchmark advisory evaluation',
  heuristicScore: candidate.heuristicScore,
  policyScore: null,
  features: {
    pathCost: Math.max(0, candidate.path.length - 1),
    visitCount: candidate.visitCount,
    unexploredNeighborCount: candidate.unexploredNeighborCount,
    frontierCount: step.traversableTileIds.length,
    goalVisible: step.goal.visible,
    trapRisk: candidate.trapRisk,
    enemyPressure: candidate.enemyPressure,
    itemOpportunity: candidate.itemOpportunity,
    puzzleOpportunity: candidate.puzzleOpportunity,
    timingWindow: candidate.timingWindow
  }
});

const selectAdvisoryCandidate = (
  candidates: readonly PolicyActionCandidate[],
  policyScores: ReadonlyMap<string, number>
): PolicyActionCandidate | null => (
  [...candidates].sort((left, right) => {
    const leftScore = policyScores.get(left.id) ?? 0;
    const rightScore = policyScores.get(right.id) ?? 0;
    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    if (left.heuristicScore !== right.heuristicScore) {
      return right.heuristicScore - left.heuristicScore;
    }

    return left.id.localeCompare(right.id);
  })[0] ?? null
);

const buildAdvisoryStepSummary = (
  scorer: PlaybookPatternScorer,
  scenario: RuntimeBenchmarkScenarioContract,
  stepIndex: number,
  step: RuntimeBenchmarkStepContract,
  tuningWeights?: Partial<PlaybookTuningWeights> | null
): RuntimeEvalStepSummary | null => {
  if (step.candidates.length === 0) {
    return null;
  }

  const observation: LocalObservation = {
    step: stepIndex,
    currentTileId: step.tileId,
    heading: step.heading,
    traversableTileIds: [...step.traversableTileIds],
    localCues: [...step.localCues],
    visibleLandmarks: cloneLandmarks(step.visibleLandmarks),
    goal: { ...step.goal },
    candidateSignals: buildCandidateSignals(step.candidates)
  };
  const snapshot = buildBenchmarkSnapshot(scenario, stepIndex, step);
  const policyCandidates = step.candidates.map((candidate) => (
    buildPolicyCandidate(scenario, stepIndex, step, candidate)
  ));
  const policyScores = scorer.scoreLegalCandidates({
    seed: scenario.seed,
    step: stepIndex,
    observation,
    snapshot,
    candidates: policyCandidates,
    tuningWeights
  });
  const selectedCandidate = selectAdvisoryCandidate(policyCandidates, policyScores);
  if (!selectedCandidate) {
    return null;
  }

  const candidateContract = step.candidates.find((candidate) => candidate.tileId === selectedCandidate.targetTileId) ?? null;
  if (!candidateContract) {
    return null;
  }

  const outcome = candidateContract.outcome;

  return {
    step: stepIndex,
    currentTileId: step.tileId,
    targetKind: selectedCandidate.targetKind,
    targetTileId: selectedCandidate.targetTileId,
    nextTileId: selectedCandidate.nextTileId,
    selectedCandidateId: selectedCandidate.id,
    candidateCount: policyCandidates.length,
    reason: selectedCandidate.reason,
    discoveredTilesDelta: outcome.discoveredTilesDelta,
    backtrackDelta: outcome.backtrackDelta,
    trapRisk: selectedCandidate.features.trapRisk,
    predictedTrap: selectedCandidate.features.trapRisk >= TRAP_THRESHOLD,
    actualTrap: outcome.trapCueCount > 0,
    trapCueCount: outcome.trapCueCount,
    enemyPressure: selectedCandidate.features.enemyPressure,
    predictedEnemyPressure: selectedCandidate.features.enemyPressure,
    actualEnemy: outcome.enemyCueCount > 0,
    enemyCueCount: outcome.enemyCueCount,
    itemOpportunity: selectedCandidate.features.itemOpportunity,
    predictedItemOpportunity: selectedCandidate.features.itemOpportunity,
    actualItem: outcome.itemCueCount > 0,
    itemCueCount: outcome.itemCueCount,
    puzzleOpportunity: selectedCandidate.features.puzzleOpportunity,
    predictedPuzzleOpportunity: selectedCandidate.features.puzzleOpportunity,
    actualPuzzle: outcome.puzzleCueCount > 0,
    puzzleCueCount: outcome.puzzleCueCount
  };
};

const evaluateBenchmarkScenario = (
  scenario: RuntimeBenchmarkScenarioContract,
  tuningWeights?: Partial<PlaybookTuningWeights> | null
): RuntimeEvalLogSummary => {
  const scorer = new PlaybookPatternScorer();
  const rows = scenario.steps
    .map((step, index) => buildAdvisoryStepSummary(scorer, scenario, index, step, tuningWeights))
    .filter((summary): summary is RuntimeEvalStepSummary => Boolean(summary));

  return summarizeRows(rows);
};

const validateMetricBands = (
  metrics: RuntimeEvalMetricSummary,
  bands: Partial<Record<RuntimeBenchmarkMetricName, RuntimeBenchmarkMetricBand>>
): { passed: boolean; failures: string[] } => {
  const failures = Object.entries(bands).flatMap(([metricName, band]) => {
    if (!band) {
      return [];
    }

    const value = metrics[metricName as RuntimeBenchmarkMetricName];
    return value >= band.min && value <= band.max
      ? []
      : [`${metricName}=${value} outside [${band.min}, ${band.max}]`];
  });

  return {
    passed: failures.length === 0,
    failures
  };
};

const runReplayScenario = (scenario: RuntimeEvalScenarioSpec) => {
  const maxSteps = scenario.steps.length + 1;
  const host = new DeterministicEvalHost(scenario);
  const scorer = new DeterministicEvalPolicyScorer(new Map(
    scenario.preferredNextTileIds.map((tileId, index) => [index, tileId])
  ));
  const bridge = new RuntimeAdapterBridge(host, scorer);
  const stepResults = bridge.runUntilIdle(maxSteps);
  const log = bridge.createEpisodeLog();
  const replayBridge = new RuntimeAdapterBridge(createRuntimeEpisodeReplayHost(log), scorer);
  const replaySteps = replayBridge.runUntilIdle(maxSteps);
  const replayLog = replayBridge.createEpisodeLog();
  const replayVerified = (
    replaySteps.length === stepResults.length
    && replayLog.stepCount === log.stepCount
    && JSON.stringify({
      ...replayLog,
      generatedAt: log.generatedAt
    }) === JSON.stringify(log)
  );

  return {
    log,
    replayVerified
  };
};

export const createDeterministicRuntimeEvalScenarios = (
  scenarioIds?: readonly string[] | null
): readonly RuntimeEvalScenarioSpec[] => {
  const scenarios = scenarioIds
    ? assertRuntimeBenchmarkScenarioIds(scenarioIds)
    : getRuntimeBenchmarkPack().scenarios;

  return scenarios.map((scenario) => toRuntimeEvalScenarioSpec(scenario));
};

export const evaluateRuntimeEpisodeLog = (log: RuntimeEpisodeLog): RuntimeEvalLogSummary => (
  buildRuntimeEvalLogSummary(log)
);

export const runRuntimeEvalScenario = (
  scenario: RuntimeBenchmarkScenarioContract,
  tuningWeights?: Partial<PlaybookTuningWeights> | null
): RuntimeEvalScenarioSummary => {
  const replayScenario = toRuntimeEvalScenarioSpec(scenario);
  const replay = runReplayScenario(replayScenario);
  const evaluation = evaluateBenchmarkScenario(scenario, tuningWeights);
  const metricBandValidation = validateMetricBands(evaluation.metrics, scenario.expectedMetricBands);
  const runId = digestText(JSON.stringify({
    scenarioId: scenario.id,
    seed: scenario.seed,
    districtType: scenario.districtType,
    tuningWeights: tuningWeights ?? null,
    replayVerified: replay.replayVerified,
    metrics: evaluation.metrics
  }));
  const summaryId = digestText(JSON.stringify({
    scenarioId: scenario.id,
    runId,
    metrics: evaluation.metrics,
    support: evaluation.support
  }));

  return {
    summaryId,
    runId,
    scenarioId: scenario.id,
    focus: resolveScenarioFocus(scenario),
    districtType: scenario.districtType,
    seed: scenario.seed,
    startTileId: replayScenario.startTileId,
    startHeading: replayScenario.startHeading,
    replayVerified: replay.replayVerified,
    metrics: evaluation.metrics,
    log: {
      source: { ...replay.log.source },
      stepCount: replay.log.stepCount
    },
    evaluation,
    expectedMetricBands: Object.fromEntries(
      Object.entries(scenario.expectedMetricBands).map(([metricName, band]) => [
        metricName,
        band ? { ...band } : band
      ])
    ),
    metricBandValidation
  };
};

const aggregateLogSummaries = (summaries: readonly RuntimeEvalLogSummary[]): RuntimeEvalLogSummary => {
  const rows = summaries.flatMap((summary) => summary.stepSummaries);
  return summarizeRows(rows);
};

export const runDeterministicRuntimeEvalSuite = (
  options: RuntimeEvalSuiteOptions = {}
): RuntimeEvalSuiteSummary => {
  const benchmarkPack = getRuntimeBenchmarkPack();
  const scenarios = options.scenarioIds
    ? assertRuntimeBenchmarkScenarioIds(options.scenarioIds)
    : benchmarkPack.scenarios;
  const scenarioSummaries = scenarios.map((scenario) => (
    runRuntimeEvalScenario(scenario, options.tuningWeights)
  ));
  const replayIntegrity = {
    verifiedScenarioCount: scenarioSummaries.filter((entry) => entry.replayVerified).length,
    failedScenarioCount: scenarioSummaries.filter((entry) => !entry.replayVerified).length,
    allScenariosVerified: scenarioSummaries.every((entry) => entry.replayVerified)
  };
  const aggregate = aggregateLogSummaries(scenarioSummaries.map((scenario) => scenario.evaluation));
  const metricBandValidation = {
    passedScenarioCount: scenarioSummaries.filter((scenario) => scenario.metricBandValidation.passed).length,
    failedScenarioCount: scenarioSummaries.filter((scenario) => !scenario.metricBandValidation.passed).length,
    allScenariosWithinBands: scenarioSummaries.every((scenario) => scenario.metricBandValidation.passed)
  };
  const scenarioIds = scenarioSummaries.map((entry) => entry.scenarioId);
  const runId = digestText(JSON.stringify({
    suiteId: 'mazer-core-deterministic-runtime-eval',
    benchmarkPackId: benchmarkPack.packId,
    scenarioIds,
    metrics: aggregate.metrics,
    support: aggregate.support,
    tuningWeights: options.tuningWeights ?? null
  }));
  const summaryId = digestText(JSON.stringify({
    suiteId: 'mazer-core-deterministic-runtime-eval',
    benchmarkPackId: benchmarkPack.packId,
    runId,
    replayIntegrity,
    metricBandValidation,
    metrics: aggregate.metrics
  }));

  return {
    schemaVersion: 1,
    suiteId: 'mazer-core-deterministic-runtime-eval',
    benchmarkPackId: benchmarkPack.packId,
    summaryId,
    runId,
    generatedAt: new Date().toISOString(),
    scenarioCount: scenarioSummaries.length,
    scenarioIds,
    replayIntegrity,
    metrics: aggregate.metrics,
    support: aggregate.support,
    metricBandValidation,
    scenarioSummaries
  };
};
