import type {
  CortexSample,
  CortexSink,
  MazeEpisode,
  MazeCore,
  MazeMetrics,
  MazeSolveResult,
  PatternFrame,
  PatternEngineMode,
  Point
} from './types';
import {
  getAStarScratch,
  getNeighborIndex,
  isTileFloor,
  nextEpoch,
  reconstructPath,
  type AStarScratch,
  xFromIndex,
  yFromIndex
} from './grid';

const N = 1 << 0;
const E = 1 << 1;
const S = 1 << 2;
const W = 1 << 3;
const ALL_WALLS = N | E | S | W;
const EMPTY_UINT8 = new Uint8Array(0);
const EMPTY_UINT32 = new Uint32Array(0);

const DIRS = [
  { bit: N, dx: 0, dy: -1, opposite: S },
  { bit: E, dx: 1, dy: 0, opposite: W },
  { bit: S, dx: 0, dy: 1, opposite: N },
  { bit: W, dx: -1, dy: 0, opposite: E }
] as const;

interface CoreBuildOptions {
  width: number;
  height: number;
  seed: number;
  braidRatio: number;
  minSolutionLength: number;
  maxAttempts: number;
  rng: () => number;
}

interface CoreBuildResult {
  maze: MazeCore;
  solution: MazeSolveResult;
  metrics: MazeMetrics;
  shortcutsCreated: number;
  accepted: boolean;
}

interface MazeScratch {
  readonly inTree: Uint8Array;
  readonly walkNext: Int32Array;
  readonly walkStamp: Uint32Array;
  readonly queue: Int32Array;
  readonly distance: Int32Array;
  readonly seenEpoch: Uint32Array;
  walkEpoch: number;
  bfsEpoch: number;
}

const mazeScratchCache = new Map<number, MazeScratch>();
const solveScratchCache = new Map<number, AStarScratch>();

export const buildMazeCore = (options: CoreBuildOptions): CoreBuildResult => {
  const {
    width,
    height,
    seed,
    braidRatio,
    minSolutionLength,
    maxAttempts,
    rng
  } = options;

  let fallback: CoreBuildResult | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const maze = generateWilsonMaze(width, height, seed, braidRatio, rng);
    const shortestPath = solveAStar(maze, maze.start, maze.goal);
    if (!shortestPath.found) {
      continue;
    }

    const metrics = measureMaze(maze, shortestPath.pathIndices);
    const built = {
      maze,
      solution: shortestPath,
      metrics,
      shortcutsCreated: countOpeningsBeyondTree(maze),
      accepted: passesQualityGate(metrics, minSolutionLength)
    };

    if (!fallback) {
      fallback = built;
    }

    if (built.accepted) {
      return built;
    }
  }

  if (fallback) {
    return fallback;
  }

  const maze = generateWilsonMaze(width, height, seed, braidRatio, rng);
  const solution = solveAStar(maze, maze.start, maze.goal);
  return {
    maze,
    solution,
    metrics: measureMaze(maze, solution.pathIndices),
    shortcutsCreated: countOpeningsBeyondTree(maze),
    accepted: false
  };
};

export const solveAStar = (maze: MazeCore, start: Point, goal: Point): MazeSolveResult => {
  const startIdx = indexOf(maze.width, start.x, start.y);
  const goalIdx = indexOf(maze.width, goal.x, goal.y);
  const goalX = goal.x;
  const goalY = goal.y;
  const scratch = getSolveScratch(maze.cells.length);
  const epoch = nextEpoch(scratch, scratch.gScoreEpoch, scratch.closedEpoch);

  scratch.cameFrom[startIdx] = -1;
  scratch.gScore[startIdx] = 0;
  scratch.gScoreEpoch[startIdx] = epoch;
  scratch.heap.clear();
  scratch.heap.push(startIdx, 0, heuristicXY(start.x, start.y, goalX, goalY));

  let visited = 0;
  let expanded = 0;

  while (scratch.heap.pop()) {
    const currentIdx = scratch.heap.current;
    if (scratch.closedEpoch[currentIdx] === epoch) {
      continue;
    }

    scratch.closedEpoch[currentIdx] = epoch;
    visited += 1;

    if (currentIdx === goalIdx) {
      return {
        found: true,
        pathIndices: reconstructPath(scratch.cameFrom, currentIdx),
        visited,
        expanded,
        cost: scratch.gScore[currentIdx]
      };
    }

    expanded += 1;
    const currentG = scratch.gScore[currentIdx];
    const currentX = xFromIndex(currentIdx, maze.width);
    const currentY = yFromIndex(currentIdx, maze.width);
    const cell = maze.cells[currentIdx];

    for (let direction = 0; direction < DIRS.length; direction += 1) {
      const dir = DIRS[direction];
      if ((cell & dir.bit) !== 0) {
        continue;
      }

      const nextX = currentX + dir.dx;
      const nextY = currentY + dir.dy;
      if (!inBounds(nextX, nextY, maze.width, maze.height)) {
        continue;
      }

      const next = indexOf(maze.width, nextX, nextY);
      if (scratch.closedEpoch[next] === epoch) {
        continue;
      }

      const tentativeG = currentG + 1;
      const seenBefore = scratch.gScoreEpoch[next] === epoch;
      if (seenBefore && tentativeG >= scratch.gScore[next]) {
        continue;
      }

      scratch.cameFrom[next] = currentIdx;
      scratch.gScore[next] = tentativeG;
      scratch.gScoreEpoch[next] = epoch;
      scratch.heap.push(next, tentativeG, tentativeG + heuristicXY(nextX, nextY, goalX, goalY));
    }
  }

  return {
    found: false,
    pathIndices: EMPTY_UINT32,
    visited,
    expanded,
    cost: Number.POSITIVE_INFINITY
  };
};

