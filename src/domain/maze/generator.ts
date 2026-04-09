import { createSeededRng } from '../rng/seededRng';
import { buildMazeCore } from './core';
import { createGrid, indexFromCoordinates, pointFromIndex } from './grid';
import type {
  MazeBuildOptions,
  MazeBuildResult,
  MazeConfig,
  MazeGenerationState,
  MazeMetrics,
  MazeTile,
  Point,
  TileBoard
} from './types';

const N = 1 << 0;
const E = 1 << 1;
const S = 1 << 2;
const W = 1 << 3;

const DIRS = [
  { bit: N, dx: 0, dy: -1 },
  { bit: E, dx: 1, dy: 0 },
  { bit: S, dx: 0, dy: 1 },
  { bit: W, dx: -1, dy: 0 }
] as const;

interface RasterizeOptions {
  seed: number;
  core: NonNullable<MazeBuildResult['core']>;
  shortcutsCreated: number;
  footprint: MazeBuildOptions['footprint'];
  minSolutionLength: number;
  acceptedCore: boolean;
  includeCore: boolean;
}

interface SolveScratch {
  readonly cameFrom: Int32Array;
  readonly gScore: Float64Array;
  readonly closed: Uint8Array;
  readonly heap: MinHeap<{ index: number; f: number; g: number }>;
}

interface TileSolveResult {
  found: boolean;
  pathIndices: number[];
  visited: number;
  expanded: number;
  cost: number;
}

const solveScratchCache = new Map<number, SolveScratch>();

export const buildMaze = (options: MazeBuildOptions): MazeBuildResult => {
  const seed = options.seed ?? Math.floor(Math.random() * 0x7fffffff);
  const seeded = options.rng ? null : createSeededRng(seed);
  const rng = options.rng ?? (() => seeded!.nextFloat());
  const logicalSize = normalizeLogicalSize(Math.min(options.width, options.height));
  const minSolutionLength = options.minSolutionLength ?? Math.max(18, Math.floor((logicalSize * logicalSize) / 4));
  const maxAttempts = options.maxAttempts ?? 64;

  const built = buildMazeCore({
    width: logicalSize,
    height: logicalSize,
    seed,
    braidRatio: clamp(options.braidRatio ?? 0, 0, 0.35),
    minSolutionLength,
    maxAttempts,
    rng
  });

  return rasterizeMaze({
    seed,
    core: built.maze,
    shortcutsCreated: built.shortcutsCreated,
    footprint: options.footprint ?? { width: options.width, height: options.height },
    minSolutionLength,
    acceptedCore: built.accepted,
    includeCore: options.includeCore === true
  });
};

export const generateMaze = (config: MazeConfig): MazeBuildResult => {
  const targetScale = Math.max(9, config.scale);
  return buildMaze({
    width: targetScale,
    height: targetScale,
    seed: config.seed,
    braidRatio: clamp(config.shortcutCountModifier, 0, 0.35),
    minSolutionLength: config.minSolutionLength ?? Math.max(
      18,
      Math.floor(((normalizeLogicalSize(targetScale) ** 2) * (0.22 + (config.checkPointModifier * 0.08))))
    ),
    maxAttempts: config.maxAttempts ?? 96
  });
};

export const createInitialGenerationState = (config: MazeConfig): MazeGenerationState => ({
  processCount: 7,
  resetGame: false,
  result: generateMaze(config)
});

export const resetAndRegenerate = (state: MazeGenerationState, config: MazeConfig): MazeGenerationState => {
  if (!state.resetGame) {
    return state;
  }

  return {
    processCount: 7,
    resetGame: false,
    result: generateMaze(config)
  };
};

