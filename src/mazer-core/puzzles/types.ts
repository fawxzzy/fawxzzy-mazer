import type { TopologyAnchor, TopologyProxyCue, TopologyVisibilityMode } from '../items/types';

export interface TopologyPuzzleDefinition {
  id: string;
  label: string;
  visibility: TopologyVisibilityMode;
  anchor: TopologyAnchor;
  proxyCues: readonly TopologyProxyCue[];
  requiredCheckpointKeyIds: readonly string[];
  requiredSignalNodeIds: readonly string[];
  requiredShellUnlockIds: readonly string[];
  outputShellId?: string;
}

export interface PuzzleObservationContext {
  step: number;
  currentTileId: string;
  neighborTileIds: readonly string[];
  visibleLandmarkIds: readonly string[];
  visibleConnectorIds: readonly string[];
  localCues: readonly string[];
  targetShellId?: string | null;
}

export interface PuzzleStateSnapshot {
  puzzleId: string;
  solvedStep: number | null;
  lastVisibleStep: number | null;
  lastProxiedStep: number | null;
  missingCheckpointKeyIds: readonly string[];
  missingSignalNodeIds: readonly string[];
  missingShellUnlockIds: readonly string[];
}

export interface PuzzleUsefulnessFeatures {
  directVisibility: number;
  proxyVisibility: number;
  topologyProximity: number;
  requirementCompletion: number;
  shellRelevance: number;
  unresolvedNeed: number;
}

export interface RankedPuzzleOpportunity {
  puzzleId: string;
  score: number;
  visibility: 'none' | 'visible' | 'proxied';
  canSolveNow: boolean;
  features: PuzzleUsefulnessFeatures;
}

export interface PuzzleObservation {
  step: number;
  observedPuzzleIds: readonly string[];
  solvedPuzzleIds: readonly string[];
  rankedOpportunities: readonly RankedPuzzleOpportunity[];
  states: readonly PuzzleStateSnapshot[];
}
