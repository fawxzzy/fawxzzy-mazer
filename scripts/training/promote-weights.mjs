import { mkdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseCliArgs,
  readJson,
  resolvePlaybookTuningWeights,
  resolveRuntimeBenchmarkPack,
  runCommand,
  writeJson
} from './common.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const DEFAULT_REGISTRY_PATH = resolve(REPO_ROOT, 'artifacts', 'training', 'playbook-weight-registry.json');
const DEFAULT_EVAL_OUTPUT_PATH = resolve(REPO_ROOT, 'tmp', 'eval', 'runtime-eval-summary.json');
const DEFAULT_CANDIDATE_OUTPUT_PATH = resolve(REPO_ROOT, 'tmp', 'training', 'governed-candidate', 'candidate-weights.json');
const DEFAULT_CANDIDATE_OUTPUT_ROOT = resolve(REPO_ROOT, 'tmp', 'lifeline', 'headless-runner', 'governed-candidate');
const DEFAULT_FUTURE_ARTIFACT_ROOT = 'tmp/captures/mazer-future-runtime';
const DEFAULT_FUTURE_BASELINE_POINTER = 'artifacts/visual/future-runtime-baseline.json';
const DEFAULT_TWO_SHELL_RUN_ID = 'two-shell-proof';

const PROMOTION_GATES = [
  { key: 'architectureCheck', command: 'npm', args: ['run', 'architecture:check'] },
  { key: 'tests', command: 'npm', args: ['test'] },
  { key: 'build', command: 'npm', args: ['run', 'build'] },
  { key: 'visualProof', command: 'npm', args: ['run', 'visual:proof'] },
  { key: 'visualCanaries', command: 'npm', args: ['run', 'visual:canaries'] }
];

const metricDirection = {
  discoveryEfficiency: 'up',
  backtrackPressure: 'down',
  trapFalsePositiveRate: 'down',
  trapFalseNegativeRate: 'down',
  wardenPressureExposure: 'down',
  itemUsefulnessScore: 'up',
  puzzleStateClarityScore: 'up'
};

const clampWeight = (value) => Number(Math.min(1.6, Math.max(0.4, Number(value) || 1)).toFixed(4));
const toRepoPath = (absolutePath) => relative(REPO_ROOT, absolutePath).replace(/\\/g, '/');

const normalizeWeights = (weights) => {
  const source = resolvePlaybookTuningWeights(weights) ?? {};
  return {
    frontierValue: clampWeight(source.frontierValue ?? 1),
    backtrackUrgency: clampWeight(source.backtrackUrgency ?? 1),
    trapSuspicion: clampWeight(source.trapSuspicion ?? 1),
    enemyRisk: clampWeight(source.enemyRisk ?? 1),
    itemValue: clampWeight(source.itemValue ?? 1),
    puzzleValue: clampWeight(source.puzzleValue ?? 1),
    rotationTiming: clampWeight(source.rotationTiming ?? 1)
  };
};

const createEmptyRegistry = () => ({
  schemaVersion: 1,
  updatedAt: new Date(0).toISOString(),
  currentBlessedRecordId: null,
  candidates: [],
  blessed: []
});

const createMissingEvalSummary = (benchmarkPackId) => ({
  schemaVersion: 1,
  suiteId: 'mazer-core-deterministic-runtime-eval',
  benchmarkPackId,
  summaryId: 'eval-missing',
  runId: 'eval-missing',
  generatedAt: new Date().toISOString(),
  scenarioCount: 0,
  scenarioIds: [],
  replayIntegrity: {
    verifiedScenarioCount: 0,
    failedScenarioCount: 0,
    allScenariosVerified: false
  },
  metrics: {
    discoveryEfficiency: 0,
    backtrackPressure: 1,
    trapFalsePositiveRate: 1,
    trapFalseNegativeRate: 1,
    wardenPressureExposure: 1,
    itemUsefulnessScore: 0,
    puzzleStateClarityScore: 0
  },
  support: {
    rowsEvaluated: 0,
    discoverySamples: 0,
    backtrackSamples: 0,
    trapPredictedPositiveCount: 0,
    trapActualPositiveCount: 0,
    trapFalsePositiveCount: 0,
    trapFalseNegativeCount: 0,
    wardenExposureSamples: 0,
    itemPositiveSamples: 0,
    puzzlePositiveSamples: 0
  },
  metricBandValidation: {
    passedScenarioCount: 0,
    failedScenarioCount: 0,
    allScenariosWithinBands: false
  },
  scenarioSummaries: []
});

