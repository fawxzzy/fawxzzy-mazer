import { RuntimeAdapterBridge, type RuntimeAdapterHost, type RuntimeEpisodeDelivery, type RuntimeIntentDelivery, type RuntimeMoveApplication, type RuntimeObservationProjection, type RuntimeTrailDelivery } from '../adapters';
import type { HeadingToken, LocalObservation, PolicyActionCandidate, PolicyCandidateSignalMap, PolicyEpisode, PolicyScorer, PolicyScorerInput, TileId, VisibleLandmark } from '../agent/types';
import { createRuntimeEpisodeReplayHost, type RuntimeEpisodeLog, type RuntimeEpisodeLogEntry } from '../logging';

export type RuntimeEvalFocus = 'trap' | 'warden' | 'item' | 'puzzle';

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
}

export interface RuntimeEvalSuiteSummary {
  schemaVersion: 1;
  suiteId: string;
  summaryId: string;
  runId: string;
  generatedAt: string;
  scenarioCount: number;
  replayIntegrity: {
    verifiedScenarioCount: number;
    failedScenarioCount: number;
    allScenariosVerified: boolean;
  };
  metrics: RuntimeEvalMetricSummary;
  support: RuntimeEvalSupportSummary;
  scenarioSummaries: readonly RuntimeEvalScenarioSummary[];
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

export const createDeterministicRuntimeEvalScenarios = (): readonly RuntimeEvalScenarioSpec[] => ([
  {
    id: 'trap-inference-seed-alpha',
    focus: 'trap',
    seed: 'eval-trap-alpha',
    startTileId: 'trap-entry',
    startHeading: 'east',
    preferredNextTileIds: ['trap-mid', null, 'trap-spur', null],
    steps: [
      makeStep({
        tileId: 'trap-entry',
        label: 'Trap Entry',
        heading: 'east',
        traversableTileIds: ['trap-mid', 'trap-spur'],
        localCues: ['trap rhythm', 'timing gate'],
        visibleLandmarks: [],
        goal: { visible: false, tileId: null },
        candidateSignals: {
          'trap-mid': { trapRisk: 0.88, timingWindow: 0.6 },
          'trap-spur': { trapRisk: 0.08, timingWindow: 0.1 }
        },
        moveToTileId: 'trap-mid'
      }),
      makeStep({
        tileId: 'trap-mid',
        label: 'Trap Mid',
        heading: 'west',
        traversableTileIds: ['trap-entry'],
        localCues: ['quiet corridor'],
        visibleLandmarks: [],
        goal: { visible: false, tileId: null },
        candidateSignals: {
          'trap-entry': { trapRisk: 0.14, timingWindow: 0.08 }
        },
        moveToTileId: 'trap-entry'
      }),
      makeStep({
        tileId: 'trap-entry',
        label: 'Trap Entry',
        heading: 'east',
        traversableTileIds: ['trap-spur'],
        localCues: ['quiet corridor'],
        visibleLandmarks: [],
        goal: { visible: false, tileId: null },
        candidateSignals: {
          'trap-spur': { trapRisk: 0.12, timingWindow: 0.05 }
        },
        moveToTileId: 'trap-spur'
      }),
      makeStep({
        tileId: 'trap-spur',
        label: 'Trap Spur',
        heading: 'south',
        traversableTileIds: [],
        localCues: ['trap alarm', 'hazard seal'],
        visibleLandmarks: [],
        goal: { visible: false, tileId: null },
        candidateSignals: {},
        moveToTileId: null
      })
    ]
  },
  {
    id: 'warden-pressure-seed-bravo',
    focus: 'warden',
    seed: 'eval-warden-bravo',
    startTileId: 'warden-entry',
    startHeading: 'east',
    preferredNextTileIds: ['warden-mid', null, 'warden-spur', null],
    steps: [
      makeStep({
        tileId: 'warden-entry',
        label: 'Warden Entry',
        heading: 'east',
        traversableTileIds: ['warden-mid', 'warden-spur'],
        localCues: ['enemy patrol', 'sightline broken'],
        visibleLandmarks: [],
        goal: { visible: false, tileId: null },
        candidateSignals: {
          'warden-mid': { enemyPressure: 0.92, timingWindow: 0.25 },
          'warden-spur': { enemyPressure: 0.18, timingWindow: 0.08 }
        },
        moveToTileId: 'warden-mid'
      }),
      makeStep({
        tileId: 'warden-mid',
        label: 'Warden Mid',
        heading: 'west',
        traversableTileIds: ['warden-entry'],
        localCues: ['quiet corridor'],
        visibleLandmarks: [],
        goal: { visible: false, tileId: null },
        candidateSignals: {
          'warden-entry': { enemyPressure: 0.81, timingWindow: 0.2 }
        },
        moveToTileId: 'warden-entry'
      }),
      makeStep({
        tileId: 'warden-entry',
        label: 'Warden Entry',
        heading: 'east',
        traversableTileIds: ['warden-spur'],
        localCues: ['quiet corridor'],
        visibleLandmarks: [],
        goal: { visible: false, tileId: null },
        candidateSignals: {
          'warden-spur': { enemyPressure: 0.84, timingWindow: 0.18 }
        },
        moveToTileId: 'warden-spur'
      }),
      makeStep({
        tileId: 'warden-spur',
        label: 'Warden Spur',
        heading: 'south',
        traversableTileIds: [],
        localCues: ['warden shadow', 'enemy patrol'],
        visibleLandmarks: [],
        goal: { visible: false, tileId: null },
        candidateSignals: {},
        moveToTileId: null
      })
    ]
  },
  {
    id: 'item-usefulness-seed-charlie',
    focus: 'item',
    seed: 'eval-item-charlie',
    startTileId: 'item-entry',
    startHeading: 'east',
    preferredNextTileIds: ['item-mid', null, 'item-spur', null],
    steps: [
      makeStep({
        tileId: 'item-entry',
        label: 'Item Entry',
        heading: 'east',
        traversableTileIds: ['item-mid', 'item-spur'],
        localCues: ['cache beacon', 'item glint'],
        visibleLandmarks: [],
        goal: { visible: false, tileId: null },
        candidateSignals: {
          'item-mid': { itemOpportunity: 0.63, timingWindow: 0.28 },
          'item-spur': { itemOpportunity: 0.12, timingWindow: 0.08 }
        },
        moveToTileId: 'item-mid'
      }),
      makeStep({
        tileId: 'item-mid',
        label: 'Item Mid',
        heading: 'west',
        traversableTileIds: ['item-entry'],
        localCues: ['empty alcove'],
        visibleLandmarks: [],
        goal: { visible: false, tileId: null },
        candidateSignals: {
          'item-entry': { itemOpportunity: 0.87, timingWindow: 0.35 }
        },
        moveToTileId: 'item-entry'
      }),
      makeStep({
        tileId: 'item-entry',
        label: 'Item Entry',
        heading: 'east',
        traversableTileIds: ['item-spur'],
        localCues: ['empty alcove'],
        visibleLandmarks: [],
        goal: { visible: false, tileId: null },
        candidateSignals: {
          'item-spur': { itemOpportunity: 0.9, timingWindow: 0.33 }
        },
        moveToTileId: 'item-spur'
      }),
      makeStep({
        tileId: 'item-spur',
        label: 'Item Spur',
        heading: 'south',
        traversableTileIds: [],
        localCues: ['item cache', 'key shard'],
        visibleLandmarks: [],
        goal: { visible: false, tileId: null },
        candidateSignals: {},
        moveToTileId: null
      })
    ]
  },
  {
    id: 'puzzle-clarity-seed-delta',
    focus: 'puzzle',
    seed: 'eval-puzzle-delta',
    startTileId: 'puzzle-entry',
    startHeading: 'east',
    preferredNextTileIds: ['puzzle-mid', null, 'puzzle-spur', null],
    steps: [
      makeStep({
        tileId: 'puzzle-entry',
        label: 'Puzzle Entry',
        heading: 'east',
        traversableTileIds: ['puzzle-mid', 'puzzle-spur'],
        localCues: ['puzzle proxy', 'glyph hint'],
        visibleLandmarks: [],
        goal: { visible: false, tileId: null },
        candidateSignals: {
          'puzzle-mid': { puzzleOpportunity: 0.57, timingWindow: 0.3 },
          'puzzle-spur': { puzzleOpportunity: 0.09, timingWindow: 0.05 }
        },
        moveToTileId: 'puzzle-mid'
      }),
      makeStep({
        tileId: 'puzzle-mid',
        label: 'Puzzle Mid',
        heading: 'west',
        traversableTileIds: ['puzzle-entry'],
        localCues: ['rune corridor'],
        visibleLandmarks: [],
        goal: { visible: false, tileId: null },
        candidateSignals: {
          'puzzle-entry': { puzzleOpportunity: 0.91, timingWindow: 0.4 }
        },
        moveToTileId: 'puzzle-entry'
      }),
      makeStep({
        tileId: 'puzzle-entry',
        label: 'Puzzle Entry',
        heading: 'east',
        traversableTileIds: ['puzzle-spur'],
        localCues: ['rune corridor'],
        visibleLandmarks: [],
        goal: { visible: false, tileId: null },
        candidateSignals: {
          'puzzle-spur': { puzzleOpportunity: 0.9, timingWindow: 0.36 }
        },
        moveToTileId: 'puzzle-spur'
      }),
      makeStep({
        tileId: 'puzzle-spur',
        label: 'Puzzle Spur',
        heading: 'south',
        traversableTileIds: [],
        localCues: ['puzzle state', 'cipher plate'],
        visibleLandmarks: [],
        goal: { visible: false, tileId: null },
        candidateSignals: {},
        moveToTileId: null
      })
    ]
  }
] as const);

export const evaluateRuntimeEpisodeLog = (log: RuntimeEpisodeLog): RuntimeEvalLogSummary => (
  buildRuntimeEvalLogSummary(log)
);

export const runRuntimeEvalScenario = (scenario: RuntimeEvalScenarioSpec): RuntimeEvalScenarioSummary => {
  const host = new DeterministicEvalHost(scenario);
  const scorer = new DeterministicEvalPolicyScorer(new Map(
    scenario.preferredNextTileIds.map((tileId, index) => [index, tileId])
  ));
  const bridge = new RuntimeAdapterBridge(host, scorer);
  const stepResults = bridge.runUntilIdle(scenario.steps.length);
  const log = bridge.createEpisodeLog();
  const replayBridge = new RuntimeAdapterBridge(createRuntimeEpisodeReplayHost(log), scorer);
  const replaySteps = replayBridge.runUntilIdle(scenario.steps.length);
  const replayLog = replayBridge.createEpisodeLog();
  const replayVerified = (
    replaySteps.length === stepResults.length
    && replayLog.stepCount === log.stepCount
    && JSON.stringify({
      ...replayLog,
      generatedAt: log.generatedAt
    }) === JSON.stringify(log)
  );
  const evaluation = evaluateRuntimeEpisodeLog(log);
  const runId = digestText(JSON.stringify({
    scenarioId: scenario.id,
    seed: scenario.seed,
    stepCount: log.stepCount,
    replayVerified
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
    focus: scenario.focus,
    seed: scenario.seed,
    startTileId: scenario.startTileId,
    startHeading: scenario.startHeading,
    replayVerified,
    metrics: evaluation.metrics,
    log: {
      source: { ...log.source },
      stepCount: log.stepCount
    },
    evaluation
  };
};

const aggregateLogSummaries = (summaries: readonly RuntimeEvalLogSummary[]): RuntimeEvalLogSummary => {
  const rows = summaries.flatMap((summary) => summary.stepSummaries);
  return summarizeRows(rows);
};

export const runDeterministicRuntimeEvalSuite = (): RuntimeEvalSuiteSummary => {
  const scenarios = createDeterministicRuntimeEvalScenarios();
  const scenarioSummaries = scenarios.map((scenario) => runRuntimeEvalScenario(scenario));
  const replayIntegrity = {
    verifiedScenarioCount: scenarioSummaries.filter((entry) => entry.replayVerified).length,
    failedScenarioCount: scenarioSummaries.filter((entry) => !entry.replayVerified).length,
    allScenariosVerified: scenarioSummaries.every((entry) => entry.replayVerified)
  };
  const aggregate = aggregateLogSummaries(scenarioSummaries.map((scenario) => scenario.evaluation));
  const runId = digestText(JSON.stringify({
    suiteId: 'mazer-core-deterministic-runtime-eval',
    scenarioIds: scenarioSummaries.map((entry) => entry.scenarioId),
    seeds: scenarioSummaries.map((entry) => entry.seed),
    metrics: aggregate.metrics,
    support: aggregate.support
  }));
  const summaryId = digestText(JSON.stringify({
    suiteId: 'mazer-core-deterministic-runtime-eval',
    runId,
    replayIntegrity,
    metrics: aggregate.metrics
  }));

  return {
    schemaVersion: 1,
    suiteId: 'mazer-core-deterministic-runtime-eval',
    summaryId,
    runId,
    generatedAt: new Date().toISOString(),
    scenarioCount: scenarioSummaries.length,
    replayIntegrity,
    metrics: aggregate.metrics,
    support: aggregate.support,
    scenarioSummaries
  };
};
