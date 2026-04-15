// @ts-nocheck
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { REPO_ROOT, hashStableValue, parseCliArgs, pathExists, readJson, relativeFromRepo, stableSerialize, writeJson } from './common.mjs';
import { resolveLifelineBenchmarkPack } from './benchmark-pack.mjs';
import { runHeadlessRunner, type HeadlessRunnerManifest, type HeadlessRunnerWeightMetadata } from './headless-runner.ts';
import { DEFAULT_PLAYBOOK_WEIGHT_REGISTRY_PATH, resolveBlessedPlaybookWeights } from '../training/common.mjs';

const DEFAULT_OUTPUT_ROOT = resolve(REPO_ROOT, 'tmp', 'lifeline', 'continuous');
const DEFAULT_BATCH_COUNTS = [25, 100, 500];
const DEFAULT_RUN_ID = 'continuous-lifeline';
const DEFAULT_RETENTION_WINDOW = 3;
const BENCHMARK_PACK_ID = resolveLifelineBenchmarkPack().packId;

type FailureBucketName =
  | 'resumeCheckpointMismatch'
  | 'batchExecutionFailure'
  | 'blessedWeightMismatch'
  | 'stableArtifactPointerMismatch'
  | 'retentionPruneFailure';

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
}

interface ContinuousBatchRecord {
  batchIndex: number;
  batchId: string;
  targetRuns: number;
  runId: string;
  summaryId: string;
  completedAt: string;
  status: 'running' | 'completed';
  manifestPath: string;
  summaryPath: string;
  failureBucketsPath: string;
  replayIntegrityOk: boolean;
  metricBandsOk: boolean;
  failures: FailureBucketName[];
  metrics: Record<string, number>;
  support: Record<string, number>;
  batchDigest: string;
}

interface ContinuousBatchFailureDetail {
  schemaVersion: 1;
  batchId: string;
  batchIndex: number;
  targetRuns: number;
  failures: FailureBucketName[];
  histogram: Record<FailureBucketName, number>;
}

interface ContinuousManifest {
  schemaVersion: 1;
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
  schemaVersion: 1;
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
  schemaVersion: 1;
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
    batchDigest: string;
    metrics: Record<string, number>;
    support: Record<string, number>;
    replayIntegrityOk: boolean;
    metricBandsOk: boolean;
    failures: FailureBucketName[];
  }>;
}

