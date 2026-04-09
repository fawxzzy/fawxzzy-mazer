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
  };
}

export interface DemoWalkerAdvance {
  state: DemoWalkerState;
  delayMs: number;
  shouldRegenerateMaze?: boolean;
  nextSeed?: number;
}

export type DemoWalkerPhase = 'explore' | 'anticipate' | 'backtrack' | 'goal-hold' | 'reset-hold';
type DemoWalkerResetReason = 'goal' | 'ai-reset' | null;
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
  resetReason: null,
  cue: 'spawn',
  queuedIndex: null,
  queuedMode: null,
  queuedDirection: null
});

const distanceToGoalSquared = (maze: MazeBuildResult, index: number): number => {
  const tile = maze.tiles[index];
  const goal = maze.tiles[maze.endIndex];
  const dx = goal.x - tile.x;
  const dy = goal.y - tile.y;
  return (dx * dx) + (dy * dy);
};

const resolveDirection = (maze: MazeBuildResult, fromIndex: number, toIndex: number): 0 | 1 | 2 | 3 => {
  const direction = maze.tiles[fromIndex].neighbors.findIndex((neighbor) => neighbor === toIndex);
  if (direction < 0 || direction > 3) {
    throw new Error(`Invalid demo walker transition: ${fromIndex} -> ${toIndex}`);
  }
  return direction as 0 | 1 | 2 | 3;
};

const appendTrailHistory = (
  trailSteps: DemoTrailStep[],
  nextIndex: number,
  currentIndex: number,
  mode: DemoTrailMode,
  maxLength: number
): DemoTrailStep[] => {
  const nextTrailSteps = trailSteps.slice();
  if (nextIndex === currentIndex) {
    return nextTrailSteps;
  }

  nextTrailSteps.push({ index: nextIndex, mode });
  if (nextTrailSteps.length > maxLength) {
    nextTrailSteps.splice(0, nextTrailSteps.length - maxLength);
  }
  return nextTrailSteps;
};

const appendTrailStep = (
  trailIndices: number[],
  nextIndex: number,
  currentIndex: number,
  maxLength: number
): number[] => {
  const nextTrailIndices = trailIndices.slice();
  if (nextIndex === currentIndex) {
    return nextTrailIndices;
  }

  nextTrailIndices.push(nextIndex);
  if (nextTrailIndices.length > maxLength) {
    nextTrailIndices.splice(0, nextTrailIndices.length - maxLength);
  }
  return nextTrailIndices;
};

const removeAllInPlace = (indices: number[], targetIndex: number): number[] => {
  for (let index = indices.length - 1; index >= 0; index -= 1) {
    if (indices[index] === targetIndex) {
      indices.splice(index, 1);
    }
  }

  return indices;
};

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
  for (const neighborIndex of maze.tiles[tileIndex].neighbors) {
    if (neighborIndex === -1 || !maze.tiles[neighborIndex].path) {
      continue;
    }

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
    resetReason: 'ai-reset',
    cue: 'reset',
    queuedIndex: null,
    queuedMode: null,
    queuedDirection: null
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
  resetReason: 'goal',
  cue: 'goal',
  queuedIndex: null,
  queuedMode: null,
  queuedDirection: null
});

