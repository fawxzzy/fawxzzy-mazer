import { createSeededRng } from '../rng/seededRng';
import { buildMazeCore, disposeMazeEpisode } from './core';
import {
  createGrid,
  getNeighborIndex,
  indexFromCoordinates,
  isTileFloor,
  TILE_END,
  TILE_FLOOR,
  TILE_PATH,
  xFromIndex,
  yFromIndex
} from './grid';
import type {
  MazeBuildOptions,
  MazeConfig,
  MazeDifficulty,
  MazeEpisode,
  MazeFamily,
  MazeFamilyMode,
  MazeGenerationState,
  MazeMetrics,
  MazePresentationPreset,
  MazeSize,
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
  size: MazeSize;
  core: NonNullable<MazeEpisode['core']>;
  solution: MazeSolveResult;
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

interface MazeSizePreset {
  readonly key: MazeSize;
  readonly label: string;
  readonly legacyScale: number;
}

interface DifficultyTuningProfile {
  readonly shortcutCountModifier: number;
  readonly minSolutionFactor: number;
  readonly maxAttempts: number;
}

interface MazeFamilyTuningProfile {
  readonly key: MazeFamily;
  readonly braidScale: number;
  readonly braidOffset: number;
  readonly shortcutScale: number;
  readonly checkpointScale: number;
  readonly minSolutionFactorBias: number;
  readonly maxAttemptsBias: number;
}

type FamilyRotationBand = 'busy' | 'balanced' | 'composed';

export interface DifficultyResolvedMaze {
  episode: MazeEpisode;
  seed: number;
}

const PRESENTATION_PRESET_ORDER: readonly MazePresentationPreset[] = [
  'classic',
  'braided',
  'framed',
  'blueprint-rare'
] as const;

export const MAZE_FAMILY_ORDER: readonly MazeFamily[] = [
  'classic',
  'braided',
  'sparse',
  'dense',
  'framed',
  'split-flow'
] as const;

const FAMILY_ROTATION_PATTERN_OPTIONS: readonly (readonly FamilyRotationBand[])[] = [
  ['busy', 'balanced', 'composed', 'balanced', 'busy', 'composed'],
  ['balanced', 'busy', 'composed', 'busy', 'balanced', 'composed']
] as const;

const FAMILY_ROTATION_BANDS: Record<MazeFamily, FamilyRotationBand> = {
  classic: 'balanced',
  braided: 'busy',
  sparse: 'composed',
  dense: 'busy',
  framed: 'composed',
  'split-flow': 'balanced'
};

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
const DIFFICULTY_ORDER: readonly MazeDifficulty[] = ['chill', 'standard', 'spicy', 'brutal'];
const TARGET_DIFFICULTY_SEARCH_LIMIT = 8;
const TARGET_DIFFICULTY_SEED_STEP = 977;

export const MAZE_SIZE_PRESETS: readonly MazeSizePreset[] = [
  { key: 'small', label: 'Small', legacyScale: 25 },
  { key: 'medium', label: 'Medium', legacyScale: 50 },
  { key: 'large', label: 'Large', legacyScale: 75 },
  { key: 'huge', label: 'Huge', legacyScale: 100 }
] as const;

export const MAZE_SIZE_ORDER: readonly MazeSize[] = MAZE_SIZE_PRESETS.map((preset) => preset.key);

const SIZE_PRESET_BY_KEY = Object.fromEntries(
  MAZE_SIZE_PRESETS.map((preset) => [preset.key, preset])
) as Record<MazeSize, MazeSizePreset>;

const DIFFICULTY_TUNING: Record<MazeDifficulty, DifficultyTuningProfile> = {
  chill: {
    shortcutCountModifier: 0.08,
    minSolutionFactor: 0.17,
    maxAttempts: 72
  },
  standard: {
    shortcutCountModifier: 0.12,
    minSolutionFactor: 0.21,
    maxAttempts: 84
  },
  spicy: {
    shortcutCountModifier: 0.18,
    minSolutionFactor: 0.255,
    maxAttempts: 96
  },
  brutal: {
    shortcutCountModifier: 0.24,
    minSolutionFactor: 0.31,
    maxAttempts: 112
  }
};

const FAMILY_TUNING: Record<MazeFamily, MazeFamilyTuningProfile> = {
  classic: {
    key: 'classic',
    braidScale: 0.88,
    braidOffset: 0,
    shortcutScale: 0.92,
    checkpointScale: 1,
    minSolutionFactorBias: -0.005,
    maxAttemptsBias: 4
  },
  braided: {
    key: 'braided',
    braidScale: 1.68,
    braidOffset: 0.1,
    shortcutScale: 1.42,
    checkpointScale: 0.9,
    minSolutionFactorBias: -0.02,
    maxAttemptsBias: 14
  },
  sparse: {
    key: 'sparse',
    braidScale: 0.42,
    braidOffset: 0.01,
    shortcutScale: 0.62,
    checkpointScale: 1.14,
    minSolutionFactorBias: 0.028,
    maxAttemptsBias: 10
  },
  dense: {
    key: 'dense',
    braidScale: 1.28,
    braidOffset: 0.07,
    shortcutScale: 1.24,
    checkpointScale: 1.06,
    minSolutionFactorBias: 0.02,
    maxAttemptsBias: 14
  },
  framed: {
    key: 'framed',
    braidScale: 0.82,
    braidOffset: 0.015,
    shortcutScale: 0.84,
    checkpointScale: 1.08,
    minSolutionFactorBias: 0.02,
    maxAttemptsBias: 12
  },
  'split-flow': {
    key: 'split-flow',
    braidScale: 1.06,
    braidOffset: 0.05,
    shortcutScale: 1.12,
    checkpointScale: 1.12,
    minSolutionFactorBias: 0.04,
    maxAttemptsBias: 18
  }
};

export const buildCuratedFamilyRotationBlock = (seed: number, block: number): readonly MazeFamily[] => {
  const remaining = [...MAZE_FAMILY_ORDER];
  const ordered: MazeFamily[] = [];
  let previous = block > 0
    ? buildCuratedFamilyRotationBlock(seed, block - 1)[MAZE_FAMILY_ORDER.length - 1]
    : undefined;
  let state = mixFamilyRotationSeed(seed, block);
  const pattern = FAMILY_ROTATION_PATTERN_OPTIONS[state % FAMILY_ROTATION_PATTERN_OPTIONS.length];

  for (let slot = 0; slot < pattern.length; slot += 1) {
    state = lcg(state);
    const desiredBand = pattern[slot];
    const preferred = remaining.filter((family) => (
      FAMILY_ROTATION_BANDS[family] === desiredBand && family !== previous
    ));
    const sameBand = remaining.filter((family) => FAMILY_ROTATION_BANDS[family] === desiredBand);
    const fallback = remaining.filter((family) => family !== previous);
    const pool = preferred.length > 0
      ? preferred
      : sameBand.length > 0
        ? sameBand
        : fallback.length > 0
          ? fallback
          : remaining;
    const nextFamily = pool[state % pool.length];
    ordered.push(nextFamily);
    remaining.splice(remaining.indexOf(nextFamily), 1);
    previous = nextFamily;
  }

  return ordered;
};

export const resolveCuratedFamilyRotation = (seed: number, cycle: number): MazeFamily => {
  const block = Math.floor(cycle / MAZE_FAMILY_ORDER.length);
  const slot = cycle % MAZE_FAMILY_ORDER.length;
  return buildCuratedFamilyRotationBlock(seed, block)[slot] ?? MAZE_FAMILY_ORDER[0];
};

export const buildMaze = (options: MazeBuildOptions): MazeEpisode => {
  const seed = options.seed ?? Math.floor(Math.random() * 0x7fffffff);
  const seeded = options.rng ? null : createSeededRng(seed);
  const rng = options.rng ?? (() => seeded!.nextFloat());
  const logicalSize = normalizeLogicalSize(Math.min(options.width, options.height));
  const minSolutionLength = options.minSolutionLength ?? Math.max(18, Math.floor((logicalSize * logicalSize) / 4));
  const maxAttempts = options.maxAttempts ?? 64;
  const size = normalizeMazeSize(options.size ?? inferMazeSizeFromScale(Math.max(options.width, options.height)));
  const presentationPreset = normalizeMazePresentationPreset(options.presentationPreset);
  const family = resolveMazeFamily(
    options.family,
    seed,
    size,
    presentationPreset,
    options.braidRatio ?? 0,
    minSolutionLength
  );

  const built = buildMazeCore({
    width: logicalSize,
    height: logicalSize,
    seed,
    braidRatio: clamp(options.braidRatio ?? 0, 0, 0.35),
    family,
    presentationPreset,
    minSolutionLength,
    maxAttempts,
    rng
  });

  return rasterizeMaze({
    seed,
    size,
    core: built.maze,
    solution: built.solution,
    shortcutsCreated: built.shortcutsCreated,
    footprint: options.footprint ?? { width: options.width, height: options.height },
    minSolutionLength,
    acceptedCore: built.accepted,
    includeCore: options.includeCore === true
  });
};

export const generateMaze = (config: MazeConfig): MazeEpisode => {
  const size = config.size ? normalizeMazeSize(config.size) : inferMazeSizeFromScale(config.scale);
  const baseScale = config.size ? resolveMazeSizeScale(size, config.scale) : config.scale;
  const variety = resolveMazeVarietyPreset(config);
  const presentationPreset = normalizeMazePresentationPreset(config.presentationPreset);
  const family = resolveMazeFamily(
    config.family,
    config.seed,
    size,
    presentationPreset,
    config.shortcutCountModifier,
    config.minSolutionLength
  );
  const familyTuning = FAMILY_TUNING[family];
  const presentationFootprintPadding = resolvePresentationFootprintPadding(presentationPreset);
  const targetScale = Math.max(9, baseScale + variety.scaleDelta);
  const footprintTarget = Math.max(targetScale, baseScale + variety.footprintDelta + presentationFootprintPadding);
  const adjustedShortcutModifier = clamp(
    (config.shortcutCountModifier * familyTuning.shortcutScale) + familyTuning.braidOffset,
    0,
    0.4
  );
  const adjustedCheckPointModifier = clamp(config.checkPointModifier * familyTuning.checkpointScale, 0, 1);
  const braidRatio = clamp(
    (adjustedShortcutModifier * variety.braidScale * familyTuning.braidScale) + variety.braidOffset,
    0,
    0.42
  );
  const minSolutionLength = config.minSolutionLength ?? Math.max(
    18,
    Math.floor(
      (normalizeLogicalSize(targetScale) ** 2)
      * (variety.minSolutionFactor + familyTuning.minSolutionFactorBias + (adjustedCheckPointModifier * 0.08))
    )
  );
  return buildMaze({
    width: targetScale,
    height: targetScale,
    size,
    seed: config.seed,
    braidRatio,
    family,
    presentationPreset,
    minSolutionLength,
    footprint: {
      width: footprintTarget,
      height: footprintTarget
    },
    maxAttempts: config.maxAttempts ?? (96 + familyTuning.maxAttemptsBias),
    includeCore: false
  });
};

export const generateMazeForDifficulty = (
  config: MazeConfig,
  targetDifficulty: MazeDifficulty,
  seedStep = 0,
  searchLimit = TARGET_DIFFICULTY_SEARCH_LIMIT
): DifficultyResolvedMaze => {
  const targetedConfig = resolveTargetDifficultyConfig(config, targetDifficulty);
  const baseSeed = targetedConfig.seed;
  let fallback: DifficultyResolvedMaze | null = null;
  let fallbackDistance = Number.POSITIVE_INFINITY;

  for (let attempt = 0; attempt < searchLimit; attempt += 1) {
    const candidateSeed = attempt === 0
      ? baseSeed + seedStep
      : baseSeed + seedStep + (attempt * TARGET_DIFFICULTY_SEED_STEP);
    const episode = generateMaze({
      ...targetedConfig,
      seed: candidateSeed
    });
    if (episode.difficulty === targetDifficulty) {
      if (fallback) {
        disposeMazeEpisode(fallback.episode);
      }
      return {
        episode: assignCanonicalDifficulty(episode, targetDifficulty),
        seed: candidateSeed
      };
    }

    const candidateDistance = Math.abs(
      DIFFICULTY_ORDER.indexOf(episode.difficulty) - DIFFICULTY_ORDER.indexOf(targetDifficulty)
    );
    if (!fallback || candidateDistance < fallbackDistance) {
      if (fallback) {
        disposeMazeEpisode(fallback.episode);
      }
      fallback = {
        episode,
        seed: candidateSeed
      };
      fallbackDistance = candidateDistance;
      continue;
    }

    disposeMazeEpisode(episode);
  }

  if (fallback) {
    return {
      episode: assignCanonicalDifficulty(fallback.episode, targetDifficulty),
      seed: fallback.seed
    };
  }

  return {
    episode: assignCanonicalDifficulty(generateMaze(targetedConfig), targetDifficulty),
    seed: baseSeed
  };
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
    solution,
    seed,
    size,
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
    pathIndices: expandCorePathToTilePath(core, solution.pathIndices, playableWidth),
    startIndex,
    endIndex
  }, footprint);

  for (let pathCursor = 0; pathCursor < raster.pathIndices.length; pathCursor += 1) {
    raster.tiles[raster.pathIndices[pathCursor]] |= TILE_PATH;
  }
  raster.tiles[raster.endIndex] |= TILE_END;

  const metrics = measureTileMaze(raster.tiles, raster.width, raster.height, raster.pathIndices);
  const rasterMinSolutionLength = Math.max(1, (minSolutionLength * 2) - 1);
  const difficultyResult = classifyMazeDifficulty(metrics, raster.width, raster.height, shortcutsCreated);

  return {
    seed,
    size,
    core: includeCore ? core : undefined,
    raster: {
      ...raster
    },
    metrics,
    shortcutsCreated,
    accepted: acceptedCore && solution.found && passesRasterQualityGate(metrics, rasterMinSolutionLength),
    difficulty: difficultyResult.difficulty,
    difficultyScore: difficultyResult.score,
    family: core.family,
    placementStrategy: core.placementStrategy,
    presentationPreset: core.presentationPreset
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

const expandCorePathToTilePath = (
  core: RasterizeOptions['core'],
  corePath: ArrayLike<number>,
  rasterWidth: number
): Uint32Array => {
  if (corePath.length === 0) {
    return EMPTY_PATH;
  }

  const expanded: number[] = [];
  for (let index = 0; index < corePath.length; index += 1) {
    const cellIndex = corePath[index];
    const cellX = xFromIndex(cellIndex, core.width);
    const cellY = yFromIndex(cellIndex, core.width);
    const rasterCellIndex = indexFromCoordinates(cellX * 2, cellY * 2, rasterWidth);

    if (expanded.length === 0) {
      expanded.push(rasterCellIndex);
    } else {
      const previousCell = corePath[index - 1];
      const previousX = xFromIndex(previousCell, core.width);
      const previousY = yFromIndex(previousCell, core.width);
      expanded.push(indexFromCoordinates((previousX * 2) + (cellX - previousX), (previousY * 2) + (cellY - previousY), rasterWidth));
      expanded.push(rasterCellIndex);
    }
  }

  return Uint32Array.from(expanded);
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
    branchDensity: junctions / Math.max(1, floorTileCount),
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

const passesRasterQualityGate = (metrics: MazeMetrics, minSolutionLength: number): boolean => (
  metrics.solutionLength >= minSolutionLength
  && metrics.straightness <= 0.9
  && metrics.coverage > 0
);

const resolveMazeVarietyPreset = (config: MazeConfig): MazeVarietyPreset => {
  const pool = config.shortcutCountModifier <= 0.14
    ? MENU_VARIETY_POOL
    : GAME_VARIETY_POOL;
  const sizeScale = config.size ? resolveMazeSizeScale(normalizeMazeSize(config.size), config.scale) : config.scale;
  const seedMix = Math.imul((config.seed >>> 0) ^ ((sizeScale & 0xff) << 9), 0x9e3779b1) >>> 0;
  return MAZE_VARIETY_PRESETS[pool[seedMix % pool.length]];
};

const resolveTargetDifficultyConfig = (config: MazeConfig, targetDifficulty: MazeDifficulty): MazeConfig => {
  const size = config.size ? normalizeMazeSize(config.size) : inferMazeSizeFromScale(config.scale);
  const sizeScale = config.size ? resolveMazeSizeScale(size, config.scale) : config.scale;
  const tuning = DIFFICULTY_TUNING[targetDifficulty];
  return {
    ...config,
    size,
    scale: sizeScale,
    maxAttempts: config.maxAttempts ?? tuning.maxAttempts,
    minSolutionLength: config.minSolutionLength ?? Math.max(18, Math.floor(sizeScale * tuning.minSolutionFactor)),
    shortcutCountModifier: tuning.shortcutCountModifier
  };
};

export const normalizeMazeSize = (value: unknown): MazeSize => (
  typeof value === 'string' && MAZE_SIZE_ORDER.includes(value as MazeSize)
    ? value as MazeSize
    : 'medium'
);

export const normalizeMazeFamilyMode = (value: unknown): MazeFamilyMode => (
  typeof value === 'string' && (value === 'auto' || MAZE_FAMILY_ORDER.includes(value as MazeFamily))
    ? value as MazeFamilyMode
    : 'auto'
);

export const normalizeMazeFamily = (value: unknown): MazeFamily => (
  typeof value === 'string' && MAZE_FAMILY_ORDER.includes(value as MazeFamily)
    ? value as MazeFamily
    : 'classic'
);

export const normalizeMazePresentationPreset = (value: unknown): MazePresentationPreset => (
  typeof value === 'string' && PRESENTATION_PRESET_ORDER.includes(value as MazePresentationPreset)
    ? value as MazePresentationPreset
    : 'classic'
);

export const resolveMazeSizeScale = (size: MazeSize, fallbackScale = SIZE_PRESET_BY_KEY.medium.legacyScale): number => (
  SIZE_PRESET_BY_KEY[size]?.legacyScale ?? fallbackScale
);

export const getMazeSizeLabel = (size: MazeSize): string => SIZE_PRESET_BY_KEY[normalizeMazeSize(size)].label;

export const getMazeFamilyLabel = (family: MazeFamily): string => (
  family === 'split-flow'
    ? 'Split Flow'
    : family.charAt(0).toUpperCase() + family.slice(1)
);

const assignCanonicalDifficulty = (episode: MazeEpisode, difficulty: MazeDifficulty): MazeEpisode => {
  episode.difficulty = difficulty;
  return episode;
};

const inferMazeSizeFromScale = (scale: number): MazeSize => {
  let bestSize: MazeSize = 'medium';
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const preset of MAZE_SIZE_PRESETS) {
    const distance = Math.abs(scale - preset.legacyScale);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestSize = preset.key;
    }
  }

  return bestSize;
};

