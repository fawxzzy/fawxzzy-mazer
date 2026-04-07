import type { MazeBuildResult } from '../maze';

export interface DemoWalkerConfig {
  seed: number;
  cadence: {
    exploreStepMs: number;
    backtrackStepMs: number;
    goalHoldMs: number;
    resetHoldMs: number;
  };
  behavior: {
    trailMaxLength: number;
    goalBias: number;
    branchBias: number;
    forwardBias: number;
    jitter: number;
  };
}

export interface DemoWalkerAdvance {
  state: DemoWalkerState;
  delayMs: number;
}

export type DemoWalkerPhase = 'explore' | 'backtrack' | 'goal-hold' | 'reset-hold';

interface BranchDecision {
  fromTrailLength: number;
  options: number[];
}

export interface DemoWalkerState {
  currentIndex: number;
  trailIndices: number[];
  visited: Set<number>;
  loops: number;
  reachedGoal: boolean;
  phase: DemoWalkerPhase;
  stepsTaken: number;
  lastDirection: 0 | 1 | 2 | 3 | null;
  branchStack: BranchDecision[];
  backtrackTargetTrailLength: number | null;
  pendingBranchIndex: number | null;
}

interface Candidate {
  index: number;
  score: number;
  direction: 0 | 1 | 2 | 3;
}

const defaultConfig: DemoWalkerConfig = {
  seed: 1988,
  cadence: {
    exploreStepMs: 78,
    backtrackStepMs: 52,
    goalHoldMs: 720,
    resetHoldMs: 360
  },
  behavior: {
    trailMaxLength: 36,
    goalBias: 0.34,
    branchBias: 0.88,
    forwardBias: 0.28,
    jitter: 0.22
  }
};

export const createDemoWalkerState = (maze: MazeBuildResult): DemoWalkerState => ({
  currentIndex: maze.startIndex,
  trailIndices: [maze.startIndex],
  visited: new Set([maze.startIndex]),
  loops: 0,
  reachedGoal: false,
  phase: 'explore',
  stepsTaken: 0,
  lastDirection: null,
  branchStack: [],
  backtrackTargetTrailLength: null,
  pendingBranchIndex: null
});

const manhattanDistanceToGoal = (maze: MazeBuildResult, index: number): number => {
  const tile = maze.tiles[index];
  const goal = maze.tiles[maze.endIndex];
  return Math.abs(goal.x - tile.x) + Math.abs(goal.y - tile.y);
};

const getWalkableNeighbors = (maze: MazeBuildResult, fromIndex: number): number[] => maze.tiles[fromIndex].neighbors
  .filter((neighborIndex) => neighborIndex !== -1 && maze.tiles[neighborIndex].floor) as number[];

const resolveDirection = (maze: MazeBuildResult, fromIndex: number, toIndex: number): 0 | 1 | 2 | 3 => {
  const direction = maze.tiles[fromIndex].neighbors.findIndex((neighbor) => neighbor === toIndex);
  if (direction < 0 || direction > 3) {
    throw new Error(`Invalid demo walker transition: ${fromIndex} -> ${toIndex}`);
  }
  return direction as 0 | 1 | 2 | 3;
};

const hashNoise = (seed: number, step: number, fromIndex: number, toIndex: number): number => {
  let value = seed ^ Math.imul(step + 1, 0x45d9f3b) ^ Math.imul(fromIndex + 11, 0x27d4eb2d) ^ Math.imul(toIndex + 17, 0x165667b1);
  value = Math.imul(value ^ (value >>> 15), 0x2c1b3c6d);
  value ^= value + Math.imul(value ^ (value >>> 7), 0x297a2d39);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967295;
};

const countUnseenWalkableNeighbors = (
  maze: MazeBuildResult,
  fromIndex: number,
  visited: Set<number>,
  excludeIndex: number
): number => getWalkableNeighbors(maze, fromIndex)
  .filter((neighborIndex) => neighborIndex !== excludeIndex && !visited.has(neighborIndex))
  .length;

const scoreCandidates = (
  maze: MazeBuildResult,
  state: DemoWalkerState,
  neighbors: number[],
  config: DemoWalkerConfig
): Candidate[] => {
  const currentDistance = manhattanDistanceToGoal(maze, state.currentIndex);

  return neighbors
    .map((index) => {
      const direction = resolveDirection(maze, state.currentIndex, index);
      const nextDistance = manhattanDistanceToGoal(maze, index);
      const progress = currentDistance - nextDistance;
      const unseenAhead = countUnseenWalkableNeighbors(maze, index, state.visited, state.currentIndex);
      const forwardBias = state.lastDirection === direction ? config.behavior.forwardBias : 0;
      const jitter = (hashNoise(config.seed, state.stepsTaken, state.currentIndex, index) - 0.5) * config.behavior.jitter;

      return {
        index,
        direction,
        score: (progress * config.behavior.goalBias)
          + (unseenAhead * config.behavior.branchBias)
          + forwardBias
          + jitter
      };
    })
    .sort((a, b) => b.score - a.score);
};

const createResetState = (maze: MazeBuildResult, state: DemoWalkerState): DemoWalkerState => ({
  currentIndex: maze.startIndex,
  trailIndices: [maze.startIndex],
  visited: new Set([maze.startIndex]),
  loops: state.loops + 1,
  reachedGoal: false,
  phase: 'reset-hold',
  stepsTaken: state.stepsTaken + 1,
  lastDirection: null,
  branchStack: [],
  backtrackTargetTrailLength: null,
  pendingBranchIndex: null
});

