import { resolve } from 'node:path';
import {
  REPO_ROOT,
  hashStableValue,
  parseCliArgs,
  pathExists,
  readJson,
  relativeFromRepo,
  writeJson
} from './common.mjs';
import { runLifelineBenchmarkSuite } from './runtime-eval.ts';
import { resolveBlessedPlaybookWeights, resolvePlaybookTuningWeights } from '../training/common.mjs';

const DEFAULT_OUTPUT_ROOT = resolve(REPO_ROOT, 'tmp', 'lifeline', 'headless-runner');

export interface HeadlessRunnerScorerWeights {
  frontierValue: number;
  backtrackUrgency: number;
  trapSuspicion: number;
  enemyRisk: number;
  itemValue: number;
  puzzleValue: number;
  rotationTiming: number;
}

export interface HeadlessRunnerWeightMetadata {
  source: 'explicit' | 'registry-blessed' | 'default';
  registryPath?: string;
  recordId?: string;
  advisoryOnly?: boolean;
  status?: string;
  weights: HeadlessRunnerScorerWeights;
}

export interface HeadlessRunnerOptions {
  scenarioIds?: readonly string[] | null;
  runId?: string;
  outputRoot?: string;
  resume?: boolean;
  tuningWeights?: Partial<HeadlessRunnerScorerWeights> | null;
  weightMetadata?: HeadlessRunnerWeightMetadata | null;
}

export interface HeadlessRunnerManifest {
  schemaVersion: 1;
  runId: string;
  summaryId: string;
  benchmarkPackId: string;
  generatedAt: string;
  completedAt: string;
  scenarioCount: number;
  scenarioIds: readonly string[];
  replayIntegrity: {
    verifiedScenarioCount: number;
    failedScenarioCount: number;
    allScenariosVerified: boolean;
  };
  metricBandValidation: {
    passedScenarioCount: number;
    failedScenarioCount: number;
    allScenariosWithinBands: boolean;
  } | null;
  metrics: Record<string, number>;
  support: Record<string, number>;
  scorerWeights: HeadlessRunnerWeightMetadata | null;
  artifacts: {
    summary: string;
    manifest: string;
  };
  scenarios: Array<{
    scenarioId: string;
    seed: string;
    summaryId: string;
    evalRunId: string;
    paths: {
      logPath: string;
      replayLogPath: string;
      evalPath: string;
      datasetPath: string;
      tuningPath: string;
      scenarioManifestPath: string;
    };
  }>;
}

const resolveRunId = (seed: unknown) => hashStableValue(seed);

const normalizeWeightMetadata = (
  tuningWeights: Partial<HeadlessRunnerScorerWeights> | null | undefined,
  weightMetadata: HeadlessRunnerWeightMetadata | null | undefined
): HeadlessRunnerWeightMetadata | null => {
  if (!tuningWeights && !weightMetadata) {
    return null;
  }

  return {
    source: weightMetadata?.source ?? 'explicit',
    registryPath: weightMetadata?.registryPath,
    recordId: weightMetadata?.recordId,
    advisoryOnly: weightMetadata?.advisoryOnly,
    status: weightMetadata?.status,
    weights: {
      frontierValue: Number((tuningWeights?.frontierValue ?? weightMetadata?.weights.frontierValue ?? 1).toFixed(4)),
      backtrackUrgency: Number((tuningWeights?.backtrackUrgency ?? weightMetadata?.weights.backtrackUrgency ?? 1).toFixed(4)),
      trapSuspicion: Number((tuningWeights?.trapSuspicion ?? weightMetadata?.weights.trapSuspicion ?? 1).toFixed(4)),
      enemyRisk: Number((tuningWeights?.enemyRisk ?? weightMetadata?.weights.enemyRisk ?? 1).toFixed(4)),
      itemValue: Number((tuningWeights?.itemValue ?? weightMetadata?.weights.itemValue ?? 1).toFixed(4)),
      puzzleValue: Number((tuningWeights?.puzzleValue ?? weightMetadata?.weights.puzzleValue ?? 1).toFixed(4)),
      rotationTiming: Number((tuningWeights?.rotationTiming ?? weightMetadata?.weights.rotationTiming ?? 1).toFixed(4))
    }
  };
};

