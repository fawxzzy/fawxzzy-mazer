import { describe, expect, test } from 'vitest';

import { advanceDemoWalker, createDemoWalkerState } from '../../src/domain/ai';
import { generateMaze } from '../../src/domain/maze';

describe('demo walker', () => {
  test('steps forward along the validated A* solution path', () => {
    const maze = generateMaze({
      scale: 30,
      seed: 22,
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.08
    });

    let state = createDemoWalkerState(maze);
    const next = advanceDemoWalker(maze, state);
    state = next.state;

    expect(state.currentIndex).toBe(maze.pathIndices[1]);
    expect(state.pathCursor).toBe(1);
    expect(state.cue).toBe('explore');
    expect(state.trailSteps).toEqual([
      { index: maze.startIndex, mode: 'explore' },
      { index: maze.pathIndices[1], mode: 'explore' }
    ]);
  });

  test('enters goal-hold after reaching the end of the solution path', () => {
    const maze = generateMaze({
      scale: 18,
      seed: 41,
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.08
    });

    let state = createDemoWalkerState(maze);
    while (state.currentIndex !== maze.endIndex) {
      state = advanceDemoWalker(maze, state).state;
    }

    expect(state.phase).toBe('goal-hold');
    expect(state.reachedGoal).toBe(true);
    expect(state.cue).toBe('goal');
    expect(state.trailSteps.at(-1)).toEqual({ index: maze.endIndex, mode: 'goal' });
  });

  test('requests regeneration after the goal hold completes', () => {
    const maze = generateMaze({
      scale: 18,
      seed: 41,
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.08
    });

    let state = createDemoWalkerState(maze);
    while (state.currentIndex !== maze.endIndex) {
      state = advanceDemoWalker(maze, state).state;
    }

    const resetAdvance = advanceDemoWalker(maze, state);
    expect(resetAdvance.state.phase).toBe('reset-hold');
    expect(resetAdvance.state.resetReason).toBe('goal');

    const regenerateAdvance = advanceDemoWalker(maze, resetAdvance.state);
    expect(regenerateAdvance.shouldRegenerateMaze).toBe(true);
    expect(regenerateAdvance.nextSeed).toBe(1989);
    expect(regenerateAdvance.state.currentIndex).toBe(maze.startIndex);
    expect(regenerateAdvance.state.loops).toBe(1);
    expect(regenerateAdvance.state.cue).toBe('spawn');
  });

  test('caps trail buffers instead of retaining the full path', () => {
    const maze = generateMaze({
      scale: 30,
      seed: 55,
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.08
    });

    let state = createDemoWalkerState(maze);
    for (let step = 0; step < 8; step += 1) {
      state = advanceDemoWalker(maze, state, {
        seed: 1988,
        cadence: {
          exploreStepMs: 1,
          backtrackStepMs: 1,
          decisionPauseMs: 1,
          anticipationStepMs: 1,
          branchCommitMs: 1,
          branchResumeMs: 1,
          goalHoldMs: 1,
          resetHoldMs: 1
        },
        behavior: {
          trailMaxLength: 3,
          aiTilePathAdditionalPaths: 0,
          preserveVisitedOnAiReset: true,
          emulateLogicSwitchPotentialCheckBug: true,
          regenerateSeedStep: 1,
          prerollSteps: 0
        }
      }).state;
      expect(state.trailIndices.length).toBeLessThanOrEqual(3);
      expect(state.trailSteps.length).toBeLessThanOrEqual(3);
    }
  });
});
