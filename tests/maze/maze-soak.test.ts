import { expect, test } from 'vitest';

import { advanceDemoWalker, createDemoWalkerState } from '../../src/domain/ai';
import { legacyTuning } from '../../src/config/tuning';
import { disposeMazeEpisode, generateMaze, isTileFloor, resetAndRegenerate, type MazeConfig } from '../../src/domain/maze';
import { assertMazeInvariants, serializeMaze } from './maze-test-utils';

const soakProfile = process.env.MAZE_SOAK_PROFILE ?? 'normal';
const defaultSoakIterations = soakProfile === 'heavy' ? 200 : 72;
const soakIterations = Number.parseInt(process.env.MAZE_SOAK_ITERATIONS ?? `${defaultSoakIterations}`, 10);
const soakScales = [18, 30, 40, 50];
const warmupIterations = Math.max(20, Math.min(60, Math.floor(soakIterations * 0.25)));
const memorySampleEvery = Math.max(10, Math.floor(soakIterations / 8));
const deterministicReplayEvery = Math.max(6, Math.floor(soakIterations / 6));
const previousPeakDeltaBaseline = 30_959_648;

interface MemorySample {
  iteration: number;
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  arrayBuffers: number;
}

const maybeCollect = (): void => {
  (globalThis as { gc?: () => void }).gc?.();
};

const yieldToRunner = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const captureMemory = (iteration: number): MemorySample => {
  maybeCollect();
  const usage = process.memoryUsage();
  const sample: MemorySample = {
    iteration,
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    rss: usage.rss,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers
  };
  console.info(
    `[maze-soak] iteration=${iteration}`
    + ` heapUsed=${sample.heapUsed}`
    + ` heapTotal=${sample.heapTotal}`
    + ` rss=${sample.rss}`
    + ` external=${sample.external}`
    + ` arrayBuffers=${sample.arrayBuffers}`
  );
  return sample;
};

const shouldRunFullInvariantSample = (completedIteration: number): boolean => (
  completedIteration === 1
  || completedIteration === warmupIterations
  || completedIteration % memorySampleEvery === 0
  || completedIteration === soakIterations
);

const shouldReplayDeterministically = (completedIteration: number): boolean => (
  completedIteration === 1
  || completedIteration % deterministicReplayEvery === 0
  || completedIteration === soakIterations
);

const createPathMembership = (pathIndices: Uint32Array, tileCount: number): Uint8Array => {
  const membership = new Uint8Array(tileCount);
  for (const index of pathIndices) {
    membership[index] = 1;
  }
  return membership;
};

