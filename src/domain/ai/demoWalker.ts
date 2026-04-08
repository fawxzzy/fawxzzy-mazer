import type { MazeBuildResult } from '../maze';

export interface DemoWalkerConfig {
  seed: number;
  cadence: {
    exploreStepMs: number;
    backtrackStepMs: number;
    decisionPauseMs: number;
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
  };
}

export interface DemoWalkerAdvance {
  state: DemoWalkerState;
  delayMs: number;
  shouldRegenerateMaze?: boolean;
  nextSeed?: number;
}

export type DemoWalkerPhase = 'explore' | 'backtrack' | 'goal-hold' | 'reset-hold';
type DemoWalkerResetReason = 'goal' | 'ai-reset' | null;
export type DemoTrailMode = 'explore' | 'backtrack' | 'goal';

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
}

const defaultConfig: DemoWalkerConfig = {
  seed: 1988,
  cadence: {
    exploreStepMs: 92,
    backtrackStepMs: 60,
    decisionPauseMs: 124,
    branchResumeMs: 86,
    goalHoldMs: 960,
    resetHoldMs: 420
  },
  behavior: {
    trailMaxLength: 44,
    aiTilePathAdditionalPaths: 0,
    preserveVisitedOnAiReset: true,
    emulateLogicSwitchPotentialCheckBug: true,
    regenerateSeedStep: 1
  }
};

export const createDemoWalkerState = (maze: MazeBuildResult): DemoWalkerState => ({
  currentIndex: maze.startIndex,
  trailIndices: [maze.startIndex],
  trailSteps: [{ index: maze.startIndex, mode: 'explore' }],
  visited: new Set<number>(),
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
  resetReason: null
});

const distanceToGoal = (maze: MazeBuildResult, index: number): number => {
  const tile = maze.tiles[index];
  const goal = maze.tiles[maze.endIndex];
  return Math.hypot(goal.x - tile.x, goal.y - tile.y);
};

const getPathNeighbors = (maze: MazeBuildResult, fromIndex: number): number[] => maze.tiles[fromIndex].neighbors
  .filter((neighborIndex) => neighborIndex !== -1 && maze.tiles[neighborIndex].path) as number[];

const resolveDirection = (maze: MazeBuildResult, fromIndex: number, toIndex: number): 0 | 1 | 2 | 3 => {
  const direction = maze.tiles[fromIndex].neighbors.findIndex((neighbor) => neighbor === toIndex);
  if (direction < 0 || direction > 3) {
    throw new Error(`Invalid demo walker transition: ${fromIndex} -> ${toIndex}`);
  }
  return direction as 0 | 1 | 2 | 3;
};

const boundTrail = <T>(values: T[], maxLength: number): T[] => (
  values.length <= maxLength ? values : values.slice(values.length - maxLength)
);

const appendTrailHistory = (
  trailSteps: DemoTrailStep[],
  nextIndex: number,
  currentIndex: number,
  mode: DemoTrailMode,
  maxLength: number
): DemoTrailStep[] => {
  if (nextIndex === currentIndex) {
    return boundTrail([...trailSteps], maxLength);
  }

  return boundTrail([...trailSteps, { index: nextIndex, mode }], maxLength);
};

const appendTrailStep = (
  trailIndices: number[],
  nextIndex: number,
  currentIndex: number,
  maxLength: number
): number[] => {
  if (nextIndex === currentIndex) {
    return boundTrail([...trailIndices], maxLength);
  }

  return boundTrail([...trailIndices, nextIndex], maxLength);
};

const removeAll = (indices: number[], targetIndex: number): number[] => indices.filter((index) => index !== targetIndex);

const createMazeResetFallbackState = (maze: MazeBuildResult, loops: number): DemoWalkerState => ({
  ...createDemoWalkerState(maze),
  loops
});

const aiTilePathCheck = (
  maze: MazeBuildResult,
  state: DemoWalkerState,
  tileIndex: number | null,
  additionalPaths: number
): boolean => {
  if (tileIndex === null) {
    return false;
  }

  if (tileIndex === maze.endIndex) {
    return true;
  }

  let validNeighborCount = additionalPaths;
  for (const neighborIndex of getPathNeighbors(maze, tileIndex)) {
    if (neighborIndex !== state.currentIndex && !state.visited.has(neighborIndex)) {
      validNeighborCount += 1;
    }
  }

  return validNeighborCount > additionalPaths;
};

