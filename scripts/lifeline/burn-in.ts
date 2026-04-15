import { resolve } from 'node:path';
import {
  REPO_ROOT,
  hashStableValue,
  parseCliArgs,
  pathExists,
  readJson,
  relativeFromRepo,
  stableSerialize,
  writeJson
} from './common.mjs';
import {
  runHeadlessRunner,
  type HeadlessRunnerManifest,
  type HeadlessRunnerWeightMetadata
} from './headless-runner.ts';
import type { LifelineBenchmarkSuiteSummary } from './runtime-eval.ts';
import { resolveLifelineBenchmarkPack } from './benchmark-pack.mjs';
import {
  DEFAULT_PLAYBOOK_WEIGHT_REGISTRY_PATH,
  resolveBlessedPlaybookWeights,
  runCommand
} from '../training/common.mjs';

const DEFAULT_OUTPUT_ROOT = resolve(REPO_ROOT, 'tmp', 'lifeline', 'burn-in');
const DEFAULT_COUNTS = [25, 100, 500];
const DEFAULT_RUN_ID = 'neutral-advisory-burn-in';
const BENCHMARK_PACK_ID = resolveLifelineBenchmarkPack().packId;
type CliArgs = Record<string, string | boolean>;

const GATE_DEFINITIONS = [
  {
    key: 'architectureCheck',
    command: 'npm',
    args: ['run', 'architecture:check']
  },
  {
    key: 'visualProof',
    command: 'npm',
    args: ['run', 'visual:proof']
  },
  {
    key: 'visualCanaries',
    command: 'npm',
    args: ['run', 'visual:canaries']
  }
] as const;

type GateKey = (typeof GATE_DEFINITIONS)[number]['key'];

interface GateResult {
  key: GateKey;
  ok: boolean;
  stdout: string;
  stderr: string;
}

interface GateSuiteResult {
  phase: 'before' | 'after';
  ok: boolean;
  results: GateResult[];
}

interface BatchFailureBuckets {
  deterministicReplayConsistency: { count: number; attempts: string[] };
  stableSummaryIdGeneration: { count: number; attempts: string[] };
  stableRunIdGeneration: { count: number; attempts: string[] };
  architectureLeakage: { count: number; phases: string[] };
  proofGateRegression: { count: number; phases: string[] };
  candidateWeightPromotion: { count: number; phases: string[] };
}

interface BatchArtifacts {
  manifestPath: string;
  failureBucketsPath: string;
  evalSummaryRollupPath: string;
  datasetPointersPath: string;
  scorerWeightMetadataPath: string;
}

interface BatchMetricSummary {
  min: number;
  max: number;
  average: number;
}

interface BatchEvalSummaryRollup {
  schemaVersion: 1;
  batchId: string;
  targetRuns: number;
  completedRuns: number;
  uniqueRunIds: readonly string[];
  uniqueSummaryIds: readonly string[];
  uniqueSignatures: readonly string[];
  metrics: Record<string, BatchMetricSummary>;
}

interface BatchDatasetPointer {
  scenarioId: string;
  datasetPath: string;
  evalPath: string;
  tuningPath: string;
}

interface BatchDatasetPointerManifest {
  schemaVersion: 1;
  batchId: string;
  targetRuns: number;
  attempts: Array<{
    attemptId: string;
    manifestPath: string;
    summaryPath: string;
    datasetPointers: BatchDatasetPointer[];
  }>;
}

interface BatchScorerWeightMetadataArtifact {
  schemaVersion: 1;
  batchId: string;
  scorerWeights: HeadlessRunnerWeightMetadata;
}

interface BatchAttemptBaseline {
  runId: string;
  summaryId: string;
  signature: string;
  scenarioIds: readonly string[];
  scenarioRunIds: Array<{ scenarioId: string; runId: string }>;
  scenarioSummaryIds: Array<{ scenarioId: string; summaryId: string }>;
  metrics: Record<string, number>;
}

interface BatchAttemptRecord extends BatchAttemptBaseline {
  attempt: number;
  attemptId: string;
  status: 'passed' | 'failed';
  manifestPath: string;
  summaryPath: string;
  replayIntegrityOk: boolean;
  metricBandsOk: boolean;
  datasetPointers: BatchDatasetPointer[];
  failures: string[];
}

