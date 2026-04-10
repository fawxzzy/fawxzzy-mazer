import type {
  CortexSample,
  CortexSink,
  MazeEpisode,
  MazeCore,
  MazeFamily,
  MazeMetrics,
  MazePlacementStrategy,
  MazePresentationPreset,
  MazeSolveResult,
  PatternFrame,
  PatternEngineMode,
  Point
} from './types';
import {
  getAStarScratch,
  getNeighborIndex,
  isTileFloor,
  MinHeap,
  nextEpoch,
  reconstructPath,
  type AStarScratch,
  xFromIndex,
  yFromIndex
} from './grid';

const N = 1 << 0;
const E = 1 << 1;
const S = 1 << 2;
const W = 1 << 3;
const ALL_WALLS = N | E | S | W;
const EMPTY_UINT8 = new Uint8Array(0);
const EMPTY_UINT32 = new Uint32Array(0);

const DIRS = [
  { bit: N, dx: 0, dy: -1, opposite: S },
  { bit: E, dx: 1, dy: 0, opposite: W },
  { bit: S, dx: 0, dy: 1, opposite: N },
  { bit: W, dx: -1, dy: 0, opposite: E }
] as const;

interface CoreBuildOptions {
  width: number;
  height: number;
  seed: number;
  braidRatio: number;
  family: MazeFamily;
  presentationPreset: MazePresentationPreset;
  minSolutionLength: number;
  maxAttempts: number;
  rng: () => number;
}

interface CoreBuildResult {
  maze: MazeCore;
  solution: MazeSolveResult;
  metrics: MazeMetrics;
  topology: MazeTopologyStats;
  shortcutsCreated: number;
  accepted: boolean;
}

interface MazeScratch {
  readonly inTree: Uint8Array;
  readonly walkNext: Int32Array;
  readonly walkStamp: Uint32Array;
  readonly queue: Int32Array;
  readonly distance: Int32Array;
  readonly seenEpoch: Uint32Array;
  walkEpoch: number;
  bfsEpoch: number;
}

interface CorridorEdge {
  readonly id: number;
  readonly a: number;
  readonly b: number;
  readonly cost: number;
  readonly path: Uint32Array;
}

interface CorridorGraph {
  readonly nodeIds: Uint32Array;
  readonly nodeToGraph: Int32Array;
  readonly edges: readonly CorridorEdge[];
  readonly adjacency: ReadonlyArray<readonly number[]>;
}

interface MazeTopologyStats {
  readonly corridorMean: number;
  readonly corridorP90: number;
  readonly branchingFactor: number;
  readonly perimeterPathShare: number;
  readonly centerCrossings: number;
  readonly quadrantCoverage: number;
  readonly startGoalSpan: number;
  readonly startGoalEdgeBias: number;
  readonly turnRate: number;
}

interface PlacementResult {
  readonly start: Point;
  readonly goal: Point;
  readonly strategy: MazePlacementStrategy;
}

interface PlacementCandidate {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly corridorLead: number;
  readonly edgeBias: number;
  readonly borderMask: number;
}

interface BidirectionalExpansionOptions {
  readonly maze: MazeCore;
  readonly graph: CorridorGraph;
  readonly heap: AStarScratch['heap'];
  readonly closed: Uint8Array;
  readonly ownCost: Float64Array;
  readonly otherCost: Float64Array;
  readonly previous: Int32Array;
  readonly previousEdge: Int32Array;
  readonly bestCost: number;
  readonly meetingNode: number;
}

interface BidirectionalExpansionResult {
  readonly visited: number;
  readonly expanded: number;
  readonly bestCost: number;
  readonly meetingNode: number;
}

const mazeScratchCache = new Map<number, MazeScratch>();
const solveScratchCache = new Map<number, AStarScratch>();
const getHeap = (size: number): MinHeap => new MinHeap(size);
const tieBreakPriority = (_cost: number, nodeId: number): number => nodeId;

const FAMILY_SEARCH_WINDOW: Record<MazeFamily, number> = {
  classic: 8,
  braided: 10,
  sparse: 18,
  dense: 10,
  framed: 12,
  'split-flow': 16
};

const FAMILY_PLACEMENT_STRATEGIES: Record<MazeFamily, readonly MazePlacementStrategy[]> = {
  classic: ['farthest-pair', 'corner-opposed', 'edge-biased'],
  braided: ['edge-biased', 'region-opposed', 'farthest-pair'],
  sparse: ['corridor-biased', 'corner-opposed', 'farthest-pair'],
  dense: ['region-opposed', 'edge-biased', 'farthest-pair'],
  framed: ['edge-biased', 'corner-opposed', 'region-opposed'],
  'split-flow': ['region-opposed', 'corridor-biased', 'edge-biased']
};

export const buildMazeCore = (options: CoreBuildOptions): CoreBuildResult => {
  const {
    width,
    height,
    seed,
    braidRatio,
    family,
    presentationPreset,
    minSolutionLength,
    maxAttempts,
    rng
  } = options;

  const attemptLimit = Math.max(1, Math.min(maxAttempts, FAMILY_SEARCH_WINDOW[family]));
  let fallback: { result: CoreBuildResult; score: number } | null = null;
  let acceptedFallback: { result: CoreBuildResult; score: number } | null = null;

  for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
    const maze = generateWilsonMaze(width, height, seed, braidRatio, family, presentationPreset, rng);
    const shortestPath = solveCorridorGraph(maze, maze.start, maze.goal);
    if (!shortestPath.found) {
      continue;
    }

    const metrics = measureMaze(maze, shortestPath.pathIndices);
    const topology = measureTopology(maze, shortestPath.pathIndices);
    const shortcutsCreated = countOpeningsBeyondTree(maze);
    const built = {
      maze,
      solution: shortestPath,
      metrics,
      topology,
      shortcutsCreated,
      accepted: passesQualityGate(maze.family, metrics, topology, minSolutionLength)
    };
    const score = scoreFamilyCandidate(built, attempt);

    if (!fallback || score > fallback.score) {
      fallback = { result: built, score };
    }

    if (built.accepted) {
      if (!acceptedFallback || score > acceptedFallback.score) {
        acceptedFallback = { result: built, score };
      }
    }
  }

  if (acceptedFallback) {
    return acceptedFallback.result;
  }

  if (fallback) {
    return fallback.result;
  }

  const maze = generateWilsonMaze(width, height, seed, braidRatio, family, presentationPreset, rng);
  const solution = solveCorridorGraph(maze, maze.start, maze.goal);
  const topology = measureTopology(maze, solution.pathIndices);
  return {
    maze,
    solution,
    metrics: measureMaze(maze, solution.pathIndices),
    topology,
    shortcutsCreated: countOpeningsBeyondTree(maze),
    accepted: false
  };
};

