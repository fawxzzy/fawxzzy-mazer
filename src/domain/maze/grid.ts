const INVALID_NEIGHBOR = -1;
export const TILE_FLOOR = 1 << 0;
export const TILE_PATH = 1 << 1;
export const TILE_END = 1 << 2;

export const indexFromCoordinates = (x: number, y: number, width: number): number => (y * width) + x;

export const pointFromIndex = (index: number, width: number) => ({
  x: index % width,
  y: Math.floor(index / width)
});

export const xFromIndex = (index: number, width: number): number => index % width;

export const yFromIndex = (index: number, width: number): number => Math.floor(index / width);

export const isIndexValid = (index: number, width: number, height = width): boolean => index >= 0 && index < width * height;

export const createGrid = (width: number, height = width): Uint8Array => new Uint8Array(width * height);

export const getNeighborIndex = (
  index: number,
  width: number,
  height: number,
  direction: 0 | 1 | 2 | 3
): number => {
  switch (direction) {
    case 0:
      return index >= width ? index - width : INVALID_NEIGHBOR;
    case 1:
      return index < (width * (height - 1)) ? index + width : INVALID_NEIGHBOR;
    case 2:
      return index % width !== 0 ? index - 1 : INVALID_NEIGHBOR;
    case 3:
      return (index + 1) % width !== 0 ? index + 1 : INVALID_NEIGHBOR;
    default:
      return INVALID_NEIGHBOR;
  }
};

export const resolveDirectionBetween = (
  fromIndex: number,
  toIndex: number,
  width: number
): 0 | 1 | 2 | 3 | null => {
  const delta = toIndex - fromIndex;

  if (delta === -width) {
    return 0;
  }
  if (delta === width) {
    return 1;
  }
  if (delta === -1 && fromIndex % width !== 0) {
    return 2;
  }
  if (delta === 1 && (fromIndex + 1) % width !== 0) {
    return 3;
  }

  return null;
};

export const hasTileFlag = (tiles: Uint8Array, index: number, flag: number): boolean => (tiles[index] & flag) !== 0;

export const setTileFlag = (tiles: Uint8Array, index: number, flag: number, enabled = true): void => {
  tiles[index] = enabled ? (tiles[index] | flag) : (tiles[index] & ~flag);
};

export const isTileFloor = (tiles: Uint8Array, index: number): boolean => hasTileFlag(tiles, index, TILE_FLOOR);

export const isTilePath = (tiles: Uint8Array, index: number): boolean => hasTileFlag(tiles, index, TILE_PATH);

export const isTileEnd = (tiles: Uint8Array, index: number): boolean => hasTileFlag(tiles, index, TILE_END);
