import type { MazeTile } from './types';

const INVALID_NEIGHBOR = -1;

export const indexFromCoordinates = (x: number, y: number, width: number): number => (y * width) + x;

export const pointFromIndex = (index: number, width: number) => ({
  x: index % width,
  y: Math.floor(index / width)
});

export const isIndexValid = (index: number, width: number, height = width): boolean => index >= 0 && index < width * height;

export const isWithinSameRow = (currentIndex: number, _neighborIndex: number, direction: 0 | 1 | 2 | 3, width: number): boolean => {
  if (direction === 3) {
    return (currentIndex + 1) % width !== 0;
  }

  if (direction === 2) {
    return currentIndex % width !== 0;
  }

  return true;
};

export const createGrid = (width: number, height = width): MazeTile[] => {
  const tiles: MazeTile[] = new Array(width * height);

  for (let index = 0; index < tiles.length; index += 1) {
    const x = index % width;
    const y = Math.floor(index / width);
    const neighbors: [number, number, number, number] = [INVALID_NEIGHBOR, INVALID_NEIGHBOR, INVALID_NEIGHBOR, INVALID_NEIGHBOR];
    let floor = true;

    const rawNeighbors: [number, number, number, number] = [
      indexFromCoordinates(x, y - 1, width),
      indexFromCoordinates(x, y + 1, width),
      indexFromCoordinates(x - 1, y, width),
      indexFromCoordinates(x + 1, y, width)
    ];

    for (let direction = 0; direction < 4; direction += 1) {
      const cardinalDirection = direction as 0 | 1 | 2 | 3;
      const candidate = rawNeighbors[cardinalDirection];
      if (isIndexValid(candidate, width, height) && isWithinSameRow(index, candidate, cardinalDirection, width)) {
        neighbors[cardinalDirection] = candidate;
        continue;
      }
      floor = false;
    }

    tiles[index] = {
      floor,
      path: false,
      end: false,
      neighbors
    };
  }

  return tiles;
};
