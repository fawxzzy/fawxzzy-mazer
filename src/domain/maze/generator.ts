import { createSeededRng } from '../rng/seededRng';
import { createGrid } from './grid';
import { mapPathWithCheckpoints } from './path';
import { createShortcuts, createWallsFromPath } from './shortcuts';
import type { MazeBuildResult, MazeConfig, MazeGenerationState } from './types';

const normalizeCheckpointCount = (scale: number, modifier: number): number => Math.max(1, Math.floor(scale + (scale * modifier)));
const normalizeShortcutCount = (scale: number, modifier: number): number => Math.max(0, Math.floor(scale * modifier));

export const generateMaze = (config: MazeConfig): MazeBuildResult => {
  const tiles = createGrid(config.scale);
  const rng = createSeededRng(config.seed);
  const startIndex = rng.nextInt(0, tiles.length - 1);
  const checkpointCount = normalizeCheckpointCount(config.scale, config.checkPointModifier);

  const { pathIndices, checkpointIndices, endIndex } = mapPathWithCheckpoints(
    tiles,
    startIndex,
    config.scale,
    checkpointCount,
    rng
  );
  const wallIndices = createWallsFromPath(tiles, pathIndices, endIndex);

  const shortcutBudget = config.scale > 35 ? normalizeShortcutCount(config.scale, config.shortcutCountModifier) : 0;
  const { shortcutsCreated, wallIndices: remainingWallIndices } = createShortcuts(tiles, wallIndices, shortcutBudget, rng);

  tiles[startIndex].floor = true;
  tiles[startIndex].path = true;
  tiles[startIndex].end = false;
  tiles[endIndex].floor = true;
  tiles[endIndex].path = true;
  tiles[endIndex].end = true;

  return {
    scale: config.scale,
    seed: config.seed,
    tiles,
    pathIndices,
    checkpointIndices,
    wallIndices: remainingWallIndices,
    startIndex,
    endIndex,
    checkpointCount,
    shortcutsCreated
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