interface BurnInBatchManifest {
  schemaVersion: 1;
  batchId: string;
  benchmarkPackId: string;
  targetRuns: number;
  completedRuns: number;
  runId: string;
  resume: boolean;
  startedAt: string;
  completedAt: string | null;
  thresholds: Record<string, string>;
  scorerWeights: HeadlessRunnerWeightMetadata;
  registryDigestBefore: string;
  registryDigestAfter: string | null;
  registryStable: boolean | null;
  gateSuites: GateSuiteResult[];
  baseline: BatchAttemptBaseline | null;
  failures: string[];
  attempts: BatchAttemptRecord[];
  artifacts: BatchArtifacts;
}

interface BurnInRootManifest {
  schemaVersion: 1;
  burnInId: string;
  outputRoot: string;
  benchmarkPackId: string;
  counts: number[];
  runId: string;
  scorerWeights: HeadlessRunnerWeightMetadata;
  registryPath: string;
  startedAt: string;
  completedAt: string | null;
  batches: Array<{
    count: number;
    manifestPath: string;
    status: 'completed' | 'in-progress';
  }>;
}

const parseCounts = (value: string | boolean | undefined): number[] => {
  if (typeof value !== 'string') {
    return [...DEFAULT_COUNTS];
  }

  return value
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry) && entry > 0);
};

const attemptIdFor = (attempt: number) => `attempt-${String(attempt).padStart(4, '0')}`;

const createFailureBuckets = (): BatchFailureBuckets => ({
  deterministicReplayConsistency: { count: 0, attempts: [] },
  stableSummaryIdGeneration: { count: 0, attempts: [] },
  stableRunIdGeneration: { count: 0, attempts: [] },
  architectureLeakage: { count: 0, phases: [] },
  proofGateRegression: { count: 0, phases: [] },
  candidateWeightPromotion: { count: 0, phases: [] }
});

const buildThresholds = (): Record<string, string> => ({
  deterministicReplayConsistency: 'Every attempt must keep replayIntegrity.allScenariosVerified=true, metricBandValidation.allScenariosWithinBands=true, and match the baseline deterministic signature.',
  stableSummaryIdGeneration: 'The suite summaryId and every scenario summaryId must remain identical across attempts.',
  stableRunIdGeneration: 'The suite runId and every scenario eval runId must remain identical across attempts.',
  architectureLeakage: '`npm run architecture:check` must pass before and after each batch.',
  proofGateRegression: '`npm run visual:proof` and `npm run visual:canaries` must pass before and after each batch.',
  candidateWeightPromotion: 'The playbook weight registry digest must remain unchanged during burn-in.'
});

const parseTrailingJsonObject = (stdout: string): Record<string, unknown> | null => {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return null;
  }

  for (let index = trimmed.lastIndexOf('{'); index >= 0; index = trimmed.lastIndexOf('{', index - 1)) {
    const candidate = trimmed.slice(index);
    try {
      const parsed = JSON.parse(candidate);
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
    } catch {
      continue;
    }
  }

  return null;
};

const resolveGateSuccess = (gate: typeof GATE_DEFINITIONS[number], result: ReturnType<typeof runCommand>): GateResult => {
  const jsonTail = parseTrailingJsonObject(result.stdout);
  const failureCount = typeof jsonTail?.failureCount === 'number' ? jsonTail.failureCount : 0;
  const regressionCount = typeof jsonTail?.regressionCount === 'number' ? jsonTail.regressionCount : 0;
  const ok = result.ok && failureCount === 0 && regressionCount === 0;

  return {
    key: gate.key,
    ok,
    stdout: result.stdout,
    stderr: result.stderr
  };
};

const runGateSuite = (phase: 'before' | 'after'): GateSuiteResult => {
  const results = GATE_DEFINITIONS.map((gate) => {
    const result = runCommand(gate.command, gate.args, { cwd: REPO_ROOT });
    return resolveGateSuccess(gate, result);
  });

  return {
    phase,
    ok: results.every((result) => result.ok),
    results
  };
};

const relativeRegistryPath = (registryPath: string) => relativeFromRepo(resolve(registryPath));

const normalizeSummary = (summary: LifelineBenchmarkSuiteSummary) => ({
  benchmarkPackId: summary.benchmarkPackId,
  summaryId: summary.summaryId,
  runId: summary.runId,
  scenarioCount: summary.scenarioCount,
  scenarioIds: summary.scenarioIds,
  replayIntegrity: summary.replayIntegrity,
  metricBandValidation: summary.metricBandValidation,
  metrics: summary.metrics,
  support: summary.support,
  scenarioSummaries: Array.isArray(summary.scenarioSummaries)
    ? summary.scenarioSummaries.map((scenario) => ({
        scenarioId: scenario.scenarioId,
        summaryId: scenario.summaryId,
        runId: scenario.runId,
        replayVerified: scenario.replayVerified,
        metricBandValidation: scenario.metricBandValidation,
        metrics: scenario.metrics
      }))
    : []
});

