export type ItemKind = 'checkpoint-key' | 'signal-node' | 'shell-unlock';

export type TopologyVisibilityMode = 'visible' | 'proxied';

export type TopologyProxyKind = 'landmark' | 'connector' | 'timing' | 'signal';

export interface TopologyAnchor {
  tileId: string;
  districtId?: string;
  loopId?: string;
  checkpointId?: string;
  connectorId?: string;
  shellId?: string;
}

export interface TopologyProxyCue {
  kind: TopologyProxyKind;
  id: string;
  label: string;
  tileId?: string;
  confidence: number;
}

export interface TopologyItemDefinition {
  id: string;
  label: string;
  kind: ItemKind;
  visibility: TopologyVisibilityMode;
  anchor: TopologyAnchor;
  proxyCues: readonly TopologyProxyCue[];
  tags: readonly string[];
}

export interface ItemStateSnapshot {
  itemId: string;
  acquiredStep: number | null;
  signalActivatedStep: number | null;
  shellUnlockedStep: number | null;
  lastEvidenceStep: number | null;
}

export interface ItemProgressSnapshot {
  checkpointKeyIds: readonly string[];
  signalNodeIds: readonly string[];
  shellUnlockIds: readonly string[];
}

export interface ItemObservationContext {
  step: number;
  currentTileId: string;
  neighborTileIds: readonly string[];
  visibleLandmarkIds: readonly string[];
  visibleConnectorIds: readonly string[];
  localCues: readonly string[];
  requestedCheckpointIds?: readonly string[];
  requestedSignalNodeIds?: readonly string[];
  requestedShellIds?: readonly string[];
}

export interface ItemEvidence {
  visibility: 'none' | 'visible' | 'proxied';
  directVisible: boolean;
  proxyStrength: number;
  matchedProxyIds: readonly string[];
}

export interface ItemUsefulnessFeatures {
  directVisibility: number;
  proxyVisibility: number;
  topologyProximity: number;
  checkpointDemand: number;
  signalDemand: number;
  shellDemand: number;
  unresolvedNeed: number;
}

export interface RankedItemUsefulness {
  itemId: string;
  score: number;
  visibility: ItemEvidence['visibility'];
  features: ItemUsefulnessFeatures;
}

export interface ItemObservation {
  step: number;
  observedItemIds: readonly string[];
  evidenceByItemId: Record<string, ItemEvidence>;
  rankedUsefulness: readonly RankedItemUsefulness[];
  progress: ItemProgressSnapshot;
  states: readonly ItemStateSnapshot[];
}
