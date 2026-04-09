import { describe, expect, test } from 'vitest';

import { advanceDemoWalker, createDemoWalkerState, resolveDemoWalkerViewFrame } from '../../src/domain/ai';
import { legacyTuning } from '../../src/config/tuning';
import { generateMaze } from '../../src/domain/maze';

describe('demo walker', () => {
  test('steps forward along the validated A* solution path', () => {
    const episode = generateMaze({
      scale: 30,
      seed: 22,
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.08
    });

    let state = createDemoWalkerState(episode);
    const next = advanceDemoWalker(episode, state);
    state = next.state;

    expect(state.currentIndex).toBe(episode.raster.pathIndices[1]);
    expect(state.pathCursor).toBe(1);
    expect(state.cue).toBe('explore');
    expect(state.trailSteps).toEqual([
      { index: episode.raster.startIndex, mode: 'explore' },
      { index: episode.raster.pathIndices[1], mode: 'explore' }
    ]);
  });

  test('enters goal-hold after reaching the end of the solution path', () => {
    const episode = generateMaze({
      scale: 18,
      seed: 41,
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.08
    });

    let state = createDemoWalkerState(episode);
    while (state.currentIndex !== episode.raster.endIndex) {
      state = advanceDemoWalker(episode, state).state;
    }

    expect(state.phase).toBe('goal-hold');
    expect(state.reachedGoal).toBe(true);
    expect(state.cue).toBe('goal');
    expect(state.trailSteps.at(-1)).toEqual({ index: episode.raster.endIndex, mode: 'goal' });
  });

  test('requests regeneration after the goal hold completes', () => {
    const episode = generateMaze({
      scale: 18,
      seed: 41,
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.08
    });

    let state = createDemoWalkerState(episode);
    while (state.currentIndex !== episode.raster.endIndex) {
      state = advanceDemoWalker(episode, state).state;
    }

    const resetAdvance = advanceDemoWalker(episode, state);
    expect(resetAdvance.state.phase).toBe('reset-hold');
    expect(resetAdvance.state.resetReason).toBe('goal');

    const regenerateAdvance = advanceDemoWalker(episode, resetAdvance.state);
    expect(regenerateAdvance.shouldRegenerateMaze).toBe(true);
    expect(regenerateAdvance.nextSeed).toBe(1989);
    expect(regenerateAdvance.state.currentIndex).toBe(episode.raster.startIndex);
    expect(regenerateAdvance.state.loops).toBe(1);
    expect(regenerateAdvance.state.cue).toBe('spawn');
  });

  test('caps trail buffers instead of retaining the full path', () => {
    const episode = generateMaze({
      scale: 30,
      seed: 55,
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.08
    });

    let state = createDemoWalkerState(episode);
    for (let step = 0; step < 8; step += 1) {
      state = advanceDemoWalker(episode, state, {
        seed: 1988,
        cadence: {
          spawnHoldMs: 1,
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

  test('view frames stay on canonical pathIndices with a bounded visible window', () => {
    const episode = generateMaze({
      scale: 40,
      seed: 73,
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.13
    });

    const elapsedMs = legacyTuning.demo.cadence.spawnHoldMs + (legacyTuning.demo.cadence.exploreStepMs * 2.5);
    const frame = resolveDemoWalkerViewFrame(episode, elapsedMs, legacyTuning.demo, 4);

    expect(episode.raster.pathIndices.includes(frame.currentIndex)).toBe(true);
    expect(episode.raster.pathIndices.includes(frame.nextIndex)).toBe(true);
    expect(frame.trailLimit - frame.trailStart).toBeLessThanOrEqual(4);
    expect(frame.progress).toBeGreaterThan(0);
    expect(frame.progress).toBeLessThan(1);
  });
});
