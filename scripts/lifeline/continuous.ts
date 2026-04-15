// @ts-nocheck
import { mkdir, rm } from 'node:fs/promises';
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
import { resolveLifelineBenchmarkPack } from './benchmark-pack.mjs';
import {
  runBurnInBatch,
  type BatchEvalSummaryRollup,
  type BurnInBatchManifest
} from './burn-in.ts';
import { type HeadlessRunnerWeightMetadata } from './headless-runner.ts';
import {
  DEFAULT_PLAYBOOK_WEIGHT_REGISTRY_PATH,
  resolveBlessedPlaybookWeights,
  runCommand
} from '../training/common.mjs';

const DEFAULT_OUTPUT_ROOT = resolve(REPO_ROOT, 'tmp', 'lifeline', 'continuous');
const DEFAULT_BATCH_COUNTS = [1000, 5000];
const DEFAULT_RUN_ID = 'continuous-lifeline-soak';
const DEFAULT_RETENTION_WINDOW = 3;
const BENCHMARK_PACK_ID = resolveLifelineBenchmarkPack().packId;
const HEALTH_COMMAND = ['run', 'health'];

type FailureBucketName =
  | 'resumeCheckpointMismatch'
  | 'batchExecutionFailure'
  | 'blessedWeightMismatch'
  | 'stableArtifactPointerMismatch'
  | 'retentionPruneFailure'
  | 'healthPackRegression';

interface FailureBucket {
  count: number;
  batchIds: string[];
  reasons: string[];
}

interface ContinuousFailureBuckets {
  resumeCheckpointMismatch: FailureBucket;
  batchExecutionFailure: FailureBucket;
  blessedWeightMismatch: FailureBucket;
  stableArtifactPointerMismatch: FailureBucket;
  retentionPruneFailure: FailureBucket;
  healthPackRegression: FailureBucket;
}

interface ContinuousHealthGateSummary {
  phase: 'before' | 'after';
  ok: boolean;
  summaryPath: string;
  failedGateKey: string | null;
  failedGateLabel: string | null;
  results: Array<{
    key: string;
    ok: boolean;
    exitCode: number;
  }>;
}

interface ContinuousBatchArtifactPointers {
  continuousManifestPath: string;
  continuousSummaryPath: string;
  continuousFailureBucketsPath: string;
  healthBeforeSummaryPath: string;
  healthAfterSummaryPath: string;
  soakRootManifestPath: string;
  soakBatchManifestPath: string;
  soakFailureBucketsPath: string;
  soakEvalSummaryRollupPath: string;
  soakDatasetPointersPath: string;
  soakScorerWeightMetadataPath: string;
}

interface ContinuousSoakRootManifest {
  schemaVersion: 1;
  batchId: string;
  runId: string;
  benchmarkPackId: string;
  targetRuns: number;
  completedRuns: number;
  completedAt: string | null;
  activeBlessedWeightId: string;
  failures: string[];
  batchManifestPath: string;
  failureBucketsPath: string;
  evalSummaryRollupPath: string;
  datasetPointersPath: string;
  scorerWeightMetadataPath: string;
}

interface ContinuousBatchRecord {
  batchIndex: number;
  batchId: string;
  targetRuns: number;
  runId: string;
  summaryId: string;
  completedAt: string;
  status: 'running' | 'completed' | 'failed';
  manifestPath: string;
  summaryPath: string;
  failureBucketsPath: string;
  activeBlessedWeightId: string;
  failures: FailureBucketName[];
  failureBucketHistogram: Record<FailureBucketName, number>;
  soakFailures: string[];
  evalRollup: BatchEvalSummaryRollup;
  artifactPointers: ContinuousBatchArtifactPointers;
  healthSuites: ContinuousHealthGateSummary[];
  batchDigest: string;
}

interface ContinuousBatchFailureDetail {
  schemaVersion: 1;
  batchId: string;
  batchIndex: number;
  targetRuns: number;
  failures: FailureBucketName[];
  histogram: Record<FailureBucketName, number>;
  soakFailures: string[];
}

interface ContinuousManifest {
  schemaVersion: 2;
  continuousId: string;
  runId: string;
  benchmarkPackId: string;
  outputRoot: string;
  counts: number[];
  retentionWindow: number;
  activeBlessedWeightId: string;
  scorerWeights: HeadlessRunnerWeightMetadata;
  startedAt: string;
  completedAt: string | null;
  nextBatchIndex: number;
  activeBatch: {
    batchId: string;
    batchIndex: number;
    targetRuns: number;
    status: 'running';
  } | null;
  lastSuccessfulBatchId: string | null;
  lastSuccessfulBatchIndex: number | null;
  lastSuccessfulBatchSummaryId: string | null;
  checkpointPath: string;
  watchdogPath: string;
  summaryRollupPath: string;
  latestBatchManifestPath: string;
  latestBatchSummaryPath: string;
  latestFailureBucketsPath: string;
  retainedBatches: ContinuousBatchRecord[];
  prunedBatchIds: string[];
  failureBucketHistogram: Record<FailureBucketName, number>;
}

