import { expect, test } from 'vitest';

import { advanceDemoWalker, createDemoWalkerState } from '../../src/domain/ai';
import { legacyTuning } from '../../src/config/tuning';
import { disposeMazeEpisode, generateMaze, resetAndRegenerate, type MazeConfig } from '../../src/domain/maze';
import { assertMazeInvariants, serializeMaze } from './maze-test-utils';

const soakIterations = Number.parseInt(process.env.MAZE_SOAK_ITERATIONS ?? '200', 10);
const soakScales = [18, 30, 40, 50];
const warmupIterations = Math.max(20, Math.min(60, Math.floor(soakIterations * 0.25)));
const memorySampleEvery = Math.max(10, Math.floor(soakIterations / 8));

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

test(
  'soak: repeated seeded generation and reset cycles hold invariants',
  () => {
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
      assertMazeInvariants(maze);

      const regenerated = resetAndRegenerate(
        {
          ...state,
          resetGame: true
        },
        config
      );

      assertMazeInvariants(regenerated.result);
      expect(serializeMaze(regenerated.result)).toEqual(serializeMaze(maze));

      if (previousEpisode !== regenerated.result) {
        disposeMazeEpisode(previousEpisode);
      }
      disposeMazeEpisode(maze);
      state = regenerated;

      const completedIteration = iteration + 1;
      if (completedIteration >= warmupIterations
        && (completedIteration === warmupIterations
          || completedIteration % memorySampleEvery === 0
          || completedIteration === soakIterations)) {
        memorySamples.push(captureMemory(completedIteration));
      }
    }

    expect(memorySamples.length).toBeGreaterThanOrEqual(2);
    const baseline = memorySamples[0];
    const tailWindow = memorySamples.slice(Math.max(1, Math.floor(memorySamples.length / 2)));
    const maxTailHeapUsed = Math.max(...tailWindow.map((sample) => sample.heapUsed));
    const maxTailArrayBuffers = Math.max(...tailWindow.map((sample) => sample.arrayBuffers));

    expect(maxTailHeapUsed).toBeLessThanOrEqual(baseline.heapUsed + (16 * 1024 * 1024));
    expect(maxTailArrayBuffers).toBeLessThanOrEqual(baseline.arrayBuffers + (4 * 1024 * 1024));
    disposeMazeEpisode(state.result);
  },
  soakIterations > 1000 ? 180000 : 120000
);

test(
  'soak: demo playback stays on the solved path through regeneration loops',
  () => {
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

      for (let step = 0; step < 6000; step += 1) {
        const advance = advanceDemoWalker(maze, state, legacyTuning.demo);
        state = advance.state;

        expect(maze.raster.tiles[state.currentIndex].floor).toBe(true);
        expect(maze.raster.pathIndices.includes(state.currentIndex)).toBe(true);

        if (advance.shouldRegenerateMaze || state.loops > 0) {
          completedLoop = true;
          break;
        }
      }

      expect(completedLoop).toBe(true);
      disposeMazeEpisode(maze);
    }
  },
  soakIterations > 1000 ? 180000 : 120000
);
