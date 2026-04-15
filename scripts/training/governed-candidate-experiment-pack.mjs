import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createDefaultPlaybookTuningWeights,
  getCurrentBlessedWeightRecord,
  hashStableValue,
  parseCliArgs,
  readJson,
  runCommand,
  writeJson
} from './common.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const DEFAULT_PACK_PATH = resolve(REPO_ROOT, 'artifacts', 'training', 'governed-candidate-experiment-pack.json');
const DEFAULT_REGISTRY_PATH = resolve(REPO_ROOT, 'artifacts', 'training', 'playbook-weight-registry.json');
const DEFAULT_OUTPUT_ROOT = resolve(REPO_ROOT, 'tmp', 'training', 'governed-candidate-experiment-pack');
const DEFAULT_EVAL_OUTPUT_ROOT = resolve(REPO_ROOT, 'tmp', 'eval', 'governed-candidate-experiment-pack');
const REQUIRED_GLOBAL_GATES = [
  'architectureCheck',
  'tests',
  'build',
  'visualProof',
  'visualCanaries',
  'contentProof',
  'twoShellProof',
  'threeShellProof'
];
const REQUIRED_GATE_NAMES = [...REQUIRED_GLOBAL_GATES, 'runtimeEval'];

const clampWeight = (value) => Number(Math.min(1.6, Math.max(0.4, Number(value) || 1)).toFixed(4));

const toRepoPath = (absolutePath) => relative(REPO_ROOT, absolutePath).replace(/\\/g, '/');

const createEmptyRegistry = () => ({
  schemaVersion: 1,
  updatedAt: new Date(0).toISOString(),
  currentBlessedRecordId: null,
  candidates: [],
  blessed: []
});