export const solveAStar = (maze: MazeCore, start: Point, goal: Point): MazeSolveResult => {
  const startIdx = indexOf(maze.width, start.x, start.y);
  const goalIdx = indexOf(maze.width, goal.x, goal.y);
  const goalX = goal.x;
  const goalY = goal.y;
  const scratch = getSolveScratch(maze.cells.length);
  const epoch = nextEpoch(scratch, scratch.gScoreEpoch, scratch.closedEpoch);

  scratch.cameFrom[startIdx] = -1;
  scratch.gScore[startIdx] = 0;
  scratch.gScoreEpoch[startIdx] = epoch;
  scratch.heap.clear();
  scratch.heap.push(startIdx, 0, heuristicXY(start.x, start.y, goalX, goalY));

  let visited = 0;
  let expanded = 0;

  while (scratch.heap.pop()) {
    const currentIdx = scratch.heap.current;
    if (scratch.closedEpoch[currentIdx] === epoch) {
      continue;
    }

    scratch.closedEpoch[currentIdx] = epoch;
    visited += 1;

    if (currentIdx === goalIdx) {
      return {
        found: true,
        pathIndices: reconstructPath(scratch.cameFrom, currentIdx),
        visited,
        expanded,
        cost: scratch.gScore[currentIdx],
        strategy: 'astar'
      };
    }

    expanded += 1;
    const currentG = scratch.gScore[currentIdx];
    const currentX = xFromIndex(currentIdx, maze.width);
    const currentY = yFromIndex(currentIdx, maze.width);
    const cell = maze.cells[currentIdx];

    for (let direction = 0; direction < DIRS.length; direction += 1) {
      const dir = DIRS[direction];
      if ((cell & dir.bit) !== 0) {
        continue;
      }

      const nextX = currentX + dir.dx;
      const nextY = currentY + dir.dy;
      if (!inBounds(nextX, nextY, maze.width, maze.height)) {
        continue;
      }

      const next = indexOf(maze.width, nextX, nextY);
      if (scratch.closedEpoch[next] === epoch) {
        continue;
      }

      const tentativeG = currentG + 1;
      const seenBefore = scratch.gScoreEpoch[next] === epoch;
      if (seenBefore && tentativeG >= scratch.gScore[next]) {
        continue;
      }

      scratch.cameFrom[next] = currentIdx;
      scratch.gScore[next] = tentativeG;
      scratch.gScoreEpoch[next] = epoch;
      scratch.heap.push(next, tentativeG, tentativeG + heuristicXY(nextX, nextY, goalX, goalY));
    }
  }

  return {
    found: false,
    pathIndices: EMPTY_UINT32,
    visited,
    expanded,
    cost: Number.POSITIVE_INFINITY,
    strategy: 'astar'
  };
};

export const solveCorridorGraph = (maze: MazeCore, start: Point, goal: Point): MazeSolveResult => {
  const graph = buildCorridorGraph(maze, start, goal);
  const startNode = graph.nodeToGraph[indexOf(maze.width, start.x, start.y)];
  const goalNode = graph.nodeToGraph[indexOf(maze.width, goal.x, goal.y)];

  if (startNode < 0 || goalNode < 0) {
    return {
      found: false,
      pathIndices: EMPTY_UINT32,
      visited: 0,
      expanded: 0,
      cost: Number.POSITIVE_INFINITY,
      strategy: 'corridor-bidirectional'
    };
  }

  if (startNode === goalNode) {
    return {
      found: true,
      pathIndices: new Uint32Array([graph.nodeIds[startNode]]),
      visited: 1,
      expanded: 0,
      cost: 0,
      strategy: 'corridor-bidirectional'
    };
  }

  const nodeCount = graph.nodeIds.length;
  const forwardCost = new Float64Array(nodeCount);
  const backwardCost = new Float64Array(nodeCount);
  forwardCost.fill(Number.POSITIVE_INFINITY);
  backwardCost.fill(Number.POSITIVE_INFINITY);

  const forwardPrev = new Int32Array(nodeCount);
  const backwardPrev = new Int32Array(nodeCount);
  const forwardEdge = new Int32Array(nodeCount);
  const backwardEdge = new Int32Array(nodeCount);
  forwardPrev.fill(-1);
  backwardPrev.fill(-1);
  forwardEdge.fill(-1);
  backwardEdge.fill(-1);

  const closedForward = new Uint8Array(nodeCount);
  const closedBackward = new Uint8Array(nodeCount);
  const forwardHeap = getHeap(nodeCount);
  const backwardHeap = getHeap(nodeCount);

  forwardHeap.clear();
  backwardHeap.clear();
  forwardCost[startNode] = 0;
  backwardCost[goalNode] = 0;
  forwardHeap.push(startNode, tieBreakPriority(0, graph.nodeIds[startNode]), 0);
  backwardHeap.push(goalNode, tieBreakPriority(0, graph.nodeIds[goalNode]), 0);

  let bestCost = Number.POSITIVE_INFINITY;
  let meetingNode = -1;
  let visited = 0;
  let expanded = 0;

  while (forwardHeap.hasItems() && backwardHeap.hasItems()) {
    if (bestCost <= (forwardHeap.peekFScore() + backwardHeap.peekFScore())) {
      break;
    }

    if (forwardHeap.peekFScore() <= backwardHeap.peekFScore()) {
      const result = expandBidirectionalFrontier({
        maze,
        graph,
        heap: forwardHeap,
        closed: closedForward,
        ownCost: forwardCost,
        otherCost: backwardCost,
        previous: forwardPrev,
        previousEdge: forwardEdge,
        bestCost,
        meetingNode
      });
      visited += result.visited;
      expanded += result.expanded;
      bestCost = result.bestCost;
      meetingNode = result.meetingNode;
      continue;
    }

    const result = expandBidirectionalFrontier({
      maze,
      graph,
      heap: backwardHeap,
      closed: closedBackward,
      ownCost: backwardCost,
      otherCost: forwardCost,
      previous: backwardPrev,
      previousEdge: backwardEdge,
      bestCost,
      meetingNode
    });
    visited += result.visited;
    expanded += result.expanded;
    bestCost = result.bestCost;
    meetingNode = result.meetingNode;
  }

  if (meetingNode === -1 || !Number.isFinite(bestCost)) {
    return {
      found: false,
      pathIndices: EMPTY_UINT32,
      visited,
      expanded,
      cost: Number.POSITIVE_INFINITY,
      strategy: 'corridor-bidirectional'
    };
  }

  return {
    found: true,
    pathIndices: expandCorridorSolution(graph, meetingNode, forwardPrev, forwardEdge, backwardPrev, backwardEdge),
    visited,
    expanded,
    cost: bestCost,
    strategy: 'corridor-bidirectional'
  };
};

export const measureMaze = (maze: MazeCore, pathIndices: ArrayLike<number>): MazeMetrics => {
  let deadEnds = 0;
  let junctions = 0;
  let straightSegments = 0;

  for (let index = 0; index < maze.cells.length; index += 1) {
    const degree = countOpenNeighbors(maze, index);
    if (degree === 1) {
      deadEnds += 1;
    } else if (degree >= 3) {
      junctions += 1;
    }
  }

  for (let index = 1; index < pathIndices.length - 1; index += 1) {
    const ab = pathIndices[index] - pathIndices[index - 1];
    const bc = pathIndices[index + 1] - pathIndices[index];
    const abx = ab % maze.width;
    const aby = Math.trunc(ab / maze.width);
    const bcx = bc % maze.width;
    const bcy = Math.trunc(bc / maze.width);
    if (abx === bcx && aby === bcy) {
      straightSegments += 1;
    }
  }

  return {
    solutionLength: pathIndices.length,
    deadEnds,
    junctions,
    straightness: pathIndices.length <= 2 ? 1 : straightSegments / Math.max(1, pathIndices.length - 2),
    coverage: pathIndices.length / Math.max(1, maze.cells.length)
  };
};

export const isPlayable = (episode: MazeEpisode): boolean => episode.raster.pathIndices.length > 0;

export const toCortexSample = (episode: MazeEpisode, solveFrames?: number[]): CortexSample => ({
  seed: episode.seed,
  metrics: { ...episode.metrics },
  solutionLength: episode.raster.pathIndices.length,
  turns: countTurns(episode.raster.pathIndices, episode.raster.width),
  branches: countSolutionBranches(episode),
  accepted: episode.accepted,
  ...(solveFrames ? { solveFrames: [...solveFrames] } : {})
});

export const disposeMazeEpisode = (episode?: MazeEpisode | null): void => {
  if (!episode) {
    return;
  }

  if (episode.core) {
    episode.core.cells = EMPTY_UINT8;
    episode.core = undefined;
  }
  episode.raster.tiles = EMPTY_UINT8;
  episode.raster.pathIndices = EMPTY_UINT32;
  episode.raster.width = 0;
  episode.raster.height = 0;
  episode.raster.scale = 0;
  episode.raster.startIndex = 0;
  episode.raster.endIndex = 0;
};

