import {
  cloneNode,
  edgeKey,
  uniqueStrings,
  type BeliefEdge,
  type BeliefGraphSnapshot,
  type BeliefNode,
  type LocalObservation,
  type TileId
} from './types';

const pickLowerId = (left: TileId, right: TileId): TileId => (left < right ? left : right);

export class BeliefGraph {
  private readonly nodes = new Map<TileId, BeliefNode>();

  private readonly edges = new Map<string, BeliefEdge>();

  private currentTileId: TileId | null = null;

  private currentHeading: string | null = null;

  private goalTileId: TileId | null = null;

  private goalObservedStep: number | null = null;

  private readonly observedLandmarkIds = new Set<string>();

  private readonly observedCues = new Set<string>();

  constructor() {
    // The graph starts empty and grows only from observed local state.
  }

  observe(observation: LocalObservation): void {
    const node = this.ensureNode(observation.currentTileId, observation.step);
    node.visitCount += 1;
    node.firstSeenStep = Math.min(node.firstSeenStep, observation.step);
    node.lastSeenStep = observation.step;
    node.headings = uniqueStrings([...node.headings, observation.heading]);
    node.localCues = uniqueStrings([...node.localCues, ...observation.localCues]);
    node.landmarkIds = uniqueStrings([
      ...node.landmarkIds,
      ...observation.visibleLandmarks.map((landmark) => landmark.id)
    ]);
    node.neighbors = uniqueStrings([...node.neighbors, ...observation.traversableTileIds]);

    for (const cue of observation.localCues) {
      this.observedCues.add(cue);
    }

    for (const landmark of observation.visibleLandmarks) {
      this.observedLandmarkIds.add(landmark.id);
    }

    for (const neighborId of observation.traversableTileIds) {
      this.ensureNode(neighborId, observation.step);
      this.ensureEdge(observation.currentTileId, neighborId, observation.step);
    }

    if (observation.goal.visible && observation.goal.tileId && this.goalTileId === null) {
      this.goalTileId = observation.goal.tileId;
      this.goalObservedStep = observation.step;
    }

    this.currentTileId = observation.currentTileId;
    this.currentHeading = observation.heading;
  }

  recordTraversal(from: TileId, to: TileId, step: number): void {
    const key = edgeKey(from, to);
    const edge = this.edges.get(key) ?? this.ensureEdge(from, to, step);
    edge.traversals += 1;
  }

  getCurrentTileId(): TileId | null {
    return this.currentTileId;
  }

  getCurrentHeading(): string | null {
    return this.currentHeading;
  }

  getGoalTileId(): TileId | null {
    return this.goalTileId;
  }

  getGoalObservedStep(): number | null {
    return this.goalObservedStep;
  }

  hasObservedGoal(): boolean {
    return this.goalTileId !== null;
  }

  getDiscoveredNodeCount(): number {
    return this.nodes.size;
  }

  getDiscoveredNodeIds(): TileId[] {
    return [...this.nodes.keys()].sort();
  }

  getObservedLandmarkIds(): string[] {
    return [...this.observedLandmarkIds].sort();
  }

  getObservedCues(): string[] {
    return [...this.observedCues].sort();
  }

  getNodeVisitCount(tileId: TileId): number {
    return this.nodes.get(tileId)?.visitCount ?? 0;
  }

  wasVisited(tileId: TileId): boolean {
    return this.getNodeVisitCount(tileId) > 0;
  }

  getKnownNeighbors(tileId: TileId): TileId[] {
    return [...(this.nodes.get(tileId)?.neighbors ?? [])].sort();
  }

  getUnvisitedNeighborIds(tileId: TileId): TileId[] {
    return this.getKnownNeighbors(tileId).filter((neighborId) => this.getNodeVisitCount(neighborId) === 0);
  }

  getFrontierIds(): TileId[] {
    return this.getDiscoveredNodeIds().filter((tileId) => this.getUnvisitedNeighborIds(tileId).length > 0);
  }