const applyAiReset = (
  maze: MazeBuildResult,
  state: DemoWalkerState,
  config: DemoWalkerConfig
): DemoWalkerState => {
  const nextVisited = new Set(state.visited);
  if (config.behavior.preserveVisitedOnAiReset) {
    nextVisited.delete(state.currentIndex);
    nextVisited.add(maze.startIndex);
  } else {
    nextVisited.clear();
  }

  return {
    ...state,
    currentIndex: maze.startIndex,
    trailIndices: [maze.startIndex],
    trailSteps: [{ index: maze.startIndex, mode: 'explore' }],
    visited: nextVisited,
    loops: state.loops + 1,
    reachedGoal: false,
    phase: 'reset-hold',
    stepsTaken: state.stepsTaken + 1,
    lastDirection: null,
    potentialBranchIndices: [],
    pathStackIndices: [],
    targetIndex: null,
    backtrackUndoVisited: false,
    logicSwitch: !state.logicSwitch,
    resetReason: 'ai-reset'
  };
};

const createGoalResetState = (maze: MazeBuildResult, state: DemoWalkerState): DemoWalkerState => ({
  ...state,
  currentIndex: maze.endIndex,
  loops: state.loops + 1,
  reachedGoal: false,
  phase: 'reset-hold',
  stepsTaken: state.stepsTaken + 1,
  potentialBranchIndices: [],
  pathStackIndices: [],
  targetIndex: null,
  backtrackUndoVisited: false,
  logicSwitch: false,
  resetReason: 'goal'
});

