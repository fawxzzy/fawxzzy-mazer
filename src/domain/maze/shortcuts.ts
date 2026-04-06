import type { SeededRng } from '../rng/seededRng';
import type { MazeTile } from './types';

export const createWallsFromPath = (tiles: MazeTile[], pathIndices: number[], endIndex: number): number[] => {
  const wallSet = new Set<number>();

  for (const pathIndex of pathIndices) {
    for (const neighborIndex of tiles[pathIndex].neighbors) {
      if (neighborIndex === -1 || tiles[neighborIndex].path || neighborIndex === endIndex) {
        continue;
      }

      tiles[neighborIndex].floor = false;
      wallSet.add(neighborIndex);
    }
  }

  return [...wallSet];
};

export const createShortcuts = (
  tiles: MazeTile[],
  wallIndices: number[],
  shortcutCount: number,
  rng: SeededRng
): { shortcutsCreated: number; wallIndices: number[] } => {
  const mutableWalls = [...wallIndices];
  let remaining = shortcutCount;
  let created = 0;

  while (remaining > 0 && mutableWalls.length > 0) {
    const randomWallArrayIndex = rng.nextInt(0, mutableWalls.length - 1);
    const wallIndex = mutableWalls[randomWallArrayIndex];
    const tile = tiles[wallIndex];

    const [top, bottom, left, right] = tile.neighbors;
    if (top !== -1 && bottom !== -1 && left !== -1 && right !== -1 && !tile.floor) {
      const verticalWallsHorizontalPath = !tiles[top].floor && !tiles[bottom].floor && tiles[left].path && tiles[right].path;
      const horizontalWallsVerticalPath = !tiles[left].floor && !tiles[right].floor && tiles[top].path && tiles[bottom].path;

      if (verticalWallsHorizontalPath || horizontalWallsVerticalPath) {
        tile.path = true;
        tile.floor = true;
        created += 1;
        remaining -= 1;
      }
    }

    mutableWalls.splice(randomWallArrayIndex, 1);
  }

  return {
    shortcutsCreated: created,
    wallIndices: mutableWalls
  };
};