  getFrontierCount(): number {
    return this.getFrontierIds().length;
  }

  getUnexploredNeighborCount(tileId: TileId): number {
    return this.getUnvisitedNeighborIds(tileId).length;
  }

  hasPath(start: TileId, goal: TileId): boolean {
    return this.findPath(start, goal).length > 0;
  }

  findPath(start: TileId, goal: TileId): TileId[] {
    if (!this.nodes.has(start) || !this.nodes.has(goal)) {
      return [];
    }

    if (start === goal) {
      return [start];
    }

    const open = [{ tileId: start, g: 0, f: 0 }];
    const cameFrom = new Map<TileId, TileId>();
    const gScore = new Map<TileId, number>([[start, 0]]);
    const closed = new Set<TileId>();

    const sortOpen = (): void => {
      open.sort((left, right) => {
        if (left.f !== right.f) {
          return left.f - right.f;
        }

        return left.tileId.localeCompare(right.tileId);
      });
    };

    while (open.length > 0) {
      sortOpen();
      const current = open.shift();
      if (!current) {
        break;
      }

      if (current.tileId === goal) {
        return this.reconstructPath(cameFrom, goal);
      }

      closed.add(current.tileId);

      for (const neighbor of this.getKnownNeighbors(current.tileId)) {
        if (closed.has(neighbor)) {
          continue;
        }

        const tentativeG = (gScore.get(current.tileId) ?? Number.POSITIVE_INFINITY) + 1;
        const knownG = gScore.get(neighbor) ?? Number.POSITIVE_INFINITY;

        if (tentativeG >= knownG) {
          continue;
        }

        cameFrom.set(neighbor, current.tileId);
        gScore.set(neighbor, tentativeG);
        const next = { tileId: neighbor, g: tentativeG, f: tentativeG };
        const existingIndex = open.findIndex((entry) => entry.tileId === neighbor);
        if (existingIndex >= 0) {
          open[existingIndex] = next;
        } else {
          open.push(next);
        }
      }
    }

    return [];
  }

  snapshot(): BeliefGraphSnapshot {
    const nodes: Record<TileId, BeliefNode> = {};

    for (const [tileId, node] of this.nodes.entries()) {
      nodes[tileId] = cloneNode(node);
    }

    return {
      currentTileId: this.currentTileId,
      currentHeading: this.currentHeading,
      discoveredNodeIds: this.getDiscoveredNodeIds(),
      frontierIds: this.getFrontierIds(),
      goalTileId: this.goalTileId,
      goalObservedStep: this.goalObservedStep,
      observedLandmarkIds: this.getObservedLandmarkIds(),
      observedCues: this.getObservedCues(),
      nodes,
      edges: [...this.edges.values()].map((edge) => ({ ...edge }))
    };
  }

  private ensureNode(tileId: TileId, step: number): BeliefNode {
    const existing = this.nodes.get(tileId);
    if (existing) {
      return existing;
    }

    const node: BeliefNode = {
      id: tileId,
      firstSeenStep: step,
      lastSeenStep: step,
      visitCount: 0,
      headings: [],
      localCues: [],
      landmarkIds: [],
      neighbors: []
    };

    this.nodes.set(tileId, node);
    return node;
  }

  private ensureEdge(from: TileId, to: TileId, step: number): BeliefEdge {
    const key = edgeKey(from, to);
    const existing = this.edges.get(key);
    if (existing) {
      return existing;
    }

    const edge: BeliefEdge = {
      id: key,
      from: pickLowerId(from, to),
      to: from < to ? to : from,
      traversals: 0,
      firstSeenStep: step
    };

    this.edges.set(key, edge);
    return edge;
  }

  private reconstructPath(cameFrom: Map<TileId, TileId>, goal: TileId): TileId[] {
    const path = [goal];
    let cursor = goal;

    while (cameFrom.has(cursor)) {
      const previous = cameFrom.get(cursor);
      if (!previous) {
        break;
      }

      path.push(previous);
      cursor = previous;
    }

    return path.reverse();
  }
}