interface ContinuousWatchdogSummary {
  schemaVersion: 2;
  continuousId: string;
  runId: string;
  batchCount: number;
  lastSuccessfulBatch: {
    batchId: string;
    batchIndex: number;
    summaryId: string;
    manifestPath: string;
  } | null;
  failureBucketHistogram: Record<FailureBucketName, number>;
  activeBlessedWeightId: string;
  checkpointPath: string;
  latestBatchManifestPath: string;
  latestBatchSummaryPath: string;
  latestFailureBucketsPath: string;
}

interface ContinuousSummaryRollup {
  schemaVersion: 2;
  continuousId: string;
  runId: string;
  benchmarkPackId: string;
  retentionWindow: number;
  batchCount: number;
  activeBlessedWeightId: string;
  failureBucketHistogram: Record<FailureBucketName, number>;
  batches: Array<{
    batchIndex: number;
    batchId: string;
    targetRuns: number;
    runId: string;
    summaryId: string;
    status: 'completed' | 'failed';
    activeBlessedWeightId: string;
    batchDigest: string;
    failures: FailureBucketName[];
    failureBucketHistogram: Record<FailureBucketName, number>;
    soakFailures: string[];
    evalRollup: BatchEvalSummaryRollup;
    artifactPointers: ContinuousBatchArtifactPointers;
    healthSuites: ContinuousHealthGateSummary[];
  }>;
}

const FAILURE_BUCKETS: FailureBucketName[] = [
  'resumeCheckpointMismatch',
  'batchExecutionFailure',
  'blessedWeightMismatch',
  'stableArtifactPointerMismatch',
  'retentionPruneFailure',
  'healthPackRegression'
];

type BlessedWeightResolution = Awaited<ReturnType<typeof resolveBlessedPlaybookWeights>>;

const createEmptyBuckets = (): ContinuousFailureBuckets => Object.fromEntries(
  FAILURE_BUCKETS.map((bucketName) => [
    bucketName,
    { count: 0, batchIds: [], reasons: [] }
  ])
) as unknown as ContinuousFailureBuckets;

const createEmptyHistogram = (): Record<FailureBucketName, number> => Object.fromEntries(
  FAILURE_BUCKETS.map((bucketName) => [bucketName, 0])
) as Record<FailureBucketName, number>;

const resolveBatchId = (batchIndex: number, targetRuns: number): string => (
  `batch-${String(batchIndex).padStart(4, '0')}-runs-${String(targetRuns).padStart(4, '0')}`
);

const resolveBatchTargetRuns = (counts: number[], batchIndex: number): number => {
  if (counts.length === 0) {
    throw new Error('Continuous Lifeline requires at least one batch count.');
  }

  return counts[(batchIndex - 1) % counts.length];
};

const resolveBatchRoot = (outputRoot: string, batchId: string): string => resolve(outputRoot, 'batches', batchId);

const normalizeWeightMetadata = (
  weights: HeadlessRunnerWeightMetadata['weights'],
  metadata: Pick<HeadlessRunnerWeightMetadata, 'source' | 'registryPath' | 'recordId' | 'advisoryOnly' | 'status'>
): HeadlessRunnerWeightMetadata => ({
  source: metadata.source,
  registryPath: metadata.registryPath,
  recordId: metadata.recordId,
  advisoryOnly: metadata.advisoryOnly,
  status: metadata.status,
  weights: {
    frontierValue: Number(weights.frontierValue.toFixed(4)),
    backtrackUrgency: Number(weights.backtrackUrgency.toFixed(4)),
    trapSuspicion: Number(weights.trapSuspicion.toFixed(4)),
    enemyRisk: Number(weights.enemyRisk.toFixed(4)),
    itemValue: Number(weights.itemValue.toFixed(4)),
    puzzleValue: Number(weights.puzzleValue.toFixed(4)),
    rotationTiming: Number(weights.rotationTiming.toFixed(4))
  }
});

const createBatchDigest = (batchRecord: Omit<ContinuousBatchRecord, 'batchDigest'>): string => hashStableValue({
  batchIndex: batchRecord.batchIndex,
  batchId: batchRecord.batchId,
  targetRuns: batchRecord.targetRuns,
  runId: batchRecord.runId,
  summaryId: batchRecord.summaryId,
  status: batchRecord.status,
  activeBlessedWeightId: batchRecord.activeBlessedWeightId,
  failures: batchRecord.failures,
  failureBucketHistogram: batchRecord.failureBucketHistogram,
  soakFailures: batchRecord.soakFailures,
  evalRollup: batchRecord.evalRollup,
  artifactPointers: batchRecord.artifactPointers,
  healthSuites: batchRecord.healthSuites
});

const incrementBucket = (
  buckets: ContinuousFailureBuckets,
  histogram: Record<FailureBucketName, number>,
  bucketName: FailureBucketName,
  batchId: string,
  reason: string
) => {
  if (!buckets[bucketName].batchIds.includes(batchId)) {
    buckets[bucketName].count += 1;
    histogram[bucketName] += 1;
    buckets[bucketName].batchIds.push(batchId);
  }
  if (!buckets[bucketName].reasons.includes(reason)) {
    buckets[bucketName].reasons.push(reason);
  }
};