const resolveMazeFamily = (
  mode: MazeFamilyMode | undefined,
  seed: number,
  size: MazeSize,
  presentationPreset: MazePresentationPreset,
  varianceSignal: number,
  solutionSignal: number | undefined
): MazeFamily => {
  const normalizedMode = normalizeMazeFamilyMode(mode);
  if (normalizedMode !== 'auto') {
    return normalizedMode;
  }

  const presetSalt = presentationPreset.charCodeAt(0) ^ presentationPreset.charCodeAt(presentationPreset.length - 1);
  const sizeSalt = resolveMazeSizeScale(size) & 0xff;
  const varianceSalt = Math.round(clamp(varianceSignal, 0, 1_000) * 100) & 0xffff;
  const solutionSalt = (solutionSignal ?? 0) & 0xffff;
  const mixed = Math.imul(
    (seed >>> 0) ^ (sizeSalt << 7) ^ (varianceSalt << 13) ^ (solutionSalt << 3),
    (0x9e3779b1 ^ presetSalt) >>> 0
  ) >>> 0;
  return MAZE_FAMILY_ORDER[mixed % MAZE_FAMILY_ORDER.length];
};

const resolvePresentationFootprintPadding = (preset: MazePresentationPreset): number => (
  preset === 'framed' || preset === 'blueprint-rare' ? 2 : 0
);