const normalizeWeights = (weights) => {
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

const createMissingEvalSummary = (benchmarkPackId, candidateId) => ({
  schemaVersion: 1,
  suiteId: 'mazer-core-deterministic-runtime-eval',
  benchmarkPackId,
  summaryId: `eval-missing-${candidateId}`,
  runId: `eval-missing-${candidateId}`,
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

const createGovernanceGateStatus = () => Object.fromEntries(
  REQUIRED_GLOBAL_GATES.map((gateName) => [gateName, false])
);

const loadGovernedCandidateExperimentPack = async (packPath = DEFAULT_PACK_PATH) => {
  const rawPack = await readJson(packPath);

  return {
    ...rawPack,
    candidates: (rawPack.candidates ?? []).map((candidate) => ({
      ...candidate,
      weights: normalizeWeights(candidate.weights)
    }))
  };
};

const collectMetricBandFailures = (evalSummary) => (
  evalSummary?.scenarioSummaries?.flatMap((scenarioSummary) => (
    scenarioSummary?.metricBandValidation?.failures?.length
      ? scenarioSummary.metricBandValidation.failures.map((failure) => (
          `${scenarioSummary.scenarioId}: ${failure}`
        ))
      : []
  )) ?? []
);

const buildGovernedCandidateExperimentRecord = ({
  pack,
  candidate,
  registry,
  gateStatus,
  evalSummary,
  createdAt,
  artifactPaths
}) => {
  const normalizedWeights = normalizeWeights(candidate.weights);
  const currentBlessed = getCurrentBlessedWeightRecord(registry);
  const gateFailures = REQUIRED_GLOBAL_GATES.filter((gateName) => !gateStatus[gateName]);
  const metricBandFailures = collectMetricBandFailures(evalSummary);
  const benchmarkPackMatched = evalSummary?.benchmarkPackId === pack.benchmarkPackId;
  const scenarioIdsMatched = (
    !Array.isArray(pack.scenarioIds) || pack.scenarioIds.length === 0
      ? true
      : Array.isArray(evalSummary?.scenarioIds)
        && evalSummary.scenarioIds.join('|') === pack.scenarioIds.join('|')
  );
  const replayVerified = evalSummary?.replayIntegrity?.allScenariosVerified === true;
  const runtimeEvalGreen = evalSummary?.metricBandValidation?.allScenariosWithinBands === true;
  const accepted = (
    gateFailures.length === 0
    && benchmarkPackMatched
    && scenarioIdsMatched
    && replayVerified
    && runtimeEvalGreen
  );
  const governanceDecision = accepted ? 'accepted' : 'rejected';
  const reasons = [];

  if (accepted) {
    reasons.push('accepted: all required promotion gates green');
    reasons.push('accepted: runtime eval bands green');
    reasons.push('promotion blocked: manual blessing required');
  } else {
    if (gateFailures.length > 0) {
      reasons.push(`failed gates: ${gateFailures.join(', ')}`);
    }

    if (!benchmarkPackMatched) {
      reasons.push(`expected benchmark pack ${pack.benchmarkPackId}, received ${evalSummary?.benchmarkPackId ?? 'missing'}`);
    }

    if (!scenarioIdsMatched) {
      reasons.push('runtime eval summary scenario ids differ from the governed benchmark pack');
    }

    if (!replayVerified) {
      reasons.push('replay integrity failed');
    }

    if (metricBandFailures.length > 0) {
      reasons.push(`metric-band failures: ${metricBandFailures.join(' | ')}`);
    } else if (!runtimeEvalGreen) {
      reasons.push('runtime eval bands failed');
    }
  }

  return {
    schemaVersion: 1,
    recordId: `${pack.packId}:${candidate.candidateId}:${hashStableValue({
      packId: pack.packId,
      candidateId: candidate.candidateId,
      runId: evalSummary?.runId ?? 'eval-missing',
      weights: normalizedWeights
    })}`,
    advisoryOnly: true,
    status: accepted ? 'candidate' : 'rejected',
    governanceDecision,
    weights: normalizedWeights,
    metadata: {
      seedPackId: pack.seedPackId,
      packId: pack.packId,
      candidateId: candidate.candidateId,
      label: candidate.label,
      promotionBlockedUntil: [...pack.promotionBlockedUntil],
      createdAt,
      runId: evalSummary?.runId ?? `eval-missing-${candidate.candidateId}`,
      sourceRunId: candidate.sourceRunId ?? null,
      date: createdAt.slice(0, 10),
      evalSummary: {
        summaryId: evalSummary?.summaryId ?? `eval-missing-${candidate.candidateId}`,
        runId: evalSummary?.runId ?? `eval-missing-${candidate.candidateId}`,
        scenarioIds: [...(evalSummary?.scenarioIds ?? [])],
        metrics: { ...(evalSummary?.metrics ?? createMissingEvalSummary(pack.benchmarkPackId, candidate.candidateId).metrics) },
        path: artifactPaths?.evalSummaryPath ? toRepoPath(artifactPaths.evalSummaryPath) : undefined
      },
      gates: {
        ...gateStatus,
        runtimeEval: runtimeEvalGreen
      },
      artifactPaths: artifactPaths
        ? {
            weightsPath: toRepoPath(artifactPaths.weightsPath),
            evalSummaryPath: toRepoPath(artifactPaths.evalSummaryPath)
          }
        : undefined
    },
    diff: createWeightDiffReport(currentBlessed?.weights ?? null, normalizedWeights),
    notes: [
      ...reasons,
      `candidatePath: ${artifactPaths ? toRepoPath(artifactPaths.weightsPath) : 'n/a'}`,
      ...(artifactPaths ? [`evalSummaryPath: ${toRepoPath(artifactPaths.evalSummaryPath)}`] : [])
    ]
  };
};

const buildGovernedCandidateExperimentRegistry = ({
  pack,
  registry,
  gateStatus,
  evalSummaries,
  createdAt
}) => {
  const candidateRecords = pack.candidates.map((candidate) => (
    buildGovernedCandidateExperimentRecord({
      pack,
      candidate,
      registry,
      gateStatus,
      evalSummary: evalSummaries[candidate.candidateId]?.evalSummary ?? null,
      artifactPaths: evalSummaries[candidate.candidateId]?.artifactPaths ?? null,
      createdAt
    })
  ));

  return {
    registry: {
      schemaVersion: 1,
      updatedAt: createdAt,
      currentBlessedRecordId: registry.currentBlessedRecordId ?? null,
      candidates: [...(registry.candidates ?? []), ...candidateRecords],
      blessed: [...(registry.blessed ?? [])]
    },
    candidateRecords
  };
};

const runGovernanceGate = (name, command, args) => {
  const result = runCommand(command, args, { cwd: REPO_ROOT });

  return {
    key: name,
    ok: result.ok,
    stdout: result.stdout,
    stderr: result.stderr
  };
};

const runGovernanceGatePack = () => ([
  runGovernanceGate('architectureCheck', 'npm', ['run', 'architecture:check']),
  runGovernanceGate('tests', 'npm', ['test']),
  runGovernanceGate('build', 'npm', ['run', 'build']),
  runGovernanceGate('visualProof', 'npm', ['run', 'visual:proof']),
  runGovernanceGate('visualCanaries', 'npm', ['run', 'visual:canaries']),
  runGovernanceGate('contentProof', 'npm', ['run', 'future:content-proof']),
  runGovernanceGate('twoShellProof', 'npm', ['run', 'future:two-shell-proof']),
  runGovernanceGate('threeShellProof', 'npm', ['run', 'future:three-shell-proof'])
]);

const runCandidateEvaluation = async ({
  pack,
  candidate,
  outputRoot,
  evalOutputRoot
}) => {
  const candidateOutputRoot = resolve(outputRoot, candidate.candidateId);
  const candidateWeightsPath = resolve(candidateOutputRoot, 'weights.json');
  const candidateEvalOutputPath = resolve(evalOutputRoot, candidate.candidateId, 'runtime-eval-summary.json');

  await mkdir(dirname(candidateWeightsPath), { recursive: true });
  await mkdir(dirname(candidateEvalOutputPath), { recursive: true });
  await writeJson(candidateWeightsPath, candidate.weights);

  const result = runCommand('node', [
    'scripts/eval/run-eval.mjs',
    '--out',
    toRepoPath(candidateEvalOutputPath),
    '--weights',
    toRepoPath(candidateWeightsPath)
  ], { cwd: REPO_ROOT });

  if (!result.ok) {
    return {
      evalSummary: createMissingEvalSummary(pack.benchmarkPackId, candidate.candidateId),
      artifactPaths: {
        weightsPath: candidateWeightsPath,
        evalSummaryPath: candidateEvalOutputPath
      },
      commandResult: result
    };
  }

  return {
    evalSummary: await readJson(candidateEvalOutputPath),
    artifactPaths: {
      weightsPath: candidateWeightsPath,
      evalSummaryPath: candidateEvalOutputPath
    },
    commandResult: result
  };
};

const evaluateGovernedCandidateExperimentPack = async ({
  packPath = DEFAULT_PACK_PATH,
  registryPath = DEFAULT_REGISTRY_PATH,
  outputRoot = DEFAULT_OUTPUT_ROOT,
  evalOutputRoot = DEFAULT_EVAL_OUTPUT_ROOT,
  reportPath = resolve(DEFAULT_OUTPUT_ROOT, 'report.json')
} = {}) => {
  const pack = await loadGovernedCandidateExperimentPack(packPath);
  const registry = await readJson(registryPath).catch(() => createEmptyRegistry());
  const createdAt = new Date().toISOString();
  const gateResults = runGovernanceGatePack();
  const gateStatus = Object.fromEntries(gateResults.map((gateResult) => [gateResult.key, gateResult.ok]));
  const evalSummaries = {};

  for (const candidate of pack.candidates) {
    evalSummaries[candidate.candidateId] = await runCandidateEvaluation({
      pack,
      candidate,
      outputRoot,
      evalOutputRoot
    });
  }

  const { registry: nextRegistry, candidateRecords } = buildGovernedCandidateExperimentRegistry({
    pack,
    registry,
    gateStatus,
    evalSummaries,
    createdAt
  });
  const report = {
    schemaVersion: 1,
    packId: pack.packId,
    benchmarkPackId: pack.benchmarkPackId,
    seedPackId: pack.seedPackId,
    createdAt,
    promotionBlockedUntil: [...pack.promotionBlockedUntil],
    gateStatus,
    candidateResults: candidateRecords.map((record) => ({
      recordId: record.recordId,
      candidateId: record.metadata.candidateId,
      governanceDecision: record.governanceDecision,
      status: record.status,
      reasons: [...record.notes],
      evalRunId: record.metadata.runId
    }))
  };

  await mkdir(dirname(registryPath), { recursive: true });
  await writeJson(registryPath, nextRegistry);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeJson(reportPath, report);

  return {
    pack,
    registry: nextRegistry,
    report,
    gateStatus,
    gateResults,
    candidateRecords,
    reportPath
  };
};

const main = async () => {
  const args = parseCliArgs();
  const result = await evaluateGovernedCandidateExperimentPack({
    packPath: typeof args.pack === 'string' ? resolve(REPO_ROOT, args.pack) : DEFAULT_PACK_PATH,
    registryPath: typeof args.registry === 'string' ? resolve(REPO_ROOT, args.registry) : DEFAULT_REGISTRY_PATH,
    outputRoot: typeof args['output-root'] === 'string' ? resolve(REPO_ROOT, args['output-root']) : DEFAULT_OUTPUT_ROOT,
    evalOutputRoot: typeof args['eval-output-root'] === 'string' ? resolve(REPO_ROOT, args['eval-output-root']) : DEFAULT_EVAL_OUTPUT_ROOT,
    reportPath: typeof args.report === 'string' ? resolve(REPO_ROOT, args.report) : resolve(DEFAULT_OUTPUT_ROOT, 'report.json')
  });

  process.stdout.write(`${JSON.stringify({
    packId: result.pack.packId,
    reportPath: toRepoPath(result.reportPath),
    registryPath: typeof args.registry === 'string' ? toRepoPath(resolve(REPO_ROOT, args.registry)) : toRepoPath(DEFAULT_REGISTRY_PATH),
    gateStatus: result.gateStatus,
    candidateDecisions: result.report.candidateResults
  }, null, 2)}\n`);
};

if (process.argv[1] === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

export {
  REQUIRED_GATE_NAMES,
  REQUIRED_GLOBAL_GATES,
  buildGovernedCandidateExperimentRecord,
  buildGovernedCandidateExperimentRegistry,
  collectMetricBandFailures,
  createEmptyRegistry,
  createGovernanceGateStatus,
  createWeightDiffReport,
  evaluateGovernedCandidateExperimentPack,
  loadGovernedCandidateExperimentPack,
  normalizeWeights,
  runGovernanceGatePack
};
