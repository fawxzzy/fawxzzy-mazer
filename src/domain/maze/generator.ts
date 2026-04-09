import { createSeededRng } from '../rng/seededRng';
import { buildMazeCore } from './core';
import {
  createGrid,
  getNeighborIndex,
  indexFromCoordinates,
  isTileFloor,
  setTileFlag,
  TILE_END,
  TILE_FLOOR,
  TILE_PATH,
  xFromIndex,
  yFromIndex
} from './grid';
import type {
  MazeBuildOptions,
  MazeBuildResult,
  MazeConfig,
  MazeGenerationState,
  MazeMetrics,
  PathBuffer,
  TileBoard
} from './types';

const N = 1 << 0;
const E = 1 << 1;
const S = 1 << 2;
const W = 1 << 3;
const EMPTY_PATH = new Uint32Array(0);

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
  readonly gScoreEpoch: Uint32Array;
  readonly closedEpoch: Uint32Array;
  readonly heap: MinHeap;
  epoch: number;
}

interface TileSolveResult {
  found: boolean;
  pathIndices: PathBuffer;
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

  for (let y = 0; y < core.height; y += 1) {
    for (let x = 0; x < core.width; x += 1) {
      const coreIndex = indexOfCore(core.width, x, y);
      const centerX = x * 2;
      const centerY = y * 2;
      const centerIndex = indexFromCoordinates(centerX, centerY, playableWidth);
      setTileFlag(tiles, centerIndex, TILE_FLOOR);

      for (let direction = 0; direction < DIRS.length; direction += 1) {
        const dir = DIRS[direction];
        if ((core.cells[coreIndex] & dir.bit) !== 0) {
          continue;
        }

        const passageIndex = indexFromCoordinates(centerX + dir.dx, centerY + dir.dy, playableWidth);
        setTileFlag(tiles, passageIndex, TILE_FLOOR);
      }
    }
  }

  const startIndex = indexFromCoordinates(core.start.x * 2, core.start.y * 2, playableWidth);
  const endIndex = indexFromCoordinates(core.goal.x * 2, core.goal.y * 2, playableWidth);
  const raster = adaptBoardFootprint({
    width: playableWidth,
    height: playableHeight,
    scale: Math.max(playableWidth, playableHeight),
    tiles,
    pathIndices: EMPTY_PATH,
    startIndex,
    endIndex,
    playableWidth,
    playableHeight,
    padding: {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    }
  }, footprint);

  const solved = solveTileAStar(raster.tiles, raster.width, raster.height, raster.startIndex, raster.endIndex);
  for (let pathCursor = 0; pathCursor < solved.pathIndices.length; pathCursor += 1) {
    setTileFlag(raster.tiles, solved.pathIndices[pathCursor], TILE_PATH);
  }
  setTileFlag(raster.tiles, raster.endIndex, TILE_END);

  const metrics = measureTileMaze(raster.tiles, raster.width, raster.height, solved.pathIndices);
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

  for (let index = 0; index < board.tiles.length; index += 1) {
    if (!isTileFloor(board.tiles, index)) {
      continue;
    }

    const x = xFromIndex(index, board.width);
    const y = yFromIndex(index, board.width);
    setTileFlag(tiles, indexFromCoordinates(x + left, y + top, targetWidth), TILE_FLOOR);
  }

  const shiftIndex = (index: number): number => {
    const x = xFromIndex(index, board.width);
    const y = yFromIndex(index, board.width);
    return indexFromCoordinates(x + left, y + top, targetWidth);
  };

  const shiftedPathIndices = new Uint32Array(board.pathIndices.length);
  for (let pathCursor = 0; pathCursor < board.pathIndices.length; pathCursor += 1) {
    shiftedPathIndices[pathCursor] = shiftIndex(board.pathIndices[pathCursor]);
  }

