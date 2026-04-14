import { RuntimeAdapterBridge } from '../../src/mazer-core/adapters';
import { createRuntimeEpisodeReplayHost } from '../../src/mazer-core/logging';
import { evaluateRuntimeEpisodeLog } from '../../src/mazer-core/eval';
import { createReplayEvalSummaryId, createReplayLinkedTrainingDataset } from '../../src/mazer-core/logging/export';
import type { RuntimeEpisodeLog } from '../../src/mazer-core/logging';
import type { RuntimeEvalLogSummary } from '../../src/mazer-core/eval';
import { PlaybookPatternScorer } from '../../src/mazer-core/playbook';
import { tunePlaybookWeightsOffline } from '../../src/mazer-core/playbook/tuning';
import type {
  HeadingToken,
  LocalObservation,
  PolicyActionCandidate,
  PolicyCandidateSignalMap,
  PolicyEpisode,
  PolicyScorer,
  PolicyScorerInput,
  TileId,
  VisibleLandmark
} from '../../src/mazer-core/agent/types';
import type {
  RuntimeAdapterHost,
  RuntimeEpisodeDelivery,
  RuntimeIntentDelivery,
  RuntimeMoveApplication,
  RuntimeObservationProjection,
  RuntimeTrailDelivery
} from '../../src/mazer-core/adapters/types';
import { hashStableValue, parseCliArgs } from './common.mjs';
import {
  resolveLifelineBenchmarkPack,
  resolveLifelineBenchmarkScenarioById,
  resolveLifelineBenchmarkScenarioBySeed
} from './benchmark-pack.mjs';

type LifelineBenchmarkStepSpec = {
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
};

type LifelineBenchmarkScenarioSpec = {
  id: string;
  focus: string;
  seed: string;
  startTileId: TileId;
  startHeading: HeadingToken;
  preferredNextTileIds: readonly (TileId | null)[];
  steps: readonly LifelineBenchmarkStepSpec[];
};

const cloneLandmarks = (landmarks: readonly VisibleLandmark[]): VisibleLandmark[] => (
  landmarks.map((landmark) => ({ ...landmark }))
);

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

const cloneStepSpec = (step: LifelineBenchmarkStepSpec): LifelineBenchmarkStepSpec => ({
  ...step,
  traversableTileIds: [...step.traversableTileIds],
  localCues: [...step.localCues],
  visibleLandmarks: cloneLandmarks(step.visibleLandmarks),
  goal: { ...step.goal },
  candidateSignals: cloneCandidateSignals(step.candidateSignals),
  traversedConnectorId: step.traversedConnectorId ?? null,
  traversedConnectorLabel: step.traversedConnectorLabel ?? null
});

class BenchmarkPolicyScorer implements PolicyScorer {
  readonly id = 'lifeline-benchmark';

  readonly #preferredNextTileIds: ReadonlyMap<number, TileId | null>;

  readonly #patternScorer = new PlaybookPatternScorer();

  constructor(preferredNextTileIds: ReadonlyMap<number, TileId | null>, tuningWeights: Record<string, number> | null = null) {
    this.#preferredNextTileIds = preferredNextTileIds;
    this.#patternScorer.updateTuningWeights(tuningWeights);
  }

  scoreCandidates(input: PolicyScorerInput): ReadonlyMap<string, number> {
    const preferredTileId = this.#preferredNextTileIds.get(input.step) ?? null;
    const scores = new Map<string, number>();
    const baseScores = this.#patternScorer.scoreLegalCandidates({
      seed: input.seed,
      step: input.step,
      observation: input.observation,
      snapshot: input.snapshot,
      candidates: input.candidates,
      tuningWeights: null
    });

    for (const candidate of input.candidates) {
      const preferredBonus = preferredTileId && candidate.targetTileId === preferredTileId ? 10 : 0;
      const baseScore = baseScores.get(candidate.id) ?? 0;
      scores.set(candidate.id, Number((baseScore + preferredBonus).toFixed(4)));
    }

    return scores;
  }
}

class BenchmarkHost implements RuntimeAdapterHost {
  readonly config;

  readonly trailDeliveries: RuntimeTrailDelivery[] = [];

  readonly intentDeliveries: RuntimeIntentDelivery[] = [];

  readonly episodeDeliveries: RuntimeEpisodeDelivery[] = [];

  currentTileId: TileId;

  #activeStepIndex = 0;

  #activeStep: LifelineBenchmarkStepSpec | null = null;

  readonly #tileLabels = new Map<TileId, string>();