const buildAttemptSignature = (manifest: HeadlessRunnerManifest, summary: LifelineBenchmarkSuiteSummary) => hashStableValue({
  manifest: {
    runId: manifest.runId,
    summaryId: manifest.summaryId,
    benchmarkPackId: manifest.benchmarkPackId,
    scenarioIds: manifest.scenarioIds,
    replayIntegrity: manifest.replayIntegrity,
    metricBandValidation: manifest.metricBandValidation,
    metrics: manifest.metrics,
    support: manifest.support
  },
  summary: normalizeSummary(summary)
});

const average = (values: number[]) => Number((values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1)).toFixed(4));

const buildEvalSummaryRollup = (batchManifest: BurnInBatchManifest): BatchEvalSummaryRollup => {
  const attempts = batchManifest.attempts;
  const metricNames = attempts[0] ? Object.keys(attempts[0].metrics) : [];

  return {
    schemaVersion: 1,
    batchId: batchManifest.batchId,
    targetRuns: batchManifest.targetRuns,
    completedRuns: attempts.length,
    uniqueRunIds: [...new Set(attempts.map((attempt) => attempt.runId))],
    uniqueSummaryIds: [...new Set(attempts.map((attempt) => attempt.summaryId))],
    uniqueSignatures: [...new Set(attempts.map((attempt) => attempt.signature))],
    metrics: Object.fromEntries(metricNames.map((metricName) => {
      const values = attempts.map((attempt) => attempt.metrics[metricName]);
      return [
        metricName,
        {
          min: Math.min(...values),
          max: Math.max(...values),
          average: average(values)
        }
      ];
    }))
  };
};

const buildDatasetPointers = (batchManifest: BurnInBatchManifest): BatchDatasetPointerManifest => ({
  schemaVersion: 1,
  batchId: batchManifest.batchId,
  targetRuns: batchManifest.targetRuns,
  attempts: batchManifest.attempts.map((attempt) => ({
    attemptId: attempt.attemptId,
    manifestPath: attempt.manifestPath,
    summaryPath: attempt.summaryPath,
    datasetPointers: attempt.datasetPointers
  }))
});

const addBucketAttempt = (bucket: { count: number; attempts: string[] }, attemptId: string) => {
  if (!bucket.attempts.includes(attemptId)) {
    bucket.attempts.push(attemptId);
    bucket.count += 1;
  }
};

const addBucketPhase = (bucket: { count: number; phases: string[] }, phase: string) => {
  if (!bucket.phases.includes(phase)) {
    bucket.phases.push(phase);
    bucket.count += 1;
  }
};

const recordGateFailures = (buckets: BatchFailureBuckets, gateSuite: GateSuiteResult) => {
  for (const result of gateSuite.results) {
    if (result.ok) {
      continue;
    }

    if (result.key === 'architectureCheck') {
      addBucketPhase(buckets.architectureLeakage, gateSuite.phase);
      continue;
    }

    addBucketPhase(buckets.proofGateRegression, `${gateSuite.phase}:${result.key}`);
  }
};