export class PatternEngine {
  private elapsed = 0;
  private current?: PatternFrame;
  private active = true;

  public constructor(
    private readonly makeMaze: () => MazeEpisode,
    private readonly mode: PatternEngineMode,
    private readonly cortex?: CortexSink
  ) {}

  public next(dtSeconds: number): PatternFrame {
    if (!this.current) {
      this.current = this.createFrame();
      return this.current;
    }

    if (!this.active) {
      return this.current;
    }

    this.elapsed += dtSeconds;
    if (this.shouldAdvance(this.current, this.elapsed)) {
      this.current = this.createFrame();
      return this.current;
    }

    this.current.t += dtSeconds;
    return this.current;
  }

  public suspend(): void {
    this.active = false;
    this.elapsed = 0;
  }

  public resumeFresh(): void {
    this.active = true;
    this.elapsed = 0;
    this.current = undefined;
  }

  public destroy(): void {
    this.active = false;
    this.elapsed = 0;
    if (!this.current) {
      return;
    }

    disposeMazeEpisode(this.current.episode);
    this.current = undefined;
  }

  private createFrame(): PatternFrame {
    const frame: PatternFrame = {
      mode: this.mode,
      episode: this.makeMaze(),
      t: 0
    };

    this.elapsed = 0;
    this.pushToCortex(frame);
    return frame;
  }

  private shouldAdvance(frame: PatternFrame, elapsed: number): boolean {
    const base = Math.max(4, frame.episode.raster.pathIndices.length * 0.06);
    switch (frame.mode) {
      case 'loading':
        return elapsed > Math.min(base, 3.5);
      case 'idle':
      case 'kiosk':
        return elapsed > base;
      case 'demo':
        return elapsed > resolveDemoFrameDuration(frame.episode);
      default:
        return false;
    }
  }

  private pushToCortex(frame: PatternFrame): void {
    if (!this.cortex) {
      return;
    }

    this.cortex.push(toCortexSample(frame.episode));
  }
}

export const manualIdleGate = (
  onIdle: () => void,
  onActive: () => void,
  idleMs = 20_000
): (() => void) => {
  let idle = false;
  let timer: number | undefined;

  const reset = (): void => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
    }

    if (idle) {
      idle = false;
      onActive();
    }

    timer = window.setTimeout(() => {
      idle = true;
      onIdle();
    }, idleMs);
  };

  const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel', 'pointerdown'] as const;
  const handleVisibilityChange = (): void => {
    if (!document.hidden) {
      reset();
    }
  };

  for (const eventName of events) {
    window.addEventListener(eventName, reset, { passive: true });
  }
  document.addEventListener('visibilitychange', handleVisibilityChange);
  reset();

  return () => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
    }
    for (const eventName of events) {
      window.removeEventListener(eventName, reset);
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
};

const buildCorridorGraph = (maze: MazeCore, start: Point, goal: Point): CorridorGraph => {
  const startIdx = indexOf(maze.width, start.x, start.y);
  const goalIdx = indexOf(maze.width, goal.x, goal.y);
  const nodeToGraph = new Int32Array(maze.cells.length);
  nodeToGraph.fill(-1);
  const nodeIds: number[] = [];

  for (let index = 0; index < maze.cells.length; index += 1) {
    if (!isCorridorNode(maze, index, startIdx, goalIdx)) {
      continue;
    }

    nodeToGraph[index] = nodeIds.length;
    nodeIds.push(index);
  }

  const adjacency = Array.from({ length: nodeIds.length }, (): number[] => []);
  const edges: CorridorEdge[] = [];

  for (let graphIndex = 0; graphIndex < nodeIds.length; graphIndex += 1) {
    const cellIndex = nodeIds[graphIndex];
    const cell = maze.cells[cellIndex];
    const cellX = xFromIndex(cellIndex, maze.width);
    const cellY = yFromIndex(cellIndex, maze.width);

    for (let direction = 0; direction < DIRS.length; direction += 1) {
      const dir = DIRS[direction];
      if ((cell & dir.bit) !== 0) {
        continue;
      }

      const nextX = cellX + dir.dx;
      const nextY = cellY + dir.dy;
      if (!inBounds(nextX, nextY, maze.width, maze.height)) {
        continue;
      }

      const edgePath = traceCorridorEdge(maze, cellIndex, direction, nodeToGraph);
      if (!edgePath || edgePath.toNode <= graphIndex) {
        continue;
      }

      const edge: CorridorEdge = {
        id: edges.length,
        a: graphIndex,
        b: edgePath.toNode,
        cost: edgePath.path.length - 1,
        path: Uint32Array.from(edgePath.path)
      };
      edges.push(edge);
      adjacency[graphIndex].push(edge.id);
      adjacency[edgePath.toNode].push(edge.id);
    }
  }

  return {
    nodeIds: Uint32Array.from(nodeIds),
    nodeToGraph,
    edges,
    adjacency
  };
};

const isCorridorNode = (maze: MazeCore, index: number, startIdx: number, goalIdx: number): boolean => {
  if (index === startIdx || index === goalIdx) {
    return true;
  }

  const openDirections: number[] = [];
  const cell = maze.cells[index];
  for (let direction = 0; direction < DIRS.length; direction += 1) {
    if ((cell & DIRS[direction].bit) === 0) {
      openDirections.push(direction);
    }
  }

  if (openDirections.length !== 2) {
    return true;
  }

  return DIRS[openDirections[0]].opposite !== DIRS[openDirections[1]].bit;
};

const traceCorridorEdge = (
  maze: MazeCore,
  startIndex: number,
  startDirection: number,
  nodeToGraph: Int32Array
): { toNode: number; path: number[] } | null => {
  const path = [startIndex];
  let currentIndex = startIndex;
  let direction = startDirection;

  while (true) {
    const currentX = xFromIndex(currentIndex, maze.width);
    const currentY = yFromIndex(currentIndex, maze.width);
    const dir = DIRS[direction];
    const nextX = currentX + dir.dx;
    const nextY = currentY + dir.dy;
    if (!inBounds(nextX, nextY, maze.width, maze.height)) {
      return null;
    }

    const nextIndex = indexOf(maze.width, nextX, nextY);
    path.push(nextIndex);
    const nextNode = nodeToGraph[nextIndex];
    if (nextNode !== -1) {
      return {
        toNode: nextNode,
        path
      };
    }

    currentIndex = nextIndex;
    direction = resolveStraightCorridorDirection(maze, nextIndex, direction);
  }
};

const resolveStraightCorridorDirection = (maze: MazeCore, index: number, previousDirection: number): number => {
  const backBit = DIRS[previousDirection].opposite;
  const cell = maze.cells[index];

  for (let direction = 0; direction < DIRS.length; direction += 1) {
    const dir = DIRS[direction];
    if ((cell & dir.bit) !== 0 || dir.bit === backBit) {
      continue;
    }

    return direction;
  }

  return previousDirection;
};