const resolveNextBacktrack = (state: DemoWalkerState): DemoWalkerState => {
  const branchStack = state.branchStack.map((entry) => ({
    fromTrailLength: entry.fromTrailLength,
    options: [...entry.options]
  }));

  while (branchStack.length > 0) {
    const candidateEntry = branchStack[branchStack.length - 1];
    const nextIndex = candidateEntry.options.shift();

    if (candidateEntry.options.length === 0) {
      branchStack.pop();
    }

    if (nextIndex === undefined || state.visited.has(nextIndex)) {
      continue;
    }

    return {
      ...state,
      phase: 'backtrack',
      branchStack,
      backtrackTargetTrailLength: candidateEntry.fromTrailLength,
      pendingBranchIndex: nextIndex,
      stepsTaken: state.stepsTaken + 1
    };
  }

  return {
    ...state,
    phase: 'goal-hold',
    reachedGoal: false,
    branchStack: [],
    backtrackTargetTrailLength: null,
    pendingBranchIndex: null,
    stepsTaken: state.stepsTaken + 1
  };
};

export const advanceDemoWalker = (
  maze: MazeBuildResult,
  state: DemoWalkerState,
  config: DemoWalkerConfig = defaultConfig
): DemoWalkerAdvance => {
  if (state.phase === 'goal-hold' && state.reachedGoal) {
    return {
      state: createResetState(maze, state),
      delayMs: config.cadence.resetHoldMs
    };
  }

  if (state.phase === 'reset-hold') {
    return {
      state: {
        ...state,
        phase: 'explore',
        stepsTaken: state.stepsTaken + 1
      },
      delayMs: config.cadence.exploreStepMs
    };
  }

  if (state.phase === 'backtrack') {
    if (state.trailIndices.length > (state.backtrackTargetTrailLength ?? 1)) {
      const nextTrail = state.trailIndices.slice(0, -1);
      return {
        state: {
          ...state,
          currentIndex: nextTrail[nextTrail.length - 1],
          trailIndices: nextTrail,
          stepsTaken: state.stepsTaken + 1
        },
        delayMs: config.cadence.backtrackStepMs
      };
    }

    if (state.pendingBranchIndex === null || state.visited.has(state.pendingBranchIndex)) {
      return {
        state: resolveNextBacktrack({
          ...state,
          phase: 'explore',
          backtrackTargetTrailLength: null,
          pendingBranchIndex: null
        }),
        delayMs: config.cadence.backtrackStepMs
      };
    }

    const nextVisited = new Set(state.visited);
    nextVisited.add(state.pendingBranchIndex);
    const nextTrail = [...state.trailIndices, state.pendingBranchIndex];
    const direction = resolveDirection(maze, state.currentIndex, state.pendingBranchIndex);
    const reachedGoal = state.pendingBranchIndex === maze.endIndex;

    return {
      state: {
        ...state,
        currentIndex: state.pendingBranchIndex,
        trailIndices: nextTrail,
        visited: nextVisited,
        reachedGoal,
        phase: reachedGoal ? 'goal-hold' : 'explore',
        lastDirection: direction,
        backtrackTargetTrailLength: null,
        pendingBranchIndex: null,
        stepsTaken: state.stepsTaken + 1
      },
      delayMs: reachedGoal ? config.cadence.goalHoldMs : config.cadence.exploreStepMs
    };
  }

  const neighbors = getWalkableNeighbors(maze, state.currentIndex);
  const unseenNeighbors = neighbors.filter((index) => !state.visited.has(index));

  if (unseenNeighbors.length > 0) {
    const scored = scoreCandidates(maze, state, unseenNeighbors, config);
    const [best, ...rest] = scored;
    const branchStack = rest.length > 0
      ? [
        ...state.branchStack,
        {
          fromTrailLength: state.trailIndices.length,
          options: rest.map((item) => item.index)
        }
      ]
      : state.branchStack.map((entry) => ({
        fromTrailLength: entry.fromTrailLength,
        options: [...entry.options]
      }));
    const nextTrail = [...state.trailIndices, best.index];
    const nextVisited = new Set(state.visited);
    nextVisited.add(best.index);
    const reachedGoal = best.index === maze.endIndex;

    return {
      state: {
        ...state,
        currentIndex: best.index,
        trailIndices: nextTrail,
        visited: nextVisited,
        reachedGoal,
        phase: reachedGoal ? 'goal-hold' : 'explore',
        stepsTaken: state.stepsTaken + 1,
        lastDirection: best.direction,
        branchStack
      },
      delayMs: reachedGoal ? config.cadence.goalHoldMs : config.cadence.exploreStepMs
    };
  }

  const nextState = resolveNextBacktrack(state);
  return {
    state: nextState.phase === 'goal-hold' && !nextState.reachedGoal
      ? createResetState(maze, nextState)
      : nextState,
    delayMs: nextState.phase === 'goal-hold' && !nextState.reachedGoal
      ? config.cadence.resetHoldMs
      : config.cadence.backtrackStepMs
  };
};

export const stepDemoWalker = (
  maze: MazeBuildResult,
  state: DemoWalkerState,
  config: DemoWalkerConfig = defaultConfig
): DemoWalkerState => advanceDemoWalker(maze, state, config).state;
