import { describe, expect, test } from 'vitest';

import {
  buildMaze,
  classifyMazeDifficulty,
  createGrid,
  type CortexSample,
  disposeMazeEpisode,
  generateMaze,
  generateMazeForDifficulty,
  getNeighborIndex,
  PatternEngine,
  resetAndRegenerate,
  runBatch,
  solveAStar,
  solveCorridorGraph,
  type MazeConfig
} from '../../src/domain/maze';
import { assertMazeInvariants, measureEpisodeTopology, serializeMaze } from './maze-test-utils';

const defaultConfig: MazeConfig = {
  scale: 50,
  seed: 42,
  size: 'medium',
  checkPointModifier: 0.35,
  shortcutCountModifier: 0.18
};

const resolveBuildWidth = (size: MazeConfig['size']): number => (
  size === 'small' ? 25 : size === 'medium' ? 37 : size === 'large' ? 51 : 75
);

describe('maze domain generation', () => {
  test('is deterministic from seed', () => {
    const a = generateMaze(defaultConfig);
    const b = generateMaze(defaultConfig);

    expect(serializeMaze(a)).toEqual(serializeMaze(b));
  });

  test('same-seed replay stays deterministic for size + difficulty + seed', () => {
    const cases = [
      { difficulty: 'chill', seed: 9_001, size: 'small' },
      { difficulty: 'standard', seed: 11_001, size: 'medium' },
      { difficulty: 'brutal', seed: 15_001, size: 'large' }
    ] as const;

    for (const testCase of cases) {
      const resolved = generateMazeForDifficulty({
        ...defaultConfig,
        size: testCase.size,
        seed: testCase.seed
      }, testCase.difficulty);
      const replay = generateMazeForDifficulty({
        ...defaultConfig,
        size: testCase.size,
        seed: resolved.seed
      }, testCase.difficulty, 0, 1);

      expect(resolved.episode.difficulty).toBe(testCase.difficulty);
      expect(resolved.episode.size).toBe(testCase.size);
      expect(serializeMaze(resolved.episode)).toEqual(serializeMaze(replay.episode));

      disposeMazeEpisode(replay.episode);
      disposeMazeEpisode(resolved.episode);
    }
  }, 15000);

  test('explicit family locks deterministic replay and survives difficulty targeting', () => {
    const resolved = generateMazeForDifficulty({
      ...defaultConfig,
      seed: 24_024,
      size: 'large',
      family: 'split-flow'
    }, 'spicy');
    const replay = generateMazeForDifficulty({
      ...defaultConfig,
      seed: resolved.seed,
      size: 'large',
      family: 'split-flow'
    }, 'spicy', 0, 1);

    expect(resolved.episode.family).toBe('split-flow');
    expect(replay.episode.family).toBe('split-flow');
    expect(serializeMaze(resolved.episode)).toEqual(serializeMaze(replay.episode));

    disposeMazeEpisode(replay.episode);
    disposeMazeEpisode(resolved.episode);
  }, 15000);

  test('preserves solver-backed maze invariants', () => {
    assertMazeInvariants(generateMaze(defaultConfig));
  });

  test('corridor graph solving stays deterministic for seed + size + difficulty + preset', () => {
    const a = generateMaze({
      ...defaultConfig,
      seed: 5_021,
      size: 'large',
      presentationPreset: 'framed'
    });
    const b = generateMaze({
      ...defaultConfig,
      seed: 5_021,
      size: 'large',
      presentationPreset: 'framed'
    });

    expect(serializeMaze(a)).toEqual(serializeMaze(b));
    expect(a.presentationPreset).toBe('framed');

    disposeMazeEpisode(b);
    disposeMazeEpisode(a);
  });

  test('size presets map to deterministic board scale bands', () => {
    const small = generateMaze({
      ...defaultConfig,
      size: 'small',
      seed: 501
    });
    const huge = generateMaze({
      ...defaultConfig,
      size: 'huge',
      seed: 501
    });
    const smallReplay = generateMaze({
      ...defaultConfig,
      size: 'small',
      seed: 501
    });

    expect(small.size).toBe('small');
    expect(huge.size).toBe('huge');
    expect(serializeMaze(small)).toEqual(serializeMaze(smallReplay));
    expect(huge.raster.width).toBeGreaterThan(small.raster.width);
    expect(huge.metrics.solutionLength).toBeGreaterThan(small.metrics.solutionLength);

    disposeMazeEpisode(smallReplay);
    disposeMazeEpisode(huge);
    disposeMazeEpisode(small);
  });

  test('buildMaze exposes the pattern-engine friendly API surface', () => {
    const episode = buildMaze({
      width: 50,
      height: 50,
      seed: 77,
      braidRatio: 0.08,
      family: 'braided',
      presentationPreset: 'braided',
      minSolutionLength: 20
    });

    assertMazeInvariants(episode);
    expect(episode.shortcutsCreated).toBeGreaterThanOrEqual(0);
    expect(episode.raster.width).toBe(50);
    expect(episode.raster.height).toBe(50);
    expect(episode.metrics.solutionLength).toBe(episode.raster.pathIndices.length);
    expect(episode.family).toBe('braided');
    expect(episode.presentationPreset).toBe('braided');
  });

  test('compressed corridor solving matches canonical A* on representative mazes', () => {
    const cases = [
      { seed: 1401, size: 'small', preset: 'classic' },
      { seed: 2402, size: 'medium', preset: 'braided' },
      { seed: 3403, size: 'large', preset: 'framed' },
      { seed: 4404, size: 'huge', preset: 'blueprint-rare' }
    ] as const;

    for (const testCase of cases) {
      const episode = buildMaze({
        width: resolveBuildWidth(testCase.size),
        height: resolveBuildWidth(testCase.size),
        size: testCase.size,
        seed: testCase.seed,
        braidRatio: 0.12,
        presentationPreset: testCase.preset,
        includeCore: true,
        minSolutionLength: 20
      });

      expect(episode.core).toBeDefined();
      const canonical = solveAStar(episode.core!, episode.core!.start, episode.core!.goal);
      const compressed = solveCorridorGraph(episode.core!, episode.core!.start, episode.core!.goal);

      expect(compressed.found).toBe(true);
      expect(compressed.cost).toBe(canonical.cost);
      expect(compressed.pathIndices.length).toBe(canonical.pathIndices.length);
      expect(compressed.pathIndices[0]).toBe(canonical.pathIndices[0]);
      expect(compressed.pathIndices[compressed.pathIndices.length - 1]).toBe(
        canonical.pathIndices[canonical.pathIndices.length - 1]
      );
      expect((compressed.cost * 2) + 1).toBe(episode.raster.pathIndices.length);

      disposeMazeEpisode(episode);
    }
  });

  test('braid ratio opens alternative routes on larger boards', () => {
    const maze = generateMaze({
      scale: 50,
      seed: 333,
      family: 'braided',
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.24
    });

    assertMazeInvariants(maze);
    expect(maze.shortcutsCreated).toBeGreaterThan(0);
    expect(maze.metrics.deadEnds).toBeGreaterThan(0);
  });

  test('family archetypes produce materially different topology signatures', () => {
    const sampleFamilies = ['classic', 'braided', 'sparse', 'dense', 'framed', 'split-flow'] as const;
    const seeds = [7_000, 7_037, 7_074, 7_111] as const;
    const samples = sampleFamilies.flatMap((family) => seeds.map((seed) => generateMaze({
      ...defaultConfig,
      family,
      seed,
      size: 'large'
    })));

    const byFamily = Object.fromEntries(sampleFamilies.map((family) => {
      const familyEpisodes = samples.filter((episode) => episode.family === family);
      const topology = familyEpisodes.map((episode) => measureEpisodeTopology(episode));
      const placementStrategies = new Set(familyEpisodes.map((episode) => episode.placementStrategy));
      return [family, {
        deadEnds: average(familyEpisodes.map((episode) => episode.metrics.deadEnds)),
        junctions: average(familyEpisodes.map((episode) => episode.metrics.junctions)),
        branchDensity: average(familyEpisodes.map((episode) => episode.metrics.branchDensity)),
        straightness: average(familyEpisodes.map((episode) => episode.metrics.straightness)),
        corridorMean: average(topology.map((item) => item.corridorMean)),
        corridorP90: average(topology.map((item) => item.corridorP90)),
        placementStrategies
      }];
    })) as Record<typeof sampleFamilies[number], {
      deadEnds: number;
      junctions: number;
      branchDensity: number;
      straightness: number;
      corridorMean: number;
      corridorP90: number;
      placementStrategies: Set<string>;
    }>;

    expect(byFamily.braided.deadEnds).toBeLessThan(byFamily.classic.deadEnds);
    expect(byFamily.braided.branchDensity).toBeGreaterThan(byFamily.classic.branchDensity);
    expect(byFamily.braided.straightness).toBeLessThan(byFamily.dense.straightness);
    expect(byFamily.sparse.corridorMean).toBeGreaterThan(byFamily.dense.corridorMean);
    expect(byFamily.sparse.deadEnds).toBeGreaterThan(byFamily.dense.deadEnds);
    expect(byFamily.dense.junctions).toBeGreaterThan(byFamily.classic.junctions);
    expect(byFamily.dense.corridorMean).toBeLessThan(byFamily.classic.corridorMean);
    expect(byFamily.dense.branchDensity).toBeGreaterThan(byFamily.classic.branchDensity);
    expect(byFamily.framed.placementStrategies.has('edge-biased')).toBe(true);
    expect(byFamily['split-flow'].placementStrategies.has('region-opposed')).toBe(true);
    expect(byFamily['split-flow'].corridorP90).toBeLessThanOrEqual(6.2);

    const signaturePairs = new Set(sampleFamilies.map((family) => [
      family,
      Math.round(byFamily[family].straightness * 1000),
      Math.round(byFamily[family].corridorMean * 1000),
      Math.round(byFamily[family].branchDensity * 1000)
    ].join(':')));
    expect(signaturePairs.size).toBe(sampleFamilies.length);

    for (const episode of samples) {
      disposeMazeEpisode(episode);
    }
  });

  test('keeps grid neighbor helpers within bounds', () => {
    const scale = 9;
    const grid = createGrid(scale);

    grid.forEach((_tile, index) => {
      for (let direction = 0; direction < 4; direction += 1) {
        const cardinalDirection = direction as 0 | 1 | 2 | 3;
        const neighborIndex = getNeighborIndex(index, scale, scale, cardinalDirection);
        if (neighborIndex === -1) {
          continue;
        }

        expect(neighborIndex).toBeGreaterThanOrEqual(0);
        expect(neighborIndex).toBeLessThan(scale * scale);
      }
    });
  });

  test('reset/regenerate loop only regenerates when flagged', () => {
    const initial = {
      processCount: 7,
      resetGame: false,
      result: generateMaze(defaultConfig)
    };

    const untouched = resetAndRegenerate(initial, defaultConfig);
    expect(untouched).toBe(initial);

    const regenerated = resetAndRegenerate({ ...initial, resetGame: true }, { ...defaultConfig, seed: 43 });
    expect(regenerated).not.toBe(initial);
    expect(regenerated.resetGame).toBe(false);
    expect(regenerated.processCount).toBe(7);
    expect(regenerated.result.seed).toBe(43);
    assertMazeInvariants(regenerated.result);
  });

  test('remains stable across repeated regeneration', async () => {
    let state = {
      processCount: 7,
      resetGame: false,
      result: generateMaze(defaultConfig)
    };

    const representativeSeeds = [44, 47, 52, 57, 63, 71, 77, 83] as const;

    for (const [index, seed] of representativeSeeds.entries()) {
      state = resetAndRegenerate(
        {
          ...state,
          resetGame: true
        },
        {
          ...defaultConfig,
          seed
        }
      );

      assertMazeInvariants(state.result, {
        exhaustive: index === 0 || index === representativeSeeds.length - 1
      });
      const replay = generateMaze({
        ...defaultConfig,
        seed
      });
      expect(serializeMaze(state.result)).toEqual(serializeMaze(replay));
      disposeMazeEpisode(replay);

      if ((index + 1) % 2 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }, 20000);

  test('batch harness reports bounded summary metrics', () => {
    const samples: CortexSample[] = [];
    const summary = runBatch(12, 50, 50, 0.08, {
      push(sample) {
        samples.push(sample);
      }
    });

    expect(summary.runs).toBe(12);
    expect(summary.avgSolutionLength).toBeGreaterThan(20);
    expect(summary.avgCoverage).toBeGreaterThan(0);
    expect(summary.avgCoverage).toBeLessThanOrEqual(1);
    expect(summary.maxSolutionLength).toBeGreaterThanOrEqual(summary.minSolutionLength);
    expect(samples).toHaveLength(12);
    expect(samples.every((sample) => sample.solutionLength > 0)).toBe(true);
    expect(samples.every((sample) => sample.metrics.solutionLength === sample.solutionLength)).toBe(true);
  }, 10000);

  test('classifies difficulty buckets deterministically from measured metrics', () => {
    expect(classifyMazeDifficulty({
      solutionLength: 120,
      deadEnds: 20,
      junctions: 10,
      branchDensity: 0.035,
      straightness: 0.5,
      coverage: 0.3
    }, 50, 50, 4).difficulty).toBe('chill');

    expect(classifyMazeDifficulty({
      solutionLength: 180,
      deadEnds: 30,
      junctions: 18,
      branchDensity: 0.05,
      straightness: 0.45,
      coverage: 0.38
    }, 50, 50, 6).difficulty).toBe('standard');

    expect(classifyMazeDifficulty({
      solutionLength: 500,
      deadEnds: 70,
      junctions: 50,
      branchDensity: 0.085,
      straightness: 0.14,
      coverage: 0.76
    }, 50, 50, 20).difficulty).toBe('spicy');

    expect(classifyMazeDifficulty({
      solutionLength: 650,
      deadEnds: 90,
      junctions: 68,
      branchDensity: 0.12,
      straightness: 0.08,
      coverage: 0.86
    }, 50, 50, 28).difficulty).toBe('brutal');
  });

  test('difficulty-targeted generation resolves into the requested bucket', () => {
    const cases = [
      { difficulty: 'chill', seed: 9_001, size: 'small' },
      { difficulty: 'standard', seed: 11_001, size: 'medium' },
      { difficulty: 'brutal', seed: 15_001, size: 'large' }
    ] as const;

    for (const [index, testCase] of cases.entries()) {
      const resolved = generateMazeForDifficulty({
        ...defaultConfig,
        size: testCase.size,
        seed: testCase.seed
      }, testCase.difficulty);

      expect(resolved.episode.difficulty).toBe(testCase.difficulty);
      assertMazeInvariants(resolved.episode, {
        exhaustive: index === 0 || index === cases.length - 1
      });
      disposeMazeEpisode(resolved.episode);
    }
  }, 15000);

  test('pattern engine resumeFresh skips hidden-tab backlog and creates one fresh demo frame', () => {
    let seed = 900;
    let cycle = 0;
    const engine = new PatternEngine(
      () => {
        const size = (['small', 'medium', 'large', 'huge'] as const)[cycle % 4];
        const difficulty = (['chill', 'standard', 'spicy', 'brutal'] as const)[cycle % 4];
        cycle += 1;
        return generateMazeForDifficulty({
          scale: 50,
          seed: seed++,
          size,
          checkPointModifier: 0.35,
          shortcutCountModifier: 0.13
        }, difficulty, 0, 1).episode;
      },
      'demo'
    );

    const initial = engine.next(0);
    engine.suspend();
    expect(engine.next(30)).toBe(initial);

    engine.resumeFresh();
    const resumed = engine.next(0);

    expect(resumed).not.toBe(initial);
    expect(resumed.episode.seed).toBeGreaterThanOrEqual(901);
    expect(cycle).toBe(2);
    disposeMazeEpisode(initial.episode);
    engine.destroy();
  });
});

const average = (values: readonly number[]): number => (
  values.reduce((total, value) => total + value, 0) / Math.max(1, values.length)
);