const buildAttemptRecord = async (
  count: number,
  attempt: number,
  runId: string,
  batchDir: string,
  scorerWeights: HeadlessRunnerWeightMetadata
): Promise<BatchAttemptRecord> => {
  const attemptId = attemptIdFor(attempt);
  const attemptRoot = resolve(batchDir, 'attempts', attemptId);
  const manifest = await runHeadlessRunner({
    runId,
    outputRoot: attemptRoot,
    resume: true,
    tuningWeights: scorerWeights.weights,
    weightMetadata: scorerWeights
  });
  const summary = await readJson(resolve(REPO_ROOT, manifest.artifacts.summary)) as LifelineBenchmarkSuiteSummary;
  const signature = buildAttemptSignature(manifest, summary);

  return {
    attempt,
    attemptId,
    status: 'passed',
    manifestPath: manifest.artifacts.manifest,
    summaryPath: manifest.artifacts.summary,
    runId: manifest.runId,
    summaryId: manifest.summaryId,
    signature,
    replayIntegrityOk: manifest.replayIntegrity.allScenariosVerified,
    metricBandsOk: manifest.metricBandValidation?.allScenariosWithinBands ?? true,
    scenarioIds: manifest.scenarioIds,
    scenarioRunIds: summary.scenarioSummaries.map((scenario) => ({
      scenarioId: scenario.scenarioId,
      runId: scenario.runId
    })),
    scenarioSummaryIds: summary.scenarioSummaries.map((scenario) => ({
      scenarioId: scenario.scenarioId,
      summaryId: scenario.summaryId
    })),
    metrics: manifest.metrics,
    datasetPointers: manifest.scenarios.map((scenario) => ({
      scenarioId: scenario.scenarioId,
      datasetPath: scenario.paths.datasetPath,
      evalPath: scenario.paths.evalPath,
      tuningPath: scenario.paths.tuningPath
    })),
    failures: []
  };
};

const evaluateAttempt = (
  attempt: BatchAttemptRecord,
  baseline: BatchAttemptBaseline | null,
  buckets: BatchFailureBuckets
): BatchAttemptBaseline => {
  if (!attempt.replayIntegrityOk || !attempt.metricBandsOk) {
    attempt.failures.push('deterministicReplayConsistency');
    addBucketAttempt(buckets.deterministicReplayConsistency, attempt.attemptId);
  }

  if (!baseline) {
    attempt.status = attempt.failures.length > 0 ? 'failed' : 'passed';
    return {
      runId: attempt.runId,
      summaryId: attempt.summaryId,
      signature: attempt.signature,
      scenarioIds: attempt.scenarioIds,
      scenarioRunIds: attempt.scenarioRunIds,
      scenarioSummaryIds: attempt.scenarioSummaryIds,
      metrics: attempt.metrics
    };
  }

  if (attempt.signature !== baseline.signature || stableSerialize(attempt.metrics) !== stableSerialize(baseline.metrics)) {
    attempt.failures.push('deterministicReplayConsistency');
    addBucketAttempt(buckets.deterministicReplayConsistency, attempt.attemptId);
  }

  if (
    attempt.summaryId !== baseline.summaryId
    || stableSerialize(attempt.scenarioSummaryIds) !== stableSerialize(baseline.scenarioSummaryIds)
  ) {
    attempt.failures.push('stableSummaryIdGeneration');
    addBucketAttempt(buckets.stableSummaryIdGeneration, attempt.attemptId);
  }

  if (
    attempt.runId !== baseline.runId
    || stableSerialize(attempt.scenarioRunIds) !== stableSerialize(baseline.scenarioRunIds)
  ) {
    attempt.failures.push('stableRunIdGeneration');
    addBucketAttempt(buckets.stableRunIdGeneration, attempt.attemptId);
  }

  attempt.status = attempt.failures.length > 0 ? 'failed' : 'passed';
  return baseline;
};

const writeBatchArtifacts = async (batchManifest: BurnInBatchManifest, failureBuckets: BatchFailureBuckets): Promise<void> => {
  await writeJson(resolve(REPO_ROOT, batchManifest.artifacts.manifestPath), batchManifest);
  await writeJson(resolve(REPO_ROOT, batchManifest.artifacts.failureBucketsPath), {
    schemaVersion: 1,
    batchId: batchManifest.batchId,
    targetRuns: batchManifest.targetRuns,
    buckets: failureBuckets
  });
  await writeJson(resolve(REPO_ROOT, batchManifest.artifacts.evalSummaryRollupPath), buildEvalSummaryRollup(batchManifest));
  await writeJson(resolve(REPO_ROOT, batchManifest.artifacts.datasetPointersPath), buildDatasetPointers(batchManifest));
  await writeJson(resolve(REPO_ROOT, batchManifest.artifacts.scorerWeightMetadataPath), {
    schemaVersion: 1,
    batchId: batchManifest.batchId,
    scorerWeights: batchManifest.scorerWeights
  } satisfies BatchScorerWeightMetadataArtifact);
};