const createWeightDiffReport = (previousWeights, nextWeights) => {
  const previous = normalizeWeights(previousWeights);
  const next = normalizeWeights(nextWeights);
  const entry = (prev, current) => ({
    previous: prev,
    next: current,
    delta: Number((current - prev).toFixed(4))
  });

  return {
    frontierValue: entry(previous.frontierValue, next.frontierValue),
    backtrackUrgency: entry(previous.backtrackUrgency, next.backtrackUrgency),
    trapSuspicion: entry(previous.trapSuspicion, next.trapSuspicion),
    enemyRisk: entry(previous.enemyRisk, next.enemyRisk),
    itemValue: entry(previous.itemValue, next.itemValue),
    puzzleValue: entry(previous.puzzleValue, next.puzzleValue),
    rotationTiming: entry(previous.rotationTiming, next.rotationTiming)
  };
};

const getCurrentBlessedRecord = (registry) => (
  registry.currentBlessedRecordId
    ? registry.blessed.find((record) => record.recordId === registry.currentBlessedRecordId) ?? null
    : registry.blessed.at(-1) ?? null
);

const compareMetrics = (baseline, candidate) => {
  if (!baseline) {
    return {
      improved: Object.keys(candidate),
      regressed: [],
      unchanged: []
    };
  }

  const improved = [];
  const regressed = [];
  const unchanged = [];

  for (const metricName of Object.keys(candidate)) {
    const direction = metricDirection[metricName];
    const baselineValue = baseline[metricName];
    const candidateValue = candidate[metricName];

    if (candidateValue === baselineValue) {
      unchanged.push(metricName);
      continue;
    }

    const isImproved = direction === 'up'
      ? candidateValue > baselineValue
      : candidateValue < baselineValue;

    if (isImproved) {
      improved.push(metricName);
      continue;
    }

    regressed.push(metricName);
  }

  return {
    improved,
    regressed,
    unchanged
  };
};

const runPromotionGate = (gate) => {
  const result = runCommand(gate.command, gate.args, { cwd: REPO_ROOT });
  return {
    key: gate.key,
    ok: result.ok,
    stdout: result.stdout,
    stderr: result.stderr
  };
};

const runFutureRuntimeGate = async ({
  futureArtifactRoot,
  futureBaselinePointer,
  twoShellRunId
}) => {
  const mainBaselinePath = resolve(REPO_ROOT, 'artifacts', 'visual', 'baseline.json');
  const baselineBefore = await readJson(mainBaselinePath);
  const commands = [
    ['node', ['scripts/visual/future-runtime-run.mjs', '--run', 'content-proof', '--skip-build', 'true']],
    ['node', ['scripts/visual/future-runtime-run.mjs', '--run', twoShellRunId, '--skip-build', 'true']],
    ['node', [
      'scripts/visual/index-artifacts.mjs',
      '--future-artifact-root',
      futureArtifactRoot,
      '--promote-baseline',
      '--run-id',
      twoShellRunId
    ]],
    ['node', [
      'scripts/visual/index-artifacts.mjs',
      '--future-artifact-root',
      futureArtifactRoot,
      '--compare',
      '--run-id',
      twoShellRunId
    ]]
  ];

  const outputs = [];
  for (const [command, args] of commands) {
    const result = runCommand(command, args, { cwd: REPO_ROOT });
    outputs.push({
      command,
      args,
      ok: result.ok,
      stdout: result.stdout,
      stderr: result.stderr
    });

    if (!result.ok) {
      return {
        key: 'futureRuntimeContentProof',
        ok: false,
        stdout: outputs.map((entry) => entry.stdout).filter(Boolean).join('\n'),
        stderr: outputs.map((entry) => entry.stderr).filter(Boolean).join('\n'),
        details: {
          futureArtifactRoot,
          futureBaselinePointer,
          twoShellRunId,
          commands: outputs
        }
      };
    }
  }

  const baselineAfter = await readJson(mainBaselinePath);
  if (JSON.stringify(baselineBefore) !== JSON.stringify(baselineAfter)) {
    return {
      key: 'futureRuntimeContentProof',
      ok: false,
      stdout: outputs.map((entry) => entry.stdout).filter(Boolean).join('\n'),
      stderr: 'Main visual baseline pointer changed during future-runtime promotion.',
      details: {
        futureArtifactRoot,
        futureBaselinePointer,
        twoShellRunId,
        commands: outputs
      }
    };
  }

  const futurePointer = await readJson(resolve(REPO_ROOT, futureBaselinePointer));
  const scenarioIds = [...(futurePointer?.scenarioIds ?? [])].sort();
  const laneCorrect = futurePointer?.runId === twoShellRunId
    && scenarioIds.length === 1
    && scenarioIds[0] === 'planet3d-two-shell-proof';

  if (!laneCorrect) {
    return {
      key: 'futureRuntimeContentProof',
      ok: false,
      stdout: outputs.map((entry) => entry.stdout).filter(Boolean).join('\n'),
      stderr: `Future baseline pointer is not lane-correct for ${twoShellRunId}.`,
      details: {
        futureArtifactRoot,
        futureBaselinePointer,
        twoShellRunId,
        futurePointer,
        commands: outputs
      }
    };
  }

  return {
    key: 'futureRuntimeContentProof',
    ok: true,
    stdout: outputs.map((entry) => entry.stdout).filter(Boolean).join('\n'),
    stderr: '',
    details: {
      futureArtifactRoot,
      futureBaselinePointer,
      twoShellRunId,
      futurePointer,
      commands: outputs
    }
  };
};

