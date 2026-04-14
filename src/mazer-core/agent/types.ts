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

export interface PolicyCandidateAdvisoryFeatures {
  trapRisk: number;
  enemyPressure: number;
  itemOpportunity: number;
  puzzleOpportunity: number;
  timingWindow: number;
}

export type PolicyCandidateSignalMap = Partial<Record<TileId, Partial<PolicyCandidateAdvisoryFeatures>>>;

export interface LocalObservation {
  step: number;
  currentTileId: TileId;
  heading: HeadingToken;
  traversableTileIds: readonly TileId[];
  localCues: readonly string[];
  visibleLandmarks: readonly VisibleLandmark[];
  goal: LocalGoalObservation;
  candidateSignals?: PolicyCandidateSignalMap;
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
  id: string;
  targetKind: ExplorerTargetKind;
  tileId: TileId;
  path: TileId[];
  score: number;
  visitCount: number;
  unexploredNeighborCount: number;
  tieBreak: number;
}

export interface PolicyObservationFeatures {
  traversableCount: number;
  landmarkCount: number;
  localCueCount: number;
  dangerCueCount: number;
  enemyCueCount: number;
  itemCueCount: number;
  puzzleCueCount: number;
  timingCueCount: number;
  goalVisible: boolean;
}

export interface PolicyCandidateFeatures {
  pathCost: number;
  visitCount: number;
  unexploredNeighborCount: number;
  frontierCount: number;
  goalVisible: boolean;
  trapRisk: number;
  enemyPressure: number;
  itemOpportunity: number;
  puzzleOpportunity: number;
  timingWindow: number;
}

export interface PolicyActionCandidate {
  id: string;
  targetKind: ExplorerTargetKind;
  targetTileId: TileId | null;
  path: TileId[];
  nextTileId: TileId | null;
  reason: string;
  heuristicScore: number;
  policyScore: number | null;
  features: PolicyCandidateFeatures;
}

export interface PolicyEpisodeOutcome {
  arrivedTileId: TileId;
  discoveredTilesDelta: number;
  frontierDelta: number;
  replanDelta: number;
  backtrackDelta: number;
  goalVisible: boolean;
  goalObservedStep: number | null;
  trapCueCount: number;
  enemyCueCount: number;
  itemCueCount: number;
  puzzleCueCount: number;
  timingCueCount: number;
  localCues: string[];
}

export interface PolicyAdaptivePrior {
  samples: number;
  frontierValue: number;
  backtrackUrgency: number;
  trapSuspicion: number;
  enemyRisk: number;
  itemValue: number;
  puzzleValue: number;
  rotationTiming: number;
}

export interface PolicyEpisodeLogFeatures {
  totalEpisodes: number;
  global: PolicyAdaptivePrior;
  byTileId: Record<TileId, PolicyAdaptivePrior>;
}

export interface PolicyEpisode {
  step: number;
  seed: string;
  scorerId: string;
  currentTileId: TileId;
  heading: HeadingToken;
  observation: PolicyObservationFeatures;
  candidates: PolicyActionCandidate[];
  chosenCandidateId: string | null;
  chosenAction: {
    targetKind: ExplorerTargetKind;
    targetTileId: TileId | null;
    nextTileId: TileId | null;
    reason: string;
  };
  outcome: PolicyEpisodeOutcome | null;
}

export interface PolicyScorerInput {
  seed: string;
  step: number;
  observation: LocalObservation;
  snapshot: ExplorerSnapshot;
  candidates: readonly PolicyActionCandidate[];
  episodeLogFeatures?: PolicyEpisodeLogFeatures | null;
}

export interface PolicyScorer {
  readonly id: string;
  scoreCandidates(input: PolicyScorerInput): ReadonlyMap<string, number>;
  recordEpisode?(episode: PolicyEpisode): void;
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
  policyScorer?: PolicyScorer | null;
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

const clampAdvisoryValue = (value: number | null | undefined): number => Number(
  Math.min(1, Math.max(0, value ?? 0)).toFixed(4)
);

export const createEmptyPolicyCandidateAdvisoryFeatures = (): PolicyCandidateAdvisoryFeatures => ({
  trapRisk: 0,
  enemyPressure: 0,
  itemOpportunity: 0,
  puzzleOpportunity: 0,
  timingWindow: 0
});

export const normalizePolicyCandidateAdvisoryFeatures = (
  value: Partial<PolicyCandidateAdvisoryFeatures> | null | undefined
): PolicyCandidateAdvisoryFeatures => ({
  trapRisk: clampAdvisoryValue(value?.trapRisk),
  enemyPressure: clampAdvisoryValue(value?.enemyPressure),
  itemOpportunity: clampAdvisoryValue(value?.itemOpportunity),
  puzzleOpportunity: clampAdvisoryValue(value?.puzzleOpportunity),
  timingWindow: clampAdvisoryValue(value?.timingWindow)
});

export const mergePolicyCandidateAdvisoryFeatures = (
  ...entries: Array<Partial<PolicyCandidateAdvisoryFeatures> | null | undefined>
): PolicyCandidateAdvisoryFeatures => {
  let merged = createEmptyPolicyCandidateAdvisoryFeatures();

  for (const entry of entries) {
    const normalized = normalizePolicyCandidateAdvisoryFeatures(entry);
    merged = {
      trapRisk: Math.max(merged.trapRisk, normalized.trapRisk),
      enemyPressure: Math.max(merged.enemyPressure, normalized.enemyPressure),
      itemOpportunity: Math.max(merged.itemOpportunity, normalized.itemOpportunity),
      puzzleOpportunity: Math.max(merged.puzzleOpportunity, normalized.puzzleOpportunity),
      timingWindow: Math.max(merged.timingWindow, normalized.timingWindow)
    };
  }

  return merged;
};

export const cloneNode = (node: BeliefNode): BeliefNode => ({
  ...node,
  headings: [...node.headings],
  localCues: [...node.localCues],
  landmarkIds: [...node.landmarkIds],
  neighbors: [...node.neighbors]
});