const commitQueuedMove = (
  maze: MazeBuildResult,
  state: DemoWalkerState,
  config: DemoWalkerConfig
): DemoWalkerAdvance | null => {
  if (state.queuedIndex === null || state.queuedMode === null || state.queuedDirection === null) {
    return null;
  }

  const nextVisited = new Set(state.visited);
  nextVisited.add(state.queuedIndex);
  const reachedGoal = state.queuedIndex === maze.endIndex;

  return {
    state: {
      ...state,
      currentIndex: state.queuedIndex,
      trailIndices: appendTrailStep(
        state.trailIndices,
        state.queuedIndex,
        state.currentIndex,
        config.behavior.trailMaxLength
      ),
      trailSteps: appendTrailHistory(
        state.trailSteps,
        state.queuedIndex,
        state.currentIndex,
        reachedGoal ? 'goal' : state.queuedMode,
        config.behavior.trailMaxLength
      ),
      visited: nextVisited,
      reachedGoal,
      phase: reachedGoal ? 'goal-hold' : 'explore',
      stepsTaken: state.stepsTaken + 1,
      lastDirection: state.queuedDirection,
      potentialBranchIndices: removeAllInPlace([...state.potentialBranchIndices], state.queuedIndex),
      pathStackIndices: [...state.pathStackIndices, state.queuedIndex],
      targetIndex: null,
      backtrackUndoVisited: false,
      resetReason: null,
      cue: reachedGoal ? 'goal' : 'explore',
      queuedIndex: null,
      queuedMode: null,
      queuedDirection: null
    },
    delayMs: reachedGoal ? config.cadence.goalHoldMs : config.cadence.exploreStepMs
  };
};

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
        resetReason: null,
        cue: 'explore',
        queuedIndex: null,
        queuedMode: null,
        queuedDirection: null
      },
      delayMs: config.cadence.exploreStepMs
    };
  }

  if (state.phase === 'anticipate') {
    const queuedMove = commitQueuedMove(maze, state, config);
    if (queuedMove) {
      return queuedMove;
    }
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
            targetIndex,
            backtrackUndoVisited: false,
            cue: 'reacquire',
            queuedIndex: null,
            queuedMode: null,
            queuedDirection: null
          },
          delayMs: config.cadence.branchResumeMs
        };
      }
    }

    let backtrackUndoVisited = false;
    for (const neighborIndex of maze.tiles[nextIndex].neighbors) {
      if (neighborIndex === -1 || !maze.tiles[neighborIndex].path) {
        continue;
      }

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
        backtrackUndoVisited,
        cue: 'backtrack',
        queuedIndex: null,
        queuedMode: null,
        queuedDirection: null
      },
      delayMs: config.cadence.backtrackStepMs
    };
  }

  let nextIndex: number | null = null;
  let smallestDistance = Number.POSITIVE_INFINITY;
  const potentialBranchIndices = [...state.potentialBranchIndices];
  let validNeighborCount = 0;

  for (const neighborIndex of maze.tiles[state.currentIndex].neighbors) {
    if (neighborIndex === -1 || !maze.tiles[neighborIndex].path) {
      continue;
    }

    if (state.visited.has(neighborIndex)
      || !aiTilePathCheck(maze, state, neighborIndex, config.behavior.aiTilePathAdditionalPaths)) {
      continue;
    }

    validNeighborCount += 1;
    potentialBranchIndices.push(neighborIndex);

    const candidateDistance = distanceToGoalSquared(maze, neighborIndex);
    if (candidateDistance < smallestDistance) {
      smallestDistance = candidateDistance;
      nextIndex = neighborIndex;
    }
  }

  if (nextIndex !== null) {
    const nextDirection = resolveDirection(maze, state.currentIndex, nextIndex);
    const isTurnCommit = state.lastDirection !== null && nextDirection !== state.lastDirection;
    const isBranchCommit = validNeighborCount > 1;
    if (isTurnCommit || isBranchCommit) {
      return {
        state: {
          ...state,
          phase: 'anticipate',
          potentialBranchIndices: removeAllInPlace(potentialBranchIndices, nextIndex),
          targetIndex: nextIndex,
          cue: 'anticipate',
          queuedIndex: nextIndex,
          queuedMode: 'explore',
          queuedDirection: nextDirection
        },
        delayMs: isBranchCommit ? config.cadence.branchCommitMs : config.cadence.anticipationStepMs
      };
    }

    return {
      ...commitQueuedMove(maze, {
        ...state,
        potentialBranchIndices,
        queuedIndex: nextIndex,
        queuedMode: 'explore',
        queuedDirection: nextDirection
      }, config)!
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
        backtrackUndoVisited: false,
        cue: 'dead-end',
        queuedIndex: null,
        queuedMode: null,
        queuedDirection: null
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
      remainingPotentialBranches = removeAllInPlace(remainingPotentialBranches, candidateIndex);
    }
  }

  return {
    state: {
      ...state,
      phase: 'backtrack',
      stepsTaken: state.stepsTaken + 1,
      potentialBranchIndices: remainingPotentialBranches,
      targetIndex,
      backtrackUndoVisited: false,
      cue: 'dead-end',
      queuedIndex: null,
      queuedMode: null,
      queuedDirection: null
    },
    delayMs: config.cadence.decisionPauseMs
  };
};

export const stepDemoWalker = (
  maze: MazeBuildResult,
  state: DemoWalkerState,
  config: DemoWalkerConfig = defaultConfig
): DemoWalkerState => advanceDemoWalker(maze, state, config).state;