const expandBidirectionalFrontier = (options: BidirectionalExpansionOptions): BidirectionalExpansionResult => {
  let visited = 0;
  let expanded = 0;
  let bestCost = options.bestCost;
  let meetingNode = options.meetingNode;

  while (options.heap.pop()) {
    const current = options.heap.current;
    if (options.closed[current] === 1) {
      continue;
    }

    options.closed[current] = 1;
    visited += 1;
    const currentCost = options.ownCost[current];
    if (Number.isFinite(options.otherCost[current])) {
      const joinedCost = currentCost + options.otherCost[current];
      if (joinedCost < bestCost || (joinedCost === bestCost && isPreferredMeetingNode(options.graph, current, meetingNode))) {
        bestCost = joinedCost;
        meetingNode = current;
      }
    }

    expanded += 1;
    for (const edgeId of options.graph.adjacency[current]) {
      const edge = options.graph.edges[edgeId];
      const next = edge.a === current ? edge.b : edge.a;
      if (options.closed[next] === 1) {
        continue;
      }

      const tentativeCost = currentCost + edge.cost;
      if (tentativeCost > bestCost) {
        continue;
      }

      if (tentativeCost < options.ownCost[next]) {
        options.ownCost[next] = tentativeCost;
        options.previous[next] = current;
        options.previousEdge[next] = edgeId;
        options.heap.push(next, options.graph.nodeIds[next], tentativeCost);
      }

      if (!Number.isFinite(options.otherCost[next])) {
        continue;
      }

      const joinedCost = tentativeCost + options.otherCost[next];
      if (joinedCost < bestCost || (joinedCost === bestCost && isPreferredMeetingNode(options.graph, next, meetingNode))) {
        bestCost = joinedCost;
        meetingNode = next;
      }
    }

    return {
      visited,
      expanded,
      bestCost,
      meetingNode
    };
  }

  return {
    visited,
    expanded,
    bestCost,
    meetingNode
  };
};

const isPreferredMeetingNode = (graph: CorridorGraph, candidate: number, current: number): boolean => (
  current === -1 || graph.nodeIds[candidate] < graph.nodeIds[current]
);

const expandCorridorSolution = (
  graph: CorridorGraph,
  meetingNode: number,
  forwardPrev: Int32Array,
  forwardEdge: Int32Array,
  backwardPrev: Int32Array,
  backwardEdge: Int32Array
): Uint32Array => {
  const forwardNodes: number[] = [];
  for (let cursor = meetingNode; cursor !== -1; cursor = forwardPrev[cursor]) {
    forwardNodes.push(cursor);
  }
  forwardNodes.reverse();

  const path = [graph.nodeIds[forwardNodes[0]]];
  for (let index = 1; index < forwardNodes.length; index += 1) {
    appendEdgePath(path, graph.edges[forwardEdge[forwardNodes[index]]], forwardNodes[index - 1], forwardNodes[index]);
  }

  for (let cursor = meetingNode; backwardPrev[cursor] !== -1; cursor = backwardPrev[cursor]) {
    appendEdgePath(path, graph.edges[backwardEdge[cursor]], cursor, backwardPrev[cursor]);
  }

  return Uint32Array.from(path);
};

const appendEdgePath = (target: number[], edge: CorridorEdge, fromNode: number, toNode: number): void => {
  if (edge.a === fromNode && edge.b === toNode) {
    for (let index = 1; index < edge.path.length; index += 1) {
      target.push(edge.path[index]);
    }
    return;
  }

  for (let index = edge.path.length - 2; index >= 0; index -= 1) {
    target.push(edge.path[index]);
  }
};

const measureTopology = (maze: MazeCore, pathIndices: ArrayLike<number>): MazeTopologyStats => {
  const graph = buildCorridorGraph(maze, maze.start, maze.goal);
  const corridorLengths = graph.edges.map((edge) => Math.max(1, edge.cost));
  let branchDegreeTotal = 0;
  let branchNodeCount = 0;
  let perimeterPathCount = 0;
  let centerCrossings = 0;
  const quadrants = new Set<number>();
  const centerX = (maze.width - 1) / 2;
  const centerY = (maze.height - 1) / 2;

  for (const adjacency of graph.adjacency) {
    if (adjacency.length < 3) {
      continue;
    }

    branchDegreeTotal += adjacency.length;
    branchNodeCount += 1;
  }

  for (let index = 0; index < pathIndices.length; index += 1) {
    const cellIndex = pathIndices[index];
    const x = xFromIndex(cellIndex, maze.width);
    const y = yFromIndex(cellIndex, maze.width);
    if (isOnPerimeter(x, y, maze.width, maze.height)) {
      perimeterPathCount += 1;
    }

    quadrants.add(resolveQuadrant(x, y, maze.width, maze.height));
    if (index === 0) {
      continue;
    }

    const previous = pathIndices[index - 1];
    const previousX = xFromIndex(previous, maze.width);
    const previousY = yFromIndex(previous, maze.width);
    if (crossesAxis(previousX, x, centerX) || crossesAxis(previousY, y, centerY)) {
      centerCrossings += 1;
    }
  }

  const dx = Math.abs(maze.goal.x - maze.start.x) / Math.max(1, maze.width - 1);
  const dy = Math.abs(maze.goal.y - maze.start.y) / Math.max(1, maze.height - 1);
  return {
    corridorMean: mean(corridorLengths),
    corridorP90: quantile(corridorLengths, 0.9),
    branchingFactor: branchNodeCount === 0 ? 0 : branchDegreeTotal / branchNodeCount,
    perimeterPathShare: perimeterPathCount / Math.max(1, pathIndices.length),
    centerCrossings,
    quadrantCoverage: quadrants.size,
    startGoalSpan: dx + dy,
    startGoalEdgeBias: (
      Number(isOnPerimeter(maze.start.x, maze.start.y, maze.width, maze.height))
      + Number(isOnPerimeter(maze.goal.x, maze.goal.y, maze.width, maze.height))
    ) / 2,
    turnRate: pathIndices.length <= 2 ? 0 : countTurns(pathIndices, maze.width) / Math.max(1, pathIndices.length - 2)
  };
};

const scoreFamilyCandidate = (result: CoreBuildResult, attempt: number): number => {
  const sizeScale = Math.max(1, Math.sqrt(result.maze.cells.length));
  const lengthScore = result.metrics.solutionLength / (sizeScale * 3.4);
  const deadEndScore = result.metrics.deadEnds / sizeScale;
  const junctionScore = result.metrics.junctions / sizeScale;
  const coverageScore = result.metrics.coverage * 5;
  const shortcutScore = result.shortcutsCreated / sizeScale;
  const recencyPenalty = attempt * 0.015;

  switch (result.maze.family) {
    case 'braided':
      return lengthScore + (junctionScore * 1.1) - (deadEndScore * 0.8) + coverageScore + shortcutScore
        + (result.topology.centerCrossings * 0.08) - recencyPenalty;
    case 'sparse':
      return lengthScore + (result.topology.corridorMean * 1.3) + (result.topology.corridorP90 * 0.35)
        - (junctionScore * 0.55) + (result.topology.startGoalSpan * 0.8) - recencyPenalty;
    case 'dense':
      return lengthScore + (junctionScore * 1.45) + (result.topology.branchingFactor * 0.7)
        + coverageScore - (result.topology.corridorMean * 0.45) + (shortcutScore * 0.4) - recencyPenalty;
    case 'framed':
      return lengthScore + (result.topology.perimeterPathShare * 3) + (result.topology.startGoalEdgeBias * 1.8)
        + (result.topology.corridorP90 * 0.2) - recencyPenalty;
    case 'split-flow': {
      const crossingBonus = 1.6 - Math.abs(result.topology.centerCrossings - 2);
      return lengthScore + coverageScore + (result.topology.quadrantCoverage * 0.45)
        + (result.topology.startGoalSpan * 0.9) + crossingBonus - recencyPenalty;
    }
    case 'classic':
    default:
      return lengthScore + (result.topology.turnRate * 1.2) + (coverageScore * 0.85)
        + (result.topology.startGoalSpan * 0.6) - recencyPenalty;
  }
};

const placeFamilyEndpoints = (maze: MazeCore, scratch: MazeScratch): PlacementResult => {
  const strategies = FAMILY_PLACEMENT_STRATEGIES[maze.family];
  const mixed = mixPlacementSeed(maze.seed, maze.family, maze.width, maze.height);
  const strategy = strategies[mixed % strategies.length];
  const pools = collectPlacementPools(maze);
  const placed = resolvePlacementByStrategy(maze, scratch, strategy, pools, mixed);

  if (placed.start.x === placed.goal.x && placed.start.y === placed.goal.y) {
    return resolvePlacementByStrategy(maze, scratch, 'farthest-pair', pools, mixed ^ 0x9e3779b9);
  }

  return placed;
};

