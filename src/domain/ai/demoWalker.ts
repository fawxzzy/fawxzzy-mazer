import type { MazeBuildResult } from '../maze';

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
  visited: Set<number>;
  loops: number;
  reachedGoal: boolean;
  phase: DemoWalkerPhase;
  stepsTaken: number;
  lastDirection: 0 | 1 | 2 | 3 | null;
  potentialBranchIndices: number[];
  pathStackIndices: number[];
  targetIndex: number | null;
  backtrackUndoVisited: boolean;
  logicSwitch: boolean;
  resetReason: DemoWalkerResetReason;
  cue: DemoWalkerCue;
  queuedIndex: number | null;
  queuedMode: DemoTrailMode | null;
  queuedDirection: 0 | 1 | 2 | 3 | null;
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

export const createDemoWalkerState = (maze: MazeBuildResult): DemoWalkerState => ({
  currentIndex: maze.startIndex,
  trailIndices: [maze.startIndex],
  trailSteps: [{ index: maze.startIndex, mode: 'explore' }],
  visited: new Set<number>([maze.startIndex]),
  loops: 0,
  reachedGoal: false,
  phase: 'explore',
  stepsTaken: 0,
  lastDirection: null,
  potentialBranchIndices: [],
  pathStackIndices: [],
  targetIndex: null,
  backtrackUndoVisited: false,
  logicSwitch: false,
  resetReason: null,
  cue: 'spawn',
  queuedIndex: null,
  queuedMode: null,
  queuedDirection: null,
  pathCursor: 0
});

export const advanceDemoWalker = (
  maze: MazeBuildResult,
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
        ...createDemoWalkerState(maze),
        loops: state.loops + 1
      },
      delayMs: config.cadence.exploreStepMs,
      shouldRegenerateMaze: true,
      nextSeed: config.seed + ((state.loops + 1) * config.behavior.regenerateSeedStep)
    };
  }

  const nextCursor = Math.min(state.pathCursor + 1, maze.pathIndices.length - 1);
  const nextIndex = maze.pathIndices[nextCursor];
  const lastDirection = resolveDirection(maze, state.currentIndex, nextIndex);
  const reachedGoal = nextIndex === maze.endIndex;
  const trailMode: DemoTrailMode = reachedGoal ? 'goal' : 'explore';

  return {
    state: {
      ...state,
      currentIndex: nextIndex,
      trailIndices: appendTrail(state.trailIndices, nextIndex, config.behavior.trailMaxLength),
      trailSteps: appendTrailSteps(state.trailSteps, nextIndex, trailMode, config.behavior.trailMaxLength),
      visited: new Set(state.visited).add(nextIndex),
      reachedGoal,
      phase: reachedGoal ? 'goal-hold' : 'explore',
      stepsTaken: state.stepsTaken + 1,
      lastDirection,
      cue: reachedGoal ? 'goal' : 'explore',
      pathCursor: nextCursor
    },
    delayMs: reachedGoal ? config.cadence.goalHoldMs : config.cadence.exploreStepMs
  };
};

export const stepDemoWalker = (
  maze: MazeBuildResult,
  state: DemoWalkerState,
  config: DemoWalkerConfig = defaultConfig
): DemoWalkerState => advanceDemoWalker(maze, state, config).state;

const appendTrail = (trail: number[], nextIndex: number, maxLength: number): number[] => {
  const nextTrail = [...trail, nextIndex];
  if (nextTrail.length > maxLength) {
    nextTrail.splice(0, nextTrail.length - maxLength);
  }
  return nextTrail;
};

const appendTrailSteps = (
  trail: DemoTrailStep[],
  nextIndex: number,
  mode: DemoTrailMode,
  maxLength: number
): DemoTrailStep[] => {
  const nextTrail = [...trail, { index: nextIndex, mode }];
  if (nextTrail.length > maxLength) {
    nextTrail.splice(0, nextTrail.length - maxLength);
  }
  return nextTrail;
};

const resolveDirection = (
  maze: MazeBuildResult,
  fromIndex: number,
  toIndex: number
): 0 | 1 | 2 | 3 | null => {
  if (fromIndex === toIndex) {
    return null;
  }

  const direction = maze.tiles[fromIndex].neighbors.findIndex((neighbor) => neighbor === toIndex);
  if (direction < 0 || direction > 3) {
    return null;
  }
  return direction as 0 | 1 | 2 | 3;
};