  constructor(private readonly scenario: LifelineBenchmarkScenarioSpec) {
    this.config = {
      seed: scenario.seed,
      startTileId: scenario.startTileId,
      startHeading: scenario.startHeading,
      intentCanary: null
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
      throw new Error(`Benchmark scenario ${this.scenario.id} expected step ${this.#activeStepIndex}, received ${step}.`);
    }

    const spec = this.scenario.steps[step];
    if (!spec) {
      throw new Error(`Benchmark scenario ${this.scenario.id} has no step spec for step ${step}.`);
    }

    if (spec.tileId !== this.currentTileId) {
      throw new Error(
        `Benchmark scenario ${this.scenario.id} expected tile ${this.currentTileId} to match step ${step} tile ${spec.tileId}.`
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
      throw new Error(`Benchmark scenario ${this.scenario.id} does not expect a committed move at step ${this.#activeStepIndex}.`);
    }

    if (nextTileId !== expectedNextTileId) {
      throw new Error(
        `Benchmark scenario ${this.scenario.id} expected committed move ${expectedNextTileId} at step ${this.#activeStepIndex}, received ${nextTileId}.`
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
        `Benchmark scenario ${this.scenario.id} trail delivery step ${delivery.step} does not match active step ${this.#activeStepIndex}.`
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
      episodes: delivery.episodes.map((episode) => ({
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
      })),
      latestEpisode: delivery.latestEpisode
        ? {
            ...delivery.latestEpisode,
            observation: { ...delivery.latestEpisode.observation },
            candidates: delivery.latestEpisode.candidates.map((candidate) => ({
              ...candidate,
              path: [...candidate.path],
              features: { ...candidate.features }
            })),
            chosenAction: { ...delivery.latestEpisode.chosenAction },
            outcome: delivery.latestEpisode.outcome
              ? {
                  ...delivery.latestEpisode.outcome,
                  localCues: [...delivery.latestEpisode.outcome.localCues]
                }
              : null
          }
        : null
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

  #requireActiveStep(): LifelineBenchmarkStepSpec {
    if (!this.#activeStep) {
      throw new Error(`Benchmark scenario ${this.scenario.id} has no active step to validate.`);
    }

    return this.#activeStep;
  }
}

const digestText = (input: string): string => {
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `eval-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const buildScenarioEvalSummary = (log: RuntimeEpisodeLog, metrics: RuntimeEvalLogSummary) => ({
  schemaVersion: 1 as const,
  summaryId: createReplayEvalSummaryId({
    schemaVersion: 1,
    runId: '',
    seed: log.source.seed,
    metrics: metrics.metrics
  }),
  runId: digestText(JSON.stringify({
    source: log.source,
    stepCount: log.stepCount,
    metrics: metrics.metrics,
    support: metrics.support
  })),
  seed: log.source.seed,
  metrics: metrics.metrics
});

const runScenario = (scenario: LifelineBenchmarkScenarioSpec, tuningWeights: Record<string, number> | null = null) => {
  const host = new BenchmarkHost(scenario);
  const scorer = new BenchmarkPolicyScorer(
    new Map(scenario.preferredNextTileIds.map((tileId, index) => [index, tileId])),
    tuningWeights
  );
  const bridge = new RuntimeAdapterBridge(host, scorer);
  const stepResults = bridge.runUntilIdle(scenario.steps.length);
  const log = bridge.createEpisodeLog();
  const replayHost = createRuntimeEpisodeReplayHost(log);
  const replayBridge = new RuntimeAdapterBridge(replayHost, scorer);
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
  const evalSummary = buildScenarioEvalSummary(log, evaluation);
  const dataset = createReplayLinkedTrainingDataset(log, evalSummary);
  const tuningRun = tunePlaybookWeightsOffline([dataset]);

  return {
    scenarioId: scenario.id,
    seed: scenario.seed,
    focus: scenario.focus,
    startTileId: scenario.startTileId,
    startHeading: scenario.startHeading,
    replayVerified,
    log,
    replayLog,
    evaluation,
    evalSummary,
    dataset,
    tuningRun,
    stepResults,
    replaySteps
  };
};

const aggregateMetrics = (evaluations: readonly ReturnType<typeof evaluateRuntimeEpisodeLog>[]) => {
  if (evaluations.length === 0) {
    return {
      discoveryEfficiency: 0,
      backtrackPressure: 0,
      trapFalsePositiveRate: 0,
      trapFalseNegativeRate: 0,
      wardenPressureExposure: 0,
      itemUsefulnessScore: 0,
      puzzleStateClarityScore: 0
    };
  }

  return {
    discoveryEfficiency: Number((evaluations.reduce((total, entry) => total + entry.metrics.discoveryEfficiency, 0) / evaluations.length).toFixed(4)),
    backtrackPressure: Number((evaluations.reduce((total, entry) => total + entry.metrics.backtrackPressure, 0) / evaluations.length).toFixed(4)),
    trapFalsePositiveRate: Number((evaluations.reduce((total, entry) => total + entry.metrics.trapFalsePositiveRate, 0) / evaluations.length).toFixed(4)),
    trapFalseNegativeRate: Number((evaluations.reduce((total, entry) => total + entry.metrics.trapFalseNegativeRate, 0) / evaluations.length).toFixed(4)),
    wardenPressureExposure: Number((evaluations.reduce((total, entry) => total + entry.metrics.wardenPressureExposure, 0) / evaluations.length).toFixed(4)),
    itemUsefulnessScore: Number((evaluations.reduce((total, entry) => total + entry.metrics.itemUsefulnessScore, 0) / evaluations.length).toFixed(4)),
    puzzleStateClarityScore: Number((evaluations.reduce((total, entry) => total + entry.metrics.puzzleStateClarityScore, 0) / evaluations.length).toFixed(4))
  };
};

const aggregateSupport = (evaluations: readonly ReturnType<typeof evaluateRuntimeEpisodeLog>[]) => ({
  rowsEvaluated: evaluations.reduce((total, entry) => total + entry.support.rowsEvaluated, 0),
  discoverySamples: evaluations.reduce((total, entry) => total + entry.support.discoverySamples, 0),
  backtrackSamples: evaluations.reduce((total, entry) => total + entry.support.backtrackSamples, 0),
  trapPredictedPositiveCount: evaluations.reduce((total, entry) => total + entry.support.trapPredictedPositiveCount, 0),
  trapActualPositiveCount: evaluations.reduce((total, entry) => total + entry.support.trapActualPositiveCount, 0),
  trapFalsePositiveCount: evaluations.reduce((total, entry) => total + entry.support.trapFalsePositiveCount, 0),
  trapFalseNegativeCount: evaluations.reduce((total, entry) => total + entry.support.trapFalseNegativeCount, 0),
  wardenExposureSamples: evaluations.reduce((total, entry) => total + entry.support.wardenExposureSamples, 0),
  itemPositiveSamples: evaluations.reduce((total, entry) => total + entry.support.itemPositiveSamples, 0),
  puzzlePositiveSamples: evaluations.reduce((total, entry) => total + entry.support.puzzlePositiveSamples, 0)
});

const runLifelineBenchmarkSuite = ({ scenarioIds = null, tuningWeights = null } = {}) => {
  const pack = resolveLifelineBenchmarkPack();
  const resolvedScenarioList = scenarioIds && scenarioIds.length > 0
    ? scenarioIds.map((scenarioId) => (
        resolveLifelineBenchmarkScenarioById(scenarioId) ?? resolveLifelineBenchmarkScenarioBySeed(scenarioId)
      ))
    : pack.scenarios;

  if (scenarioIds && scenarioIds.length > 0) {
    const missingScenarioIds = scenarioIds.filter((scenarioId, index) => !resolvedScenarioList[index]);
    if (missingScenarioIds.length > 0) {
      throw new Error(`No lifeline benchmark scenarios matched ids: ${missingScenarioIds.join(', ')}.`);
    }
  }

  const scenarioList = resolvedScenarioList.filter(Boolean);

  const scenarioRuns = scenarioList.map((scenario) => runScenario({
    ...scenario,
    steps: scenario.steps.map(cloneStepSpec)
  }, tuningWeights));
  const replayIntegrity = {
    verifiedScenarioCount: scenarioRuns.filter((entry) => entry.replayVerified).length,
    failedScenarioCount: scenarioRuns.filter((entry) => !entry.replayVerified).length,
    allScenariosVerified: scenarioRuns.every((entry) => entry.replayVerified)
  };
  const metrics = aggregateMetrics(scenarioRuns.map((run) => run.evaluation));
  const support = aggregateSupport(scenarioRuns.map((run) => run.evaluation));
  const runId = digestText(JSON.stringify({
    packId: pack.packId,
    scenarioIds: scenarioRuns.map((entry) => entry.scenarioId),
    metrics,
    replayIntegrity
  }));
  const summaryId = digestText(JSON.stringify({
    packId: pack.packId,
    runId,
    metrics
  }));

  return {
    schemaVersion: 1 as const,
    benchmarkPackId: pack.packId,
    summaryId,
    runId,
    generatedAt: new Date().toISOString(),
    scenarioCount: scenarioRuns.length,
    scenarioIds: scenarioRuns.map((entry) => entry.scenarioId),
    replayIntegrity,
    metrics,
    support,
    scenarioSummaries: scenarioRuns.map((scenarioRun) => ({
      scenarioId: scenarioRun.scenarioId,
      seed: scenarioRun.seed,
      focus: scenarioRun.focus,
      startTileId: scenarioRun.startTileId,
      startHeading: scenarioRun.startHeading,
      replayVerified: scenarioRun.replayVerified,
      summaryId: scenarioRun.evalSummary.summaryId,
      runId: scenarioRun.evalSummary.runId,
      metrics: scenarioRun.evaluation.metrics,
      log: {
        source: { ...scenarioRun.log.source },
        stepCount: scenarioRun.log.stepCount
      },
      evaluation: scenarioRun.evaluation,
      dataset: scenarioRun.dataset,
      tuning: scenarioRun.tuningRun
    }))
  };
};

const main = async () => {
  const args = parseCliArgs();
  const scenarioIds = typeof args.scenario === 'string'
    ? args.scenario.split(',').map((value) => value.trim()).filter(Boolean)
    : null;
  const summary = runLifelineBenchmarkSuite({
    scenarioIds
  });

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
};

export {
  aggregateMetrics,
  aggregateSupport,
  buildScenarioEvalSummary,
  runLifelineBenchmarkSuite,
  runScenario
};

if (process.argv[1] && process.argv[1].endsWith('runtime-eval.ts')) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