const resolvePlacementByStrategy = (
  maze: MazeCore,
  scratch: MazeScratch,
  strategy: MazePlacementStrategy,
  pools: { deadEnds: PlacementCandidate[]; perimeter: PlacementCandidate[]; all: PlacementCandidate[] },
  seed: number
): PlacementResult => {
  switch (strategy) {
    case 'edge-biased': {
      const pair = selectBestPlacementPair(
        pools.perimeter.length >= 4 ? pools.perimeter : pools.deadEnds,
        maze,
        (left, right) => {
          const separation = normalizedSeparation(left, right, maze.width, maze.height);
          return separation + ((left.edgeBias + right.edgeBias) * 0.9) + opposedBorderBonus(left, right);
        }
      );
      if (pair) {
        return pairToPlacement(pair, strategy);
      }
      break;
    }
    case 'corner-opposed': {
      const pair = selectBestPlacementPair(
        pools.perimeter.length >= 4 ? pools.perimeter : pools.deadEnds,
        maze,
        (left, right) => {
          const separation = normalizedSeparation(left, right, maze.width, maze.height);
          const diagonal = diagonalSpan(left, right, maze.width, maze.height);
          return (separation * 1.1) + (diagonal * 1.4) + ((left.edgeBias + right.edgeBias) * 0.7);
        }
      );
      if (pair) {
        return pairToPlacement(pair, strategy);
      }
      break;
    }
    case 'region-opposed': {
      const candidateSource = pools.deadEnds.length >= 8 ? pools.deadEnds : downsampleCandidates(pools.all, 48, seed);
      const pair = selectBestPlacementPair(
        candidateSource,
        maze,
        (left, right) => {
          const separation = normalizedSeparation(left, right, maze.width, maze.height);
          const diagonal = diagonalSpan(left, right, maze.width, maze.height);
          const quadrantBonus = isOpposedQuadrantPair(left, right, maze.width, maze.height) ? 1.2 : 0;
          return (separation * 1.25) + (diagonal * 0.8) + quadrantBonus;
        }
      );
      if (pair) {
        return pairToPlacement(pair, strategy);
      }
      break;
    }
    case 'corridor-biased': {
      const candidateSource = pools.deadEnds.length >= 6 ? pools.deadEnds : pools.perimeter;
      const pair = selectBestPlacementPair(
        candidateSource,
        maze,
        (left, right) => {
          const separation = normalizedSeparation(left, right, maze.width, maze.height);
          return separation + ((left.corridorLead + right.corridorLead) / Math.max(1, Math.max(maze.width, maze.height))) * 1.6
            + (diagonalSpan(left, right, maze.width, maze.height) * 0.5);
        }
      );
      if (pair) {
        return pairToPlacement(pair, strategy);
      }
      break;
    }
    case 'farthest-pair':
    default:
      break;
  }

  const farA = farthestReachable(maze, { x: 0, y: 0 }, scratch);
  const farB = farthestReachable(maze, farA.point, scratch);
  return {
    start: farA.point,
    goal: farB.point,
    strategy: 'farthest-pair'
  };
};

const collectPlacementPools = (maze: MazeCore): {
  deadEnds: PlacementCandidate[];
  perimeter: PlacementCandidate[];
  all: PlacementCandidate[];
} => {
  const deadEnds: PlacementCandidate[] = [];
  const perimeter: PlacementCandidate[] = [];
  const all: PlacementCandidate[] = [];

  for (let index = 0; index < maze.cells.length; index += 1) {
    const x = xFromIndex(index, maze.width);
    const y = yFromIndex(index, maze.width);
    const degree = countOpenNeighbors(maze, index);
    const edgeDistance = Math.min(x, y, (maze.width - 1) - x, (maze.height - 1) - y);
    const edgeBias = clamp(1 - (edgeDistance / Math.max(1, Math.floor(Math.min(maze.width, maze.height) / 2))), 0, 1);
    const candidate: PlacementCandidate = {
      index,
      x,
      y,
      corridorLead: degree === 1 ? measureDeadEndCorridorLead(maze, index) : 0,
      edgeBias,
      borderMask: resolveBorderMask(x, y, maze.width, maze.height)
    };

    all.push(candidate);
    if (degree === 1) {
      deadEnds.push(candidate);
    }
    if (candidate.borderMask !== 0) {
      perimeter.push(candidate);
    }
  }

  return {
    deadEnds,
    perimeter,
    all
  };
};

const selectBestPlacementPair = (
  candidates: readonly PlacementCandidate[],
  maze: MazeCore,
  scorePair: (left: PlacementCandidate, right: PlacementCandidate) => number
): [PlacementCandidate, PlacementCandidate] | null => {
  if (candidates.length < 2) {
    return null;
  }

  let bestScore = Number.NEGATIVE_INFINITY;
  let bestPair: [PlacementCandidate, PlacementCandidate] | null = null;

  for (let leftIndex = 0; leftIndex < candidates.length - 1; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
      const left = candidates[leftIndex];
      const right = candidates[rightIndex];
      if (left.index === right.index) {
        continue;
      }

      const score = scorePair(left, right) + (normalizedSeparation(left, right, maze.width, maze.height) * 0.15);
      if (score > bestScore) {
        bestScore = score;
        bestPair = [left, right];
      }
    }
  }

  return bestPair;
};

const pairToPlacement = (
  pair: [PlacementCandidate, PlacementCandidate],
  strategy: MazePlacementStrategy
): PlacementResult => ({
  start: { x: pair[0].x, y: pair[0].y },
  goal: { x: pair[1].x, y: pair[1].y },
  strategy
});

const downsampleCandidates = (
  candidates: readonly PlacementCandidate[],
  maxCount: number,
  seed: number
): PlacementCandidate[] => {
  if (candidates.length <= maxCount) {
    return [...candidates];
  }

  const stride = Math.max(1, Math.floor(candidates.length / maxCount));
  const offset = seed % stride;
  const sampled: PlacementCandidate[] = [];

  for (let index = offset; index < candidates.length && sampled.length < maxCount; index += stride) {
    sampled.push(candidates[index]);
  }

  return sampled.length >= 2 ? sampled : candidates.slice(0, maxCount);
};

const applyMazeFamilyPass = (maze: MazeCore, family: MazeFamily, rng: () => number): void => {
  switch (family) {
    case 'braided':
      braidMaze(maze, 0.18, rng);
      applyDenseWeavePass(maze, rng, 2);
      break;
    case 'sparse':
      applySparseFlowPass(maze, rng);
      break;
    case 'dense':
      braidMaze(maze, 0.1, rng);
      applyDenseWeavePass(maze, rng, 3);
      break;
    case 'framed':
      applyFramedPass(maze, rng);
      break;
    case 'split-flow':
      applySplitFlowPass(maze, rng);
      break;
    case 'classic':
    default:
      break;
  }
};

const applySparseFlowPass = (maze: MazeCore, rng: () => number): void => {
  if (maze.width < 7 || maze.height < 7) {
    return;
  }

  const horizontal = rng() >= 0.5;
  if (horizontal) {
    const row = clamp(Math.floor(maze.height / 2) + randomInt(3, rng) - 1, 1, maze.height - 2);
    carveLinearFeature(maze, 1, row, 1, 0, maze.width - 2);
    return;
  }

  const column = clamp(Math.floor(maze.width / 2) + randomInt(3, rng) - 1, 1, maze.width - 2);
  carveLinearFeature(maze, column, 1, 0, 1, maze.height - 2);
};