export const measureMaze = (maze: MazeCore, pathIndices: ArrayLike<number>): MazeMetrics => {
  let deadEnds = 0;
  let junctions = 0;
  let straightSegments = 0;

  for (let index = 0; index < maze.cells.length; index += 1) {
    const degree = countOpenNeighbors(maze, index);
    if (degree === 1) {
      deadEnds += 1;
    } else if (degree >= 3) {
      junctions += 1;
    }
  }

  for (let index = 1; index < pathIndices.length - 1; index += 1) {
    const ab = pathIndices[index] - pathIndices[index - 1];
    const bc = pathIndices[index + 1] - pathIndices[index];
    const abx = ab % maze.width;
    const aby = Math.trunc(ab / maze.width);
    const bcx = bc % maze.width;
    const bcy = Math.trunc(bc / maze.width);
    if (abx === bcx && aby === bcy) {
      straightSegments += 1;
    }
  }

  return {
    solutionLength: pathIndices.length,
    deadEnds,
    junctions,
    straightness: pathIndices.length <= 2 ? 1 : straightSegments / Math.max(1, pathIndices.length - 2),
    coverage: pathIndices.length / Math.max(1, maze.cells.length)
  };
};

export const isPlayable = (episode: MazeEpisode): boolean => episode.raster.pathIndices.length > 0;

export const toCortexSample = (episode: MazeEpisode, solveFrames?: number[]): CortexSample => ({
  seed: episode.seed,
  metrics: { ...episode.metrics },
  solutionLength: episode.raster.pathIndices.length,
  turns: countTurns(episode.raster.pathIndices, episode.raster.width),
  branches: countSolutionBranches(episode),
  accepted: episode.accepted,
  ...(solveFrames ? { solveFrames: [...solveFrames] } : {})
});

export const disposeMazeEpisode = (episode?: MazeEpisode | null): void => {
  if (!episode) {
    return;
  }

  if (episode.core) {
    episode.core.cells = EMPTY_UINT8;
    episode.core = undefined;
  }
  episode.raster.tiles = EMPTY_UINT8;
  episode.raster.pathIndices = EMPTY_UINT32;
  episode.raster.width = 0;
  episode.raster.height = 0;
  episode.raster.scale = 0;
  episode.raster.startIndex = 0;
  episode.raster.endIndex = 0;
};

export class PatternEngine {
  private elapsed = 0;
  private current?: PatternFrame;
  private active = true;

  public constructor(
    private readonly makeMaze: () => MazeEpisode,
    private readonly mode: PatternEngineMode,
    private readonly cortex?: CortexSink
  ) {}

  public next(dtSeconds: number): PatternFrame {
    if (!this.current) {
      this.current = this.createFrame();
      return this.current;
    }

    if (!this.active) {
      return this.current;
    }

    this.elapsed += dtSeconds;
    if (this.shouldAdvance(this.current, this.elapsed)) {
      this.current = this.createFrame();
      return this.current;
    }

    this.current.t += dtSeconds;
    return this.current;
  }

  public suspend(): void {
    this.active = false;
    this.elapsed = 0;
  }

  public resumeFresh(): void {
    this.active = true;
    this.elapsed = 0;
    this.current = undefined;
  }

