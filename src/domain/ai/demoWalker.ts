import { resolveDirectionBetween, type MazeEpisode } from '../maze';

export interface DemoWalkerConfig {
  seed: number;
  cadence: {
    spawnHoldMs: number;
    exploreStepMs: number;
    backtrackStepMs: number;
    decisionPauseMs: number;
    anticipationStepMs: number;
    branchCommitMs: number;
    branchResumeMs: number;
    goalHoldMs: number;
    resetHoldMs: number;
  };
  behavior: {
    trailMaxLength: number;
    aiTilePathAdditionalPaths: number;
    preserveVisitedOnAiReset: boolean;
    emulateLogicSwitchPotentialCheckBug: boolean;
    regenerateSeedStep: number;
    prerollSteps?: number;
  };
}

export interface DemoWalkerAdvance {
  state: DemoWalkerState;
  delayMs: number;
  shouldRegenerateMaze?: boolean;
  nextSeed?: number;
}

export interface DemoWalkerViewFrame {
  currentIndex: number;
  nextIndex: number;
  previousIndex: number;
  direction: 0 | 1 | 2 | 3 | null;
  progress: number;
  cue: DemoWalkerCue;
  trailStart: number;
  trailLimit: number;
  cycleComplete: boolean;
}

export type DemoWalkerPhase = 'explore' | 'goal-hold' | 'reset-hold';
type DemoWalkerResetReason = 'goal' | null;
export type DemoTrailMode = 'explore' | 'backtrack' | 'goal';
export type DemoWalkerCue = 'spawn' | 'anticipate' | 'explore' | 'dead-end' | 'backtrack' | 'reacquire' | 'goal' | 'reset';

export interface DemoTrailStep {
  index: number;
  mode: DemoTrailMode;
}

export interface DemoWalkerState {
  currentIndex: number;
  trailIndices: number[];
  trailSteps: DemoTrailStep[];
  loops: number;
  reachedGoal: boolean;
  phase: DemoWalkerPhase;
  stepsTaken: number;
  lastDirection: 0 | 1 | 2 | 3 | null;
  resetReason: DemoWalkerResetReason;
  cue: DemoWalkerCue;
  pathCursor: number;
}

const defaultConfig: DemoWalkerConfig = {
  seed: 1988,
  cadence: {
    spawnHoldMs: 220,
    exploreStepMs: 104,
    backtrackStepMs: 76,
    decisionPauseMs: 228,
    anticipationStepMs: 84,
    branchCommitMs: 112,
    branchResumeMs: 148,
    goalHoldMs: 3000,
    resetHoldMs: 340
  },
  behavior: {
    trailMaxLength: 46,
    aiTilePathAdditionalPaths: 0,
    preserveVisitedOnAiReset: true,
    emulateLogicSwitchPotentialCheckBug: true,
    regenerateSeedStep: 1,
    prerollSteps: 0
  }
};

export const createDemoWalkerState = (episode: MazeEpisode): DemoWalkerState => ({
  currentIndex: episode.raster.startIndex,
  trailIndices: [episode.raster.startIndex],
  trailSteps: [{ index: episode.raster.startIndex, mode: 'explore' }],
  loops: 0,
  reachedGoal: false,
  phase: 'explore',
  stepsTaken: 0,
  lastDirection: null,
  resetReason: null,
  cue: 'spawn',
  pathCursor: 0
});

export const advanceDemoWalker = (
  episode: MazeEpisode,
  state: DemoWalkerState,
  config: DemoWalkerConfig = defaultConfig
): DemoWalkerAdvance => {
  if (state.phase === 'goal-hold' && state.reachedGoal) {
    return {
      state: {
        ...state,
        phase: 'reset-hold',
        resetReason: 'goal',
        cue: 'goal',
        stepsTaken: state.stepsTaken + 1
      },
      delayMs: config.cadence.resetHoldMs
    };
  }

  if (state.phase === 'reset-hold') {
    return {
      state: {
        ...createDemoWalkerState(episode),
        loops: state.loops + 1
      },
      delayMs: config.cadence.exploreStepMs,
      shouldRegenerateMaze: true,
      nextSeed: config.seed + ((state.loops + 1) * config.behavior.regenerateSeedStep)
    };
  }

  const nextCursor = Math.min(state.pathCursor + 1, episode.raster.pathIndices.length - 1);
  const nextIndex = episode.raster.pathIndices[nextCursor];
  const reachedGoal = nextIndex === episode.raster.endIndex;
  const trailMode: DemoTrailMode = reachedGoal ? 'goal' : 'explore';

  return {
    state: {
      ...state,
      currentIndex: nextIndex,
      trailIndices: appendTrail(state.trailIndices, nextIndex, config.behavior.trailMaxLength),
      trailSteps: appendTrailStep(state.trailSteps, nextIndex, trailMode, config.behavior.trailMaxLength),
      reachedGoal,
      phase: reachedGoal ? 'goal-hold' : 'explore',
      stepsTaken: state.stepsTaken + 1,
      lastDirection: state.currentIndex === nextIndex
        ? null
        : resolveDirectionBetween(state.currentIndex, nextIndex, episode.raster.width),
      resetReason: null,
      cue: reachedGoal ? 'goal' : 'explore',
      pathCursor: nextCursor
    },
    delayMs: reachedGoal ? config.cadence.goalHoldMs : config.cadence.exploreStepMs
  };
};

