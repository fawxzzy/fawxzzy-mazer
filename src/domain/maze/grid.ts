import type { MazeTile } from './types';

const INVALID_NEIGHBOR = -1;

export const indexFromCoordinates = (x: number, y: number, scale: number): number => (y * scale) + x;

export const isIndexValid = (index: number, scale: number): boolean => index >= 0 && index < scale * scale;

export const isWithinSameRow = (currentIndex: number, neighborIndex: number, direction: 0 | 1 | 2 | 3, scale: number): boolean => {
  if (direction === 3) {
    return (currentIndex + 1) % scale !== 0 && neighborIndex < scale * scale;
  }

  if (direction === 2) {
    return currentIndex % scale !== 0 && neighborIndex >= 0;
  }

  return true;
};

export const createGrid = (scale: number): MazeTile[] => {
  const tiles: MazeTile[] = new Array(scale * scale);

  for (let y = 0; y < scale; y += 1) {
    for (let x = 0; x < scale; x += 1) {
      const index = indexFromCoordinates(x, y, scale);
      const rawNeighbors: [number, number, number, number] = [
        indexFromCoordinates(x, y - 1, scale),
        indexFromCoordinates(x, y + 1, scale),
        indexFromCoordinates(x - 1, y, scale),
        indexFromCoordinates(x + 1, y, scale)
      ];

      const neighbors: [number, number, number, number] = [INVALID_NEIGHBOR, INVALID_NEIGHBOR, INVALID_NEIGHBOR, INVALID_NEIGHBOR];
      let neighborCount = 0;

      for (let direction = 0; direction < 4; direction += 1) {
        const cardinalDirection = direction as 0 | 1 | 2 | 3;
        const candidate = rawNeighbors[cardinalDirection];
        if (isIndexValid(candidate, scale) && isWithinSameRow(index, candidate, cardinalDirection, scale)) {
          neighbors[cardinalDirection] = candidate;
          neighborCount += 1;
        }
      }

      tiles[index] = {
        index,
        x,
        y,
        floor: neighborCount === 4,
        path: false,
        end: false,
        neighbors,
        neighborCount
      };
    }
  }

  return tiles;
};