  return {
    width: targetWidth,
    height: targetHeight,
    scale: Math.max(targetWidth, targetHeight),
    tiles,
    pathIndices: shiftedPathIndices,
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
  tiles: Uint8Array,
  width: number,
  height: number,
  startIndex: number,
  goalIndex: number
): TileSolveResult => {
  const scratch = getSolveScratch(tiles.length);
  const epoch = nextEpoch(scratch);
  const goalX = xFromIndex(goalIndex, width);
  const goalY = yFromIndex(goalIndex, width);

  scratch.cameFrom[startIndex] = -1;
  scratch.gScore[startIndex] = 0;
  scratch.gScoreEpoch[startIndex] = epoch;
  scratch.heap.clear();
  scratch.heap.push(startIndex, 0, heuristicIndex(startIndex, goalX, goalY, width));

  let visited = 0;
  let expanded = 0;

  while (scratch.heap.pop()) {
    const currentIndex = scratch.heap.currentIndex;
    if (scratch.closedEpoch[currentIndex] === epoch) {
      continue;
    }

    scratch.closedEpoch[currentIndex] = epoch;
    visited += 1;

    if (currentIndex === goalIndex) {
      return {
        found: true,
        pathIndices: reconstructTilePath(scratch.cameFrom, currentIndex),
        visited,
        expanded,
        cost: scratch.gScore[currentIndex]
      };
    }

    expanded += 1;
    const currentG = scratch.gScore[currentIndex];
    for (let direction = 0; direction < 4; direction += 1) {
      const next = getNeighborIndex(currentIndex, width, height, direction as 0 | 1 | 2 | 3);
      if (next === -1 || !isTileFloor(tiles, next) || scratch.closedEpoch[next] === epoch) {
        continue;
      }

      const tentativeG = currentG + 1;
      const seenBefore = scratch.gScoreEpoch[next] === epoch;
      if (seenBefore && tentativeG >= scratch.gScore[next]) {
        continue;
      }

      scratch.cameFrom[next] = currentIndex;
      scratch.gScore[next] = tentativeG;
      scratch.gScoreEpoch[next] = epoch;
      scratch.heap.push(next, tentativeG, tentativeG + heuristicIndex(next, goalX, goalY, width));
    }
  }

  return {
    found: false,
    pathIndices: EMPTY_PATH,
    visited,
    expanded,
    cost: Number.POSITIVE_INFINITY
  };
};

const measureTileMaze = (
  tiles: Uint8Array,
  width: number,
  height: number,
  pathIndices: ArrayLike<number>
): MazeMetrics => {
  let deadEnds = 0;
  let junctions = 0;
  let straightSegments = 0;
  let floorTileCount = 0;

  for (let index = 0; index < tiles.length; index += 1) {
    if (!isTileFloor(tiles, index)) {
      continue;
    }

    floorTileCount += 1;
    const degree = countOpenFloorNeighbors(tiles, width, height, index);
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

const countOpenFloorNeighbors = (tiles: Uint8Array, width: number, height: number, index: number): number => {
  let count = 0;

  for (let direction = 0; direction < 4; direction += 1) {
    const neighbor = getNeighborIndex(index, width, height, direction as 0 | 1 | 2 | 3);
    if (neighbor !== -1 && isTileFloor(tiles, neighbor)) {
      count += 1;
    }
  }

  return count;
};

const reconstructTilePath = (cameFrom: Int32Array, endIndex: number): PathBuffer => {
  let length = 0;
  let cursor = endIndex;

  while (cursor >= 0) {
    length += 1;
    cursor = cameFrom[cursor];
  }

  const path = new Uint32Array(length);
  cursor = endIndex;
  for (let writeIndex = length - 1; writeIndex >= 0; writeIndex -= 1) {
    path[writeIndex] = cursor;
    cursor = cameFrom[cursor];
  }
  return path;
};

const indexOfCore = (width: number, x: number, y: number): number => (y * width) + x;

const normalizeLogicalSize = (targetScale: number): number => Math.max(4, Math.floor((targetScale + 1) / 2));

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const heuristicIndex = (index: number, goalX: number, goalY: number, width: number): number => {
  const x = xFromIndex(index, width);
  const y = yFromIndex(index, width);
  return Math.abs(x - goalX) + Math.abs(y - goalY);
};

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
    gScoreEpoch: new Uint32Array(size),
    closedEpoch: new Uint32Array(size),
    heap: new MinHeap(size),
    epoch: 0
  };
  solveScratchCache.set(size, scratch);
  return scratch;
};

const nextEpoch = (scratch: SolveScratch): number => {
  scratch.epoch += 1;
  if (scratch.epoch !== 0) {
    return scratch.epoch;
  }

  scratch.gScoreEpoch.fill(0);
  scratch.closedEpoch.fill(0);
  scratch.epoch = 1;
  return scratch.epoch;
};

class MinHeap {
  private indices: Uint32Array;
  private fScores: Float64Array;
  private gScores: Float64Array;
  private sizeValue = 0;