export const stepDemoWalker = (
  episode: MazeEpisode,
  state: DemoWalkerState,
  config: DemoWalkerConfig = defaultConfig
): DemoWalkerState => advanceDemoWalker(episode, state, config).state;

export const resolveDemoWalkerViewFrame = (
  episode: MazeEpisode,
  elapsedMs: number,
  config: DemoWalkerConfig = defaultConfig,
  trailWindow = config.behavior.trailMaxLength
): DemoWalkerViewFrame => {
  const path = episode.raster.pathIndices;
  const startIndex = episode.raster.startIndex;
  const endIndex = episode.raster.endIndex;
  const spawnHoldMs = Math.max(0, config.cadence.spawnHoldMs);
  const stepMs = Math.max(1, config.cadence.exploreStepMs);
  const goalHoldMs = Math.max(0, config.cadence.goalHoldMs);
  const resetHoldMs = Math.max(0, config.cadence.resetHoldMs);
  const visibleWindow = Math.max(1, trailWindow);
  const lastPathIndex = Math.max(0, path.length - 1);

  if (path.length <= 1) {
    return {
      currentIndex: startIndex,
      nextIndex: endIndex,
      previousIndex: startIndex,
      direction: null,
      progress: 1,
      cue: elapsedMs < spawnHoldMs ? 'spawn' : 'goal',
      trailStart: 0,
      trailLimit: Math.min(1, path.length),
      cycleComplete: elapsedMs >= spawnHoldMs + goalHoldMs + resetHoldMs
    };
  }

  if (elapsedMs < spawnHoldMs) {
    return {
      currentIndex: startIndex,
      nextIndex: path[1],
      previousIndex: startIndex,
      direction: resolveDirectionBetween(startIndex, path[1], episode.raster.width),
      progress: 0,
      cue: 'spawn',
      trailStart: 0,
      trailLimit: 1,
      cycleComplete: false
    };
  }

  const traverseMs = lastPathIndex * stepMs;
  const moveElapsedMs = elapsedMs - spawnHoldMs;
  if (moveElapsedMs <= traverseMs) {
    const clampedMoveElapsedMs = Math.min(moveElapsedMs, traverseMs);
    const segment = Math.min(
      lastPathIndex - 1,
      Math.max(0, Math.floor(Math.max(0, clampedMoveElapsedMs - 1) / stepMs))
    );
    const segmentElapsedMs = clampedMoveElapsedMs - (segment * stepMs);
    const progress = segment === lastPathIndex - 1 && clampedMoveElapsedMs >= traverseMs
      ? 1
      : Math.min(1, segmentElapsedMs / stepMs);
    const currentIndex = path[segment];
    const nextIndex = path[segment + 1];
    const visibleCursor = Math.min(lastPathIndex, segment + (progress >= 0.16 ? 1 : 0));
    const trailLimit = Math.max(Math.min(visibleWindow, path.length), visibleCursor + 1);

    return {
      currentIndex,
      nextIndex,
      previousIndex: segment === 0 ? startIndex : path[segment - 1],
      direction: resolveDirectionBetween(currentIndex, nextIndex, episode.raster.width),
      progress,
      cue: segment >= lastPathIndex - 2 && progress >= 0.42 ? 'anticipate' : 'explore',
      trailStart: 0,
      trailLimit,
      cycleComplete: false
    };
  }

  if (moveElapsedMs < traverseMs + goalHoldMs) {
    return {
      currentIndex: endIndex,
      nextIndex: endIndex,
      previousIndex: path[lastPathIndex - 1] ?? endIndex,
      direction: resolveDirectionBetween(path[lastPathIndex - 1] ?? endIndex, endIndex, episode.raster.width),
      progress: 1,
      cue: 'goal',
      trailStart: 0,
      trailLimit: path.length,
      cycleComplete: false
    };
  }

  if (moveElapsedMs < traverseMs + goalHoldMs + resetHoldMs) {
    return {
      currentIndex: endIndex,
      nextIndex: endIndex,
      previousIndex: path[lastPathIndex - 1] ?? endIndex,
      direction: resolveDirectionBetween(path[lastPathIndex - 1] ?? endIndex, endIndex, episode.raster.width),
      progress: 1,
      cue: 'reset',
      trailStart: 0,
      trailLimit: path.length,
      cycleComplete: false
    };
  }

  return {
    currentIndex: endIndex,
    nextIndex: endIndex,
    previousIndex: path[lastPathIndex - 1] ?? endIndex,
    direction: resolveDirectionBetween(path[lastPathIndex - 1] ?? endIndex, endIndex, episode.raster.width),
    progress: 1,
    cue: 'reset',
    trailStart: 0,
    trailLimit: path.length,
    cycleComplete: true
  };
};

const appendTrail = (trail: number[], nextIndex: number, maxLength: number): number[] => {
  const nextTrail = trail.slice(Math.max(0, trail.length - maxLength + 1));
  nextTrail.push(nextIndex);
  return nextTrail;
};

const appendTrailStep = (
  trail: DemoTrailStep[],
  nextIndex: number,
  mode: DemoTrailMode,
  maxLength: number
): DemoTrailStep[] => {
  const nextTrail = trail.slice(Math.max(0, trail.length - maxLength + 1));
  nextTrail.push({ index: nextIndex, mode });
  return nextTrail;
};
