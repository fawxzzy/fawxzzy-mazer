import {
  stableTokenScore,
  type FrontierCandidate,
  type HeadingToken,
  type TileId
} from './types';
import type { BeliefGraph } from './BeliefGraph';

export interface FrontierPlanResult {
  targetKind: 'frontier' | 'goal' | 'backtrack' | 'idle';
  targetTileId: TileId | null;
  path: TileId[];
  frontierIds: TileId[];
  reason: string;
  candidate?: FrontierCandidate;
}

export class FrontierPlanner {
  constructor(private readonly seed: string) {}

  plan(graph: BeliefGraph, currentTileId: TileId, heading: HeadingToken): FrontierPlanResult {
    const goalTileId = graph.getGoalTileId();
    if (goalTileId && graph.hasPath(currentTileId, goalTileId)) {
      const path = graph.findPath(currentTileId, goalTileId);
      return {
        targetKind: 'goal',
        targetTileId: goalTileId,
        path,
        frontierIds: graph.getFrontierIds(),
        reason: 'goal observed and reachable on discovered graph'
      };
    }

    const localOptions = graph.getUnvisitedNeighborIds(currentTileId);
    if (localOptions.length > 0) {
      const candidate = this.rankLocalOptions(graph, currentTileId, heading, localOptions)[0];
      return {
        targetKind: 'frontier',
        targetTileId: candidate?.tileId ?? null,
        path: candidate ? [currentTileId, candidate.tileId] : [currentTileId],
        frontierIds: graph.getFrontierIds(),
        reason: 'expanding local frontier from current tile',
        candidate
      };
    }

    const frontierIds = graph.getFrontierIds().filter((tileId) => tileId !== currentTileId);
    const ranked = this.rankFrontierTargets(graph, currentTileId, heading, frontierIds);
    const candidate = ranked[0];

    if (!candidate) {
      return {
        targetKind: 'idle',
        targetTileId: null,
        path: [currentTileId],
        frontierIds,
        reason: 'no reachable frontier remains on the discovered graph'
      };
    }

    const path = graph.findPath(currentTileId, candidate.tileId);
    if (path.length === 0) {
      return {
        targetKind: 'idle',
        targetTileId: null,
        path: [currentTileId],
        frontierIds,
        reason: 'frontier exists but no discovered route reaches it yet'
      };
    }

    return {
      targetKind: 'frontier',
      targetTileId: candidate.tileId,
      path,
      frontierIds,
      reason: 'reaching the best discovered frontier by shortest known path',
      candidate
    };
  }

  private rankLocalOptions(
    graph: BeliefGraph,
    currentTileId: TileId,
    heading: HeadingToken,
    localOptions: readonly TileId[]
  ): FrontierCandidate[] {
    return [...localOptions]
      .map((tileId) => this.buildCandidate(graph, heading, tileId, [currentTileId, tileId]))
      .sort((left, right) => this.compareCandidates(left, right));
  }

  private rankFrontierTargets(
    graph: BeliefGraph,
    currentTileId: TileId,
    heading: HeadingToken,
    frontierIds: readonly TileId[]
  ): FrontierCandidate[] {
    return [...frontierIds]
      .map((tileId) => {
        const path = graph.findPath(currentTileId, tileId);
        return this.buildCandidate(graph, heading, tileId, path);
      })
      .filter((candidate) => candidate.path.length > 0)
      .sort((left, right) => this.compareCandidates(left, right));
  }

  private buildCandidate(
    graph: BeliefGraph,
    heading: HeadingToken,
    tileId: TileId,
    path: TileId[]
  ): FrontierCandidate {
    const visitCount = graph.getNodeVisitCount(tileId);
    const unexploredNeighborCount = graph.getUnexploredNeighborCount(tileId);
    const tieBreak = stableTokenScore(this.seed, tileId, heading);
    const pathCost = Math.max(0, path.length - 1);
    const score = (pathCost * 1000) + (visitCount * 40) - (unexploredNeighborCount * 30) + tieBreak;

    return {
      tileId,
      path,
      score,
      visitCount,
      unexploredNeighborCount,
      tieBreak
    };
  }

  private compareCandidates(left: FrontierCandidate, right: FrontierCandidate): number {
    if (left.score !== right.score) {
      return left.score - right.score;
    }

    if (left.visitCount !== right.visitCount) {
      return left.visitCount - right.visitCount;
    }

    if (left.unexploredNeighborCount !== right.unexploredNeighborCount) {
      return right.unexploredNeighborCount - left.unexploredNeighborCount;
    }

    if (left.tieBreak !== right.tieBreak) {
      return left.tieBreak - right.tieBreak;
    }

    return left.tileId.localeCompare(right.tileId);
  }
}
