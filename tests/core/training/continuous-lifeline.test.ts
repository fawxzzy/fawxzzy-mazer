// @ts-nocheck
import { access, mkdir, rm, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { runContinuousLifeline } from '../../../scripts/lifeline/continuous.ts';
import { resolveBlessedPlaybookWeights } from '../../../scripts/training/common.mjs';

const makeTempRoot = () => resolve('tmp', 'lifeline-tests', `continuous-${randomUUID()}`);
const makeHealthRunner = () => () => ({ ok: true, stdout: '', stderr: '' });

describe('continuous lifeline runner', () => {
  test('checkpoints batches, resumes from the last completed batch, and prunes outside the retention window', async () => {
    const outputRoot = makeTempRoot();
    await mkdir(outputRoot, { recursive: true });

    try {
      const firstRun = await runContinuousLifeline({
        outputRoot,
        runId: 'continuous-test',
        counts: [1, 1],
        retentionWindow: 1,
        maxBatches: 1,
        resume: true,
        commandRunner: makeHealthRunner()
      });
      const firstBatch = firstRun.retainedBatches[0];
      const firstManifestPath = resolve(outputRoot, 'batches', firstBatch.batchId, 'manifest.json');
      const firstSummaryPath = resolve(outputRoot, 'batches', firstBatch.batchId, 'summary-rollup.json');
      const firstSoakRootManifestPath = resolve(outputRoot, 'batches', firstBatch.batchId, 'soak-pack', 'manifest.json');
      const latestFailureBucketsPath = resolve(outputRoot, 'latest-failure-buckets.json');
      const firstWatchdog = JSON.parse(await readFile(resolve(outputRoot, 'watchdog.json'), 'utf8'));
      const firstLatestFailureBuckets = JSON.parse(await readFile(latestFailureBucketsPath, 'utf8'));

      expect(firstRun.retainedBatches).toHaveLength(1);
      expect(firstRun.lastSuccessfulBatchId).toBe(firstBatch.batchId);
      expect(firstRun.lastSuccessfulBatchIndex).toBe(1);
      expect(firstRun.activeBlessedWeightId).toBe((await resolveBlessedPlaybookWeights()).blessedRecord?.recordId ?? 'default-neutral');
      expect(relative(process.cwd(), firstManifestPath).replace(/\\/g, '/')).toBe(firstBatch.manifestPath);
      expect(relative(process.cwd(), firstSummaryPath).replace(/\\/g, '/')).toBe(firstBatch.summaryPath);
      expect(firstBatch.targetRuns).toBe(1);
      expect(firstBatch.activeBlessedWeightId).toBe(firstRun.activeBlessedWeightId);
      expect(firstBatch.artifactPointers.soakEvalSummaryRollupPath).toContain('eval-summary-rollup.json');
      expect(relative(process.cwd(), firstSoakRootManifestPath).replace(/\\/g, '/')).toBe(firstBatch.artifactPointers.soakRootManifestPath);
      expect(firstBatch.healthSuites.map((suite) => suite.phase)).toEqual(['before', 'after']);
      expect(firstBatch.failureBucketHistogram.healthPackRegression).toBe(0);
      expect(firstLatestFailureBuckets.batchId).toBe(firstBatch.batchId);
      expect(firstWatchdog.batchCount).toBe(1);
      expect(firstWatchdog.activeBlessedWeightId).toBe(firstRun.activeBlessedWeightId);
      await expect(access(firstManifestPath)).resolves.toBeUndefined();
      await expect(access(firstSummaryPath)).resolves.toBeUndefined();
      await expect(access(firstSoakRootManifestPath)).resolves.toBeUndefined();

      const resumed = await runContinuousLifeline({
        outputRoot,
        runId: 'continuous-test',
        counts: [1, 1],
        retentionWindow: 1,
        maxBatches: 2,
        resume: true,
        commandRunner: makeHealthRunner()
      });
      const secondBatch = resumed.retainedBatches[0];
      const secondManifestPath = resolve(outputRoot, 'batches', secondBatch.batchId, 'manifest.json');
      const secondSummaryPath = resolve(outputRoot, 'batches', secondBatch.batchId, 'summary-rollup.json');

      expect(resumed.retainedBatches).toHaveLength(1);
      expect(resumed.lastSuccessfulBatchIndex).toBe(2);
      expect(resumed.lastSuccessfulBatchId).toBe(secondBatch.batchId);
      expect(resumed.nextBatchIndex).toBe(3);
      expect(secondBatch.batchIndex).toBe(2);
      expect(secondBatch.batchId).toContain('batch-0002');
      expect(secondBatch.status).toBe('completed');
      expect(relative(process.cwd(), secondManifestPath).replace(/\\/g, '/')).toBe(secondBatch.manifestPath);
      expect(relative(process.cwd(), secondSummaryPath).replace(/\\/g, '/')).toBe(secondBatch.summaryPath);
      await expect(access(firstManifestPath)).rejects.toThrow();
      await expect(access(firstSummaryPath)).rejects.toThrow();
      await expect(access(secondManifestPath)).resolves.toBeUndefined();
      await expect(access(secondSummaryPath)).resolves.toBeUndefined();
      expect(JSON.parse(await readFile(resolve(outputRoot, 'watchdog.json'), 'utf8')).batchCount).toBe(2);
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  }, 15000);

  test('fails the soak when the active blessed weight id drifts between batches', async () => {
    const outputRoot = makeTempRoot();
    await mkdir(outputRoot, { recursive: true });
    const blessed = await resolveBlessedPlaybookWeights();
    const weights = blessed.weights;
    let resolveCount = 0;

    try {
      await expect(runContinuousLifeline({
        outputRoot,
        runId: 'continuous-blessed-drift',
        counts: [1],
        retentionWindow: 2,
        maxBatches: 1,
        resume: true,
        commandRunner: makeHealthRunner(),
        resolveBlessedWeights: async () => {
          resolveCount += 1;
          return {
            registryPath: blessed.registryPath,
            registry: blessed.registry,
            blessedRecord: resolveCount >= 2
              ? {
                  ...(blessed.blessedRecord ?? {}),
                  recordId: 'unexpected-blessed-id',
                  advisoryOnly: true,
                  status: 'blessed',
                  weights
                }
              : blessed.blessedRecord,
            weights
          };
        }
      })).rejects.toThrow(/blessedWeightMismatch/);

      const manifest = JSON.parse(await readFile(resolve(outputRoot, 'manifest.json'), 'utf8'));
      expect(manifest.retainedBatches[0].status).toBe('failed');
      expect(manifest.retainedBatches[0].failures).toContain('blessedWeightMismatch');
      expect(manifest.failureBucketHistogram.blessedWeightMismatch).toBe(1);
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });

  test('preserves latest batch pointers when a resumed soak is interrupted before the next batch completes', async () => {
    const outputRoot = makeTempRoot();
    await mkdir(outputRoot, { recursive: true });
    const latestBatchManifestPath = resolve(outputRoot, 'latest-batch-manifest.json');
    const latestFailureBucketsPath = resolve(outputRoot, 'latest-failure-buckets.json');

    try {
      const initialRun = await runContinuousLifeline({
        outputRoot,
        runId: 'continuous-interruption-test',
        counts: [1, 1],
        retentionWindow: 2,
        maxBatches: 1,
        resume: true,
        commandRunner: makeHealthRunner()
      });

      const initialBatchId = initialRun.retainedBatches[0].batchId;

      await expect(runContinuousLifeline({
        outputRoot,
        runId: 'continuous-interruption-test',
        counts: [1, 1],
        retentionWindow: 2,
        maxBatches: 2,
        resume: true,
        commandRunner: (_command: string, args: string[]) => {
          const summaryPath = args.at(-1) ?? '';
          if (summaryPath.includes('batch-0002')) {
            throw new Error('interrupted health pack');
          }

          return { ok: true, stdout: '', stderr: '' };
        }
      })).rejects.toThrow(/interrupted health pack/);

      const latestBatch = JSON.parse(await readFile(latestBatchManifestPath, 'utf8'));
      const latestFailureBuckets = JSON.parse(await readFile(latestFailureBucketsPath, 'utf8'));
      const checkpoint = JSON.parse(await readFile(resolve(outputRoot, 'checkpoint.json'), 'utf8'));

      expect(latestBatch.batchId).toBe(initialBatchId);
      expect(latestFailureBuckets.batchId).toBe(initialBatchId);
      expect(checkpoint.activeBatch?.batchId).toBe('batch-0002-runs-0001');
      expect(checkpoint.lastSuccessfulBatchId).toBe(initialBatchId);
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });
});


