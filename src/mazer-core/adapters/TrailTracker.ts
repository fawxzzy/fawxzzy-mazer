import type { TileId } from '../agent/types';
import type { RuntimeTrailSnapshot } from './types';

export interface TrailTrackerOptions {
  capacity?: number;
  initialTileId?: TileId | null;
}

const normalizeCapacity = (capacity: number | undefined): number => {
  if (!capacity || Number.isNaN(capacity)) {
    return 12;
  }

  return Math.max(1, Math.floor(capacity));
};

const cloneTiles = (values: readonly TileId[]): TileId[] => [...values];

export class TrailTracker {
  readonly #capacity: number;
  #currentPlayerTileId: TileId | null;
  #occupancyHistory: TileId[];
  #committedTileCount: number;

  constructor(options: TrailTrackerOptions = {}) {
    this.#capacity = normalizeCapacity(options.capacity);
    this.#currentPlayerTileId = options.initialTileId ?? null;
    this.#occupancyHistory = options.initialTileId ? [options.initialTileId] : [];
    this.#committedTileCount = options.initialTileId ? 1 : 0;
  }

  snapshot(): RuntimeTrailSnapshot {
    return {
      currentPlayerTileId: this.#currentPlayerTileId,
      trailHeadTileId: this.#currentPlayerTileId,
      trailTailTileIds: cloneTiles(this.#occupancyHistory.slice(0, Math.max(0, this.#occupancyHistory.length - 1))),
      occupancyHistory: cloneTiles(this.#occupancyHistory),
      committedTileCount: this.#committedTileCount
    };
  }

  syncCurrentTile(currentTileId: TileId): RuntimeTrailSnapshot {
    if (this.#currentPlayerTileId !== null && this.#currentPlayerTileId !== currentTileId) {
      throw new Error(
        `Trail head ${this.#currentPlayerTileId} does not match the current player tile ${currentTileId}. ` +
        'Commit the move first.'
      );
    }

    return this.snapshot();
  }

  commitTile(nextTileId: TileId): RuntimeTrailSnapshot {
    if (nextTileId.length === 0) {
      throw new Error('Committed tile ids must be non-empty.');
    }

    if (this.#currentPlayerTileId === nextTileId) {
      return this.snapshot();
    }

    this.#currentPlayerTileId = nextTileId;
    this.#occupancyHistory = [...this.#occupancyHistory, nextTileId];
    this.#committedTileCount += 1;

    if (this.#occupancyHistory.length > this.#capacity) {
      this.#occupancyHistory = this.#occupancyHistory.slice(-this.#capacity);
    }

    return this.snapshot();
  }
}
