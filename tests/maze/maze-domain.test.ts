import { describe, expect, test } from 'vitest';

import {
  buildMaze,
  createGrid,
  type CortexSample,
  generateMaze,
  isIndexValid,
  isWithinSameRow,
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

    grid.forEach((tile, index) => {
      for (let direction = 0; direction < 4; direction += 1) {
        const cardinalDirection = direction as 0 | 1 | 2 | 3;
        const neighborIndex = tile.neighbors[cardinalDirection];
        if (neighborIndex === -1) {
          continue;
        }

        expect(isIndexValid(neighborIndex, scale)).toBe(true);
        expect(isWithinSameRow(index, neighborIndex, cardinalDirection, scale)).toBe(true);
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
});