export const runHeadlessRunner = async (options: HeadlessRunnerOptions = {}): Promise<HeadlessRunnerManifest> => {
  const scenarioIds = options.scenarioIds ?? null;
  const runId = options.runId ?? resolveRunId({
    pack: 'mazer-lifeline-benchmark-pack',
    scenarioIds: scenarioIds ?? 'all'
  });
  const outputRoot = options.outputRoot
    ? resolve(options.outputRoot)
    : resolve(DEFAULT_OUTPUT_ROOT, runId);
  const manifestPath = resolve(outputRoot, 'manifest.json');
  const resume = options.resume !== false;
  const existingManifest = resume && await pathExists(manifestPath)
    ? await readJson(manifestPath) as HeadlessRunnerManifest
    : null;

  if (existingManifest?.completedAt) {
    return existingManifest;
  }

  const scorerWeights = normalizeWeightMetadata(options.tuningWeights, options.weightMetadata);
  const suite = runLifelineBenchmarkSuite({
    scenarioIds,
    tuningWeights: scorerWeights?.weights ?? options.tuningWeights ?? null
  });
  const scenarioManifests: HeadlessRunnerManifest['scenarios'] = [];

  for (const scenario of suite.scenarioSummaries) {
    const scenarioDir = resolve(outputRoot, 'scenarios', scenario.scenarioId);
    const logPath = resolve(scenarioDir, 'runtime-episode-log.json');
    const replayLogPath = resolve(scenarioDir, 'replay-runtime-episode-log.json');
    const evalPath = resolve(scenarioDir, 'runtime-eval-summary.json');
    const datasetPath = resolve(scenarioDir, 'replay-linked-dataset.json');
    const tuningPath = resolve(scenarioDir, 'tuning-prep.json');
    const scenarioManifestPath = resolve(scenarioDir, 'scenario-manifest.json');

    await writeJson(logPath, scenario.log);
    await writeJson(replayLogPath, scenario.replayLog);
    await writeJson(evalPath, scenario.evaluation);
    await writeJson(datasetPath, scenario.dataset);
    await writeJson(tuningPath, scenario.tuning);
    await writeJson(scenarioManifestPath, {
      schemaVersion: 1,
      scenarioId: scenario.scenarioId,
      seed: scenario.seed,
      runId,
      summaryId: scenario.summaryId,
      evalRunId: scenario.runId,
      scorerWeights,
      logPath: relativeFromRepo(logPath),
      replayLogPath: relativeFromRepo(replayLogPath),
      evalPath: relativeFromRepo(evalPath),
      datasetPath: relativeFromRepo(datasetPath),
      tuningPath: relativeFromRepo(tuningPath)
    });

    scenarioManifests.push({
      scenarioId: scenario.scenarioId,
      seed: scenario.seed,
      summaryId: scenario.summaryId,
      evalRunId: scenario.runId,
      paths: {
        logPath: relativeFromRepo(logPath),
        replayLogPath: relativeFromRepo(replayLogPath),
        evalPath: relativeFromRepo(evalPath),
        datasetPath: relativeFromRepo(datasetPath),
        tuningPath: relativeFromRepo(tuningPath),
        scenarioManifestPath: relativeFromRepo(scenarioManifestPath)
      }
    });
  }

  const suiteSummaryPath = resolve(outputRoot, 'suite-summary.json');
  const manifest: HeadlessRunnerManifest = {
    schemaVersion: 1,
    runId,
    summaryId: suite.summaryId,
    benchmarkPackId: suite.benchmarkPackId,
    generatedAt: suite.generatedAt,
    completedAt: new Date().toISOString(),
    scenarioCount: suite.scenarioCount,
    scenarioIds: suite.scenarioIds,
    replayIntegrity: suite.replayIntegrity,
    metricBandValidation: suite.metricBandValidation ?? null,
    metrics: suite.metrics,
    support: suite.support,
    scorerWeights,
    artifacts: {
      summary: relativeFromRepo(suiteSummaryPath),
      manifest: relativeFromRepo(manifestPath)
    },
    scenarios: scenarioManifests
  };

  await writeJson(suiteSummaryPath, suite);
  await writeJson(manifestPath, manifest);
  return manifest;
};

const resolveCliWeights = async (
  args: Record<string, string | boolean>
): Promise<{ tuningWeights: Partial<HeadlessRunnerScorerWeights> | null; weightMetadata: HeadlessRunnerWeightMetadata | null }> => {
  if (typeof args.weights === 'string') {
    const explicitWeights = resolvePlaybookTuningWeights(await readJson(resolve(REPO_ROOT, args.weights)));
    return {
      tuningWeights: explicitWeights,
      weightMetadata: normalizeWeightMetadata(explicitWeights, {
        source: 'explicit',
        weights: {
          frontierValue: Number((explicitWeights?.frontierValue ?? 1).toFixed(4)),
          backtrackUrgency: Number((explicitWeights?.backtrackUrgency ?? 1).toFixed(4)),
          trapSuspicion: Number((explicitWeights?.trapSuspicion ?? 1).toFixed(4)),
          enemyRisk: Number((explicitWeights?.enemyRisk ?? 1).toFixed(4)),
          itemValue: Number((explicitWeights?.itemValue ?? 1).toFixed(4)),
          puzzleValue: Number((explicitWeights?.puzzleValue ?? 1).toFixed(4)),
          rotationTiming: Number((explicitWeights?.rotationTiming ?? 1).toFixed(4))
        }
      })
    };
  }

  if (args.blessed === true || args.blessed === 'true') {
    const resolved = await resolveBlessedPlaybookWeights(
      typeof args.registry === 'string'
        ? resolve(REPO_ROOT, args.registry)
        : undefined
    );

    return {
      tuningWeights: resolved.weights,
      weightMetadata: normalizeWeightMetadata(resolved.weights, {
        source: resolved.blessedRecord ? 'registry-blessed' : 'default',
        registryPath: resolved.registryPath,
        recordId: resolved.blessedRecord?.recordId,
        advisoryOnly: resolved.blessedRecord?.advisoryOnly,
        status: resolved.blessedRecord?.status,
        weights: resolved.weights
      })
    };
  }

  return {
    tuningWeights: null,
    weightMetadata: null
  };
};

export const main = async () => {
  const args = parseCliArgs();
  const scenarioIds = typeof args.scenario === 'string'
    ? args.scenario.split(',').map((entry) => entry.trim()).filter(Boolean)
    : null;
  const runId = typeof args.run === 'string'
    ? args.run
    : resolveRunId({
        pack: 'mazer-lifeline-benchmark-pack',
        scenarioIds: scenarioIds ?? 'all'
      });
  const outputRoot = typeof args['output-root'] === 'string'
    ? resolve(REPO_ROOT, args['output-root'])
    : resolve(DEFAULT_OUTPUT_ROOT, runId);
  const { tuningWeights, weightMetadata } = await resolveCliWeights(args);
  const manifest = await runHeadlessRunner({
    scenarioIds,
    runId,
    outputRoot,
    resume: args.resume !== 'false',
    tuningWeights,
    weightMetadata
  });

  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
};