const applyDenseWeavePass = (maze: MazeCore, rng: () => number, clusterCount: number): void => {
  if (maze.width < 6 || maze.height < 6) {
    return;
  }

  for (let cluster = 0; cluster < clusterCount; cluster += 1) {
    const centerX = clamp(2 + randomInt(Math.max(1, maze.width - 4), rng), 1, maze.width - 2);
    const centerY = clamp(2 + randomInt(Math.max(1, maze.height - 4), rng), 1, maze.height - 2);
    carveLinearFeature(maze, clamp(centerX - 1, 1, maze.width - 2), centerY, 1, 0, 2);
    carveLinearFeature(maze, centerX, clamp(centerY - 1, 1, maze.height - 2), 0, 1, 2);
  }
};

const applySplitFlowPass = (maze: MazeCore, rng: () => number): void => {
  if (maze.width < 8 || maze.height < 8) {
    return;
  }

  const midX = Math.floor(maze.width / 2);
  const midY = Math.floor(maze.height / 2);
  const upperRow = clamp(Math.floor(maze.height * 0.28) + randomInt(3, rng) - 1, 1, maze.height - 2);
  const lowerRow = clamp(Math.floor(maze.height * 0.72) + randomInt(3, rng) - 1, 1, maze.height - 2);

  carveLinearFeature(maze, 1, upperRow, 1, 0, Math.max(2, midX - 1));
  carveLinearFeature(maze, midX, upperRow, 0, upperRow <= midY ? 1 : -1, Math.max(1, Math.abs(midY - upperRow)));
  carveLinearFeature(maze, midX, midY, 0, lowerRow >= midY ? 1 : -1, Math.max(1, Math.abs(lowerRow - midY)));
  carveLinearFeature(maze, midX, lowerRow, 1, 0, Math.max(2, maze.width - midX - 2));

  if (rng() > 0.45) {
    carveLinearFeature(maze, 1, lowerRow, 1, 0, Math.max(2, Math.floor(maze.width * 0.34)));
  }
  if (rng() > 0.45) {
    carveLinearFeature(maze, maze.width - 2, upperRow, -1, 0, Math.max(2, Math.floor(maze.width * 0.34)));
  }
};

const applyPresentationPreset = (maze: MazeCore, preset: MazePresentationPreset, rng: () => number): void => {
  switch (preset) {
    case 'braided':
      braidMaze(maze, 0.2, rng);
      break;
    case 'framed':
      braidMaze(maze, 0.06, rng);
      applyFramedPass(maze, rng);
      break;
    case 'blueprint-rare':
      braidMaze(maze, 0.08, rng);
      applyFramedPass(maze, rng);
      applyArchitecturalPasses(maze, rng);
      break;
    case 'classic':
    default:
      break;
  }
};

const applyFramedPass = (maze: MazeCore, rng: () => number): void => {
  if (maze.width < 6 || maze.height < 6) {
    return;
  }

  const inset = Math.max(1, Math.min(2, Math.floor(Math.min(maze.width, maze.height) / 12)));
  const horizontalSpan = Math.max(2, maze.width - (inset * 2) - 2);
  const verticalSpan = Math.max(2, maze.height - (inset * 2) - 2);
  const horizontalOffset = horizontalSpan <= 2 ? 0 : randomInt(Math.max(1, Math.floor(horizontalSpan * 0.2)), rng);
  const verticalOffset = verticalSpan <= 2 ? 0 : randomInt(Math.max(1, Math.floor(verticalSpan * 0.2)), rng);
  const horizontalLength = Math.max(2, Math.floor(horizontalSpan * 0.65));
  const verticalLength = Math.max(2, Math.floor(verticalSpan * 0.65));

  carveLinearFeature(maze, inset + 1 + horizontalOffset, inset, 1, 0, horizontalLength);
  carveLinearFeature(maze, inset + 1 + horizontalOffset, maze.height - inset - 1, 1, 0, horizontalLength);
  carveLinearFeature(maze, inset, inset + 1 + verticalOffset, 0, 1, verticalLength);
  carveLinearFeature(maze, maze.width - inset - 1, inset + 1 + verticalOffset, 0, 1, verticalLength);
};

const applyArchitecturalPasses = (maze: MazeCore, rng: () => number): void => {
  if (maze.width < 7 || maze.height < 7) {
    return;
  }

  const centerRow = Math.round((maze.height - 1) / 2) + randomInt(3, rng) - 1;
  const centerColumn = Math.round((maze.width - 1) / 2) + randomInt(3, rng) - 1;
  carveLinearFeature(maze, 1, clamp(centerRow, 1, maze.height - 2), 1, 0, maze.width - 2);
  carveLinearFeature(maze, clamp(centerColumn, 1, maze.width - 2), 1, 0, 1, maze.height - 2);

  if (maze.width >= 10) {
    carveLinearFeature(maze, 2, clamp(Math.floor(maze.height / 3), 1, maze.height - 2), 1, 0, maze.width - 4);
  }
  if (maze.height >= 10) {
    carveLinearFeature(maze, clamp(Math.floor(maze.width / 3), 1, maze.width - 2), 2, 0, 1, maze.height - 4);
  }
};

const carveLinearFeature = (
  maze: MazeCore,
  startX: number,
  startY: number,
  stepX: number,
  stepY: number,
  length: number
): void => {
  let currentX = clamp(startX, 0, maze.width - 1);
  let currentY = clamp(startY, 0, maze.height - 1);

  for (let step = 0; step < length; step += 1) {
    const nextX = currentX + stepX;
    const nextY = currentY + stepY;
    if (!inBounds(nextX, nextY, maze.width, maze.height)) {
      break;
    }

    carvePassage(maze, indexOf(maze.width, currentX, currentY), indexOf(maze.width, nextX, nextY));
    currentX = nextX;
    currentY = nextY;
  }
};

const generateWilsonMaze = (
  width: number,
  height: number,
  seed: number,
  braidRatio: number,
  family: MazeFamily,
  presentationPreset: MazePresentationPreset,
  rng: () => number
): MazeCore => {
  const cellCount = width * height;
  const scratch = getMazeScratch(cellCount);
  const cells = new Uint8Array(cellCount);
  cells.fill(ALL_WALLS);

  const maze: MazeCore = {
    width,
    height,
    cells,
    start: { x: 0, y: 0 },
    goal: { x: width - 1, y: height - 1 },
    seed,
    braidRatio,
    family,
    placementStrategy: 'farthest-pair',
    presentationPreset
  };

  scratch.inTree.fill(0);

  const root = randomInt(cellCount, rng);
  scratch.inTree[root] = 1;
  let unvisited = cellCount - 1;

  while (unvisited > 0) {
    let cursor = randomUnvisitedIndex(scratch.inTree, rng);
    const walkStart = cursor;
    const walkEpoch = bumpScratchEpoch(scratch, 'walkEpoch', scratch.walkStamp);

    while (scratch.inTree[cursor] === 0) {
      const next = randomNeighborIndex(cursor, width, height, rng);
      scratch.walkNext[cursor] = next;
      scratch.walkStamp[cursor] = walkEpoch;
      cursor = next;
    }

    cursor = walkStart;
    while (scratch.inTree[cursor] === 0) {
      const next = scratch.walkStamp[cursor] === walkEpoch ? scratch.walkNext[cursor] : -1;
      if (next < 0) {
        break;
      }
      carvePassage(maze, cursor, next);
      scratch.inTree[cursor] = 1;
      unvisited -= 1;
      cursor = next;
    }
  }

  if (braidRatio > 0) {
    braidMaze(maze, braidRatio, rng);
  }

  applyMazeFamilyPass(maze, family, rng);
  applyPresentationPreset(maze, presentationPreset, rng);
  const placement = placeFamilyEndpoints(maze, scratch);
  maze.start = placement.start;
  maze.goal = placement.goal;
  maze.placementStrategy = placement.strategy;
  return maze;
};