  public destroy(): void {
    this.active = false;
    this.elapsed = 0;
    if (!this.current) {
      return;
    }

    disposeMazeEpisode(this.current.episode);
    this.current = undefined;
  }

  private createFrame(): PatternFrame {
    const frame: PatternFrame = {
      mode: this.mode,
      episode: this.makeMaze(),
      t: 0
    };

    this.elapsed = 0;
    this.pushToCortex(frame);
    return frame;
  }

  private shouldAdvance(frame: PatternFrame, elapsed: number): boolean {
    const base = Math.max(4, frame.episode.raster.pathIndices.length * 0.06);
    switch (frame.mode) {
      case 'loading':
        return elapsed > Math.min(base, 3.5);
      case 'idle':
      case 'kiosk':
        return elapsed > base;
      case 'demo':
        return elapsed > resolveDemoFrameDuration(frame.episode);
      default:
        return false;
    }
  }

  private pushToCortex(frame: PatternFrame): void {
    if (!this.cortex) {
      return;
    }

    this.cortex.push(toCortexSample(frame.episode));
  }
}

export const manualIdleGate = (
  onIdle: () => void,
  onActive: () => void,
  idleMs = 20_000
): (() => void) => {
  let idle = false;
  let timer: number | undefined;

  const reset = (): void => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
    }

    if (idle) {
      idle = false;
      onActive();
    }

    timer = window.setTimeout(() => {
      idle = true;
      onIdle();
    }, idleMs);
  };

  const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'pointerdown'] as const;
  const handleVisibilityChange = (): void => {
    if (!document.hidden) {
      reset();
    }
  };

  for (const eventName of events) {
    window.addEventListener(eventName, reset, { passive: true });
  }
  document.addEventListener('visibilitychange', handleVisibilityChange);
  reset();

  return () => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
    }
    for (const eventName of events) {
      window.removeEventListener(eventName, reset);
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
};

const generateWilsonMaze = (
  width: number,
  height: number,
  seed: number,
  braidRatio: number,
  rng: () => number
): MazeCore => {
  const cellCount = width * height;
  const scratch = getMazeScratch(cellCount);
  const cells = new Uint8Array(cellCount);
  cells.fill(ALL_WALLS);

  const maze: MazeCore = {
    width,
    height,
    cells,
    start: { x: 0, y: 0 },
    goal: { x: width - 1, y: height - 1 },
    seed,
    braidRatio
  };

  scratch.inTree.fill(0);

  const root = randomInt(cellCount, rng);
  scratch.inTree[root] = 1;
  let unvisited = cellCount - 1;

  while (unvisited > 0) {
    let cursor = randomUnvisitedIndex(scratch.inTree, rng);
    const walkStart = cursor;
    const walkEpoch = bumpScratchEpoch(scratch, 'walkEpoch', scratch.walkStamp);

    while (scratch.inTree[cursor] === 0) {
      const next = randomNeighborIndex(cursor, width, height, rng);
      scratch.walkNext[cursor] = next;
      scratch.walkStamp[cursor] = walkEpoch;
      cursor = next;
    }

    cursor = walkStart;
    while (scratch.inTree[cursor] === 0) {
      const next = scratch.walkStamp[cursor] === walkEpoch ? scratch.walkNext[cursor] : -1;
      if (next < 0) {
        break;
      }
      carvePassage(maze, cursor, next);
      scratch.inTree[cursor] = 1;
      unvisited -= 1;
      cursor = next;
    }
  }

  if (braidRatio > 0) {
    braidMaze(maze, braidRatio, rng);
  }

  const farA = farthestReachable(maze, { x: 0, y: 0 }, scratch);
  const farB = farthestReachable(maze, farA.point, scratch);
  maze.start = farA.point;
  maze.goal = farB.point;
  return maze;
};

const braidMaze = (maze: MazeCore, ratio: number, rng: () => number): void => {
  const candidates: number[] = [];
  for (let index = 0; index < maze.cells.length; index += 1) {
    if (countOpenNeighbors(maze, index) === 1) {
      candidates.push(index);
    }
  }

  shuffleInPlace(candidates, rng);
  const target = Math.floor(candidates.length * clamp(ratio, 0, 1));
  let opened = 0;

  for (let cursor = 0; cursor < candidates.length && opened < target; cursor += 1) {
    const chosen = pickRandomClosedNeighbor(maze, candidates[cursor], rng);
    if (chosen === -1) {
      continue;
    }

    carvePassage(maze, candidates[cursor], chosen);
    opened += 1;
  }
};

