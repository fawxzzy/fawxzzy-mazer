export interface TrailModelOptions {
  capacity?: number;
  initialTileId?: string | null;
}

export interface TrailSnapshot {
  currentPlayerTileId: string | null;
  trailHeadTileId: string | null;
  trailTailTileIds: readonly string[];
  occupancyHistory: readonly string[];
  committedTileCount: number;
}

const normalizeCapacity = (capacity: number | undefined): number => {
  if (!capacity || Number.isNaN(capacity)) {
    return 12;
  }

  return Math.max(1, Math.floor(capacity));
};

const cloneHistory = (history: readonly string[]): readonly string[] => [...history];

export class TrailModel {
  readonly #capacity: number;
  #currentPlayerTileId: string | null;
  #occupancyHistory: string[];
  #committedTileCount: number;

  constructor(options: TrailModelOptions = {}) {
    this.#capacity = normalizeCapacity(options.capacity);
    this.#currentPlayerTileId = options.initialTileId ?? null;
    this.#occupancyHistory = options.initialTileId ? [options.initialTileId] : [];
    this.#committedTileCount = options.initialTileId ? 1 : 0;
  }

  get currentPlayerTileId(): string | null {
    return this.#currentPlayerTileId;
  }

  get trailHeadTileId(): string | null {
    return this.#currentPlayerTileId;
  }

  get occupancyHistory(): readonly string[] {
    return cloneHistory(this.#occupancyHistory);
  }

  get trailTailTileIds(): readonly string[] {
    return this.#occupancyHistory.slice(0, Math.max(0, this.#occupancyHistory.length - 1));
  }

  get committedTileCount(): number {
    return this.#committedTileCount;
  }

  snapshot(): TrailSnapshot {
    return {
      currentPlayerTileId: this.#currentPlayerTileId,
      trailHeadTileId: this.#currentPlayerTileId,
      trailTailTileIds: this.trailTailTileIds,
      occupancyHistory: this.occupancyHistory,
      committedTileCount: this.#committedTileCount
    };
  }

  syncCurrentTile(currentTileId: string): TrailSnapshot {
    if (this.#currentPlayerTileId !== null && this.#currentPlayerTileId !== currentTileId) {
      throw new Error(
        `Trail head ${this.#currentPlayerTileId} does not match the current player tile ${currentTileId}. ` +
        'Commit the move first.'
      );
    }

    return this.snapshot();
  }

  tileCommitted(nextTileId: string): TrailSnapshot {
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
