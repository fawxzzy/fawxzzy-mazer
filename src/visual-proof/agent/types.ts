export type TileId = string;
export type HeadingToken = string;

export type ExplorerMode = 'explore' | 'goal' | 'idle';
export type ExplorerTargetKind = 'frontier' | 'goal' | 'backtrack' | 'idle';

export interface VisibleLandmark {
  id: string;
  label: string;
  tileId?: TileId;
  cue?: string;
}

export interface LocalGoalObservation {
  visible: boolean;
  tileId: TileId | null;
  label?: string;
}

export interface LocalObservation {
  step: number;
  currentTileId: TileId;
  heading: HeadingToken;
  traversableTileIds: readonly TileId[];
  localCues: readonly string[];
  visibleLandmarks: readonly VisibleLandmark[];
  goal: LocalGoalObservation;
}

export interface BeliefNode {
  id: TileId;
  firstSeenStep: number;
  lastSeenStep: number;
  visitCount: number;
  headings: HeadingToken[];
  localCues: string[];
  landmarkIds: string[];
  neighbors: TileId[];
}

export interface BeliefEdge {
  id: string;
  from: TileId;
  to: TileId;
  traversals: number;
  firstSeenStep: number;
}

export interface BeliefGraphSnapshot {
  currentTileId: TileId | null;
  currentHeading: HeadingToken | null;
  discoveredNodeIds: TileId[];
  frontierIds: TileId[];
  goalTileId: TileId | null;
  goalObservedStep: number | null;
  observedLandmarkIds: string[];
  observedCues: string[];
  nodes: Record<TileId, BeliefNode>;
  edges: BeliefEdge[];
}

export interface FrontierCandidate {
  tileId: TileId;
  path: TileId[];
  score: number;
  visitCount: number;
  unexploredNeighborCount: number;
  tieBreak: number;
}

export interface ExplorerDecision {
  step: number;
  currentTileId: TileId;
  targetKind: ExplorerTargetKind;
  targetTileId: TileId | null;
  path: TileId[];
  nextTileId: TileId | null;
  reason: string;
  goalVisible: boolean;
}

export interface ExplorerActionLogEntry extends ExplorerDecision {
  seed: string;
}

export interface ExplorerCounters {
  replanCount: number;
  backtrackCount: number;
  frontierCount: number;
  goalObservedStep: number | null;
  tilesDiscovered: number;
}

export interface ExplorerSnapshot {
  seed: string;
  currentTileId: TileId | null;
  currentHeading: HeadingToken | null;
  mode: ExplorerMode;
  counters: ExplorerCounters;
  discoveredNodeIds: TileId[];
  frontierIds: TileId[];
  goalTileId: TileId | null;
  observedLandmarkIds: string[];
  observedCues: string[];
}

export interface ExplorerAgentOptions {
  seed: string;
  startTileId: TileId;
  startHeading?: HeadingToken;
}

export const edgeKey = (from: TileId, to: TileId): string => [from, to].sort().join('::');

export const uniqueStrings = (values: readonly string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
};

export const stableTokenScore = (seed: string, tileId: TileId, heading: HeadingToken): number => {
  const input = `${seed}|${tileId}|${heading}`;
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0) / 0xffffffff;
};

export const cloneNode = (node: BeliefNode): BeliefNode => ({
  ...node,
  headings: [...node.headings],
  localCues: [...node.localCues],
  landmarkIds: [...node.landmarkIds],
  neighbors: [...node.neighbors]
});

