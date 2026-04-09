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
import { pointFromIndex } from './grid';

const N = 1 << 0;
const E = 1 << 1;
const S = 1 << 2;
const W = 1 << 3;
const ALL_WALLS = N | E | S | W;

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
  readonly queue: Int32Array;
  readonly distance: Int32Array;
  readonly seen: Uint8Array;
}

interface SolveScratch {
  readonly cameFrom: Int32Array;
  readonly gScore: Float64Array;
  readonly closed: Uint8Array;
  readonly heap: MinHeap<{ idx: number; f: number; g: number }>;
}

const mazeScratchCache = new Map<number, MazeScratch>();
const solveScratchCache = new Map<number, SolveScratch>();

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

    const metrics = measureMaze(maze, shortestPath.path);
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
    metrics: measureMaze(maze, solution.path),
    shortcutsCreated: countOpeningsBeyondTree(maze),
    accepted: false
  };
};

export const solveAStar = (maze: MazeCore, start: Point, goal: Point): MazeSolveResult => {
  const startIdx = indexOf(maze.width, start.x, start.y);
  const goalIdx = indexOf(maze.width, goal.x, goal.y);
  const scratch = getSolveScratch(maze.cells.length);
  const { cameFrom, gScore, closed, heap } = scratch;

  cameFrom.fill(-1);
  gScore.fill(Number.POSITIVE_INFINITY);
  closed.fill(0);
  heap.clear();

  let visited = 0;
  let expanded = 0;

  gScore[startIdx] = 0;
  heap.push({ idx: startIdx, g: 0, f: heuristic(start, goal) });

  while (heap.size > 0) {
    const current = heap.pop();
    if (!current || closed[current.idx] === 1) {
      continue;
    }

    closed[current.idx] = 1;
    visited += 1;

    if (current.idx === goalIdx) {
      return {
        found: true,
        path: reconstructPath(cameFrom, current.idx, maze.width),
        visited,
        expanded,
        cost: gScore[current.idx]
      };
    }

    expanded += 1;
    visitOpenNeighbors(maze, current.idx, (next) => {
      if (closed[next] === 1) {
        return;
      }

      const tentativeG = gScore[current.idx] + 1;
      if (tentativeG >= gScore[next]) {
        return;
      }

      cameFrom[next] = current.idx;
      gScore[next] = tentativeG;
      heap.push({
        idx: next,
        g: tentativeG,
        f: tentativeG + heuristic(pointFromIndex(next, maze.width), goal)
      });
    });
  }

  return {
    found: false,
    path: [],
    visited,
    expanded,
    cost: Number.POSITIVE_INFINITY
  };
};

