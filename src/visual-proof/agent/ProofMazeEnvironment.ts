import type { PlanetProofManifest } from '../manifestTypes';
import { ObservationProjector, type ProofMazeObservation } from './ObservationProjector';

export interface ProofMazeEnvironmentMoveResult {
  currentTileId: string;
  observation: ProofMazeObservation;
}

export class ProofMazeEnvironment {
  #projector: ObservationProjector;
  #currentTileId: string;
  #stepCount = 0;

  constructor(manifest: PlanetProofManifest, startTileId = manifest.graph.entryNodeId) {
    this.#projector = new ObservationProjector(manifest);
    this.#currentTileId = startTileId;
    this.#projector.getCurrentNode(startTileId);
  }

  getCurrentTileId(): string {
    return this.#currentTileId;
  }

  getStepCount(): number {
    return this.#stepCount;
  }

  getObservation(): ProofMazeObservation {
    return this.#projector.project(this.#currentTileId);
  }

  commitMove(nextTileId: string): ProofMazeEnvironmentMoveResult {
    const neighbors = this.#projector.getTraversableNeighborIds(this.#currentTileId);
    if (!neighbors.includes(nextTileId)) {
      throw new Error(`Tile ${nextTileId} is not reachable in one step from ${this.#currentTileId}.`);
    }

    if (nextTileId === this.#currentTileId) {
      throw new Error('The environment only supports committed moves to adjacent tiles.');
    }

    this.#currentTileId = nextTileId;
    this.#stepCount += 1;

    return {
      currentTileId: this.#currentTileId,
      observation: this.getObservation()
    };
  }
}