const passesQualityGate = (metrics: MazeMetrics, minSolutionLength: number): boolean => (
  metrics.solutionLength >= minSolutionLength
  && metrics.straightness <= 0.82
  && metrics.coverage >= 0.18
);

const farthestReachable = (
  maze: MazeCore,
  start: Point,
  scratch: MazeScratch
): { point: Point; distance: number } => {
  const startIdx = indexOf(maze.width, start.x, start.y);
  const epoch = bumpScratchEpoch(scratch, 'bfsEpoch', scratch.seenEpoch);
  let head = 0;
  let tail = 0;
  let best = startIdx;

  scratch.queue[tail] = startIdx;
  tail += 1;
  scratch.seenEpoch[startIdx] = epoch;
  scratch.distance[startIdx] = 0;

  while (head < tail) {
    const current = scratch.queue[head];
    head += 1;

    if (scratch.distance[current] > scratch.distance[best]) {
      best = current;
    }

    const currentX = xFromIndex(current, maze.width);
    const currentY = yFromIndex(current, maze.width);
    const cell = maze.cells[current];
    for (let direction = 0; direction < DIRS.length; direction += 1) {
      const dir = DIRS[direction];
      if ((cell & dir.bit) !== 0) {
        continue;
      }

      const nextX = currentX + dir.dx;
      const nextY = currentY + dir.dy;
      if (!inBounds(nextX, nextY, maze.width, maze.height)) {
        continue;
      }

      const next = indexOf(maze.width, nextX, nextY);
      if (scratch.seenEpoch[next] === epoch) {
        continue;
      }

      scratch.seenEpoch[next] = epoch;
      scratch.distance[next] = scratch.distance[current] + 1;
      scratch.queue[tail] = next;
      tail += 1;
    }
  }

  return {
    point: {
      x: best % maze.width,
      y: Math.floor(best / maze.width)
    },
    distance: scratch.distance[best]
  };
};

const countOpeningsBeyondTree = (maze: MazeCore): number => {
  let passages = 0;
  for (let index = 0; index < maze.cells.length; index += 1) {
    passages += countOpenNeighbors(maze, index);
  }

  const undirectedEdges = passages / 2;
  return Math.max(0, undirectedEdges - (maze.cells.length - 1));
};

const countOpenNeighbors = (maze: MazeCore, idx: number): number => {
  const x = xFromIndex(idx, maze.width);
  const y = yFromIndex(idx, maze.width);
  const cell = maze.cells[idx];
  let count = 0;

  for (let direction = 0; direction < DIRS.length; direction += 1) {
    const dir = DIRS[direction];
    if ((cell & dir.bit) !== 0) {
      continue;
    }

    if (inBounds(x + dir.dx, y + dir.dy, maze.width, maze.height)) {
      count += 1;
    }
  }

  return count;
};

const pickRandomClosedNeighbor = (maze: MazeCore, idx: number, rng: () => number): number => {
  const x = xFromIndex(idx, maze.width);
  const y = yFromIndex(idx, maze.width);
  const cell = maze.cells[idx];
  let optionCount = 0;

  for (let direction = 0; direction < DIRS.length; direction += 1) {
    const dir = DIRS[direction];
    if ((cell & dir.bit) === 0) {
      continue;
    }
    if (inBounds(x + dir.dx, y + dir.dy, maze.width, maze.height)) {
      optionCount += 1;
    }
  }

  if (optionCount === 0) {
    return -1;
  }

  let pick = randomInt(optionCount, rng);
  for (let direction = 0; direction < DIRS.length; direction += 1) {
    const dir = DIRS[direction];
    if ((cell & dir.bit) === 0) {
      continue;
    }

    const nextX = x + dir.dx;
    const nextY = y + dir.dy;
    if (!inBounds(nextX, nextY, maze.width, maze.height)) {
      continue;
    }

    if (pick === 0) {
      return indexOf(maze.width, nextX, nextY);
    }
    pick -= 1;
  }

  return -1;
};

const carvePassage = (maze: MazeCore, a: number, b: number): void => {
  const ax = xFromIndex(a, maze.width);
  const ay = yFromIndex(a, maze.width);
  const bx = xFromIndex(b, maze.width);
  const by = yFromIndex(b, maze.width);
  const dx = bx - ax;
  const dy = by - ay;

  for (let direction = 0; direction < DIRS.length; direction += 1) {
    const dir = DIRS[direction];
    if (dir.dx !== dx || dir.dy !== dy) {
      continue;
    }

    maze.cells[a] &= ~dir.bit;
    maze.cells[b] &= ~dir.opposite;
    return;
  }

  throw new Error(`Cells ${a} and ${b} are not neighbors`);
};