const createBatchManifest = (
  batchId: string,
  benchmarkPackId: string,
  targetRuns: number,
  runId: string,
  resume: boolean,
  batchDir: string,
  scorerWeights: HeadlessRunnerWeightMetadata,
  registryDigestBefore: string
): BurnInBatchManifest => ({
  schemaVersion: 1,
  batchId,
  benchmarkPackId,
  targetRuns,
  completedRuns: 0,
  runId,
  resume,
  startedAt: new Date().toISOString(),
  completedAt: null,
  thresholds: buildThresholds(),
  scorerWeights,
  registryDigestBefore,
  registryDigestAfter: null,
  registryStable: null,
  gateSuites: [],
  baseline: null,
  failures: [],
  attempts: [],
  artifacts: {
    manifestPath: relativeFromRepo(resolve(batchDir, 'manifest.json')),
    failureBucketsPath: relativeFromRepo(resolve(batchDir, 'failure-buckets.json')),
    evalSummaryRollupPath: relativeFromRepo(resolve(batchDir, 'eval-summary-rollup.json')),
    datasetPointersPath: relativeFromRepo(resolve(batchDir, 'dataset-pointers.json')),
    scorerWeightMetadataPath: relativeFromRepo(resolve(batchDir, 'scorer-weight-metadata.json'))
  }
});

interface BurnInBatchOptions {
  count: number;
  outputRoot: string;
  runId: string;
  scorerWeights: HeadlessRunnerWeightMetadata;
  registryPath: string;
  registryDigestBefore: string;
  resume: boolean;
}

const runBurnInBatch = async ({
  count,
  outputRoot,
  runId,
  scorerWeights,
  registryPath,
  registryDigestBefore,
  resume
}: BurnInBatchOptions): Promise<string> => {
  const batchId = `runs-${count}`;
  const batchDir = resolve(outputRoot, batchId);
  const batchManifestPath = resolve(batchDir, 'manifest.json');
  const existingBatchManifest = resume && await pathExists(batchManifestPath)
    ? await readJson(batchManifestPath) as BurnInBatchManifest
    : null;
  const batchManifest = existingBatchManifest?.completedAt
    ? existingBatchManifest
    : existingBatchManifest ?? createBatchManifest(
        batchId,
        BENCHMARK_PACK_ID,
        count,
        runId,
        resume,
        batchDir,
        scorerWeights,
        registryDigestBefore
      );
  const failureBuckets = createFailureBuckets();

  if (existingBatchManifest?.completedAt) {
    await writeBatchArtifacts(batchManifest, failureBuckets);
    return batchManifest.artifacts.manifestPath;
  }

  for (const gateSuite of batchManifest.gateSuites) {
    recordGateFailures(failureBuckets, gateSuite);
  }

  if (batchManifest.gateSuites.length === 0) {
    const beforeSuite = runGateSuite('before');
    batchManifest.gateSuites.push(beforeSuite);
    recordGateFailures(failureBuckets, beforeSuite);
    await writeBatchArtifacts(batchManifest, failureBuckets);
  }

  let baseline = batchManifest.baseline;
  if (!baseline && batchManifest.attempts.length > 0) {
    baseline = evaluateAttempt(batchManifest.attempts[0], null, failureBuckets);
  }

  for (const attempt of batchManifest.attempts.slice(1)) {
    baseline = evaluateAttempt(attempt, baseline, failureBuckets);
  }

  for (let attempt = batchManifest.attempts.length + 1; attempt <= count; attempt += 1) {
    const attemptRecord = await buildAttemptRecord(count, attempt, runId, batchDir, scorerWeights);
    baseline = evaluateAttempt(attemptRecord, baseline, failureBuckets);
    batchManifest.baseline = baseline;
    batchManifest.attempts.push(attemptRecord);
    batchManifest.completedRuns = batchManifest.attempts.length;
    await writeBatchArtifacts(batchManifest, failureBuckets);
  }

  const afterSuite = runGateSuite('after');
  batchManifest.gateSuites.push(afterSuite);
  recordGateFailures(failureBuckets, afterSuite);
  const registryDigestAfter = hashStableValue(await readJson(registryPath).catch(() => null));
  batchManifest.registryDigestAfter = registryDigestAfter;
  batchManifest.registryStable = registryDigestAfter === registryDigestBefore;

  if (!batchManifest.registryStable) {
    addBucketPhase(failureBuckets.candidateWeightPromotion, 'after');
  }

  batchManifest.failures = [
    ...(failureBuckets.deterministicReplayConsistency.count > 0 ? ['deterministicReplayConsistency'] : []),
    ...(failureBuckets.stableSummaryIdGeneration.count > 0 ? ['stableSummaryIdGeneration'] : []),
    ...(failureBuckets.stableRunIdGeneration.count > 0 ? ['stableRunIdGeneration'] : []),
    ...(failureBuckets.architectureLeakage.count > 0 ? ['architectureLeakage'] : []),
    ...(failureBuckets.proofGateRegression.count > 0 ? ['proofGateRegression'] : []),
    ...(failureBuckets.candidateWeightPromotion.count > 0 ? ['candidateWeightPromotion'] : [])
  ];
  batchManifest.completedAt = new Date().toISOString();
  await writeBatchArtifacts(batchManifest, failureBuckets);
  return batchManifest.artifacts.manifestPath;
};