test(
  'soak: repeated seeded generation and reset cycles hold invariants',
  async () => {
    const memorySamples: MemorySample[] = [];
    let state = {
      processCount: 7,
      resetGame: false,
      result: generateMaze({
        scale: soakScales[0],
        seed: 1,
        checkPointModifier: 0.35,
        shortcutCountModifier: 0.18
      })
    };

    for (let iteration = 0; iteration < soakIterations; iteration += 1) {
      const scale = soakScales[iteration % soakScales.length];
      const config: MazeConfig = {
        scale,
        seed: iteration + 1,
        checkPointModifier: 0.35,
        shortcutCountModifier: scale >= 40 ? 0.18 : 0.13
      };

      const maze = generateMaze(config);
      const previousEpisode = state.result;
      const completedIteration = iteration + 1;
      const exhaustiveSample = shouldRunFullInvariantSample(completedIteration);
      assertMazeInvariants(maze, {
        exhaustive: exhaustiveSample
      });

      const regenerated = resetAndRegenerate(
        {
          ...state,
          resetGame: true
        },
        config
      );

      assertMazeInvariants(regenerated.result, {
        exhaustive: exhaustiveSample
      });
      if (shouldReplayDeterministically(completedIteration)) {
        expect(serializeMaze(regenerated.result)).toEqual(serializeMaze(maze));
      } else {
        expect(regenerated.result.seed).toBe(maze.seed);
        expect(regenerated.result.raster.pathIndices.length).toBe(maze.raster.pathIndices.length);
        expect(regenerated.result.raster.startIndex).toBe(maze.raster.startIndex);
        expect(regenerated.result.raster.endIndex).toBe(maze.raster.endIndex);
      }

      if (previousEpisode !== regenerated.result) {
        disposeMazeEpisode(previousEpisode);
      }
      disposeMazeEpisode(maze);
      state = regenerated;

      if (completedIteration >= warmupIterations
        && (completedIteration === warmupIterations
          || completedIteration % memorySampleEvery === 0
          || completedIteration === soakIterations)) {
        memorySamples.push(captureMemory(completedIteration));
      }

      if (completedIteration % 8 === 0) {
        await yieldToRunner();
      }
    }

    expect(memorySamples.length).toBeGreaterThanOrEqual(2);
    const postWarmupHeapUsed = memorySamples.map((sample) => sample.heapUsed);
    const postWarmupSampleCount = memorySamples.length;
    const postWarmupMinHeapUsed = Math.min(...postWarmupHeapUsed);
    const postWarmupMaxHeapUsed = Math.max(...postWarmupHeapUsed);
    const postWarmupRange = postWarmupMaxHeapUsed - postWarmupMinHeapUsed;
    const postWarmupPeaks = memorySamples.filter((sample, index, samples) => {
      const previous = samples[index - 1]?.heapUsed ?? Number.NEGATIVE_INFINITY;
      const next = samples[index + 1]?.heapUsed ?? Number.NEGATIVE_INFINITY;
      return sample.heapUsed >= previous && sample.heapUsed >= next;
    });
    const postWarmupPeakDelta = postWarmupPeaks.length < 2
      ? 0
      : Math.abs(postWarmupPeaks[postWarmupPeaks.length - 1].heapUsed - postWarmupPeaks[0].heapUsed);
    const finalHeapUsed = memorySamples[memorySamples.length - 1].heapUsed;
    const finalReturnedNearLowerBand = finalHeapUsed <= postWarmupMinHeapUsed + (16 * 1024 * 1024);
    const maxPostWarmupArrayBuffers = Math.max(...memorySamples.map((sample) => sample.arrayBuffers));
    const peakDeltaVsPreviousBaseline = postWarmupPeakDelta - previousPeakDeltaBaseline;

    console.info(
      `[maze-soak] warmupWindow=${warmupIterations}`
      + ` postWarmupSamples=${postWarmupSampleCount}`
      + ` postWarmupHeapUsedMin=${postWarmupMinHeapUsed}`
      + ` postWarmupHeapUsedMax=${postWarmupMaxHeapUsed}`
      + ` postWarmupHeapUsedRange=${postWarmupRange}`
      + ` postWarmupPeakDelta=${postWarmupPeakDelta}`
      + ` finalHeapUsed=${finalHeapUsed}`
      + ` finalNearLowerBand=${finalReturnedNearLowerBand}`
      + ` previousPeakDeltaBaseline=${previousPeakDeltaBaseline}`
      + ` peakDeltaVsPreviousBaseline=${peakDeltaVsPreviousBaseline}`
    );

    expect(postWarmupMaxHeapUsed).toBeLessThanOrEqual(memorySamples[0].heapUsed + (40 * 1024 * 1024));
    expect(postWarmupPeakDelta).toBeLessThanOrEqual(40 * 1024 * 1024);
    expect(finalReturnedNearLowerBand).toBe(true);
    expect(maxPostWarmupArrayBuffers).toBeLessThanOrEqual(memorySamples[0].arrayBuffers + (4 * 1024 * 1024));
    disposeMazeEpisode(state.result);
  },
  soakIterations > 1000 ? 180000 : 120000
);

test(
  'soak: demo playback stays on the solved path through regeneration loops',
  async () => {
    const demoIterations = Math.max(24, Math.floor(soakIterations / 8));

    for (let iteration = 0; iteration < demoIterations; iteration += 1) {
      const scale = soakScales[iteration % soakScales.length];
      const maze = generateMaze({
        scale,
        seed: iteration + 700,
        checkPointModifier: 0.35,
        shortcutCountModifier: scale >= 40 ? 0.18 : 0.13
      });
      let state = createDemoWalkerState(maze);
      let completedLoop = false;
      const pathMembership = createPathMembership(maze.raster.pathIndices, maze.raster.tiles.length);
      const maxSteps = Math.max(256, maze.raster.pathIndices.length * 3);

      for (let step = 0; step < maxSteps; step += 1) {
        const advance = advanceDemoWalker(maze, state, legacyTuning.demo);
        state = advance.state;

        expect(isTileFloor(maze.raster.tiles, state.currentIndex)).toBe(true);
        expect(pathMembership[state.currentIndex]).toBe(1);

        if (advance.shouldRegenerateMaze || state.loops > 0) {
          completedLoop = true;
          break;
        }
      }

      expect(completedLoop).toBe(true);
      disposeMazeEpisode(maze);
      if ((iteration + 1) % 4 === 0) {
        await yieldToRunner();
      }
    }
  },
  soakProfile === 'heavy' || soakIterations > 1000 ? 180000 : 60000
);
