import type {
  PlanetEdge,
  PlanetNode,
  PlanetProofManifest
} from '../manifestTypes';
import type { LandmarkDefinition } from '../scenarioLibrary';

export interface ProofMazeVisibleLandmark {
  id: string;
  label: string;
  shellId: LandmarkDefinition['shellId'];
  tone: LandmarkDefinition['tone'];
}

export interface ProofMazeGoalState {
  visible: boolean;
  tileId: string | null;
  label: string | null;
}

export interface ProofMazeObservation {
  tileId: string;
  tileLabel: string;
  tileKind: PlanetNode['kind'];
  traversableNeighborIds: string[];
  localCues: string[];
  visibleLandmarks: ProofMazeVisibleLandmark[];
  goal: ProofMazeGoalState;
}

const sortStrings = (values: readonly string[]): string[] => [...values].sort((left, right) => left.localeCompare(right));

const normalizeNodeLabel = (node: PlanetNode): string => node.label.trim() || node.id;

export class ObservationProjector {
  #nodesById: Map<string, PlanetNode>;
  #edgesByNodeId: Map<string, string[]>;
  #landmarksByShell: Map<LandmarkDefinition['shellId'], LandmarkDefinition[]>;
  #objectiveNodeId: string;
  #objectiveNode: PlanetNode;

  constructor(manifest: PlanetProofManifest) {
    this.#nodesById = new Map(manifest.nodes.map((node) => [node.id, node]));
    this.#edgesByNodeId = this.#buildAdjacency(manifest.nodes, manifest.edges);
    this.#landmarksByShell = this.#groupLandmarks(manifest.landmarks);
    this.#objectiveNodeId = manifest.graph.objectiveNodeId;
    const objectiveNode = this.#nodesById.get(this.#objectiveNodeId);

    if (!objectiveNode) {
      throw new Error(`Manifest objective node ${this.#objectiveNodeId} is missing.`);
    }

    this.#objectiveNode = objectiveNode;
  }

  #buildAdjacency(nodes: readonly PlanetNode[], edges: readonly PlanetEdge[]): Map<string, string[]> {
    const adjacency = new Map<string, Set<string>>();

    for (const node of nodes) {
      adjacency.set(node.id, new Set());
    }

    for (const edge of edges) {
      if (!adjacency.has(edge.from)) {
        adjacency.set(edge.from, new Set());
      }

      if (!adjacency.has(edge.to)) {
        adjacency.set(edge.to, new Set());
      }

      adjacency.get(edge.from)?.add(edge.to);
      adjacency.get(edge.to)?.add(edge.from);
    }

    const resolved = new Map<string, string[]>();
    for (const [nodeId, neighbors] of adjacency.entries()) {
      resolved.set(nodeId, sortStrings([...neighbors]));
    }

    return resolved;
  }

  #groupLandmarks(landmarks: readonly LandmarkDefinition[]): Map<LandmarkDefinition['shellId'], LandmarkDefinition[]> {
    const grouped = new Map<LandmarkDefinition['shellId'], LandmarkDefinition[]>();

    for (const landmark of landmarks) {
      const list = grouped.get(landmark.shellId) ?? [];
      list.push(landmark);
      grouped.set(landmark.shellId, list);
    }

    for (const list of grouped.values()) {
      list.sort((left, right) => left.angle === right.angle
        ? left.id.localeCompare(right.id)
        : left.angle - right.angle);
    }

    return grouped;
  }

  getCurrentNode(tileId: string): PlanetNode {
    const node = this.#nodesById.get(tileId);
    if (!node) {
      throw new Error(`Unknown maze tile ${tileId}.`);
    }

    return node;
  }

  getTraversableNeighborIds(tileId: string): string[] {
    const neighbors = this.#edgesByNodeId.get(tileId);
    if (!neighbors) {
      throw new Error(`Unknown maze tile ${tileId}.`);
    }

    return [...neighbors];
  }

  project(tileId: string): ProofMazeObservation {
    const node = this.getCurrentNode(tileId);
    const traversableNeighborIds = this.getTraversableNeighborIds(tileId);
    const visibleLandmarks = this.#getVisibleLandmarks(node);
    const goalVisible = tileId === this.#objectiveNodeId || traversableNeighborIds.includes(this.#objectiveNodeId);

    return {
      tileId: node.id,
      tileLabel: normalizeNodeLabel(node),
      tileKind: node.kind,
      traversableNeighborIds,
      localCues: this.#buildLocalCues(node, traversableNeighborIds, visibleLandmarks, goalVisible),
      visibleLandmarks,
      goal: {
        visible: goalVisible,
        tileId: goalVisible ? this.#objectiveNode.id : null,
        label: goalVisible ? normalizeNodeLabel(this.#objectiveNode) : null
      }
    };
  }

  #getVisibleLandmarks(node: PlanetNode): ProofMazeVisibleLandmark[] {
    const visible = [
      ...(this.#landmarksByShell.get(node.shellId) ?? []),
      ...(node.shellId === 'outer' ? this.#landmarksByShell.get('orbit') ?? [] : [])
    ];

    return visible.map((landmark) => ({
      id: landmark.id,
      label: landmark.label,
      shellId: landmark.shellId,
      tone: landmark.tone
    }));
  }

  #buildLocalCues(
    node: PlanetNode,
    traversableNeighborIds: string[],
    visibleLandmarks: ProofMazeVisibleLandmark[],
    goalVisible: boolean
  ): string[] {
    const cues = [
      `tile:${node.id}`,
      `label:${normalizeNodeLabel(node)}`,
      `kind:${node.kind}`,
      `neighbors:${traversableNeighborIds.length}`,
      `neighbor-ids:${traversableNeighborIds.join('|')}`,
      `landmarks:${visibleLandmarks.map((landmark) => landmark.id).join('|') || 'none'}`,
      goalVisible ? 'goal:visible' : 'goal:hidden'
    ];

    return cues;
  }
}