const addBatchFailure = (
  failures: FailureBucketName[],
  histogram: Record<FailureBucketName, number>,
  bucketName: FailureBucketName
) => {
  if (failures.includes(bucketName)) {
    return;
  }

  failures.push(bucketName);
  histogram[bucketName] = 1;
};

const buildBatchFailureDetail = (
  batchId: string,
  batchIndex: number,
  targetRuns: number,
  failures: FailureBucketName[],
  histogram: Record<FailureBucketName, number>,
  soakFailures: string[]
): ContinuousBatchFailureDetail => ({
  schemaVersion: 1,
  batchId,
  batchIndex,
  targetRuns,
  failures: [...failures],
  histogram: { ...histogram },
  soakFailures: [...soakFailures]
});

const cloneEvalRollup = (evalRollup: BatchEvalSummaryRollup): BatchEvalSummaryRollup => ({
  ...evalRollup,
  uniqueRunIds: [...evalRollup.uniqueRunIds],
  uniqueSummaryIds: [...evalRollup.uniqueSummaryIds],
  uniqueSignatures: [...evalRollup.uniqueSignatures],
  metrics: Object.fromEntries(
    Object.entries(evalRollup.metrics).map(([metricName, value]) => [metricName, { ...value }])
  )
});

const cloneHealthSuites = (healthSuites: ContinuousHealthGateSummary[]): ContinuousHealthGateSummary[] => (
  healthSuites.map((suite) => ({
    ...suite,
    results: suite.results.map((result) => ({ ...result }))
  }))
);

const buildCheckpoint = (manifest: ContinuousManifest): ContinuousManifest => ({
  ...manifest,
  retainedBatches: manifest.retainedBatches.map((batch) => ({
    ...batch,
    failures: [...batch.failures],
    failureBucketHistogram: { ...batch.failureBucketHistogram },
    soakFailures: [...batch.soakFailures],
    evalRollup: cloneEvalRollup(batch.evalRollup),
    artifactPointers: { ...batch.artifactPointers },
    healthSuites: cloneHealthSuites(batch.healthSuites)
  })),
  prunedBatchIds: [...manifest.prunedBatchIds],
  failureBucketHistogram: { ...manifest.failureBucketHistogram },
  activeBatch: manifest.activeBatch ? { ...manifest.activeBatch } : null,
  scorerWeights: {
    ...manifest.scorerWeights,
    weights: { ...manifest.scorerWeights.weights }
  }
});

const buildSummaryRollup = (manifest: ContinuousManifest): ContinuousSummaryRollup => ({
  schemaVersion: 2,
  continuousId: manifest.continuousId,
  runId: manifest.runId,
  benchmarkPackId: manifest.benchmarkPackId,
  retentionWindow: manifest.retentionWindow,
  batchCount: manifest.retainedBatches.length + manifest.prunedBatchIds.length,
  activeBlessedWeightId: manifest.activeBlessedWeightId,
  failureBucketHistogram: { ...manifest.failureBucketHistogram },
  batches: manifest.retainedBatches.map((batch) => ({
    batchIndex: batch.batchIndex,
    batchId: batch.batchId,
    targetRuns: batch.targetRuns,
    runId: batch.runId,
    summaryId: batch.summaryId,
    status: batch.status === 'failed' ? 'failed' : 'completed',
    activeBlessedWeightId: batch.activeBlessedWeightId,
    batchDigest: batch.batchDigest,
    failures: [...batch.failures],
    failureBucketHistogram: { ...batch.failureBucketHistogram },
    soakFailures: [...batch.soakFailures],
    evalRollup: cloneEvalRollup(batch.evalRollup),
    artifactPointers: { ...batch.artifactPointers },
    healthSuites: cloneHealthSuites(batch.healthSuites)
  }))
});

const buildWatchdogSummary = (manifest: ContinuousManifest): ContinuousWatchdogSummary => ({
  schemaVersion: 2,
  continuousId: manifest.continuousId,
  runId: manifest.runId,
  batchCount: manifest.retainedBatches.length + manifest.prunedBatchIds.length,
  lastSuccessfulBatch: manifest.lastSuccessfulBatchId
    ? {
        batchId: manifest.lastSuccessfulBatchId,
        batchIndex: manifest.lastSuccessfulBatchIndex ?? manifest.nextBatchIndex - 1,
        summaryId: manifest.lastSuccessfulBatchSummaryId ?? '',
        manifestPath: manifest.retainedBatches.find((batch) => batch.batchId === manifest.lastSuccessfulBatchId)?.manifestPath
          ?? manifest.latestBatchManifestPath
      }
    : null,
  failureBucketHistogram: { ...manifest.failureBucketHistogram },
  activeBlessedWeightId: manifest.activeBlessedWeightId,
  checkpointPath: manifest.checkpointPath,
  latestBatchManifestPath: manifest.latestBatchManifestPath,
  latestBatchSummaryPath: manifest.latestBatchSummaryPath,
  latestFailureBucketsPath: manifest.latestFailureBucketsPath
});

