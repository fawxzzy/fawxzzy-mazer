export type NeighborTuple = readonly [top: number, bottom: number, left: number, right: number];

export interface MazeTile {
  index: number;
  x: number;
  y: number;
  floor: boolean;
  path: boolean;
  end: boolean;
  neighbors: NeighborTuple;
  neighborCount: number;
}

export interface MazeConfig {
  scale: number;
  seed: number;
  checkPointModifier: number;
  shortcutCountModifier: number;
}

export interface MazeBuildResult {
  scale: number;
  seed: number;
  tiles: MazeTile[];
  pathIndices: number[];
  wallIndices: number[];
  startIndex: number;
  endIndex: number;
  checkpointCount: number;
  shortcutsCreated: number;
}

export interface MazeGenerationState {
  processCount: number;
  resetGame: boolean;
  result: MazeBuildResult;
}