const rasterizeMaze = (options: RasterizeOptions): MazeBuildResult => {
  const { core, seed, shortcutsCreated, footprint, minSolutionLength, acceptedCore, includeCore } = options;
  const playableWidth = (core.width * 2) - 1;
  const playableHeight = (core.height * 2) - 1;
  const tiles = createGrid(playableWidth, playableHeight);

  for (const tile of tiles) {
    tile.floor = false;
    tile.path = false;
    tile.end = false;
  }

  for (let y = 0; y < core.height; y += 1) {
    for (let x = 0; x < core.width; x += 1) {
      const coreIndex = indexOfCore(core.width, x, y);
      const center = toRasterPoint({ x, y });
      const centerIndex = indexFromCoordinates(center.x, center.y, playableWidth);
      tiles[centerIndex].floor = true;

      for (const dir of DIRS) {
        if ((core.cells[coreIndex].walls & dir.bit) !== 0) {
          continue;
        }

        const passageIndex = indexFromCoordinates(center.x + dir.dx, center.y + dir.dy, playableWidth);
        tiles[passageIndex].floor = true;
      }
    }
  }

  const startPoint = toRasterPoint(core.start);
  const goalPoint = toRasterPoint(core.goal);
  const raster = adaptBoardFootprint({
    width: playableWidth,
    height: playableHeight,
    scale: Math.max(playableWidth, playableHeight),
    tiles,
    pathIndices: [],
    startIndex: indexFromCoordinates(startPoint.x, startPoint.y, playableWidth),
    endIndex: indexFromCoordinates(goalPoint.x, goalPoint.y, playableWidth),
    playableWidth,
    playableHeight,
    padding: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    }
  }, footprint);

  const adaptedStart = pointFromIndex(raster.startIndex, raster.width);
  const adaptedGoal = pointFromIndex(raster.endIndex, raster.width);
  const solved = solveTileAStar(raster.tiles, raster.width, raster.height, adaptedStart, adaptedGoal);
  for (const pathIndex of solved.pathIndices) {
    raster.tiles[pathIndex].path = true;
  }
  raster.tiles[raster.endIndex].end = true;

  const metrics = measureTileMaze(raster.tiles, raster.width, solved.pathIndices);
  const rasterMinSolutionLength = Math.max(1, (minSolutionLength * 2) - 1);

  return {
    seed,
    core: includeCore ? core : undefined,
    raster: {
      ...raster,
      pathIndices: solved.pathIndices
    },
    metrics,
    shortcutsCreated,
    accepted: acceptedCore && solved.found && passesRasterQualityGate(metrics, rasterMinSolutionLength)
  };
};

const adaptBoardFootprint = (board: TileBoard, target?: MazeBuildOptions['footprint']): TileBoard => {
  const targetWidth = Math.max(board.width, target?.width ?? board.width);
  const targetHeight = Math.max(board.height, target?.height ?? board.height);

  if (targetWidth === board.width && targetHeight === board.height) {
    return board;
  }

  const left = Math.floor((targetWidth - board.width) / 2);
  const right = targetWidth - board.width - left;
  const top = Math.floor((targetHeight - board.height) / 2);
  const bottom = targetHeight - board.height - top;
  const tiles = createGrid(targetWidth, targetHeight);

  for (const tile of tiles) {
    tile.floor = false;
    tile.path = false;
    tile.end = false;
  }

  for (let index = 0; index < board.tiles.length; index += 1) {
    const { x, y } = pointFromIndex(index, board.width);
    tiles[indexFromCoordinates(x + left, y + top, targetWidth)].floor = board.tiles[index].floor;
  }

  const shiftIndex = (index: number): number => {
    const x = index % board.width;
    const y = Math.floor(index / board.width);
    return indexFromCoordinates(x + left, y + top, targetWidth);
  };

  return {
    width: targetWidth,
    height: targetHeight,
    scale: Math.max(targetWidth, targetHeight),
    tiles,
    pathIndices: board.pathIndices.map(shiftIndex),
    startIndex: shiftIndex(board.startIndex),
    endIndex: shiftIndex(board.endIndex),
    playableWidth: board.playableWidth,
    playableHeight: board.playableHeight,
    padding: {
      top: board.padding.top + top,
      right: board.padding.right + right,
      bottom: board.padding.bottom + bottom,
      left: board.padding.left + left
    }
  };
};

