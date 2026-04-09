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
import { toCortexSample } from './cortex';

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
  const cameFrom = new Array<number>(maze.cells.length).fill(-1);
  const gScore = new Array<number>(maze.cells.length).fill(Number.POSITIVE_INFINITY);
  const closed = new Array<boolean>(maze.cells.length).fill(false);
  const open = new MinHeap<{ idx: number; f: number; g: number }>((a, b) => a.f - b.f || a.g - b.g);

  let visited = 0;
  let expanded = 0;

  gScore[startIdx] = 0;
  open.push({ idx: startIdx, g: 0, f: heuristic(start, goal) });

  while (open.size > 0) {
    const current = open.pop();
    if (!current) {
      break;
    }

    if (closed[current.idx]) {
      continue;
    }

    closed[current.idx] = true;
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

    for (const next of openNeighbors(maze, current.idx)) {
      if (closed[next]) {
        continue;
      }

      const tentativeG = gScore[current.idx] + 1;
      if (tentativeG >= gScore[next]) {
        continue;
      }

      cameFrom[next] = current.idx;
      gScore[next] = tentativeG;
      const point = pointFromIndex(next, maze.width);
      open.push({
        idx: next,
        g: tentativeG,
        f: tentativeG + heuristic(point, goal)
      });
    }
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
    const degree = openNeighbors(maze, index).length;
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

export const isPlayable = (episode: MazeEpisode): boolean => episode.solution.length > 0;

export class PatternEngine {
  private elapsed = 0;
  private current?: PatternFrame;

  public constructor(
    private readonly makeMaze: () => MazeEpisode,
    private readonly mode: PatternEngineMode,
    private readonly cortex?: CortexSink
  ) {}

  public next(dtSeconds: number): PatternFrame {
    this.elapsed += dtSeconds;

    if (!this.current || this.shouldAdvance(this.current, this.elapsed)) {
      const episode = this.makeMaze();
      this.current = {
        mode: this.mode,
        episode,
        t: 0
      };
      this.elapsed = 0;
      this.pushToCortex(this.current);
    }

    this.current.t += dtSeconds;
    return this.current;
  }

  private shouldAdvance(frame: PatternFrame, elapsed: number): boolean {
    const base = Math.max(4, frame.episode.solution.length * 0.06);
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

    const sample: CortexSample = toCortexSample(frame.episode);

    this.cortex.push(sample);
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
    if (timer) {
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
  for (const eventName of events) {
    window.addEventListener(eventName, reset, { passive: true });
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      reset();
    }
  });

  reset();

  return () => {
    if (timer) {
      window.clearTimeout(timer);
    }
    for (const eventName of events) {
      window.removeEventListener(eventName, reset);
    }
  };
};

const generateWilsonMaze = (
  width: number,
  height: number,
  seed: number,
  braidRatio: number,
  rng: () => number
): MazeCore => {
  const cells = Array.from({ length: width * height }, () => ({ walls: ALL_WALLS }));
  const inTree = new Array<boolean>(width * height).fill(false);
  const maze: MazeCore = {
    width,
    height,
    cells,
    start: { x: 0, y: 0 },
    goal: { x: width - 1, y: height - 1 },
    seed,
    braidRatio
  };

  const root = randomInt(width * height, rng);
  inTree[root] = true;

  while (inTree.some((value) => !value)) {
    const walk = new Map<number, number>();
    let cursor = randomUnvisitedIndex(inTree, rng);
    const walkStart = cursor;
    walk.set(cursor, -1);

    while (!inTree[cursor]) {
      const next = randomNeighborIndex(cursor, width, height, rng);
      walk.set(cursor, next);
      cursor = next;
      if (!walk.has(cursor)) {
        walk.set(cursor, -1);
      }
    }

    cursor = walkStart;
    while (!inTree[cursor]) {
      const next = walk.get(cursor);
      if (next === undefined || next < 0) {
        break;
      }
      carvePassage(maze, cursor, next);
      inTree[cursor] = true;
      cursor = next;
    }
    inTree[cursor] = true;
  }

  if (braidRatio > 0) {
    braidMaze(maze, braidRatio, rng);
  }

  const farA = farthestReachable(maze, { x: 0, y: 0 });
  const farB = farthestReachable(maze, farA.point);
  maze.start = farA.point;
  maze.goal = farB.point;
  return maze;
};

const braidMaze = (maze: MazeCore, ratio: number, rng: () => number): void => {
  const candidates: number[] = [];
  for (let index = 0; index < maze.cells.length; index += 1) {
    if (openNeighbors(maze, index).length === 1) {
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

    const choices = closedNeighbors(maze, index);
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

const farthestReachable = (maze: MazeCore, start: Point): { point: Point; distance: number } => {
  const startIdx = indexOf(maze.width, start.x, start.y);
  const queue = [startIdx];
  const seen = new Array<boolean>(maze.cells.length).fill(false);
  const distance = new Array<number>(maze.cells.length).fill(-1);
  seen[startIdx] = true;
  distance[startIdx] = 0;

  let best = startIdx;
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) {
      continue;
    }

    if (distance[current] > distance[best]) {
      best = current;
    }

    for (const next of openNeighbors(maze, current)) {
      if (seen[next]) {
        continue;
      }

      seen[next] = true;
      distance[next] = distance[current] + 1;
      queue.push(next);
    }
  }

  return {
    point: pointFromIndex(best, maze.width),
    distance: distance[best]
  };
};

const countOpeningsBeyondTree = (maze: MazeCore): number => {
  let passages = 0;
  for (let index = 0; index < maze.cells.length; index += 1) {
    passages += openNeighbors(maze, index).length;
  }

  const undirectedEdges = passages / 2;
  return Math.max(0, undirectedEdges - (maze.cells.length - 1));
};

const reconstructPath = (cameFrom: number[], endIdx: number, width: number): Point[] => {
  const path: Point[] = [];
  let cursor = endIdx;

  while (cursor >= 0) {
    path.push(pointFromIndex(cursor, width));
    cursor = cameFrom[cursor];
  }

  path.reverse();
  return path;
};

const openNeighbors = (maze: MazeCore, idx: number): number[] => {
  const point = pointFromIndex(idx, maze.width);
  const cell = maze.cells[idx];
  const neighbors: number[] = [];

  for (const dir of DIRS) {
    if ((cell.walls & dir.bit) !== 0) {
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

const closedNeighbors = (maze: MazeCore, idx: number): number[] => {
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

const heuristic = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const indexOf = (width: number, x: number, y: number): number => (y * width) + x;

const pointFromIndex = (idx: number, width: number): Point => ({
  x: idx % width,
  y: Math.floor(idx / width)
});

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

const randomUnvisitedIndex = (inTree: boolean[], rng: () => number): number => {
  const candidates: number[] = [];
  for (let index = 0; index < inTree.length; index += 1) {
    if (!inTree[index]) {
      candidates.push(index);
    }
  }
  return candidates[randomInt(candidates.length, rng)];
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

class MinHeap<T> {
  private readonly data: T[] = [];

  public constructor(private readonly compare: (a: T, b: T) => number) {}

  public get size(): number {
    return this.data.length;
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