const braidMaze = (maze: MazeCore, ratio: number, rng: () => number): void => {
  const candidates: number[] = [];
  for (let index = 0; index < maze.cells.length; index += 1) {
    if (countOpenNeighbors(maze, index) === 1) {
      candidates.push(index);
    }
  }

  shuffleInPlace(candidates, rng);
  const target = Math.floor(candidates.length * clamp(ratio, 0, 1));
  let opened = 0;

  for (let cursor = 0; cursor < candidates.length && opened < target; cursor += 1) {
    const chosen = pickRandomClosedNeighbor(maze, candidates[cursor], rng);
    if (chosen === -1) {
      continue;
    }

    carvePassage(maze, candidates[cursor], chosen);
    opened += 1;
  }
};

const passesQualityGate = (
  family: MazeFamily,
  metrics: MazeMetrics,
  topology: MazeTopologyStats,
  minSolutionLength: number
): boolean => {
  const baselineCoverage = metrics.coverage >= 0.14;
  switch (family) {
    case 'braided':
      return metrics.solutionLength >= Math.floor(minSolutionLength * 0.84)
        && baselineCoverage
        && metrics.straightness <= 0.9
        && metrics.deadEnds <= Math.floor(mazeDensityThreshold(minSolutionLength, 0.7))
        && metrics.junctions >= Math.floor(mazeDensityThreshold(minSolutionLength, 0.12));
    case 'sparse':
      return metrics.solutionLength >= Math.floor(minSolutionLength * 0.96)
        && metrics.coverage >= 0.12
        && topology.corridorMean >= 3.2
        && topology.corridorP90 >= 6
        && topology.startGoalSpan >= 1.1;
    case 'dense':
      return metrics.solutionLength >= Math.floor(minSolutionLength * 0.9)
        && metrics.coverage >= 0.18
        && metrics.junctions >= Math.floor(mazeDensityThreshold(minSolutionLength, 0.16))
        && topology.branchingFactor >= 3;
    case 'framed':
      return metrics.solutionLength >= Math.floor(minSolutionLength * 0.92)
        && metrics.coverage >= 0.15
        && topology.perimeterPathShare >= 0.16
        && topology.startGoalEdgeBias >= 0.5;
    case 'split-flow':
      return metrics.solutionLength >= Math.floor(minSolutionLength * 0.96)
        && metrics.coverage >= 0.16
        && topology.quadrantCoverage >= 3
        && topology.centerCrossings >= 1
        && topology.centerCrossings <= 4;
    case 'classic':
    default:
      return metrics.solutionLength >= minSolutionLength
        && metrics.straightness <= 0.82
        && metrics.coverage >= 0.18;
  }
};

const farthestReachable = (
  maze: MazeCore,
  start: Point,
  scratch: MazeScratch
): { point: Point; distance: number } => {
  const startIdx = indexOf(maze.width, start.x, start.y);
  const epoch = bumpScratchEpoch(scratch, 'bfsEpoch', scratch.seenEpoch);
  let head = 0;
  let tail = 0;
  let best = startIdx;

  scratch.queue[tail] = startIdx;
  tail += 1;
  scratch.seenEpoch[startIdx] = epoch;
  scratch.distance[startIdx] = 0;

  while (head < tail) {
    const current = scratch.queue[head];
    head += 1;

    if (scratch.distance[current] > scratch.distance[best]) {
      best = current;
    }

    const currentX = xFromIndex(current, maze.width);
    const currentY = yFromIndex(current, maze.width);
    const cell = maze.cells[current];
    for (let direction = 0; direction < DIRS.length; direction += 1) {
      const dir = DIRS[direction];
      if ((cell & dir.bit) !== 0) {
        continue;
      }

      const nextX = currentX + dir.dx;
      const nextY = currentY + dir.dy;
      if (!inBounds(nextX, nextY, maze.width, maze.height)) {
        continue;
      }

      const next = indexOf(maze.width, nextX, nextY);
      if (scratch.seenEpoch[next] === epoch) {
        continue;
      }

      scratch.seenEpoch[next] = epoch;
      scratch.distance[next] = scratch.distance[current] + 1;
      scratch.queue[tail] = next;
      tail += 1;
    }
  }

  return {
    point: {
      x: best % maze.width,
      y: Math.floor(best / maze.width)
    },
    distance: scratch.distance[best]
  };
};

const countOpeningsBeyondTree = (maze: MazeCore): number => {
  let passages = 0;
  for (let index = 0; index < maze.cells.length; index += 1) {
    passages += countOpenNeighbors(maze, index);
  }

  const undirectedEdges = passages / 2;
  return Math.max(0, undirectedEdges - (maze.cells.length - 1));
};

const countOpenNeighbors = (maze: MazeCore, idx: number): number => {
  const x = xFromIndex(idx, maze.width);
  const y = yFromIndex(idx, maze.width);
  const cell = maze.cells[idx];
  let count = 0;

  for (let direction = 0; direction < DIRS.length; direction += 1) {
    const dir = DIRS[direction];
    if ((cell & dir.bit) !== 0) {
      continue;
    }

    if (inBounds(x + dir.dx, y + dir.dy, maze.width, maze.height)) {
      count += 1;
    }
  }

  return count;
};

const pickRandomClosedNeighbor = (maze: MazeCore, idx: number, rng: () => number): number => {
  const x = xFromIndex(idx, maze.width);
  const y = yFromIndex(idx, maze.width);
  const cell = maze.cells[idx];
  let optionCount = 0;

  for (let direction = 0; direction < DIRS.length; direction += 1) {
    const dir = DIRS[direction];
    if ((cell & dir.bit) === 0) {
      continue;
    }
    if (inBounds(x + dir.dx, y + dir.dy, maze.width, maze.height)) {
      optionCount += 1;
    }
  }

  if (optionCount === 0) {
    return -1;
  }

  let pick = randomInt(optionCount, rng);
  for (let direction = 0; direction < DIRS.length; direction += 1) {
    const dir = DIRS[direction];
    if ((cell & dir.bit) === 0) {
      continue;
    }

    const nextX = x + dir.dx;
    const nextY = y + dir.dy;
    if (!inBounds(nextX, nextY, maze.width, maze.height)) {
      continue;
    }

    if (pick === 0) {
      return indexOf(maze.width, nextX, nextY);
    }
    pick -= 1;
  }

  return -1;
};

const carvePassage = (maze: MazeCore, a: number, b: number): void => {
  const ax = xFromIndex(a, maze.width);
  const ay = yFromIndex(a, maze.width);
  const bx = xFromIndex(b, maze.width);
  const by = yFromIndex(b, maze.width);
  const dx = bx - ax;
  const dy = by - ay;

  for (let direction = 0; direction < DIRS.length; direction += 1) {
    const dir = DIRS[direction];
    if (dir.dx !== dx || dir.dy !== dy) {
      continue;
    }

    maze.cells[a] &= ~dir.bit;
    maze.cells[b] &= ~dir.opposite;
    return;
  }

  throw new Error(`Cells ${a} and ${b} are not neighbors`);
};

const countTurns = (pathIndices: ArrayLike<number>, width: number): number => {
  let turns = 0;

  for (let index = 1; index < pathIndices.length - 1; index += 1) {
    const ab = pathIndices[index] - pathIndices[index - 1];
    const bc = pathIndices[index + 1] - pathIndices[index];
    if (ab % width !== bc % width || Math.trunc(ab / width) !== Math.trunc(bc / width)) {
      turns += 1;
    }
  }

  return turns;
};

const countSolutionBranches = (episode: MazeEpisode): number => {
  let branches = 0;

  for (let pathCursor = 0; pathCursor < episode.raster.pathIndices.length; pathCursor += 1) {
    const index = episode.raster.pathIndices[pathCursor];
    let degree = 0;

    for (let direction = 0; direction < 4; direction += 1) {
      const neighbor = getNeighborIndex(index, episode.raster.width, episode.raster.height, direction as 0 | 1 | 2 | 3);
      if (neighbor !== -1 && isTileFloor(episode.raster.tiles, neighbor)) {
        degree += 1;
      }
    }

    if (degree >= 3) {
      branches += 1;
    }
  }

  return branches;
};

