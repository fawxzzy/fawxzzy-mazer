import { createSeededRng } from '../rng/seededRng';
import { buildMazeCore } from './core';
import { adaptTileBoardFootprint } from './footprintAdapter';
import { createGrid, indexFromCoordinates } from './grid';
import type {
  MazeBuildOptions,
  MazeBuildResult,
  MazeConfig,
  MazeGenerationState,
  MazeMetrics,
  MazeSolveResult,
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
    acceptedCore: built.accepted
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

interface RasterizeOptions {
  seed: number;
  core: MazeBuildResult['core'];
  shortcutsCreated: number;
  footprint: MazeBuildOptions['footprint'];
  minSolutionLength: number;
  acceptedCore: boolean;
}

const rasterizeMaze = (options: RasterizeOptions): MazeBuildResult => {
  const { core, seed, shortcutsCreated, footprint, minSolutionLength, acceptedCore } = options;
  const playableWidth = (core.width * 2) - 1;
  const playableHeight = (core.height * 2) - 1;
  const tiles = createGrid(playableWidth, playableHeight).map(resetTile);

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

        const passageX = center.x + dir.dx;
        const passageY = center.y + dir.dy;
        const passageIndex = indexFromCoordinates(passageX, passageY, playableWidth);
        tiles[passageIndex].floor = true;
      }
    }
  }

  const startPoint = toRasterPoint(core.start);
  const goalPoint = toRasterPoint(core.goal);
  const baseBoard: TileBoard = {
    width: playableWidth,
    height: playableHeight,
    scale: Math.max(playableWidth, playableHeight),
    tiles,
    pathIndices: [],
    checkpointIndices: [],
    wallIndices: [],
    startIndex: indexFromCoordinates(startPoint.x, startPoint.y, playableWidth),
    endIndex: indexFromCoordinates(goalPoint.x, goalPoint.y, playableWidth),
    checkpointCount: 0,
    playableWidth,
    playableHeight,
    padding: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    }
  };
  const raster = adaptTileBoardFootprint(baseBoard, footprint);
  const adaptedStart = pointFromIndex(raster.startIndex, raster.width);
  const adaptedGoal = pointFromIndex(raster.endIndex, raster.width);
  const solved = solveTileAStar(raster.tiles, raster.width, raster.height, adaptedStart, adaptedGoal);
  const pathIndices = solved.path.map((point) => indexFromCoordinates(point.x, point.y, raster.width));
  const solvedTiles = raster.tiles.map((tile) => ({
    ...tile,
    path: false,
    end: false
  }));

  for (const index of pathIndices) {
    solvedTiles[index].path = true;
  }
  solvedTiles[raster.endIndex].end = true;

  const wallIndices = solvedTiles
    .filter((tile) => !tile.floor)
    .map((tile) => tile.index);
  const metrics = measureTileMaze(solvedTiles, raster.width, raster.height, pathIndices);
  const rasterMinSolutionLength = Math.max(1, (minSolutionLength * 2) - 1);

  return {
    seed,
    core,
    raster: {
      ...raster,
      tiles: solvedTiles,
      pathIndices,
      wallIndices
    },
    solution: solved.path,
    metrics,
    shortcutsCreated,
    accepted: acceptedCore && solved.found && passesRasterQualityGate(metrics, rasterMinSolutionLength)
  };
};

const solveTileAStar = (
  tiles: MazeTile[],
  width: number,
  _height: number,
  start: Point,
  goal: Point
): MazeSolveResult => {
  const startIndex = indexFromCoordinates(start.x, start.y, width);
  const goalIndex = indexFromCoordinates(goal.x, goal.y, width);
  const cameFrom = new Array<number>(tiles.length).fill(-1);
  const gScore = new Array<number>(tiles.length).fill(Number.POSITIVE_INFINITY);
  const closed = new Array<boolean>(tiles.length).fill(false);
  const open = new MinHeap<{ index: number; f: number; g: number }>((a, b) => a.f - b.f || a.g - b.g);

  let visited = 0;
  let expanded = 0;

  gScore[startIndex] = 0;
  open.push({ index: startIndex, g: 0, f: heuristic(start, goal) });

  while (open.size > 0) {
    const current = open.pop();
    if (!current) {
      break;
    }
    if (closed[current.index]) {
      continue;
    }

    closed[current.index] = true;
    visited += 1;

    if (current.index === goalIndex) {
      return {
        found: true,
        path: reconstructTilePath(cameFrom, current.index, width),
        visited,
        expanded,
        cost: gScore[current.index]
      };
    }

    expanded += 1;

    for (const next of openFloorNeighbors(tiles, current.index)) {
      if (closed[next]) {
        continue;
      }

      const tentativeG = gScore[current.index] + 1;
      if (tentativeG >= gScore[next]) {
        continue;
      }

      cameFrom[next] = current.index;
      gScore[next] = tentativeG;
      const point = pointFromIndex(next, width);
      open.push({
        index: next,
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

const measureTileMaze = (tiles: MazeTile[], width: number, _height: number, pathIndices: number[]): MazeMetrics => {
  let deadEnds = 0;
  let junctions = 0;
  let straightSegments = 0;
  const floorTiles = tiles.filter((tile) => tile.floor);

  for (const tile of floorTiles) {
    const degree = openFloorNeighbors(tiles, tile.index).length;
    if (degree === 1) {
      deadEnds += 1;
    } else if (degree >= 3) {
      junctions += 1;
    }
  }

  for (let index = 1; index < pathIndices.length - 1; index += 1) {
    const a = pointFromIndex(pathIndices[index - 1], width);
    const b = pointFromIndex(pathIndices[index], width);
    const c = pointFromIndex(pathIndices[index + 1], width);
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const bcx = c.x - b.x;
    const bcy = c.y - b.y;
    if (abx === bcx && aby === bcy) {
      straightSegments += 1;
    }
  }

  return {
    solutionLength: pathIndices.length,
    deadEnds,
    junctions,
    straightness: pathIndices.length <= 2 ? 1 : straightSegments / Math.max(1, pathIndices.length - 2),
    coverage: pathIndices.length / Math.max(1, floorTiles.length)
  };
};

const resetTile = (tile: MazeTile): MazeTile => ({
  ...tile,
  floor: false,
  path: false,
  end: false
});

const toRasterPoint = (point: Point): Point => ({
  x: point.x * 2,
  y: point.y * 2
});

const openFloorNeighbors = (tiles: MazeTile[], index: number): number[] => {
  const tile = tiles[index];
  const neighbors: number[] = [];

  for (const neighbor of tile.neighbors) {
    if (neighbor === -1 || !tiles[neighbor].floor) {
      continue;
    }
    neighbors.push(neighbor);
  }

  return neighbors;
};

const reconstructTilePath = (cameFrom: number[], endIndex: number, width: number): Point[] => {
  const path: Point[] = [];
  let cursor = endIndex;

  while (cursor >= 0) {
    path.push(pointFromIndex(cursor, width));
    cursor = cameFrom[cursor];
  }

  path.reverse();
  return path;
};

const pointFromIndex = (index: number, width: number): Point => ({
  x: index % width,
  y: Math.floor(index / width)
});

const indexOfCore = (width: number, x: number, y: number): number => (y * width) + x;

const normalizeLogicalSize = (targetScale: number): number => Math.max(4, Math.floor((targetScale + 1) / 2));

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const heuristic = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const passesRasterQualityGate = (metrics: MazeMetrics, minSolutionLength: number): boolean => (
  metrics.solutionLength >= minSolutionLength
  && metrics.straightness <= 0.9
  && metrics.coverage > 0
);

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
