export type NeighborTuple = readonly [top: number, bottom: number, left: number, right: number];

export type Point = { x: number; y: number };
export type PatternMode = 'play' | 'demo' | 'loading' | 'screensaver';

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

export interface MazeBuildResult {
  scale: number;
  seed: number;
  tiles: MazeTile[];
  pathIndices: number[];
  checkpointIndices: number[];
  wallIndices: number[];
  startIndex: number;
  endIndex: number;
  checkpointCount: number;
  shortcutsCreated: number;
  core: MazeCore;
  solution: MazeSolveResult;
  metrics: MazeMetrics;
}

export interface MazeGenerationState {
  processCount: number;
  resetGame: boolean;
  result: MazeBuildResult;
}

export interface PatternFrame {
  mode: PatternMode;
  maze: MazeBuildResult;
  solution: MazeSolveResult;
  metrics: MazeMetrics;
  t: number;
}

export interface CortexSample {
  seed: number;
  scale: number;
  solutionLength: number;
  deadEnds: number;
  junctions: number;
  straightness: number;
  coverage: number;
  path: Point[];
}

export interface CortexSink {
  push(sample: CortexSample): void;
}