const solveTileAStar = (
  tiles: MazeTile[],
  width: number,
  _height: number,
  start: Point,
  goal: Point
): TileSolveResult => {
  const startIndex = indexFromCoordinates(start.x, start.y, width);
  const goalIndex = indexFromCoordinates(goal.x, goal.y, width);
  const scratch = getSolveScratch(tiles.length);
  const { cameFrom, gScore, closed, heap } = scratch;

  cameFrom.fill(-1);
  gScore.fill(Number.POSITIVE_INFINITY);
  closed.fill(0);
  heap.clear();

  let visited = 0;
  let expanded = 0;

  gScore[startIndex] = 0;
  heap.push({ index: startIndex, g: 0, f: heuristic(start, goal) });

  while (heap.size > 0) {
    const current = heap.pop();
    if (!current || closed[current.index] === 1) {
      continue;
    }

    closed[current.index] = 1;
    visited += 1;

    if (current.index === goalIndex) {
      return {
        found: true,
        pathIndices: reconstructTilePath(cameFrom, current.index),
        visited,
        expanded,
        cost: gScore[current.index]
      };
    }

    expanded += 1;
    visitOpenFloorNeighbors(tiles, current.index, (next) => {
      if (closed[next] === 1) {
        return;
      }

      const tentativeG = gScore[current.index] + 1;
      if (tentativeG >= gScore[next]) {
        return;
      }

      cameFrom[next] = current.index;
      gScore[next] = tentativeG;
      heap.push({
        index: next,
        g: tentativeG,
        f: tentativeG + heuristic(pointFromIndex(next, width), goal)
      });
    });
  }

  return {
    found: false,
    pathIndices: [],
    visited,
    expanded,
    cost: Number.POSITIVE_INFINITY
  };
};

const measureTileMaze = (tiles: MazeTile[], width: number, pathIndices: number[]): MazeMetrics => {
  let deadEnds = 0;
  let junctions = 0;
  let straightSegments = 0;
  let floorTileCount = 0;

  for (let index = 0; index < tiles.length; index += 1) {
    if (!tiles[index].floor) {
      continue;
    }

    floorTileCount += 1;
    const degree = countOpenFloorNeighbors(tiles, index);
    if (degree === 1) {
      deadEnds += 1;
    } else if (degree >= 3) {
      junctions += 1;
    }
  }

  for (let index = 1; index < pathIndices.length - 1; index += 1) {
    const ab = pathIndices[index] - pathIndices[index - 1];
    const bc = pathIndices[index + 1] - pathIndices[index];
    const abx = ab % width;
    const aby = Math.trunc(ab / width);
    const bcx = bc % width;
    const bcy = Math.trunc(bc / width);
    if (abx === bcx && aby === bcy) {
      straightSegments += 1;
    }
  }

  return {
    solutionLength: pathIndices.length,
    deadEnds,
    junctions,
    straightness: pathIndices.length <= 2 ? 1 : straightSegments / Math.max(1, pathIndices.length - 2),
    coverage: pathIndices.length / Math.max(1, floorTileCount)
  };
};

const toRasterPoint = (point: Point): Point => ({
  x: point.x * 2,
  y: point.y * 2
});

const visitOpenFloorNeighbors = (tiles: MazeTile[], index: number, visit: (next: number) => void): void => {
  for (const neighbor of tiles[index].neighbors) {
    if (neighbor !== -1 && tiles[neighbor].floor) {
      visit(neighbor);
    }
  }
};

const countOpenFloorNeighbors = (tiles: MazeTile[], index: number): number => {
  let count = 0;
  visitOpenFloorNeighbors(tiles, index, () => {
    count += 1;
  });
  return count;
};

const reconstructTilePath = (cameFrom: Int32Array, endIndex: number): number[] => {
  const path: number[] = [];
  let cursor = endIndex;

  while (cursor >= 0) {
    path.push(cursor);
    cursor = cameFrom[cursor];
  }

  path.reverse();
  return path;
};

const indexOfCore = (width: number, x: number, y: number): number => (y * width) + x;

const normalizeLogicalSize = (targetScale: number): number => Math.max(4, Math.floor((targetScale + 1) / 2));

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const heuristic = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const passesRasterQualityGate = (metrics: MazeMetrics, minSolutionLength: number): boolean => (
  metrics.solutionLength >= minSolutionLength
  && metrics.straightness <= 0.9
  && metrics.coverage > 0
);

const getSolveScratch = (size: number): SolveScratch => {
  const cached = solveScratchCache.get(size);
  if (cached) {
    return cached;
  }

  const scratch: SolveScratch = {
    cameFrom: new Int32Array(size),
    gScore: new Float64Array(size),
    closed: new Uint8Array(size),
    heap: new MinHeap<{ index: number; f: number; g: number }>((a, b) => a.f - b.f || a.g - b.g)
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