const createContinuousManifest = (
  outputRoot: string,
  runId: string,
  counts: number[],
  retentionWindow: number,
  scorerWeights: HeadlessRunnerWeightMetadata,
  activeBlessedWeightId: string
): ContinuousManifest => ({
  schemaVersion: 2,
  continuousId: 'lifeline-continuous',
  runId,
  benchmarkPackId: BENCHMARK_PACK_ID,
  outputRoot: relativeFromRepo(outputRoot),
  counts: [...counts],
  retentionWindow,
  activeBlessedWeightId,
  scorerWeights: {
    ...scorerWeights,
    weights: { ...scorerWeights.weights }
  },
  startedAt: new Date().toISOString(),
  completedAt: null,
  nextBatchIndex: 1,
  activeBatch: null,
  lastSuccessfulBatchId: null,
  lastSuccessfulBatchIndex: null,
  lastSuccessfulBatchSummaryId: null,
  checkpointPath: relativeFromRepo(resolve(outputRoot, 'checkpoint.json')),
  watchdogPath: relativeFromRepo(resolve(outputRoot, 'watchdog.json')),
  summaryRollupPath: relativeFromRepo(resolve(outputRoot, 'summary-rollup.json')),
  latestBatchManifestPath: relativeFromRepo(resolve(outputRoot, 'latest-batch-manifest.json')),
  latestBatchSummaryPath: relativeFromRepo(resolve(outputRoot, 'latest-summary-rollup.json')),
  latestFailureBucketsPath: relativeFromRepo(resolve(outputRoot, 'latest-failure-buckets.json')),
  retainedBatches: [],
  prunedBatchIds: [],
  failureBucketHistogram: createEmptyHistogram()
});

const loadExistingManifest = async (manifestPath: string, checkpointPath: string): Promise<ContinuousManifest | null> => {
  if (await pathExists(manifestPath)) {
    return await readJson(manifestPath) as ContinuousManifest;
  }

  if (await pathExists(checkpointPath)) {
    return await readJson(checkpointPath) as ContinuousManifest;
  }

  return null;
};

const manifestPathFromManifest = (manifest: ContinuousManifest): string => manifest.checkpointPath.replace(/checkpoint\.json$/, 'manifest.json');

const resolvePersistedJson = async <T>(filePath: string): Promise<T | null> => {
  if (!(await pathExists(filePath))) {
    return null;
  }

  return await readJson(filePath) as T;
};

const writeContinuousArtifacts = async (
  manifest: ContinuousManifest,
  latestBatch: ContinuousBatchRecord | null,
  latestFailureBuckets: ContinuousBatchFailureDetail | null
) => {
  const checkpoint = buildCheckpoint(manifest);
  const summaryRollup = buildSummaryRollup(manifest);
  const watchdog = buildWatchdogSummary(manifest);
  const latestBatchManifestPath = resolve(REPO_ROOT, manifest.latestBatchManifestPath);
  const latestBatchSummaryPath = resolve(REPO_ROOT, manifest.latestBatchSummaryPath);
  const latestFailureBucketsPath = resolve(REPO_ROOT, manifest.latestFailureBucketsPath);
  const persistedLatestBatch = latestBatch ?? await resolvePersistedJson<ContinuousBatchRecord>(latestBatchManifestPath);
  const persistedLatestSummary = latestBatch ?? await resolvePersistedJson<ContinuousBatchRecord>(latestBatchSummaryPath);
  const persistedLatestFailureBuckets = latestFailureBuckets
    ?? await resolvePersistedJson<ContinuousBatchFailureDetail>(latestFailureBucketsPath);

  await writeJson(resolve(REPO_ROOT, manifest.checkpointPath), checkpoint);
  await writeJson(resolve(REPO_ROOT, manifest.summaryRollupPath), summaryRollup);
  await writeJson(resolve(REPO_ROOT, manifest.watchdogPath), watchdog);
  await writeJson(latestBatchManifestPath, persistedLatestBatch);
  await writeJson(latestBatchSummaryPath, persistedLatestSummary);
  await writeJson(latestFailureBucketsPath, persistedLatestFailureBuckets);
  await writeJson(resolve(REPO_ROOT, manifestPathFromManifest(manifest)), manifest);
};

