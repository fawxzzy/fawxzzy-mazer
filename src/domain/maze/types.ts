export type Point = { x: number; y: number };
export type PatternEngineMode = 'demo' | 'loading' | 'idle' | 'kiosk';
export type MazeDifficulty = 'chill' | 'standard' | 'spicy' | 'brutal';
export type MazeSize = 'small' | 'medium' | 'large' | 'huge';
export type MazeSolveStrategy = 'astar' | 'corridor-bidirectional';
export type MazePresentationPreset = 'classic' | 'braided' | 'framed' | 'blueprint-rare';

export interface MazeCore {
  width: number;
  height: number;
  cells: Uint8Array;
  start: Point;
  goal: Point;
  seed: number;
  braidRatio: number;
  presentationPreset: MazePresentationPreset;
}

export interface MazeConfig {
  scale: number;
  seed: number;
  checkPointModifier: number;
  shortcutCountModifier: number;
  size?: MazeSize;
  presentationPreset?: MazePresentationPreset;
  minSolutionLength?: number;
  maxAttempts?: number;
}

export interface MazeBuildOptions {
  width: number;
  height: number;
  size?: MazeSize;
  seed?: number;
  braidRatio?: number;
  presentationPreset?: MazePresentationPreset;
  minSolutionLength?: number;
  maxAttempts?: number;
  rng?: () => number;
  footprint?: BoardFootprintTarget;
  includeCore?: boolean;
}

export interface MazeSolveResult {
  found: boolean;
  pathIndices: Uint32Array;
  visited: number;
  expanded: number;
  cost: number;
  strategy: MazeSolveStrategy;
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

export interface TileBoard {
  width: number;
  height: number;
  scale: number;
  tiles: Uint8Array;
  pathIndices: Uint32Array;
  startIndex: number;
  endIndex: number;
}

export interface MazeEpisode {
  seed: number;
  size: MazeSize;
  core?: MazeCore;
  raster: TileBoard;
  metrics: MazeMetrics;
  shortcutsCreated: number;
  accepted: boolean;
  difficulty: MazeDifficulty;
  difficultyScore: number;
  presentationPreset: MazePresentationPreset;
}

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
