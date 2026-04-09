export type NeighborTuple = readonly [top: number, bottom: number, left: number, right: number];

export type Point = { x: number; y: number };
export type PatternEngineMode = 'demo' | 'loading' | 'idle' | 'kiosk';

export interface MazeTile {
  floor: boolean;
  path: boolean;
  end: boolean;
  neighbors: NeighborTuple;
}

export interface MazeCell {
  walls: number;
}

export interface MazeCore {
  width: number;
  height: number;
  cells: MazeCell[];
  start: Point;
  goal: Point;
  seed: number;
  braidRatio: number;
}

export interface MazeConfig {
  scale: number;
  seed: number;
  checkPointModifier: number;
  shortcutCountModifier: number;
  minSolutionLength?: number;
  maxAttempts?: number;
}

export interface MazeBuildOptions {
  width: number;
  height: number;
  seed?: number;
  braidRatio?: number;
  minSolutionLength?: number;
  maxAttempts?: number;
  rng?: () => number;
  footprint?: BoardFootprintTarget;
  includeCore?: boolean;
}

export interface MazeSolveResult {
  found: boolean;
  path: Point[];
  visited: number;
  expanded: number;
  cost: number;
}

export interface MazeMetrics {
  solutionLength: number;
  deadEnds: number;
  junctions: number;
  straightness: number;
  coverage: number;
}

export interface BoardFootprintTarget {
  width?: number;
  height?: number;
}

export interface BoardFootprintPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface TileBoard {
  width: number;
  height: number;
  scale: number;
  tiles: MazeTile[];
  pathIndices: number[];
  startIndex: number;
  endIndex: number;
  playableWidth: number;
  playableHeight: number;
  padding: BoardFootprintPadding;
}

export interface MazeEpisode {
  seed: number;
  core?: MazeCore;
  raster: TileBoard;
  metrics: MazeMetrics;
  shortcutsCreated: number;
  accepted: boolean;
}

export type MazeBuildResult = MazeEpisode;

export interface MazeGenerationState {
  processCount: number;
  resetGame: boolean;
  result: MazeEpisode;
}

export interface PatternFrame {
  mode: PatternEngineMode;
  episode: MazeEpisode;
  t: number;
}

export interface CortexSample {
  seed: number;
  metrics: MazeMetrics;
  solutionLength: number;
  turns: number;
  branches: number;
  accepted: boolean;
  solveFrames?: number[];
}

export interface CortexSink {
  push(sample: CortexSample): void;
}