const measureDeadEndCorridorLead = (maze: MazeCore, startIndex: number): number => {
  let length = 0;
  let current = startIndex;
  let previous = -1;

  while (true) {
    const next = getOpenNeighbors(maze, current).filter((candidate) => candidate !== previous);
    if (next.length !== 1) {
      return length;
    }

    previous = current;
    current = next[0];
    length += 1;

    if (countOpenNeighbors(maze, current) !== 2) {
      return length;
    }
  }
};

const getOpenNeighbors = (maze: MazeCore, idx: number): number[] => {
  const x = xFromIndex(idx, maze.width);
  const y = yFromIndex(idx, maze.width);
  const cell = maze.cells[idx];
  const neighbors: number[] = [];

  for (let direction = 0; direction < DIRS.length; direction += 1) {
    const dir = DIRS[direction];
    if ((cell & dir.bit) !== 0) {
      continue;
    }

    const nextX = x + dir.dx;
    const nextY = y + dir.dy;
    if (inBounds(nextX, nextY, maze.width, maze.height)) {
      neighbors.push(indexOf(maze.width, nextX, nextY));
    }
  }

  return neighbors;
};

const normalizedSeparation = (
  left: PlacementCandidate,
  right: PlacementCandidate,
  width: number,
  height: number
): number => (
  (Math.abs(left.x - right.x) / Math.max(1, width - 1))
  + (Math.abs(left.y - right.y) / Math.max(1, height - 1))
);

const diagonalSpan = (
  left: PlacementCandidate,
  right: PlacementCandidate,
  width: number,
  height: number
): number => Math.min(
  Math.abs(left.x - right.x) / Math.max(1, width - 1),
  Math.abs(left.y - right.y) / Math.max(1, height - 1)
);

const resolveQuadrant = (x: number, y: number, width: number, height: number): number => {
  const horizontal = x < ((width - 1) / 2) ? 0 : 1;
  const vertical = y < ((height - 1) / 2) ? 0 : 1;
  return (vertical * 2) + horizontal;
};

const isOpposedQuadrantPair = (
  left: PlacementCandidate,
  right: PlacementCandidate,
  width: number,
  height: number
): boolean => {
  const leftQuadrant = resolveQuadrant(left.x, left.y, width, height);
  const rightQuadrant = resolveQuadrant(right.x, right.y, width, height);
  return Math.abs(leftQuadrant - rightQuadrant) === 3;
};

const resolveBorderMask = (x: number, y: number, width: number, height: number): number => (
  (y === 0 ? 1 : 0)
  | (x === width - 1 ? 2 : 0)
  | (y === height - 1 ? 4 : 0)
  | (x === 0 ? 8 : 0)
);

const opposedBorderBonus = (left: PlacementCandidate, right: PlacementCandidate): number => {
  const verticalOpposition = (left.borderMask & 1) !== 0 && (right.borderMask & 4) !== 0
    || (left.borderMask & 4) !== 0 && (right.borderMask & 1) !== 0;
  const horizontalOpposition = (left.borderMask & 2) !== 0 && (right.borderMask & 8) !== 0
    || (left.borderMask & 8) !== 0 && (right.borderMask & 2) !== 0;
  return verticalOpposition || horizontalOpposition ? 0.9 : 0;
};

const isOnPerimeter = (x: number, y: number, width: number, height: number): boolean => (
  x === 0 || y === 0 || x === width - 1 || y === height - 1
);

const crossesAxis = (from: number, to: number, axis: number): boolean => (
  (from < axis && to >= axis) || (from > axis && to <= axis)
);

const mixPlacementSeed = (seed: number, family: MazeFamily, width: number, height: number): number => (
  Math.imul((seed >>> 0) ^ (width << 8) ^ (height << 16), (family.charCodeAt(0) | 1) >>> 0) >>> 0
);

const mazeDensityThreshold = (minSolutionLength: number, factor: number): number => (
  Math.max(1, Math.sqrt(Math.max(1, minSolutionLength)) * factor * 10)
);

const quantile = (values: readonly number[], q: number): number => {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * clamp(q, 0, 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) {
    return sorted[lower];
  }

  const ratio = position - lower;
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * ratio);
};

const mean = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total / values.length;
};

const heuristicXY = (ax: number, ay: number, bx: number, by: number): number => Math.abs(ax - bx) + Math.abs(ay - by);

const indexOf = (width: number, x: number, y: number): number => (y * width) + x;

const randomInt = (maxExclusive: number, rng: () => number): number => Math.floor(rng() * maxExclusive);

const randomNeighborIndex = (idx: number, width: number, height: number, rng: () => number): number => {
  const x = xFromIndex(idx, width);
  const y = yFromIndex(idx, width);
  let optionCount = 0;

  for (let direction = 0; direction < DIRS.length; direction += 1) {
    const dir = DIRS[direction];
    if (inBounds(x + dir.dx, y + dir.dy, width, height)) {
      optionCount += 1;
    }
  }

  let pick = randomInt(optionCount, rng);
  for (let direction = 0; direction < DIRS.length; direction += 1) {
    const dir = DIRS[direction];
    const nextX = x + dir.dx;
    const nextY = y + dir.dy;
    if (!inBounds(nextX, nextY, width, height)) {
      continue;
    }

    if (pick === 0) {
      return indexOf(width, nextX, nextY);
    }
    pick -= 1;
  }

  return idx;
};

const randomUnvisitedIndex = (inTree: Uint8Array, rng: () => number): number => {
  const offset = randomInt(inTree.length, rng);

  for (let step = 0; step < inTree.length; step += 1) {
    const index = (offset + step) % inTree.length;
    if (inTree[index] === 0) {
      return index;
    }
  }

  return 0;
};

const inBounds = (x: number, y: number, width: number, height: number): boolean => (
  x >= 0 && y >= 0 && x < width && y < height
);

const shuffleInPlace = <T>(items: T[], rng: () => number): void => {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1, rng);
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const getCached = <T>(cache: Map<number, T>, size: number, create: () => T): T => {
  const cached = cache.get(size);
  if (cached) {
    return cached;
  }

  const next = create();
  cache.set(size, next);
  return next;
};

const getMazeScratch = (size: number): MazeScratch => getCached(mazeScratchCache, size, () => ({
    inTree: new Uint8Array(size),
    walkNext: new Int32Array(size),
    walkStamp: new Uint32Array(size),
    queue: new Int32Array(size),
    distance: new Int32Array(size),
    seenEpoch: new Uint32Array(size),
    walkEpoch: 0,
    bfsEpoch: 0
  }));

const getSolveScratch = (size: number): AStarScratch => getAStarScratch(solveScratchCache, size);

const bumpScratchEpoch = (
  scratch: MazeScratch,
  key: 'walkEpoch' | 'bfsEpoch',
  reset: Uint32Array
): number => {
  scratch[key] += 1;
  if (scratch[key] !== 0) {
    return scratch[key];
  }

  reset.fill(0);
  scratch[key] = 1;
  return 1;
};

const resolveDemoFrameDuration = (episode: MazeEpisode): number => {
  const difficultyLinger = episode.difficulty === 'chill'
    ? 0.48
    : episode.difficulty === 'standard'
      ? 0.34
      : episode.difficulty === 'spicy'
        ? 0.22
        : 0.14;
  const sizeLinger = episode.size === 'small'
    ? -0.08
    : episode.size === 'medium'
      ? 0
      : episode.size === 'large'
        ? 0.12
        : 0.2;
  const pulseJitter = (((episode.seed >>> 0) & 0xf) - 7) * 0.012;
  return Math.max(4.4, 1.74 + difficultyLinger + sizeLinger + pulseJitter + (episode.raster.pathIndices.length * 0.104));
};