const countTurns = (pathIndices: ArrayLike<number>, width: number): number => {
  let turns = 0;

  for (let index = 1; index < pathIndices.length - 1; index += 1) {
    const ab = pathIndices[index] - pathIndices[index - 1];
    const bc = pathIndices[index + 1] - pathIndices[index];
    if (ab % width !== bc % width || Math.trunc(ab / width) !== Math.trunc(bc / width)) {
      turns += 1;
    }
  }

  return turns;
};

const countSolutionBranches = (episode: MazeEpisode): number => {
  let branches = 0;

  for (let pathCursor = 0; pathCursor < episode.raster.pathIndices.length; pathCursor += 1) {
    const index = episode.raster.pathIndices[pathCursor];
    let degree = 0;

    for (let direction = 0; direction < 4; direction += 1) {
      const neighbor = getNeighborIndex(index, episode.raster.width, episode.raster.height, direction as 0 | 1 | 2 | 3);
      if (neighbor !== -1 && isTileFloor(episode.raster.tiles, neighbor)) {
        degree += 1;
      }
    }

    if (degree >= 3) {
      branches += 1;
    }
  }

  return branches;
};

const heuristicXY = (ax: number, ay: number, bx: number, by: number): number => Math.abs(ax - bx) + Math.abs(ay - by);

const indexOf = (width: number, x: number, y: number): number => (y * width) + x;

const randomInt = (maxExclusive: number, rng: () => number): number => Math.floor(rng() * maxExclusive);

const randomNeighborIndex = (idx: number, width: number, height: number, rng: () => number): number => {
  const x = xFromIndex(idx, width);
  const y = yFromIndex(idx, width);
  let optionCount = 0;

  for (let direction = 0; direction < DIRS.length; direction += 1) {
    const dir = DIRS[direction];
    if (inBounds(x + dir.dx, y + dir.dy, width, height)) {
      optionCount += 1;
    }
  }

  let pick = randomInt(optionCount, rng);
  for (let direction = 0; direction < DIRS.length; direction += 1) {
    const dir = DIRS[direction];
    const nextX = x + dir.dx;
    const nextY = y + dir.dy;
    if (!inBounds(nextX, nextY, width, height)) {
      continue;
    }

    if (pick === 0) {
      return indexOf(width, nextX, nextY);
    }
    pick -= 1;
  }

  return idx;
};

const randomUnvisitedIndex = (inTree: Uint8Array, rng: () => number): number => {
  const offset = randomInt(inTree.length, rng);

  for (let step = 0; step < inTree.length; step += 1) {
    const index = (offset + step) % inTree.length;
    if (inTree[index] === 0) {
      return index;
    }
  }

  return 0;
};

const inBounds = (x: number, y: number, width: number, height: number): boolean => (
  x >= 0 && y >= 0 && x < width && y < height
);

const shuffleInPlace = <T>(items: T[], rng: () => number): void => {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1, rng);
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const getCached = <T>(cache: Map<number, T>, size: number, create: () => T): T => {
  const cached = cache.get(size);
  if (cached) {
    return cached;
  }

  const next = create();
  cache.set(size, next);
  return next;
};

const getMazeScratch = (size: number): MazeScratch => getCached(mazeScratchCache, size, () => ({
    inTree: new Uint8Array(size),
    walkNext: new Int32Array(size),
    walkStamp: new Uint32Array(size),
    queue: new Int32Array(size),
    distance: new Int32Array(size),
    seenEpoch: new Uint32Array(size),
    walkEpoch: 0,
    bfsEpoch: 0
  }));

const getSolveScratch = (size: number): AStarScratch => getAStarScratch(solveScratchCache, size);

const bumpScratchEpoch = (
  scratch: MazeScratch,
  key: 'walkEpoch' | 'bfsEpoch',
  reset: Uint32Array
): number => {
  scratch[key] += 1;
  if (scratch[key] !== 0) {
    return scratch[key];
  }

  reset.fill(0);
  scratch[key] = 1;
  return 1;
};

const resolveDemoFrameDuration = (episode: MazeEpisode): number => {
  const difficultyLinger = episode.difficulty === 'chill'
    ? 0.48
    : episode.difficulty === 'standard'
      ? 0.34
      : episode.difficulty === 'spicy'
        ? 0.22
        : 0.14;
  return Math.max(4.4, 1.74 + difficultyLinger + (episode.raster.pathIndices.length * 0.104));
};