export const measureMaze = (maze: MazeCore, path: Point[]): MazeMetrics => {
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

  for (let index = 1; index < path.length - 1; index += 1) {
    const a = path[index - 1];
    const b = path[index];
    const c = path[index + 1];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const bcx = c.x - b.x;
    const bcy = c.y - b.y;
    if (abx === bcx && aby === bcy) {
      straightSegments += 1;
    }
  }

  return {
    solutionLength: path.length,
    deadEnds,
    junctions,
    straightness: path.length <= 2 ? 1 : straightSegments / Math.max(1, path.length - 2),
    coverage: path.length / Math.max(1, maze.cells.length)
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

  episode.core?.cells.splice(0, episode.core.cells.length);
  episode.core = undefined;
  episode.raster.tiles.length = 0;
  episode.raster.pathIndices.length = 0;
  episode.raster.width = 0;
  episode.raster.height = 0;
  episode.raster.scale = 0;
  episode.raster.startIndex = 0;
  episode.raster.endIndex = 0;
  episode.raster.playableWidth = 0;
  episode.raster.playableHeight = 0;
  episode.raster.padding.top = 0;
  episode.raster.padding.right = 0;
  episode.raster.padding.bottom = 0;
  episode.raster.padding.left = 0;
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
        return elapsed > base * 1.15;
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
  const { inTree, walkNext } = scratch;
  const cells = Array.from({ length: cellCount }, () => ({ walls: ALL_WALLS }));
  const maze: MazeCore = {
    width,
    height,
    cells,
    start: { x: 0, y: 0 },
    goal: { x: width - 1, y: height - 1 },
    seed,
    braidRatio
  };

  inTree.fill(0);
  walkNext.fill(-1);

  const root = randomInt(cellCount, rng);
  inTree[root] = 1;
  let unvisited = cellCount - 1;

  while (unvisited > 0) {
    let cursor = randomUnvisitedIndex(inTree, rng);
    const walkStart = cursor;

    while (inTree[cursor] === 0) {
      const next = randomNeighborIndex(cursor, width, height, rng);
      walkNext[cursor] = next;
      cursor = next;
    }

    cursor = walkStart;
    while (inTree[cursor] === 0) {
      const next = walkNext[cursor];
      if (next < 0) {
        break;
      }
      carvePassage(maze, cursor, next);
      inTree[cursor] = 1;
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

  for (const index of candidates) {
    if (opened >= target) {
      break;
    }

    const choices = collectClosedNeighbors(maze, index);
    if (choices.length === 0) {
      continue;
    }

    carvePassage(maze, index, choices[randomInt(choices.length, rng)]);
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
  const { queue, seen, distance } = scratch;

  seen.fill(0);
  distance.fill(-1);

  let head = 0;
  let tail = 0;
  let best = startIdx;

  queue[tail] = startIdx;
  tail += 1;
  seen[startIdx] = 1;
  distance[startIdx] = 0;

  while (head < tail) {
    const current = queue[head];
    head += 1;

    if (distance[current] > distance[best]) {
      best = current;
    }

    visitOpenNeighbors(maze, current, (next) => {
      if (seen[next] === 1) {
        return;
      }

      seen[next] = 1;
      distance[next] = distance[current] + 1;
      queue[tail] = next;
      tail += 1;
    });
  }

  return {
    point: pointFromIndex(best, maze.width),
    distance: distance[best]
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

const reconstructPath = (cameFrom: Int32Array, endIdx: number, width: number): Point[] => {
  const path: Point[] = [];
  let cursor = endIdx;

  while (cursor >= 0) {
    path.push(pointFromIndex(cursor, width));
    cursor = cameFrom[cursor];
  }

  path.reverse();
  return path;
};

const visitOpenNeighbors = (maze: MazeCore, idx: number, visit: (next: number) => void): void => {
  const point = pointFromIndex(idx, maze.width);
  const cell = maze.cells[idx];

  for (const dir of DIRS) {
    if ((cell.walls & dir.bit) !== 0) {
      continue;
    }

    const nextX = point.x + dir.dx;
    const nextY = point.y + dir.dy;
    if (!inBounds(nextX, nextY, maze.width, maze.height)) {
      continue;
    }

    visit(indexOf(maze.width, nextX, nextY));
  }
};

const countOpenNeighbors = (maze: MazeCore, idx: number): number => {
  let count = 0;
  visitOpenNeighbors(maze, idx, () => {
    count += 1;
  });
  return count;
};

const collectClosedNeighbors = (maze: MazeCore, idx: number): number[] => {
  const point = pointFromIndex(idx, maze.width);
  const cell = maze.cells[idx];
  const neighbors: number[] = [];

  for (const dir of DIRS) {
    if ((cell.walls & dir.bit) === 0) {
      continue;
    }

    const nextX = point.x + dir.dx;
    const nextY = point.y + dir.dy;
    if (!inBounds(nextX, nextY, maze.width, maze.height)) {
      continue;
    }

    neighbors.push(indexOf(maze.width, nextX, nextY));
  }

  return neighbors;
};

const carvePassage = (maze: MazeCore, a: number, b: number): void => {
  const pointA = pointFromIndex(a, maze.width);
  const pointB = pointFromIndex(b, maze.width);
  const dx = pointB.x - pointA.x;
  const dy = pointB.y - pointA.y;

  for (const dir of DIRS) {
    if (dir.dx !== dx || dir.dy !== dy) {
      continue;
    }

    maze.cells[a].walls &= ~dir.bit;
    maze.cells[b].walls &= ~dir.opposite;
    return;
  }

  throw new Error(`Cells ${a} and ${b} are not neighbors`);
};

const countTurns = (pathIndices: readonly number[], width: number): number => {
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

  for (const index of episode.raster.pathIndices) {
    let degree = 0;
    for (const neighbor of episode.raster.tiles[index].neighbors) {
      if (neighbor !== -1 && episode.raster.tiles[neighbor].floor) {
        degree += 1;
      }
    }
    if (degree >= 3) {
      branches += 1;
    }
  }

  return branches;
};

const heuristic = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const indexOf = (width: number, x: number, y: number): number => (y * width) + x;

const randomInt = (maxExclusive: number, rng: () => number): number => Math.floor(rng() * maxExclusive);

const randomNeighborIndex = (idx: number, width: number, height: number, rng: () => number): number => {
  const point = pointFromIndex(idx, width);
  const neighbors: number[] = [];

  for (const dir of DIRS) {
    const nextX = point.x + dir.dx;
    const nextY = point.y + dir.dy;
    if (inBounds(nextX, nextY, width, height)) {
      neighbors.push(indexOf(width, nextX, nextY));
    }
  }

  return neighbors[randomInt(neighbors.length, rng)];
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

const getMazeScratch = (size: number): MazeScratch => {
  const cached = mazeScratchCache.get(size);
  if (cached) {
    return cached;
  }

  const scratch: MazeScratch = {
    inTree: new Uint8Array(size),
    walkNext: new Int32Array(size),
    queue: new Int32Array(size),
    distance: new Int32Array(size),
    seen: new Uint8Array(size)
  };
  mazeScratchCache.set(size, scratch);
  return scratch;
};

const getSolveScratch = (size: number): SolveScratch => {
  const cached = solveScratchCache.get(size);
  if (cached) {
    return cached;
  }

  const scratch: SolveScratch = {
    cameFrom: new Int32Array(size),
    gScore: new Float64Array(size),
    closed: new Uint8Array(size),
    heap: new MinHeap<{ idx: number; f: number; g: number }>((a, b) => a.f - b.f || a.g - b.g)
  };
  solveScratchCache.set(size, scratch);
  return scratch;
};

class MinHeap<T> {
  private readonly data: T[] = [];

  public constructor(private readonly compare: (a: T, b: T) => number) {}

  public get size(): number {
    return this.data.length;
  }

  public clear(): void {
    this.data.length = 0;
  }

  public push(value: T): void {
    this.data.push(value);
    this.bubbleUp(this.data.length - 1);
  }

  public pop(): T | undefined {
    if (this.data.length === 0) {
      return undefined;
    }
    if (this.data.length === 1) {
      return this.data.pop();
    }

    const top = this.data[0];
    const last = this.data.pop();
    if (last === undefined) {
      return top;
    }

    this.data[0] = last;
    this.bubbleDown(0);
    return top;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.data[index], this.data[parent]) >= 0) {
        break;
      }
      [this.data[index], this.data[parent]] = [this.data[parent], this.data[index]];
      index = parent;
    }
  }

  private bubbleDown(index: number): void {
    while (true) {
      const left = (index * 2) + 1;
      const right = left + 1;
      let smallest = index;

      if (left < this.data.length && this.compare(this.data[left], this.data[smallest]) < 0) {
        smallest = left;
      }
      if (right < this.data.length && this.compare(this.data[right], this.data[smallest]) < 0) {
        smallest = right;
      }
      if (smallest === index) {
        break;
      }

      [this.data[index], this.data[smallest]] = [this.data[smallest], this.data[index]];
      index = smallest;
    }
  }
}
