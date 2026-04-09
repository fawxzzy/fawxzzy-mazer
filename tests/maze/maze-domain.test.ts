import { describe, expect, test } from 'vitest';

import {
  buildMaze,
  classifyMazeDifficulty,
  createGrid,
  type CortexSample,
  disposeMazeEpisode,
  generateMaze,
  getNeighborIndex,
  PatternEngine,
  resetAndRegenerate,
  runBatch,
  type MazeConfig
} from '../../src/domain/maze';
import { assertMazeInvariants, serializeMaze } from './maze-test-utils';

const defaultConfig: MazeConfig = {
  scale: 50,
  seed: 42,
  checkPointModifier: 0.35,
  shortcutCountModifier: 0.18
};

describe('maze domain generation', () => {
  test('is deterministic from seed', () => {
    const a = generateMaze(defaultConfig);
    const b = generateMaze(defaultConfig);

    expect(serializeMaze(a)).toEqual(serializeMaze(b));
  });

  test('preserves solver-backed maze invariants', () => {
    assertMazeInvariants(generateMaze(defaultConfig));
  });

  test('buildMaze exposes the pattern-engine friendly API surface', () => {
    const episode = buildMaze({
      width: 50,
      height: 50,
      seed: 77,
      braidRatio: 0.08,
      minSolutionLength: 20
    });

    assertMazeInvariants(episode);
    expect(episode.shortcutsCreated).toBeGreaterThanOrEqual(0);
    expect(episode.raster.width).toBe(50);
    expect(episode.raster.height).toBe(50);
    expect(episode.metrics.solutionLength).toBe(episode.raster.pathIndices.length);
  });

  test('braid ratio opens alternative routes on larger boards', () => {
    const maze = generateMaze({
      scale: 50,
      seed: 333,
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.24
    });

    assertMazeInvariants(maze);
    expect(maze.shortcutsCreated).toBeGreaterThan(0);
    expect(maze.metrics.deadEnds).toBeGreaterThan(0);
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

  test('remains stable across repeated regeneration', () => {
    let state = {
      processCount: 7,
      resetGame: false,
      result: generateMaze(defaultConfig)
    };

    for (let seed = 44; seed < 84; seed += 1) {
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

      assertMazeInvariants(state.result);
      expect(serializeMaze(state.result)).toEqual(
        serializeMaze(
          generateMaze({
            ...defaultConfig,
            seed
          })
        )
      );
    }
  }, 20000);

  test('batch harness reports bounded summary metrics', () => {
    const samples: CortexSample[] = [];
    const summary = runBatch(24, 50, 50, 0.08, {
      push(sample) {
        samples.push(sample);
      }
    });

    expect(summary.runs).toBe(24);
    expect(summary.avgSolutionLength).toBeGreaterThan(20);
    expect(summary.avgCoverage).toBeGreaterThan(0);
    expect(summary.avgCoverage).toBeLessThanOrEqual(1);
    expect(summary.maxSolutionLength).toBeGreaterThanOrEqual(summary.minSolutionLength);
    expect(samples).toHaveLength(24);
    expect(samples.every((sample) => sample.solutionLength > 0)).toBe(true);
    expect(samples.every((sample) => sample.metrics.solutionLength === sample.solutionLength)).toBe(true);
  });

  test('classifies difficulty buckets deterministically from measured metrics', () => {
    expect(classifyMazeDifficulty({
      solutionLength: 34,
      deadEnds: 8,
      junctions: 4,
      straightness: 0.86,
      coverage: 0.18
    }, 42, 42, 1).difficulty).toBe('chill');

    expect(classifyMazeDifficulty({
      solutionLength: 80,
      deadEnds: 16,
      junctions: 10,
      straightness: 0.55,
      coverage: 0.32
    }, 50, 50, 3).difficulty).toBe('standard');

    expect(classifyMazeDifficulty({
      solutionLength: 104,
      deadEnds: 28,
      junctions: 18,
      straightness: 0.42,
      coverage: 0.42
    }, 50, 50, 6).difficulty).toBe('spicy');

    expect(classifyMazeDifficulty({
      solutionLength: 130,
      deadEnds: 36,
      junctions: 24,
      straightness: 0.36,
      coverage: 0.5
    }, 50, 50, 9).difficulty).toBe('brutal');
  });

  test('pattern engine resumeFresh skips hidden-tab backlog and creates one fresh demo frame', () => {
    let seed = 900;
    const engine = new PatternEngine(
      () => generateMaze({
        scale: 30,
        seed: seed++,
        checkPointModifier: 0.35,
        shortcutCountModifier: 0.13
      }),
      'demo'
    );

    const initial = engine.next(0);
    engine.suspend();
    expect(engine.next(30)).toBe(initial);

    engine.resumeFresh();
    const resumed = engine.next(0);

    expect(resumed).not.toBe(initial);
    expect(resumed.episode.seed).toBe(901);
    disposeMazeEpisode(initial.episode);
    engine.destroy();
  });
});