const mixFamilyRotationSeed = (seed: number, block: number): number => (
  Math.imul((seed >>> 0) ^ ((block & 0xffff) << 11), 0x45d9f3b) >>> 0
);

const lcg = (state: number): number => (Math.imul(state || 1, 1664525) + 1013904223) >>> 0;

export const classifyMazeDifficulty = (
  metrics: MazeMetrics,
  width: number,
  height: number,
  shortcutsCreated: number
): { difficulty: MazeDifficulty; score: number } => {
  const scale = Math.max(width, height);
  const pathPressure = metrics.solutionLength / Math.max(1, scale * 1.18);
  const branchPressure = metrics.junctions / Math.max(1, scale * 0.19);
  const branchDensityPressure = metrics.branchDensity * scale * 0.32;
  const deadEndPressure = metrics.deadEnds / Math.max(1, scale * 0.24);
  const coveragePressure = metrics.coverage * 2.7;
  const turnPressure = (1 - metrics.straightness) * 1.65;
  const shortcutPressure = shortcutsCreated / Math.max(1, scale * 0.11);
  const score = pathPressure
    + branchPressure
    + branchDensityPressure
    + (deadEndPressure * 0.62)
    + coveragePressure
    + turnPressure
    + (shortcutPressure * 0.84);

  if (score < 9) {
    return { difficulty: 'chill', score };
  }
  if (score < 17) {
    return { difficulty: 'standard', score };
  }
  if (score < 28) {
    return { difficulty: 'spicy', score };
  }
  return { difficulty: 'brutal', score };
};
