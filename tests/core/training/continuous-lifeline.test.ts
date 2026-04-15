// @ts-nocheck
import { access, mkdir, rm, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { runContinuousLifeline } from '../../../scripts/lifeline/continuous.ts';
import { resolveBlessedPlaybookWeights } from '../../../scripts/training/common.mjs';

const makeTempRoot = () => resolve('tmp', 'lifeline-tests', `continuous-${randomUUID()}`);

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
        resume: true
      });
      const firstBatch = firstRun.retainedBatches[0];
      const firstManifestPath = resolve(outputRoot, 'batches', firstBatch.batchId, 'manifest.json');
      const firstSummaryPath = resolve(outputRoot, 'batches', firstBatch.batchId, 'summary-rollup.json');
      const firstWatchdog = JSON.parse(await readFile(resolve(outputRoot, 'watchdog.json'), 'utf8'));

      expect(firstRun.retainedBatches).toHaveLength(1);
      expect(firstRun.lastSuccessfulBatchId).toBe(firstBatch.batchId);
      expect(firstRun.lastSuccessfulBatchIndex).toBe(1);
      expect(firstRun.activeBlessedWeightId).toBe((await resolveBlessedPlaybookWeights()).blessedRecord?.recordId ?? 'default-neutral');
      expect(relative(process.cwd(), firstManifestPath).replace(/\\/g, '/')).toBe(firstBatch.manifestPath);
      expect(relative(process.cwd(), firstSummaryPath).replace(/\\/g, '/')).toBe(firstBatch.summaryPath);
      expect(firstWatchdog.batchCount).toBe(1);
      expect(firstWatchdog.activeBlessedWeightId).toBe(firstRun.activeBlessedWeightId);
      await expect(access(firstManifestPath)).resolves.toBeUndefined();
      await expect(access(firstSummaryPath)).resolves.toBeUndefined();

      const resumed = await runContinuousLifeline({
        outputRoot,
        runId: 'continuous-test',
        counts: [1, 1],
        retentionWindow: 1,
        maxBatches: 2,
        resume: true
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
  });
});