const FAILURE_BUCKETS: FailureBucketName[] = [
  'resumeCheckpointMismatch',
  'batchExecutionFailure',
  'blessedWeightMismatch',
  'stableArtifactPointerMismatch',
  'retentionPruneFailure'
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
  `batch-${String(batchIndex).padStart(4, '0')}-runs-${String(targetRuns).padStart(3, '0')}`
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

const createBatchDigest = (manifest: HeadlessRunnerManifest, batchSummary: Record<string, unknown>): string => hashStableValue({
  runId: manifest.runId,
  summaryId: manifest.summaryId,
  benchmarkPackId: manifest.benchmarkPackId,
  scenarioIds: manifest.scenarioIds,
  replayIntegrity: manifest.replayIntegrity,
  metricBandValidation: manifest.metricBandValidation,
  metrics: manifest.metrics,
  support: manifest.support,
  batchSummary
});

const incrementBucket = (
  buckets: ContinuousFailureBuckets,
  histogram: Record<FailureBucketName, number>,
  bucketName: FailureBucketName,
  batchId: string,
  reason: string
) => {
  buckets[bucketName].count += 1;
  histogram[bucketName] += 1;
  if (!buckets[bucketName].batchIds.includes(batchId)) {
    buckets[bucketName].batchIds.push(batchId);
  }
  if (!buckets[bucketName].reasons.includes(reason)) {
    buckets[bucketName].reasons.push(reason);
  }
};

const buildBatchFailureDetail = (
  batchId: string,
  batchIndex: number,
  targetRuns: number,
  failures: FailureBucketName[]
): ContinuousBatchFailureDetail => {
  const histogram = Object.fromEntries(
    FAILURE_BUCKETS.map((bucketName) => [bucketName, failures.includes(bucketName) ? 1 : 0])
  ) as Record<FailureBucketName, number>;

  return {
    schemaVersion: 1,
    batchId,
    batchIndex,
    targetRuns,
    failures: [...failures],
    histogram
  };
};

const buildCheckpoint = (manifest: ContinuousManifest): ContinuousManifest => ({
  ...manifest,
  retainedBatches: manifest.retainedBatches.map((batch) => ({
    ...batch,
    failures: [...batch.failures],
    metrics: { ...batch.metrics },
    support: { ...batch.support }
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
  schemaVersion: 1,
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
    batchDigest: batch.batchDigest,
    metrics: { ...batch.metrics },
    support: { ...batch.support },
    replayIntegrityOk: batch.replayIntegrityOk,
    metricBandsOk: batch.metricBandsOk,
    failures: [...batch.failures]
  }))
});

const buildWatchdogSummary = (manifest: ContinuousManifest): ContinuousWatchdogSummary => ({
  schemaVersion: 1,
  continuousId: manifest.continuousId,
  runId: manifest.runId,
  batchCount: manifest.retainedBatches.length + manifest.prunedBatchIds.length,
  lastSuccessfulBatch: manifest.lastSuccessfulBatchId
    ? {
        batchId: manifest.lastSuccessfulBatchId,
        batchIndex: manifest.lastSuccessfulBatchIndex ?? manifest.nextBatchIndex - 1,
        summaryId: manifest.lastSuccessfulBatchSummaryId ?? '',
        manifestPath: manifest.retainedBatches.at(-1)?.manifestPath ?? manifest.latestBatchManifestPath
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
  schemaVersion: 1,
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

const writeContinuousArtifacts = async (
  manifest: ContinuousManifest,
  latestBatch: ContinuousBatchRecord | null,
  latestFailureBuckets: ContinuousBatchFailureDetail | null
) => {
  const checkpoint = buildCheckpoint(manifest);
  const summaryRollup = buildSummaryRollup(manifest);
  const watchdog = buildWatchdogSummary(manifest);

  await writeJson(resolve(REPO_ROOT, manifest.checkpointPath), checkpoint);
  await writeJson(resolve(REPO_ROOT, manifest.summaryRollupPath), summaryRollup);
  await writeJson(resolve(REPO_ROOT, manifest.watchdogPath), watchdog);
  await writeJson(resolve(REPO_ROOT, manifest.latestBatchManifestPath), latestBatch);
  await writeJson(resolve(REPO_ROOT, manifest.latestBatchSummaryPath), latestBatch ? {
    schemaVersion: 1,
    batchIndex: latestBatch.batchIndex,
    batchId: latestBatch.batchId,
    targetRuns: latestBatch.targetRuns,
    runId: latestBatch.runId,
    summaryId: latestBatch.summaryId,
    batchDigest: latestBatch.batchDigest,
    metrics: { ...latestBatch.metrics },
    support: { ...latestBatch.support },
    replayIntegrityOk: latestBatch.replayIntegrityOk,
    metricBandsOk: latestBatch.metricBandsOk,
    failures: [...latestBatch.failures]
  } : null);
  await writeJson(resolve(REPO_ROOT, manifest.latestFailureBucketsPath), latestFailureBuckets);
  await writeJson(resolve(REPO_ROOT, manifestPathFromManifest(manifest)), manifest);
};

const manifestPathFromManifest = (manifest: ContinuousManifest): string => manifest.checkpointPath.replace(/checkpoint\.json$/, 'manifest.json');

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

const runContinuousBatch = async (
  manifest: ContinuousManifest,
  outputRoot: string,
  batchIndex: number,
  targetRuns: number,
  blessed: BlessedWeightResolution,
  buckets: ContinuousFailureBuckets
): Promise<ContinuousBatchRecord> => {
  const batchId = resolveBatchId(batchIndex, targetRuns);
  const batchRoot = resolveBatchRoot(outputRoot, batchId);
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

  const batchRunId = `${manifest.runId}:${batchId}`;
  const batchManifest = await runHeadlessRunner({
    runId: batchRunId,
    outputRoot: batchRoot,
    resume: true,
    tuningWeights: blessed.weights,
    weightMetadata: blessed
  });
  const batchSummary = await readJson(resolve(REPO_ROOT, batchManifest.artifacts.summary)) as Record<string, unknown>;
  const failures: FailureBucketName[] = [];

  if (blessed.recordId && blessed.recordId !== manifest.activeBlessedWeightId) {
    failures.push('blessedWeightMismatch');
    incrementBucket(
      buckets,
      manifest.failureBucketHistogram,
      'blessedWeightMismatch',
      batchId,
      `expected blessed weight ${manifest.activeBlessedWeightId}, received ${blessed.recordId}`
    );
  }

  if (!batchManifest.replayIntegrity.allScenariosVerified || !(batchManifest.metricBandValidation?.allScenariosWithinBands ?? true)) {
    failures.push('batchExecutionFailure');
    incrementBucket(
      buckets,
      manifest.failureBucketHistogram,
      'batchExecutionFailure',
      batchId,
      'headless batch replay integrity or metric bands failed'
    );
  }

  const batchRecord: ContinuousBatchRecord = {
    batchIndex,
    batchId,
    targetRuns,
    runId: batchManifest.runId,
    summaryId: batchManifest.summaryId,
    completedAt: batchManifest.completedAt,
    status: 'completed',
    manifestPath: relativeFromRepo(batchManifestPath),
    summaryPath: relativeFromRepo(batchSummaryPath),
    failureBucketsPath: relativeFromRepo(batchFailureBucketsPath),
    replayIntegrityOk: batchManifest.replayIntegrity.allScenariosVerified,
    metricBandsOk: batchManifest.metricBandValidation?.allScenariosWithinBands ?? true,
    failures,
    metrics: { ...batchManifest.metrics },
    support: { ...batchManifest.support },
    batchDigest: createBatchDigest(batchManifest, batchSummary)
  };

  const failureDetail = buildBatchFailureDetail(batchId, batchIndex, targetRuns, failures);

  await writeJson(batchManifestPath, batchRecord);
  await writeJson(batchSummaryPath, {
    schemaVersion: 1,
    batchIndex,
    batchId,
    targetRuns,
    runId: batchManifest.runId,
    summaryId: batchManifest.summaryId,
    batchDigest: batchRecord.batchDigest,
    metrics: { ...batchRecord.metrics },
    support: { ...batchRecord.support },
    replayIntegrityOk: batchRecord.replayIntegrityOk,
    metricBandsOk: batchRecord.metricBandsOk,
    failures: [...batchRecord.failures],
    scenarioIds: [...batchManifest.scenarioIds]
  });
  await writeJson(batchFailureBucketsPath, failureDetail);

  const latestBatchManifestPath = resolve(REPO_ROOT, manifest.latestBatchManifestPath);
  const latestBatchSummaryPath = resolve(REPO_ROOT, manifest.latestBatchSummaryPath);
  const latestFailureBucketsPath = resolve(REPO_ROOT, manifest.latestFailureBucketsPath);
  await writeJson(latestBatchManifestPath, batchRecord);
  await writeJson(latestBatchSummaryPath, {
    schemaVersion: 1,
    batchIndex,
    batchId,
    targetRuns,
    runId: batchManifest.runId,
    summaryId: batchManifest.summaryId,
    batchDigest: batchRecord.batchDigest,
    metrics: { ...batchRecord.metrics },
    support: { ...batchRecord.support },
    replayIntegrityOk: batchRecord.replayIntegrityOk,
    metricBandsOk: batchRecord.metricBandsOk,
    failures: [...batchRecord.failures],
    scenarioIds: [...batchManifest.scenarioIds]
  });
  await writeJson(latestFailureBucketsPath, failureDetail);

  const latestManifestRoundTrip = await readJson(latestBatchManifestPath) as ContinuousBatchRecord;
  const latestSummaryRoundTrip = await readJson(latestBatchSummaryPath) as Record<string, unknown>;
  const latestFailureRoundTrip = await readJson(latestFailureBucketsPath) as ContinuousBatchFailureDetail;
  let updatedFailureDetail = failureDetail;
  if (
    stableSerialize(latestManifestRoundTrip) !== stableSerialize(batchRecord)
    || stableSerialize(latestSummaryRoundTrip) !== stableSerialize({
      schemaVersion: 1,
      batchIndex,
      batchId,
      targetRuns,
      runId: batchManifest.runId,
      summaryId: batchManifest.summaryId,
      batchDigest: batchRecord.batchDigest,
      metrics: { ...batchRecord.metrics },
      support: { ...batchRecord.support },
      replayIntegrityOk: batchRecord.replayIntegrityOk,
      metricBandsOk: batchRecord.metricBandsOk,
      failures: [...batchRecord.failures],
      scenarioIds: [...batchManifest.scenarioIds]
    })
    || stableSerialize(latestFailureRoundTrip) !== stableSerialize(failureDetail)
  ) {
    failures.push('stableArtifactPointerMismatch');
    incrementBucket(
      buckets,
      manifest.failureBucketHistogram,
      'stableArtifactPointerMismatch',
      batchId,
      'latest artifact pointer files did not round-trip to the completed batch'
    );
    batchRecord.failures = [...failures];
    updatedFailureDetail = buildBatchFailureDetail(batchId, batchIndex, targetRuns, failures);
    batchRecord.batchDigest = createBatchDigest(batchManifest, {
      schemaVersion: 1,
      batchIndex,
      batchId,
      targetRuns,
      runId: batchManifest.runId,
      summaryId: batchManifest.summaryId,
      batchDigest: batchRecord.batchDigest,
      metrics: { ...batchRecord.metrics },
      support: { ...batchRecord.support },
      replayIntegrityOk: batchRecord.replayIntegrityOk,
      metricBandsOk: batchRecord.metricBandsOk,
      failures: [...batchRecord.failures],
      scenarioIds: [...batchManifest.scenarioIds]
    });
    await writeJson(batchManifestPath, batchRecord);
    await writeJson(batchSummaryPath, {
      schemaVersion: 1,
      batchIndex,
      batchId,
      targetRuns,
      runId: batchManifest.runId,
      summaryId: batchManifest.summaryId,
      batchDigest: batchRecord.batchDigest,
      metrics: { ...batchRecord.metrics },
      support: { ...batchRecord.support },
      replayIntegrityOk: batchRecord.replayIntegrityOk,
      metricBandsOk: batchRecord.metricBandsOk,
      failures: [...batchRecord.failures],
      scenarioIds: [...batchManifest.scenarioIds]
    });
    await writeJson(batchFailureBucketsPath, updatedFailureDetail);
    await writeJson(latestBatchManifestPath, batchRecord);
    await writeJson(latestBatchSummaryPath, {
      schemaVersion: 1,
      batchIndex,
      batchId,
      targetRuns,
      runId: batchManifest.runId,
      summaryId: batchManifest.summaryId,
      batchDigest: batchRecord.batchDigest,
      metrics: { ...batchRecord.metrics },
      support: { ...batchRecord.support },
      replayIntegrityOk: batchRecord.replayIntegrityOk,
      metricBandsOk: batchRecord.metricBandsOk,
      failures: [...batchRecord.failures],
      scenarioIds: [...batchManifest.scenarioIds]
    });
    await writeJson(latestFailureBucketsPath, updatedFailureDetail);
  }

  manifest.retainedBatches.push(batchRecord);
  manifest.retainedBatches.sort((left, right) => left.batchIndex - right.batchIndex);
  manifest.activeBatch = null;
  manifest.nextBatchIndex = batchIndex + 1;
  manifest.lastSuccessfulBatchId = batchId;
  manifest.lastSuccessfulBatchIndex = batchIndex;
  manifest.lastSuccessfulBatchSummaryId = batchRecord.summaryId;

  await pruneRetainedBatchDirs(manifest, outputRoot, buckets);
  await writeContinuousArtifacts(manifest, batchRecord, updatedFailureDetail);

  return batchRecord;
};

export const runContinuousLifeline = async ({
  counts = DEFAULT_BATCH_COUNTS,
  outputRoot = DEFAULT_OUTPUT_ROOT,
  runId = DEFAULT_RUN_ID,
  retentionWindow = DEFAULT_RETENTION_WINDOW,
  resume = true,
  maxBatches = counts.length,
  registryPath = resolve(REPO_ROOT, DEFAULT_PLAYBOOK_WEIGHT_REGISTRY_PATH)
}: {
  counts?: number[];
  outputRoot?: string;
  runId?: string;
  retentionWindow?: number;
  resume?: boolean;
  maxBatches?: number | null;
  registryPath?: string;
} = {}): Promise<ContinuousManifest> => {
  const resolvedOutputRoot = resolve(outputRoot);
  const resolvedRegistryPath = resolve(registryPath);
  const blessed = await resolveBlessedPlaybookWeights(resolvedRegistryPath);
  const activeBlessedWeightId = blessed.blessedRecord?.recordId ?? 'default-neutral';
  const scorerWeights = normalizeWeightMetadata(blessed.weights, {
    source: blessed.blessedRecord ? 'registry-blessed' : 'default',
    registryPath: relativeFromRepo(blessed.registryPath),
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
    await runContinuousBatch(manifest, resolvedOutputRoot, batchIndex, targetRuns, blessed, failureBuckets);
  }

  manifest.completedAt = new Date().toISOString();
  await writeContinuousArtifacts(manifest, manifest.retainedBatches.at(-1) ?? null, null);
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