const writeSoakRootManifest = async (
  soakRoot: string,
  soakManifest: BurnInBatchManifest,
  activeBlessedWeightId: string
): Promise<string> => {
  const soakRootManifestPath = resolve(soakRoot, 'manifest.json');
  const soakRootManifest: ContinuousSoakRootManifest = {
    schemaVersion: 1,
    batchId: soakManifest.batchId,
    runId: soakManifest.runId,
    benchmarkPackId: soakManifest.benchmarkPackId,
    targetRuns: soakManifest.targetRuns,
    completedRuns: soakManifest.completedRuns,
    completedAt: soakManifest.completedAt,
    activeBlessedWeightId,
    failures: [...soakManifest.failures],
    batchManifestPath: soakManifest.artifacts.manifestPath,
    failureBucketsPath: soakManifest.artifacts.failureBucketsPath,
    evalSummaryRollupPath: soakManifest.artifacts.evalSummaryRollupPath,
    datasetPointersPath: soakManifest.artifacts.datasetPointersPath,
    scorerWeightMetadataPath: soakManifest.artifacts.scorerWeightMetadataPath
  };

  await writeJson(soakRootManifestPath, soakRootManifest);
  return relativeFromRepo(soakRootManifestPath);
};

const pruneRetainedBatchDirs = async (
  manifest: ContinuousManifest,
  outputRoot: string,
  buckets: ContinuousFailureBuckets
) => {
  while (manifest.retainedBatches.length > manifest.retentionWindow) {
    const removed = manifest.retainedBatches.shift();
    if (!removed) {
      continue;
    }

    try {
      await rm(resolveBatchRoot(outputRoot, removed.batchId), { recursive: true, force: true });
      manifest.prunedBatchIds.push(removed.batchId);
    } catch (error) {
      incrementBucket(
        buckets,
        manifest.failureBucketHistogram,
        'retentionPruneFailure',
        removed.batchId,
        error instanceof Error ? error.message : String(error)
      );
      manifest.prunedBatchIds.push(removed.batchId);
    }
  }
};

const resolveBlessedMismatchReason = (
  resolvedBlessed: BlessedWeightResolution,
  manifest: ContinuousManifest
): string | null => {
  const currentBlessedWeightId = resolvedBlessed.blessedRecord?.recordId ?? 'default-neutral';
  const currentWeights = normalizeWeightMetadata(resolvedBlessed.weights, {
    source: resolvedBlessed.blessedRecord ? 'registry-blessed' : 'default',
    registryPath: relativeFromRepo(resolve(resolvedBlessed.registryPath)),
    recordId: resolvedBlessed.blessedRecord?.recordId,
    advisoryOnly: resolvedBlessed.blessedRecord?.advisoryOnly,
    status: resolvedBlessed.blessedRecord?.status
  });

  if (currentBlessedWeightId !== manifest.activeBlessedWeightId) {
    return `expected active blessed weight ${manifest.activeBlessedWeightId}, received ${currentBlessedWeightId}`;
  }

  if (stableSerialize(currentWeights.weights) !== stableSerialize(manifest.scorerWeights.weights)) {
    return `expected pinned blessed weights ${hashStableValue(manifest.scorerWeights.weights)}, received ${hashStableValue(currentWeights.weights)}`;
  }

  return null;
};

const runHealthPack = async (
  batchRoot: string,
  phase: 'before' | 'after',
  commandRunner: typeof runCommand
): Promise<ContinuousHealthGateSummary> => {
  const summaryPath = resolve(batchRoot, `health-${phase}.json`);
  const relativeSummaryPath = relativeFromRepo(summaryPath);
  const result = commandRunner('npm', [...HEALTH_COMMAND, '--', '--summary', relativeSummaryPath], { cwd: REPO_ROOT });
  const summary = await readJson(summaryPath).catch(() => null);

  return {
    phase,
    ok: result.ok && !summary?.failedGate,
    summaryPath: relativeSummaryPath,
    failedGateKey: summary?.failedGate?.key ?? null,
    failedGateLabel: summary?.failedGate?.label ?? null,
    results: Array.isArray(summary?.results)
      ? summary.results.map((entry: Record<string, unknown>) => ({
          key: String(entry.key),
          ok: Boolean(entry.ok),
          exitCode: Number(entry.exitCode ?? 1)
        }))
      : []
  };
};

const writeBatchArtifacts = async (
  batchRecord: ContinuousBatchRecord,
  batchFailureDetail: ContinuousBatchFailureDetail
) => {
  await writeJson(resolve(REPO_ROOT, batchRecord.manifestPath), batchRecord);
  await writeJson(resolve(REPO_ROOT, batchRecord.summaryPath), batchRecord);
  await writeJson(resolve(REPO_ROOT, batchRecord.failureBucketsPath), batchFailureDetail);
};