  public currentIndex = 0;

  public constructor(capacity: number) {
    this.indices = new Uint32Array(Math.max(4, capacity));
    this.fScores = new Float64Array(Math.max(4, capacity));
    this.gScores = new Float64Array(Math.max(4, capacity));
  }

  public clear(): void {
    this.sizeValue = 0;
  }

  public push(index: number, g: number, f: number): void {
    this.ensureCapacity(this.sizeValue + 1);
    let cursor = this.sizeValue;
    this.sizeValue += 1;
    this.indices[cursor] = index;
    this.gScores[cursor] = g;
    this.fScores[cursor] = f;
    this.bubbleUp(cursor);
  }

  public pop(): boolean {
    if (this.sizeValue === 0) {
      return false;
    }

    this.currentIndex = this.indices[0];
    this.sizeValue -= 1;
    if (this.sizeValue > 0) {
      this.indices[0] = this.indices[this.sizeValue];
      this.gScores[0] = this.gScores[this.sizeValue];
      this.fScores[0] = this.fScores[this.sizeValue];
      this.bubbleDown(0);
    }

    return true;
  }

  private ensureCapacity(size: number): void {
    if (size <= this.indices.length) {
      return;
    }

    const nextCapacity = Math.max(size, this.indices.length * 2);
    const nextIndices = new Uint32Array(nextCapacity);
    nextIndices.set(this.indices);
    this.indices = nextIndices;

    const nextGScores = new Float64Array(nextCapacity);
    nextGScores.set(this.gScores);
    this.gScores = nextGScores;

    const nextFScores = new Float64Array(nextCapacity);
    nextFScores.set(this.fScores);
    this.fScores = nextFScores;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(index, parent) >= 0) {
        break;
      }
      this.swap(index, parent);
      index = parent;
    }
  }

  private bubbleDown(index: number): void {
    while (true) {
      const left = (index * 2) + 1;
      const right = left + 1;
      let smallest = index;

      if (left < this.sizeValue && this.compare(left, smallest) < 0) {
        smallest = left;
      }
      if (right < this.sizeValue && this.compare(right, smallest) < 0) {
        smallest = right;
      }
      if (smallest === index) {
        break;
      }

      this.swap(index, smallest);
      index = smallest;
    }
  }

  private compare(a: number, b: number): number {
    const fDelta = this.fScores[a] - this.fScores[b];
    if (fDelta !== 0) {
      return fDelta;
    }
    return this.gScores[a] - this.gScores[b];
  }

  private swap(a: number, b: number): void {
    [this.indices[a], this.indices[b]] = [this.indices[b], this.indices[a]];
    [this.gScores[a], this.gScores[b]] = [this.gScores[b], this.gScores[a]];
    [this.fScores[a], this.fScores[b]] = [this.fScores[b], this.fScores[a]];
  }
}