interface BurnInOptions {
  counts?: number[];
  outputRoot?: string;
  runId?: string;
  resume?: boolean;
  registryPath?: string;
}

export const runBurnIn = async ({
  counts = DEFAULT_COUNTS,
  outputRoot = DEFAULT_OUTPUT_ROOT,
  runId = DEFAULT_RUN_ID,
  resume = true,
  registryPath = resolve(REPO_ROOT, DEFAULT_PLAYBOOK_WEIGHT_REGISTRY_PATH)
}: BurnInOptions = {}): Promise<BurnInRootManifest> => {
  const resolvedOutputRoot = resolve(outputRoot);
  const resolvedRegistryPath = resolve(registryPath);
  const blessed = await resolveBlessedPlaybookWeights(resolvedRegistryPath);
  const scorerWeights: HeadlessRunnerWeightMetadata = {
    source: blessed.blessedRecord ? 'registry-blessed' : 'default',
    registryPath: relativeRegistryPath(blessed.registryPath),
    recordId: blessed.blessedRecord?.recordId,
    advisoryOnly: blessed.blessedRecord?.advisoryOnly,
    status: blessed.blessedRecord?.status,
    weights: blessed.weights
  };
  const registryDigestBefore = hashStableValue(await readJson(resolvedRegistryPath).catch(() => null));
  const rootManifestPath = resolve(resolvedOutputRoot, 'manifest.json');
  const existingRootManifest = resume && await pathExists(rootManifestPath)
    ? await readJson(rootManifestPath) as BurnInRootManifest
    : null;
  const rootManifest: BurnInRootManifest = existingRootManifest ?? {
    schemaVersion: 1,
    burnInId: 'lifeline-burn-in',
    outputRoot: relativeFromRepo(resolvedOutputRoot),
    benchmarkPackId: BENCHMARK_PACK_ID,
    counts,
    runId,
    scorerWeights,
    registryPath: relativeRegistryPath(blessed.registryPath),
    startedAt: new Date().toISOString(),
    completedAt: null,
    batches: []
  };

  for (const count of counts) {
    const existingBatch = rootManifest.batches.find((batch) => batch.count === count);
    if (!existingBatch) {
      rootManifest.batches.push({
        count,
        manifestPath: relativeFromRepo(resolve(resolvedOutputRoot, `runs-${count}`, 'manifest.json')),
        status: 'in-progress'
      });
      await writeJson(rootManifestPath, rootManifest);
    }

    const manifestPath = await runBurnInBatch({
      count,
      outputRoot: resolvedOutputRoot,
      runId,
      scorerWeights,
      registryPath: resolvedRegistryPath,
      registryDigestBefore,
      resume
    });
    const batch = rootManifest.batches.find((entry) => entry.count === count);
    if (batch) {
      batch.manifestPath = manifestPath;
      batch.status = 'completed';
    }
    await writeJson(rootManifestPath, rootManifest);
  }

  rootManifest.completedAt = new Date().toISOString();
  await writeJson(rootManifestPath, rootManifest);
  return rootManifest;
};

export const main = async () => {
  const args = parseCliArgs() as CliArgs;
  const counts = parseCounts(args.counts);
  const rootManifest = await runBurnIn({
    counts,
    outputRoot: typeof args['output-root'] === 'string'
      ? resolve(REPO_ROOT, args['output-root'])
      : DEFAULT_OUTPUT_ROOT,
    runId: typeof args.run === 'string' ? args.run : DEFAULT_RUN_ID,
    resume: args.resume !== 'false',
    registryPath: typeof args.registry === 'string'
      ? resolve(REPO_ROOT, args.registry)
      : resolve(REPO_ROOT, DEFAULT_PLAYBOOK_WEIGHT_REGISTRY_PATH)
  });

  process.stdout.write(`${JSON.stringify(rootManifest, null, 2)}\n`);
};