const runContinuousBatch = async (
  manifest: ContinuousManifest,
  outputRoot: string,
  batchIndex: number,
  targetRuns: number,
  registryPath: string,
  resolveBlessedWeights: typeof resolveBlessedPlaybookWeights,
  commandRunner: typeof runCommand,
  buckets: ContinuousFailureBuckets
): Promise<ContinuousBatchRecord> => {
  const batchId = resolveBatchId(batchIndex, targetRuns);
  const batchRoot = resolveBatchRoot(outputRoot, batchId);
  const soakRoot = resolve(batchRoot, 'soak-pack');
  const batchManifestPath = resolve(batchRoot, 'manifest.json');
  const batchSummaryPath = resolve(batchRoot, 'summary-rollup.json');
  const batchFailureBucketsPath = resolve(batchRoot, 'failure-buckets.json');
  await mkdir(batchRoot, { recursive: true });

  if (manifest.nextBatchIndex !== batchIndex) {
    incrementBucket(
      buckets,
      manifest.failureBucketHistogram,
      'resumeCheckpointMismatch',
      batchId,
      `expected next batch ${manifest.nextBatchIndex}, received ${batchIndex}`
    );
  }

  manifest.activeBatch = {
    batchId,
    batchIndex,
    targetRuns,
    status: 'running'
  };
  await writeContinuousArtifacts(manifest, null, null);

  const failures: FailureBucketName[] = [];
  const batchFailureHistogram = createEmptyHistogram();
  const beforeBlessed = await resolveBlessedWeights(registryPath);
  const beforeBlessedMismatch = resolveBlessedMismatchReason(beforeBlessed, manifest);
  if (beforeBlessedMismatch) {
    addBatchFailure(failures, batchFailureHistogram, 'blessedWeightMismatch');
    incrementBucket(
      buckets,
      manifest.failureBucketHistogram,
      'blessedWeightMismatch',
      batchId,
      `${beforeBlessedMismatch} before batch execution`
    );
  }

  const healthBefore = await runHealthPack(batchRoot, 'before', commandRunner);
  if (!healthBefore.ok) {
    addBatchFailure(failures, batchFailureHistogram, 'healthPackRegression');
    incrementBucket(
      buckets,
      manifest.failureBucketHistogram,
      'healthPackRegression',
      batchId,
      `health pack failed before batch execution${healthBefore.failedGateKey ? ` at ${healthBefore.failedGateKey}` : ''}`
    );
  }

  const soakManifest = await runBurnInBatch({
    count: targetRuns,
    outputRoot: soakRoot,
    runId: `${manifest.runId}:${batchId}`,
    scorerWeights: manifest.scorerWeights,
    registryPath,
    registryDigestBefore: hashStableValue({
      activeBlessedWeightId: manifest.activeBlessedWeightId,
      scorerWeights: manifest.scorerWeights.weights
    }),
    resume: true,
    gateSuitesEnabled: false,
    enforceRegistryStability: false
  });
  const soakRootManifestPath = await writeSoakRootManifest(soakRoot, soakManifest, manifest.activeBlessedWeightId);

  const evalRollup = await readJson(resolve(REPO_ROOT, soakManifest.artifacts.evalSummaryRollupPath)) as BatchEvalSummaryRollup;
  if (Array.isArray(soakManifest.failures) && soakManifest.failures.length > 0) {
    addBatchFailure(failures, batchFailureHistogram, 'batchExecutionFailure');
    incrementBucket(
      buckets,
      manifest.failureBucketHistogram,
      'batchExecutionFailure',
      batchId,
      `soak pack reported failures: ${soakManifest.failures.join(', ')}`
    );
  }

  const healthAfter = await runHealthPack(batchRoot, 'after', commandRunner);
  if (!healthAfter.ok) {
    addBatchFailure(failures, batchFailureHistogram, 'healthPackRegression');
    incrementBucket(
      buckets,
      manifest.failureBucketHistogram,
      'healthPackRegression',
      batchId,
      `health pack failed after batch execution${healthAfter.failedGateKey ? ` at ${healthAfter.failedGateKey}` : ''}`
    );
  }

  const afterBlessed = await resolveBlessedWeights(registryPath);
  const afterBlessedMismatch = resolveBlessedMismatchReason(afterBlessed, manifest);
  if (afterBlessedMismatch) {
    addBatchFailure(failures, batchFailureHistogram, 'blessedWeightMismatch');
    incrementBucket(
      buckets,
      manifest.failureBucketHistogram,
      'blessedWeightMismatch',
      batchId,
      `${afterBlessedMismatch} after batch execution`
    );
  }

  const artifactPointers: ContinuousBatchArtifactPointers = {
    continuousManifestPath: relativeFromRepo(batchManifestPath),
    continuousSummaryPath: relativeFromRepo(batchSummaryPath),
    continuousFailureBucketsPath: relativeFromRepo(batchFailureBucketsPath),
    healthBeforeSummaryPath: healthBefore.summaryPath,
    healthAfterSummaryPath: healthAfter.summaryPath,
    soakRootManifestPath,
    soakBatchManifestPath: soakManifest.artifacts.manifestPath,
    soakFailureBucketsPath: soakManifest.artifacts.failureBucketsPath,
    soakEvalSummaryRollupPath: soakManifest.artifacts.evalSummaryRollupPath,
    soakDatasetPointersPath: soakManifest.artifacts.datasetPointersPath,
    soakScorerWeightMetadataPath: soakManifest.artifacts.scorerWeightMetadataPath
  };

  const batchRecordWithoutDigest: Omit<ContinuousBatchRecord, 'batchDigest'> = {
    batchIndex,
    batchId,
    targetRuns,
    runId: soakManifest.runId,
    summaryId: soakManifest.baseline?.summaryId ?? `${batchId}-summary`,
    completedAt: soakManifest.completedAt ?? new Date().toISOString(),
    status: failures.length > 0 ? 'failed' : 'completed',
    manifestPath: relativeFromRepo(batchManifestPath),
    summaryPath: relativeFromRepo(batchSummaryPath),
    failureBucketsPath: relativeFromRepo(batchFailureBucketsPath),
    activeBlessedWeightId: manifest.activeBlessedWeightId,
    failures: [...failures],
    failureBucketHistogram: { ...batchFailureHistogram },
    soakFailures: Array.isArray(soakManifest.failures) ? [...soakManifest.failures] : [],
    evalRollup,
    artifactPointers,
    healthSuites: [healthBefore, healthAfter]
  };
  const batchRecord: ContinuousBatchRecord = {
    ...batchRecordWithoutDigest,
    batchDigest: createBatchDigest(batchRecordWithoutDigest)
  };
  let batchFailureDetail = buildBatchFailureDetail(
    batchId,
    batchIndex,
    targetRuns,
    batchRecord.failures,
    batchRecord.failureBucketHistogram,
    batchRecord.soakFailures
  );

  await writeBatchArtifacts(batchRecord, batchFailureDetail);
  await writeJson(resolve(REPO_ROOT, manifest.latestBatchManifestPath), batchRecord);
  await writeJson(resolve(REPO_ROOT, manifest.latestBatchSummaryPath), batchRecord);
  await writeJson(resolve(REPO_ROOT, manifest.latestFailureBucketsPath), batchFailureDetail);

  const latestManifestRoundTrip = await readJson(resolve(REPO_ROOT, manifest.latestBatchManifestPath)) as ContinuousBatchRecord;
  const latestSummaryRoundTrip = await readJson(resolve(REPO_ROOT, manifest.latestBatchSummaryPath)) as ContinuousBatchRecord;
  const latestFailureRoundTrip = await readJson(resolve(REPO_ROOT, manifest.latestFailureBucketsPath)) as ContinuousBatchFailureDetail;

  if (
    stableSerialize(latestManifestRoundTrip) !== stableSerialize(batchRecord)
    || stableSerialize(latestSummaryRoundTrip) !== stableSerialize(batchRecord)
    || stableSerialize(latestFailureRoundTrip) !== stableSerialize(batchFailureDetail)
  ) {
    addBatchFailure(batchRecord.failures, batchRecord.failureBucketHistogram, 'stableArtifactPointerMismatch');
    incrementBucket(
      buckets,
      manifest.failureBucketHistogram,
      'stableArtifactPointerMismatch',
      batchId,
      'latest artifact pointer files did not round-trip to the completed batch'
    );
    batchRecord.status = 'failed';
    batchRecord.batchDigest = createBatchDigest({
      ...batchRecord,
      batchDigest: undefined
    });
    batchFailureDetail = buildBatchFailureDetail(
      batchId,
      batchIndex,
      targetRuns,
      batchRecord.failures,
      batchRecord.failureBucketHistogram,
      batchRecord.soakFailures
    );
    await writeBatchArtifacts(batchRecord, batchFailureDetail);
    await writeJson(resolve(REPO_ROOT, manifest.latestBatchManifestPath), batchRecord);
    await writeJson(resolve(REPO_ROOT, manifest.latestBatchSummaryPath), batchRecord);
    await writeJson(resolve(REPO_ROOT, manifest.latestFailureBucketsPath), batchFailureDetail);
  }

  manifest.retainedBatches.push(batchRecord);
  manifest.retainedBatches.sort((left, right) => left.batchIndex - right.batchIndex);
  manifest.activeBatch = null;
  manifest.nextBatchIndex = batchIndex + 1;
  if (batchRecord.status === 'completed') {
    manifest.lastSuccessfulBatchId = batchId;
    manifest.lastSuccessfulBatchIndex = batchIndex;
    manifest.lastSuccessfulBatchSummaryId = batchRecord.summaryId;
  }

  await pruneRetainedBatchDirs(manifest, outputRoot, buckets);
  await writeContinuousArtifacts(manifest, batchRecord, batchFailureDetail);

  if (batchRecord.failures.length > 0) {
    throw new Error(`Continuous soak batch ${batchId} failed: ${batchRecord.failures.join(', ')}`);
  }

  return batchRecord;
};

