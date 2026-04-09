import { createSeededRng } from '../rng/seededRng';
import { buildMazeCore } from './core';
import {
  getAStarScratch,
  createGrid,
  getNeighborIndex,
  indexFromCoordinates,
  isTileFloor,
  nextEpoch,
  reconstructPath,
  TILE_END,
  TILE_FLOOR,
  TILE_PATH,
  type AStarScratch,
  xFromIndex,
  yFromIndex
} from './grid';
import type {
  MazeBuildOptions,
  MazeConfig,
  MazeDifficulty,
  MazeEpisode,
  MazeGenerationState,
  MazeMetrics,
  MazeSolveResult,
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
  core: NonNullable<MazeEpisode['core']>;
  shortcutsCreated: number;
  footprint: MazeBuildOptions['footprint'];
  minSolutionLength: number;
  acceptedCore: boolean;
  includeCore: boolean;
}

interface MazeVarietyPreset {
  readonly key: string;
  readonly scaleDelta: number;
  readonly footprintDelta: number;
  readonly braidScale: number;
  readonly braidOffset: number;
  readonly minSolutionFactor: number;
}

const solveScratchCache = new Map<number, AStarScratch>();

const MAZE_VARIETY_PRESETS: readonly MazeVarietyPreset[] = [
  {
    key: 'survey',
    scaleDelta: -10,
    footprintDelta: 0,
    braidScale: 0.72,
    braidOffset: 0,
    minSolutionFactor: 0.17
  },
  {
    key: 'relay',
    scaleDelta: -6,
    footprintDelta: 0,
    braidScale: 0.84,
    braidOffset: 0.02,
    minSolutionFactor: 0.2
  },
  {
    key: 'weave',
    scaleDelta: -2,
    footprintDelta: 0,
    braidScale: 1,
    braidOffset: 0.04,
    minSolutionFactor: 0.23
  },
  {
    key: 'switchback',
    scaleDelta: 2,
    footprintDelta: 2,
    braidScale: 1.12,
    braidOffset: 0.06,
    minSolutionFactor: 0.265
  },
  {
    key: 'gauntlet',
    scaleDelta: 4,
    footprintDelta: 4,
    braidScale: 1.2,
    braidOffset: 0.08,
    minSolutionFactor: 0.3
  }
] as const;

const MENU_VARIETY_POOL = [0, 1, 2, 3] as const;
const GAME_VARIETY_POOL = [0, 1, 2, 3, 4] as const;

