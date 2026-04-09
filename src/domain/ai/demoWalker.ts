import type { MazeEpisode } from '../maze';

export interface DemoWalkerConfig {
  seed: number;
  cadence: {
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
    exploreStepMs: 104,
    backtrackStepMs: 76,
    decisionPauseMs: 228,
    anticipationStepMs: 84,
    branchCommitMs: 112,
    branchResumeMs: 148,
    goalHoldMs: 1180,
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
      lastDirection: resolveDirection(episode, state.currentIndex, nextIndex),
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

const resolveDirection = (
  episode: MazeEpisode,
  fromIndex: number,
  toIndex: number
): 0 | 1 | 2 | 3 | null => {
  if (fromIndex === toIndex) {
    return null;
  }

  const direction = episode.raster.tiles[fromIndex].neighbors.findIndex((neighbor) => neighbor === toIndex);
  if (direction < 0 || direction > 3) {
    return null;
  }
  return direction as 0 | 1 | 2 | 3;
};