export const runContinuousLifeline = async ({
  counts = DEFAULT_BATCH_COUNTS,
  outputRoot = DEFAULT_OUTPUT_ROOT,
  runId = DEFAULT_RUN_ID,
  retentionWindow = DEFAULT_RETENTION_WINDOW,
  resume = true,
  maxBatches = counts.length,
  registryPath = resolve(REPO_ROOT, DEFAULT_PLAYBOOK_WEIGHT_REGISTRY_PATH),
  resolveBlessedWeights = resolveBlessedPlaybookWeights,
  commandRunner = runCommand
}: {
  counts?: number[];
  outputRoot?: string;
  runId?: string;
  retentionWindow?: number;
  resume?: boolean;
  maxBatches?: number | null;
  registryPath?: string;
  resolveBlessedWeights?: typeof resolveBlessedPlaybookWeights;
  commandRunner?: typeof runCommand;
} = {}): Promise<ContinuousManifest> => {
  const resolvedOutputRoot = resolve(outputRoot);
  const resolvedRegistryPath = resolve(registryPath);
  const blessed = await resolveBlessedWeights(resolvedRegistryPath);
  const activeBlessedWeightId = blessed.blessedRecord?.recordId ?? 'default-neutral';
  const scorerWeights = normalizeWeightMetadata(blessed.weights, {
    source: blessed.blessedRecord ? 'registry-blessed' : 'default',
    registryPath: relativeFromRepo(resolve(blessed.registryPath)),
    recordId: blessed.blessedRecord?.recordId,
    advisoryOnly: blessed.blessedRecord?.advisoryOnly,
    status: blessed.blessedRecord?.status
  });

  await mkdir(resolvedOutputRoot, { recursive: true });
  const manifestPath = resolve(resolvedOutputRoot, 'manifest.json');
  const checkpointPath = resolve(resolvedOutputRoot, 'checkpoint.json');
  const existingManifest = resume ? await loadExistingManifest(manifestPath, checkpointPath) : null;
  const manifest = existingManifest ?? createContinuousManifest(
    resolvedOutputRoot,
    runId,
    counts,
    retentionWindow,
    scorerWeights,
    activeBlessedWeightId
  );

  manifest.outputRoot = relativeFromRepo(resolvedOutputRoot);
  manifest.runId = runId;
  manifest.counts = [...counts];
  manifest.retentionWindow = retentionWindow;
  manifest.activeBlessedWeightId = activeBlessedWeightId;
  manifest.scorerWeights = scorerWeights;
  manifest.checkpointPath = relativeFromRepo(checkpointPath);
  manifest.watchdogPath = relativeFromRepo(resolve(resolvedOutputRoot, 'watchdog.json'));
  manifest.summaryRollupPath = relativeFromRepo(resolve(resolvedOutputRoot, 'summary-rollup.json'));
  manifest.latestBatchManifestPath = relativeFromRepo(resolve(resolvedOutputRoot, 'latest-batch-manifest.json'));
  manifest.latestBatchSummaryPath = relativeFromRepo(resolve(resolvedOutputRoot, 'latest-summary-rollup.json'));
  manifest.latestFailureBucketsPath = relativeFromRepo(resolve(resolvedOutputRoot, 'latest-failure-buckets.json'));

  const failureBuckets = createEmptyBuckets();
  const targetBatchCount = maxBatches ?? Number.POSITIVE_INFINITY;
  let completedBatches = manifest.retainedBatches.length + manifest.prunedBatchIds.length;

  for (let batchIndex = manifest.nextBatchIndex; completedBatches < targetBatchCount; batchIndex += 1, completedBatches += 1) {
    const targetRuns = resolveBatchTargetRuns([...counts], batchIndex);
    await runContinuousBatch(
      manifest,
      resolvedOutputRoot,
      batchIndex,
      targetRuns,
      resolvedRegistryPath,
      resolveBlessedWeights,
      commandRunner,
      failureBuckets
    );
  }

  manifest.completedAt = new Date().toISOString();
  const lastBatch = manifest.retainedBatches.at(-1) ?? null;
  const lastFailureBuckets = lastBatch
    ? await readJson(resolve(REPO_ROOT, lastBatch.failureBucketsPath)).catch(() => null)
    : null;
  await writeContinuousArtifacts(manifest, lastBatch, lastFailureBuckets);
  await writeJson(manifestPath, manifest);

  return manifest;
};

export const main = async () => {
  const args = parseCliArgs();
  const counts = typeof args.counts === 'string'
    ? args.counts
      .split(',')
      .map((entry: string) => Number(entry.trim()))
      .filter((entry: number) => Number.isFinite(entry) && entry > 0)
    : DEFAULT_BATCH_COUNTS;
  const maxBatches = typeof args['max-batches'] === 'string'
    ? Number(args['max-batches'])
    : undefined;

  const manifest = await runContinuousLifeline({
    counts,
    outputRoot: typeof args['output-root'] === 'string'
      ? resolve(REPO_ROOT, args['output-root'])
      : DEFAULT_OUTPUT_ROOT,
    runId: typeof args.run === 'string' ? args.run : DEFAULT_RUN_ID,
    retentionWindow: typeof args.retention === 'string' ? Number(args.retention) : DEFAULT_RETENTION_WINDOW,
    resume: args.resume !== 'false',
    maxBatches: args.forever === true || args.forever === 'true' ? null : maxBatches ?? counts.length,
    registryPath: typeof args.registry === 'string'
      ? resolve(REPO_ROOT, args.registry)
      : resolve(REPO_ROOT, DEFAULT_PLAYBOOK_WEIGHT_REGISTRY_PATH)
  });

  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
};