const resolveCandidateInput = async (args) => {
  if (typeof args.candidate === 'string') {
    const candidatePath = resolve(REPO_ROOT, args.candidate);
    const candidateInput = await readJson(candidatePath);
    return {
      candidatePath,
      candidateInput,
      candidateManifestPath: null,
      sourceRunId: candidateInput.runId ?? candidateInput.metadata?.runId ?? null
    };
  }

  const candidateOutputRoot = typeof args['candidate-output-root'] === 'string'
    ? resolve(REPO_ROOT, args['candidate-output-root'])
    : DEFAULT_CANDIDATE_OUTPUT_ROOT;
  const candidatePath = typeof args['candidate-out'] === 'string'
    ? resolve(REPO_ROOT, args['candidate-out'])
    : DEFAULT_CANDIDATE_OUTPUT_PATH;
  const candidateRunId = typeof args['candidate-run'] === 'string'
    ? args['candidate-run']
    : 'governed-candidate';

  const runnerResult = runCommand('node', [
    'scripts/lifeline/headless-runner.mjs',
    '--run',
    candidateRunId,
    '--output-root',
    toRepoPath(candidateOutputRoot)
  ], { cwd: REPO_ROOT });

  if (!runnerResult.ok) {
    throw new Error(
      `Failed to generate benchmark-pack candidate inputs.\n${runnerResult.stderr || runnerResult.stdout}`
    );
  }

  const manifestPath = resolve(candidateOutputRoot, 'manifest.json');
  const manifest = await readJson(manifestPath);
  const datasetPaths = (manifest.scenarios ?? [])
    .map((scenario) => scenario?.paths?.datasetPath)
    .filter(Boolean);

  if (datasetPaths.length === 0) {
    throw new Error('Benchmark-pack candidate generation did not emit any replay-linked datasets.');
  }

  await mkdir(dirname(candidatePath), { recursive: true });
  const tuningResult = runCommand('node', [
    'scripts/training/tune-scorer.mjs',
    '--dataset',
    datasetPaths.join(','),
    '--output',
    toRepoPath(candidatePath)
  ], { cwd: REPO_ROOT });

  if (!tuningResult.ok) {
    throw new Error(
      `Failed to derive governed candidate weights.\n${tuningResult.stderr || tuningResult.stdout}`
    );
  }

  const candidateInput = await readJson(candidatePath);
  return {
    candidatePath,
    candidateInput,
    candidateManifestPath: manifestPath,
    sourceRunId: manifest.runId ?? candidateRunId
  };
};