export const advanceDemoWalker = (
  maze: MazeBuildResult,
  state: DemoWalkerState,
  config: DemoWalkerConfig = defaultConfig
): DemoWalkerAdvance => {
  if (state.phase === 'goal-hold' && state.reachedGoal) {
    return {
      state: createGoalResetState(maze, state),
      delayMs: config.cadence.resetHoldMs
    };
  }

  if (state.phase === 'reset-hold') {
    if (state.resetReason === 'goal') {
      return {
        state: createMazeResetFallbackState(maze, state.loops),
        delayMs: config.cadence.exploreStepMs,
        shouldRegenerateMaze: true,
        nextSeed: config.seed + (state.loops * config.behavior.regenerateSeedStep)
      };
    }

    return {
      state: {
        ...state,
        phase: 'explore',
        reachedGoal: false,
        stepsTaken: state.stepsTaken + 1,
        resetReason: null
      },
      delayMs: config.cadence.exploreStepMs
    };
  }

  if (state.phase === 'backtrack') {
    const targetIndex = state.targetIndex ?? maze.startIndex;

    if (state.pathStackIndices.length === 0) {
      return {
        state: applyAiReset(maze, state, config),
        delayMs: config.cadence.resetHoldMs
      };
    }

    const nextIndex = state.pathStackIndices[state.pathStackIndices.length - 1];

    for (const neighborIndex of maze.tiles[nextIndex].neighbors) {
      if (neighborIndex === targetIndex) {
        const nextVisited = new Set(state.visited);
        nextVisited.add(nextIndex);

        return {
          state: {
            ...state,
            currentIndex: nextIndex,
            trailIndices: appendTrailStep(state.trailIndices, nextIndex, state.currentIndex, config.behavior.trailMaxLength),
            trailSteps: appendTrailHistory(
              state.trailSteps,
              nextIndex,
              state.currentIndex,
              'backtrack',
              config.behavior.trailMaxLength
            ),
            visited: nextVisited,
            phase: 'explore',
            stepsTaken: state.stepsTaken + 1,
            lastDirection: nextIndex === state.currentIndex
              ? state.lastDirection
              : resolveDirection(maze, state.currentIndex, nextIndex),
            targetIndex: null,
            backtrackUndoVisited: false
          },
          delayMs: config.cadence.branchResumeMs
        };
      }
    }

    let backtrackUndoVisited = false;
    for (const neighborIndex of getPathNeighbors(maze, nextIndex)) {
      if (state.potentialBranchIndices.includes(neighborIndex)
        && aiTilePathCheck(maze, state, neighborIndex, config.behavior.aiTilePathAdditionalPaths)) {
        backtrackUndoVisited = true;
        break;
      }
    }

    const nextVisited = new Set(state.visited);
    nextVisited.add(nextIndex);
    if (backtrackUndoVisited) {
      nextVisited.delete(nextIndex);
    }

    return {
      state: {
        ...state,
        currentIndex: nextIndex,
        trailIndices: appendTrailStep(state.trailIndices, nextIndex, state.currentIndex, config.behavior.trailMaxLength),
        trailSteps: appendTrailHistory(
          state.trailSteps,
          nextIndex,
          state.currentIndex,
          'backtrack',
          config.behavior.trailMaxLength
        ),
        visited: nextVisited,
        phase: 'backtrack',
        stepsTaken: state.stepsTaken + 1,
        lastDirection: nextIndex === state.currentIndex
          ? state.lastDirection
          : resolveDirection(maze, state.currentIndex, nextIndex),
        pathStackIndices: state.pathStackIndices.slice(0, -1),
        backtrackUndoVisited
      },
      delayMs: config.cadence.backtrackStepMs
    };
  }

  let nextIndex: number | null = null;
  let smallestDistance = Number.POSITIVE_INFINITY;
  const potentialBranchIndices = [...state.potentialBranchIndices];

  for (const neighborIndex of getPathNeighbors(maze, state.currentIndex)) {
    if (state.visited.has(neighborIndex)
      || !aiTilePathCheck(maze, state, neighborIndex, config.behavior.aiTilePathAdditionalPaths)) {
      continue;
    }

    potentialBranchIndices.push(neighborIndex);

    const candidateDistance = distanceToGoal(maze, neighborIndex);
    if (candidateDistance < smallestDistance) {
      smallestDistance = candidateDistance;
      nextIndex = neighborIndex;
    }
  }

  if (nextIndex !== null) {
    const nextVisited = new Set(state.visited);
    nextVisited.add(nextIndex);
    const reachedGoal = nextIndex === maze.endIndex;

    return {
      state: {
        ...state,
        currentIndex: nextIndex,
        trailIndices: appendTrailStep(state.trailIndices, nextIndex, state.currentIndex, config.behavior.trailMaxLength),
        trailSteps: appendTrailHistory(
          state.trailSteps,
          nextIndex,
          state.currentIndex,
          reachedGoal ? 'goal' : 'explore',
          config.behavior.trailMaxLength
        ),
        visited: nextVisited,
        reachedGoal,
        phase: reachedGoal ? 'goal-hold' : 'explore',
        stepsTaken: state.stepsTaken + 1,
        lastDirection: resolveDirection(maze, state.currentIndex, nextIndex),
        potentialBranchIndices: removeAll(potentialBranchIndices, nextIndex),
        pathStackIndices: [...state.pathStackIndices, nextIndex],
        targetIndex: null,
        backtrackUndoVisited: false,
        resetReason: null
      },
      delayMs: reachedGoal ? config.cadence.goalHoldMs : config.cadence.exploreStepMs
    };
  }

  if (config.behavior.emulateLogicSwitchPotentialCheckBug && state.logicSwitch) {
    return {
      state: {
        ...state,
        phase: 'backtrack',
        stepsTaken: state.stepsTaken + 1,
        potentialBranchIndices: [],
        targetIndex: null,
        backtrackUndoVisited: false
      },
      delayMs: config.cadence.decisionPauseMs
    };
  }

  let targetIndex: number | null = null;
  let remainingPotentialBranches = [...potentialBranchIndices];

  while (targetIndex === null && remainingPotentialBranches.length > 0) {
    const candidateIndex = remainingPotentialBranches[remainingPotentialBranches.length - 1];
    remainingPotentialBranches = remainingPotentialBranches.slice(0, -1);

    if (aiTilePathCheck(maze, state, candidateIndex, config.behavior.aiTilePathAdditionalPaths)) {
      targetIndex = candidateIndex;
      remainingPotentialBranches = removeAll(remainingPotentialBranches, candidateIndex);
    }
  }

  return {
    state: {
      ...state,
      phase: 'backtrack',
      stepsTaken: state.stepsTaken + 1,
      potentialBranchIndices: remainingPotentialBranches,
      targetIndex,
      backtrackUndoVisited: false
    },
    delayMs: config.cadence.decisionPauseMs
  };
};

export const stepDemoWalker = (
  maze: MazeBuildResult,
  state: DemoWalkerState,
  config: DemoWalkerConfig = defaultConfig
): DemoWalkerState => advanceDemoWalker(maze, state, config).state;
