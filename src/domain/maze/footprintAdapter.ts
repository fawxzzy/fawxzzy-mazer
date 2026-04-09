import { createGrid, indexFromCoordinates } from './grid';
import type { BoardFootprintTarget, TileBoard } from './types';

export const adaptTileBoardFootprint = (
  board: TileBoard,
  target?: BoardFootprintTarget
): TileBoard => {
  const targetWidth = Math.max(board.width, target?.width ?? board.width);
  const targetHeight = Math.max(board.height, target?.height ?? board.height);

  if (targetWidth === board.width && targetHeight === board.height) {
    return board;
  }

  const left = Math.floor((targetWidth - board.width) / 2);
  const right = targetWidth - board.width - left;
  const top = Math.floor((targetHeight - board.height) / 2);
  const bottom = targetHeight - board.height - top;
  const tiles = createGrid(targetWidth, targetHeight).map((tile) => ({
    ...tile,
    floor: false,
    path: false,
    end: false
  }));

  for (const tile of board.tiles) {
    const targetIndex = indexFromCoordinates(tile.x + left, tile.y + top, targetWidth);
    tiles[targetIndex] = {
      ...tiles[targetIndex],
      floor: tile.floor,
      path: tile.path,
      end: tile.end
    };
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
    checkpointIndices: board.checkpointIndices.map(shiftIndex),
    wallIndices: board.wallIndices.map(shiftIndex),
    startIndex: shiftIndex(board.startIndex),
    endIndex: shiftIndex(board.endIndex),
    checkpointCount: board.checkpointCount,
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
