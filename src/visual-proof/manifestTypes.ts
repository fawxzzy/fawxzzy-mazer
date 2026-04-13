import type {
  ConnectorDefinition,
  LandmarkDefinition,
  ProofStateDefinition,
  RouteSegment,
  ScenarioDefinition,
  SemanticGateDefinition,
  ShellDefinition
} from './scenarioLibrary';

export type ProofShellId = 'outer' | 'middle' | 'core';

export type PlanetDistrictType =
  | 'labyrinth-tutorial'
  | 'puzzle'
  | 'loopy-combat-capable'
  | 'scavenger-checkpoint'
  | 'vantage-observatory';

export type PlanetNodeKind =
  | 'entry'
  | 'path'
  | 'junction'
  | 'connector'
  | 'objective'
  | 'checkpoint'
  | 'vantage'
  | 'dead-end';

export type PlanetEdgePurpose = 'main' | 'branch' | 'loop' | 'connector';

export interface PlanetNode {
  id: string;
  label: string;
  shellId: ProofShellId;
  angle: number;
  kind: PlanetNodeKind;
  districtId: string;
}

export interface PlanetEdge {
  id: string;
  from: string;
  to: string;
  purpose: PlanetEdgePurpose;
  shellTransition: boolean;
  activeRotationStateIds: string[];
}

export interface PlanetMazeGraph {
  nodeIds: string[];
  edgeIds: string[];
  shellIds: ProofShellId[];
  districtIds: string[];
  landmarkIds: string[];
  gateIds: string[];
  entryNodeId: string;
  objectiveNodeId: string;
  solutionNodeIds: string[];
  solutionEdgeIds: string[];
}

export interface PlanetDistrict {
  id: string;
  name: string;
  districtType: PlanetDistrictType;
  shellIds: ProofShellId[];
  nodeIds: string[];
  landmarkIds: string[];
  topologyTargets: {
    solutionLengthBand: [number, number];
    deadEndBand: [number, number];
    loopBand: [number, number];
    shellTransitionBand: [number, number];
  };
  readabilityTargets: {
    landmarkSpacingBand: [number, number];
    objectiveVisibilityBand: [number, number];
    vantageFrequencyBand: [number, number];
  };
  mechanicHooks: string[];
}

export interface RotationState {
  id: string;
  label: string;
  currentAlignment: string;
  allowedMoves: string[];
  unlockedGates: string[];
  affectedDistricts: string[];
  shellRotations: Record<ProofShellId, number>;
  activeConnectorIds: string[];
}

export interface WayfindingCue {
  id: string;
  cueType: 'player' | 'objective' | 'landmark' | 'connector' | 'vantage';
  trigger: string;
  priority: number;
  visualTreatment: string;
  targetId: string;
}

export interface PlanetMazeMetrics {
  solutionLength: number;
  deadEndCount: number;
  junctionDegreeHistogram: Record<string, number>;
  corridorRunLength: {
    minimum: number;
    maximum: number;
    average: number;
  };
  loopCount: number;
  shellTransitionCount: number;
  landmarkSpacing: {
    minimum: number;
    average: number;
  };
  objectiveVisibilityUptime: number;
  vantageFrequency: number;
}

export interface ProofReportDefinition {
  changed: string;
  regressed: string;
  better: string;
  worse: string;
  humanJudgment: string;
}

export interface PlanetProofManifest {
  schemaVersion: 1;
  manifestId: string;
  scenarioId: string;
  title: string;
  subtitle: string;
  seed: string;
  districtType: PlanetDistrictType;
  graph: PlanetMazeGraph;
  nodes: PlanetNode[];
  edges: PlanetEdge[];
  shells: ShellDefinition[];
  districts: PlanetDistrict[];
  landmarks: LandmarkDefinition[];
  connectors: ConnectorDefinition[];
  rotationStates: RotationState[];
  wayfindingCues: WayfindingCue[];
  metrics: PlanetMazeMetrics;
  proof: {
    motion: boolean;
    evidence: string[];
    routes: RouteSegment[];
    states: ProofStateDefinition[];
    humanJudgment: string;
    semanticGate: SemanticGateDefinition;
    report: ProofReportDefinition;
  };
}

export interface ProofScenarioSource {
  kind: 'manifest' | 'fallback';
  manifestPath: string | null;
  seed: string | null;
  districtType: PlanetDistrictType | null;
  rotationStateIds: string[];
}

export interface LoadedProofScenario {
  definition: ScenarioDefinition;
  manifest: PlanetProofManifest | null;
  source: ProofScenarioSource;
}
