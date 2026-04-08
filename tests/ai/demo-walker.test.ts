import { describe, expect, test } from 'vitest';

import { advanceDemoWalker, createDemoWalkerState, type DemoWalkerState } from '../../src/domain/ai';
import type { MazeBuildResult, MazeTile, NeighborTuple } from '../../src/domain/maze';

const createTile = (
  index: number,
  x: number,
  y: number,
  neighbors: NeighborTuple,
  { floor = true, path = true, end = false }: Partial<Pick<MazeTile, 'floor' | 'path' | 'end'>> = {}
): MazeTile => ({
  index,
  x,
  y,
  floor,
  path,
  end,
  neighbors,
  neighborCount: neighbors.filter((neighborIndex) => neighborIndex !== -1).length
});

const buildMaze = (tiles: MazeTile[], startIndex: number, endIndex: number): MazeBuildResult => ({
  scale: tiles.length,
  seed: 22,
  tiles,
  pathIndices: tiles.filter((tile) => tile.path).map((tile) => tile.index),
  checkpointIndices: [],
  wallIndices: [],
  startIndex,
  endIndex,
  checkpointCount: 0,
  shortcutsCreated: 0
});

const createBranchChoiceMaze = (): MazeBuildResult => buildMaze([
  createTile(0, 0, 0, [-1, 5, -1, 1]),
  createTile(1, 1, 0, [-1, 2, 0, -1]),
  createTile(2, 2, 0, [1, -1, -1, -1], { end: true }),
  createTile(3, 0, 0, [-1, -1, -1, -1], { floor: false, path: false }),
  createTile(4, 0, 0, [-1, -1, -1, -1], { floor: false, path: false }),
  createTile(5, 0, 2, [0, 6, -1, -1]),
  createTile(6, 0, 3, [5, -1, -1, -1])
], 0, 2);

const createBacktrackMaze = (): MazeBuildResult => buildMaze([
  createTile(0, 0, 0, [-1, -1, -1, 1]),
  createTile(1, 1, 0, [-1, 3, 0, 2]),
  createTile(2, 2, 0, [-1, 4, 1, -1]),
  createTile(3, 1, 1, [1, -1, -1, -1]),
  createTile(4, 2, 1, [2, -1, -1, -1], { end: true })
], 0, 4);

const createGoalMaze = (): MazeBuildResult => buildMaze([
  createTile(0, 0, 0, [-1, -1, -1, 1]),
  createTile(1, 1, 0, [-1, -1, 0, -1], { end: true })
], 0, 1);

describe('demo walker', () => {
  test('matches legacy direct-move selection and preserves alternate branches', () => {
    const maze = createBranchChoiceMaze();
    const advance = advanceDemoWalker(maze, createDemoWalkerState(maze));

    expect(advance.state.currentIndex).toBe(1);
    expect(advance.state.pathStackIndices).toEqual([1]);
    expect(advance.state.potentialBranchIndices).toEqual([5]);
    expect(advance.state.visited).toEqual(new Set([1]));
  });

  test('uses the legacy potential-target backtrack flow before taking a branch', () => {
    const maze = createBacktrackMaze();
    let state: DemoWalkerState = {
      ...createDemoWalkerState(maze),
      currentIndex: 3,
      trailIndices: [0, 1, 3],
      visited: new Set([1, 3]),
      pathStackIndices: [1, 3],
      potentialBranchIndices: [2]
    };

    state = advanceDemoWalker(maze, state).state;
    expect(state.phase).toBe('backtrack');
    expect(state.targetIndex).toBe(2);
    expect(state.potentialBranchIndices).toEqual([]);

    state = advanceDemoWalker(maze, state).state;
    expect(state.phase).toBe('backtrack');
    expect(state.currentIndex).toBe(3);
    expect(state.pathStackIndices).toEqual([1]);

    state = advanceDemoWalker(maze, state).state;
    expect(state.phase).toBe('explore');
    expect(state.currentIndex).toBe(1);

    state = advanceDemoWalker(maze, state).state;
    expect(state.currentIndex).toBe(2);
    expect(state.phase).toBe('explore');
  });

  test('preserves visited history across legacy AI resets and flips logic switch', () => {
    const maze = createBacktrackMaze();
    const state: DemoWalkerState = {
      ...createDemoWalkerState(maze),
      currentIndex: 3,
      trailIndices: [0, 1, 3],
      visited: new Set([1, 3]),
      phase: 'backtrack',
      pathStackIndices: [],
      potentialBranchIndices: [],
      logicSwitch: true
    };
    const nextState = advanceDemoWalker(maze, state).state;

    expect(nextState.phase).toBe('reset-hold');
    expect(nextState.resetReason).toBe('ai-reset');
    expect(nextState.currentIndex).toBe(maze.startIndex);
    expect(nextState.logicSwitch).toBe(false);
    expect(nextState.loops).toBe(1);
    expect(nextState.visited.has(1)).toBe(true);
    expect(nextState.visited.has(3)).toBe(false);
    expect(nextState.visited.has(maze.startIndex)).toBe(true);
  });

  test('preserves the legacy logic-switch retarget bug before backtracking', () => {
    const maze = createBacktrackMaze();
    const state: DemoWalkerState = {
      ...createDemoWalkerState(maze),
      currentIndex: 3,
      trailIndices: [0, 1, 3],
      visited: new Set([1, 3]),
      pathStackIndices: [1, 3],
      potentialBranchIndices: [2],
      logicSwitch: true
    };
    const nextState = advanceDemoWalker(maze, state).state;

    expect(nextState.phase).toBe('backtrack');
    expect(nextState.targetIndex).toBeNull();
    expect(nextState.potentialBranchIndices).toEqual([]);
  });

  test('requests a maze regeneration after reaching the goal', () => {
    const maze = createGoalMaze();
    let advance = advanceDemoWalker(maze, createDemoWalkerState(maze));

    expect(advance.state.phase).toBe('goal-hold');
    expect(advance.state.reachedGoal).toBe(true);
    expect(advance.delayMs).toBe(720);

    advance = advanceDemoWalker(maze, advance.state);
    expect(advance.state.phase).toBe('reset-hold');
    expect(advance.state.resetReason).toBe('goal');

    advance = advanceDemoWalker(maze, advance.state);
    expect(advance.shouldRegenerateMaze).toBe(true);
    expect(advance.nextSeed).toBe(1989);
    expect(advance.state.currentIndex).toBe(maze.startIndex);
    expect(advance.state.loops).toBe(1);
  });
});
