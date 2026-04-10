const INVALID_NEIGHBOR = -1;
export const TILE_FLOOR = 1 << 0;
export const TILE_PATH = 1 << 1;
export const TILE_END = 1 << 2;

export const indexFromCoordinates = (x: number, y: number, width: number): number => (y * width) + x;

export const xFromIndex = (index: number, width: number): number => index % width;

export const yFromIndex = (index: number, width: number): number => Math.floor(index / width);

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

export const isTileFloor = (tiles: Uint8Array, index: number): boolean => (tiles[index] & TILE_FLOOR) !== 0;

export const isTilePath = (tiles: Uint8Array, index: number): boolean => (tiles[index] & TILE_PATH) !== 0;

export const isTileEnd = (tiles: Uint8Array, index: number): boolean => (tiles[index] & TILE_END) !== 0;

export interface AStarScratch {
  readonly cameFrom: Int32Array;
  readonly gScore: Float64Array;
  readonly gScoreEpoch: Uint32Array;
  readonly closedEpoch: Uint32Array;
  readonly heap: MinHeap;
  epoch: number;
}

export const getAStarScratch = (cache: Map<number, AStarScratch>, size: number): AStarScratch => {
  const cached = cache.get(size);
  if (cached) {
    return cached;
  }

  const scratch: AStarScratch = {
    cameFrom: new Int32Array(size),
    gScore: new Float64Array(size),
    gScoreEpoch: new Uint32Array(size),
    closedEpoch: new Uint32Array(size),
    heap: new MinHeap(size),
    epoch: 0
  };
  cache.set(size, scratch);
  return scratch;
};

export const nextEpoch = (
  scratch: { epoch: number },
  ...resetOnOverflow: Uint32Array[]
): number => {
  scratch.epoch += 1;
  if (scratch.epoch !== 0) {
    return scratch.epoch;
  }

  for (const buffer of resetOnOverflow) {
    buffer.fill(0);
  }
  scratch.epoch = 1;
  return 1;
};

export const reconstructPath = (cameFrom: Int32Array, endIndex: number): Uint32Array => {
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

export class MinHeap {
  private indices: Uint32Array;
  private fScores: Float64Array;
  private gScores: Float64Array;
  private size = 0;

  public current = 0;

  public constructor(capacity: number) {
    const initialCapacity = Math.max(4, capacity);
    this.indices = new Uint32Array(initialCapacity);
    this.fScores = new Float64Array(initialCapacity);
    this.gScores = new Float64Array(initialCapacity);
  }

  public clear(): void {
    this.size = 0;
  }

  public hasItems(): boolean {
    return this.size > 0;
  }

  public peekFScore(): number {
    return this.size > 0 ? this.fScores[0] : Number.POSITIVE_INFINITY;
  }

  public push(index: number, g: number, f: number): void {
    this.ensureCapacity(this.size + 1);
    let cursor = this.size;
    this.size += 1;

    while (cursor > 0) {
      const parent = (cursor - 1) >> 1;
      const parentF = this.fScores[parent];
      const parentG = this.gScores[parent];
      if (parentF < f || (parentF === f && parentG <= g)) {
        break;
      }

      this.indices[cursor] = this.indices[parent];
      this.gScores[cursor] = parentG;
      this.fScores[cursor] = parentF;
      cursor = parent;
    }

    this.indices[cursor] = index;
    this.gScores[cursor] = g;
    this.fScores[cursor] = f;
  }

  public pop(): boolean {
    if (this.size === 0) {
      return false;
    }

    this.current = this.indices[0];
    const last = --this.size;
    if (last === 0) {
      return true;
    }

    const index = this.indices[last];
    const g = this.gScores[last];
    const f = this.fScores[last];
    let cursor = 0;

    while (true) {
      let child = (cursor * 2) + 1;
      if (child >= last) {
        break;
      }

      const right = child + 1;
      if (right < last) {
        const rightF = this.fScores[right];
        const childF = this.fScores[child];
        if (rightF < childF || (rightF === childF && this.gScores[right] < this.gScores[child])) {
          child = right;
        }
      }

      const childF = this.fScores[child];
      const childG = this.gScores[child];
      if (childF > f || (childF === f && childG >= g)) {
        break;
      }

      this.indices[cursor] = this.indices[child];
      this.gScores[cursor] = childG;
      this.fScores[cursor] = childF;
      cursor = child;
    }

    this.indices[cursor] = index;
    this.gScores[cursor] = g;
    this.fScores[cursor] = f;
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
}