const main = async () => {
  const args = parseCliArgs();
  const registryPath = typeof args.registry === 'string'
    ? resolve(REPO_ROOT, args.registry)
    : DEFAULT_REGISTRY_PATH;
  const evalOutputPath = typeof args['eval-out'] === 'string'
    ? resolve(REPO_ROOT, args['eval-out'])
    : DEFAULT_EVAL_OUTPUT_PATH;
  const futureArtifactRoot = typeof args['future-artifact-root'] === 'string'
    ? args['future-artifact-root']
    : DEFAULT_FUTURE_ARTIFACT_ROOT;
  const futureBaselinePointer = typeof args['future-baseline-pointer'] === 'string'
    ? args['future-baseline-pointer']
    : DEFAULT_FUTURE_BASELINE_POINTER;
  const twoShellRunId = typeof args['future-two-shell-run'] === 'string'
    ? args['future-two-shell-run']
    : DEFAULT_TWO_SHELL_RUN_ID;
  const benchmarkPack = resolveRuntimeBenchmarkPack();
  const expectedScenarioIds = benchmarkPack.scenarios.map((scenario) => scenario.id);
  const candidate = await resolveCandidateInput(args);
  const candidateWeights = normalizeWeights(candidate.candidateInput);
  const registry = await readJson(registryPath).catch(() => createEmptyRegistry());
  const currentBlessed = getCurrentBlessedRecord(registry);
  const gateResults = PROMOTION_GATES.map((gate) => runPromotionGate(gate));
  const futureRuntimeGate = await runFutureRuntimeGate({
    futureArtifactRoot,
    futureBaselinePointer,
    twoShellRunId
  });
  gateResults.push(futureRuntimeGate);

  const evalGate = runCommand('node', [
    'scripts/eval/run-eval.mjs',
    '--out',
    toRepoPath(evalOutputPath),
    '--weights',
    toRepoPath(candidate.candidatePath)
  ], { cwd: REPO_ROOT });
  gateResults.push({
    key: 'runtimeEval',
    ok: evalGate.ok,
    stdout: evalGate.stdout,
    stderr: evalGate.stderr
  });

  const gateStatus = Object.fromEntries(gateResults.map((result) => [result.key, result.ok]));
  const evalSummary = await readJson(evalOutputPath).catch(() => createMissingEvalSummary(benchmarkPack.packId));
  const metricComparison = compareMetrics(
    currentBlessed?.metadata?.evalSummary?.metrics ?? null,
    evalSummary.metrics
  );
  const reasons = [];

  const failedGateKeys = gateResults.filter((result) => !result.ok).map((result) => result.key);
  if (failedGateKeys.length > 0) {
    reasons.push(`failed gates: ${failedGateKeys.join(', ')}`);
  }

  if (evalSummary.benchmarkPackId !== benchmarkPack.packId) {
    reasons.push(`expected benchmark pack ${benchmarkPack.packId}, received ${evalSummary.benchmarkPackId}`);
  }

  if (evalSummary.scenarioIds.join('|') !== expectedScenarioIds.join('|')) {
    reasons.push('runtime eval summary does not match the benchmark scenario ids');
  }

  if (!evalSummary.replayIntegrity?.allScenariosVerified) {
    reasons.push('replay integrity failed');
  }

  if (!evalSummary.metricBandValidation?.allScenariosWithinBands) {
    reasons.push('runtime eval summary fell outside expected metric bands');
  }

  if (metricComparison.regressed.length > 0) {
    reasons.push(`metric regressions: ${metricComparison.regressed.join(', ')}`);
  }

  if (currentBlessed && metricComparison.improved.length === 0) {
    reasons.push('no metric improved over the current blessed weights');
  }

  const createdAt = new Date().toISOString();
  const candidateRecord = {
    schemaVersion: 1,
    recordId: `${benchmarkPack.packId}:${evalSummary.runId}`,
    advisoryOnly: true,
    status: reasons.length === 0 ? 'blessed' : 'rejected',
    weights: candidateWeights,
    metadata: {
      seedPackId: benchmarkPack.packId,
      createdAt,
      runId: evalSummary.runId,
      sourceRunId: candidate.sourceRunId,
      date: createdAt.slice(0, 10),
      evalSummary: {
        summaryId: evalSummary.summaryId,
        runId: evalSummary.runId,
        scenarioIds: [...evalSummary.scenarioIds],
        metrics: { ...evalSummary.metrics },
        path: evalOutputPath
      },
      gates: gateStatus
    },
    diff: createWeightDiffReport(currentBlessed?.weights ?? null, candidateWeights),
    notes: [
      ...reasons,
      `candidatePath: ${toRepoPath(candidate.candidatePath)}`,
      ...(candidate.candidateManifestPath ? [`candidateManifestPath: ${toRepoPath(candidate.candidateManifestPath)}`] : [])
    ]
  };

  const nextRegistry = {
    schemaVersion: 1,
    updatedAt: createdAt,
    currentBlessedRecordId: registry.currentBlessedRecordId ?? null,
    candidates: [...(registry.candidates ?? []), candidateRecord],
    blessed: [...(registry.blessed ?? [])]
  };

  if (reasons.length === 0) {
    nextRegistry.blessed.push(candidateRecord);
    nextRegistry.currentBlessedRecordId = candidateRecord.recordId;
  }

  await mkdir(dirname(registryPath), { recursive: true });
  await writeJson(registryPath, nextRegistry);

  process.stdout.write(`${JSON.stringify({
    accepted: reasons.length === 0,
    registryPath,
    candidatePath: candidate.candidatePath,
    candidateManifestPath: candidate.candidateManifestPath,
    evalSummaryPath: evalOutputPath,
    futureBaselinePointerPath: resolve(REPO_ROOT, futureBaselinePointer),
    recordId: candidateRecord.recordId,
    reasons,
    metricComparison,
    diff: candidateRecord.diff,
    gateStatus
  }, null, 2)}\n`);

  if (reasons.length > 0) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