export const buildMaze = (options: MazeBuildOptions): MazeEpisode => {
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

export const generateMaze = (config: MazeConfig): MazeEpisode => {
  const variety = resolveMazeVarietyPreset(config);
  const targetScale = Math.max(9, config.scale + variety.scaleDelta);
  const footprintTarget = Math.max(targetScale, config.scale + variety.footprintDelta);
  const braidRatio = clamp(
    (config.shortcutCountModifier * variety.braidScale) + variety.braidOffset,
    0,
    0.35
  );
  const minSolutionLength = config.minSolutionLength ?? Math.max(
    18,
    Math.floor(((normalizeLogicalSize(targetScale) ** 2) * (variety.minSolutionFactor + (config.checkPointModifier * 0.08))))
  );
  return buildMaze({
    width: targetScale,
    height: targetScale,
    seed: config.seed,
    braidRatio,
    minSolutionLength,
    footprint: {
      width: footprintTarget,
      height: footprintTarget
    },
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

const rasterizeMaze = (options: RasterizeOptions): MazeEpisode => {
  const {
    core,
    seed,
    shortcutsCreated,
    footprint,
    minSolutionLength,
    acceptedCore,
    includeCore
  } = options;
  const playableWidth = (core.width * 2) - 1;
  const playableHeight = (core.height * 2) - 1;
  const tiles = createGrid(playableWidth, playableHeight);

  for (let y = 0; y < core.height; y += 1) {
    for (let x = 0; x < core.width; x += 1) {
      const coreIndex = indexOfCore(core.width, x, y);
      const centerX = x * 2;
      const centerY = y * 2;
      const centerIndex = indexFromCoordinates(centerX, centerY, playableWidth);
      tiles[centerIndex] |= TILE_FLOOR;

      for (let direction = 0; direction < DIRS.length; direction += 1) {
        const dir = DIRS[direction];
        if ((core.cells[coreIndex] & dir.bit) !== 0) {
          continue;
        }

        const passageIndex = indexFromCoordinates(centerX + dir.dx, centerY + dir.dy, playableWidth);
        tiles[passageIndex] |= TILE_FLOOR;
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
    endIndex
  }, footprint);

  const solved = solveTileAStar(raster.tiles, raster.width, raster.height, raster.startIndex, raster.endIndex);
  for (let pathCursor = 0; pathCursor < solved.pathIndices.length; pathCursor += 1) {
    raster.tiles[solved.pathIndices[pathCursor]] |= TILE_PATH;
  }
  raster.tiles[raster.endIndex] |= TILE_END;

  const metrics = measureTileMaze(raster.tiles, raster.width, raster.height, solved.pathIndices);
  const rasterMinSolutionLength = Math.max(1, (minSolutionLength * 2) - 1);
  const difficultyResult = classifyMazeDifficulty(metrics, raster.width, raster.height, shortcutsCreated);

  return {
    seed,
    core: includeCore ? core : undefined,
    raster: {
      ...raster,
      pathIndices: solved.pathIndices
    },
    metrics,
    shortcutsCreated,
    accepted: acceptedCore && solved.found && passesRasterQualityGate(metrics, rasterMinSolutionLength),
    difficulty: difficultyResult.difficulty,
    difficultyScore: difficultyResult.score
  };
};

const adaptBoardFootprint = (board: TileBoard, target?: MazeBuildOptions['footprint']): TileBoard => {
  const targetWidth = Math.max(board.width, target?.width ?? board.width);
  const targetHeight = Math.max(board.height, target?.height ?? board.height);

  if (targetWidth === board.width && targetHeight === board.height) {
    return board;
  }

  const left = Math.floor((targetWidth - board.width) / 2);
  const top = Math.floor((targetHeight - board.height) / 2);
  const tiles = createGrid(targetWidth, targetHeight);

  for (let index = 0; index < board.tiles.length; index += 1) {
    if (!isTileFloor(board.tiles, index)) {
      continue;
    }

    const x = xFromIndex(index, board.width);
    const y = yFromIndex(index, board.width);
    tiles[indexFromCoordinates(x + left, y + top, targetWidth)] |= TILE_FLOOR;
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
    endIndex: shiftIndex(board.endIndex)
  };
};

const solveTileAStar = (
  tiles: Uint8Array,
  width: number,
  height: number,
  startIndex: number,
  goalIndex: number
): MazeSolveResult => {
  const scratch = getSolveScratch(tiles.length);
  const epoch = nextEpoch(scratch, scratch.gScoreEpoch, scratch.closedEpoch);
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
    const currentIndex = scratch.heap.current;
    if (scratch.closedEpoch[currentIndex] === epoch) {
      continue;
    }

    scratch.closedEpoch[currentIndex] = epoch;
    visited += 1;

    if (currentIndex === goalIndex) {
      return {
        found: true,
        pathIndices: reconstructPath(scratch.cameFrom, currentIndex),
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

const getSolveScratch = (size: number): AStarScratch => getAStarScratch(solveScratchCache, size);

const resolveMazeVarietyPreset = (config: MazeConfig): MazeVarietyPreset => {
  const pool = config.shortcutCountModifier <= 0.14
    ? MENU_VARIETY_POOL
    : GAME_VARIETY_POOL;
  const seedMix = Math.imul((config.seed >>> 0) ^ ((config.scale & 0xff) << 9), 0x9e3779b1) >>> 0;
  return MAZE_VARIETY_PRESETS[pool[seedMix % pool.length]];
};

export const classifyMazeDifficulty = (
  metrics: MazeMetrics,
  width: number,
  height: number,
  shortcutsCreated: number
): { difficulty: MazeDifficulty; score: number } => {
  const scale = Math.max(width, height);
  const pathPressure = metrics.solutionLength / Math.max(1, scale * 1.18);
  const branchPressure = metrics.junctions / Math.max(1, scale * 0.19);
  const deadEndPressure = metrics.deadEnds / Math.max(1, scale * 0.24);
  const coveragePressure = metrics.coverage * 2.7;
  const turnPressure = (1 - metrics.straightness) * 1.65;
  const shortcutPressure = shortcutsCreated / Math.max(1, scale * 0.11);
  const score = pathPressure + branchPressure + (deadEndPressure * 0.62) + coveragePressure + turnPressure + (shortcutPressure * 0.84);

  if (score < 5.1) {
    return { difficulty: 'chill', score };
  }
  if (score < 6.85) {
    return { difficulty: 'standard', score };
  }
  if (score < 8.4) {
    return { difficulty: 'spicy', score };
  }
  return { difficulty: 'brutal', score };
};
