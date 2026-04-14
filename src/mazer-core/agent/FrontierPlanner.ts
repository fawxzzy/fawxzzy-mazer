import {
  normalizePolicyCandidateAdvisoryFeatures,
  stableTokenScore,
  type ExplorerSnapshot,
  type FrontierCandidate,
  type HeadingToken,
  type LocalObservation,
  type PolicyActionCandidate,
  type PolicyEpisodeLogFeatures,
  type PolicyScorer,
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
  candidates: PolicyActionCandidate[];
  selectedCandidateId: string | null;
}

export class FrontierPlanner {
  constructor(
    private readonly seed: string,
    private readonly policyScorer: PolicyScorer | null = null
  ) {}

  plan(
    graph: BeliefGraph,
    currentTileId: TileId,
    heading: HeadingToken,
    context?: {
      observation?: LocalObservation;
      snapshot?: ExplorerSnapshot;
      episodeLogFeatures?: PolicyEpisodeLogFeatures;
    }
  ): FrontierPlanResult {
    const goalTileId = graph.getGoalTileId();
    if (goalTileId && graph.hasPath(currentTileId, goalTileId)) {
      const path = graph.findPath(currentTileId, goalTileId);
      const candidate = this.buildCandidate(graph, heading, goalTileId, path, 'goal');
      return {
        targetKind: 'goal',
        targetTileId: goalTileId,
        path,
        frontierIds: graph.getFrontierIds(),
        reason: 'goal observed and reachable on discovered graph',
        candidate,
        candidates: [
          this.toPolicyCandidate(candidate, {
            goalVisible: context?.observation?.goal.visible ?? false,
            frontierCount: graph.getFrontierIds().length,
            reason: 'goal observed and reachable on discovered graph'
          })
        ],
        selectedCandidateId: candidate.id
      };
    }

    const localOptions = graph.getUnvisitedNeighborIds(currentTileId);
    if (localOptions.length > 0) {
      const reason = 'expanding local frontier from current tile';
      const candidates = [...localOptions]
        .map((tileId) => this.buildCandidate(graph, heading, tileId, [currentTileId, tileId], 'frontier'))
        .sort((left, right) => this.compareCandidates(left, right));
      const selection = this.selectCandidate(candidates, {
        frontierCount: graph.getFrontierIds().length,
        goalVisible: context?.observation?.goal.visible ?? false,
        reason,
        observation: context?.observation,
        snapshot: context?.snapshot,
        episodeLogFeatures: context?.episodeLogFeatures
      });
      const candidate = selection.frontierCandidate;

      return {
        targetKind: 'frontier',
        targetTileId: candidate?.tileId ?? null,
        path: candidate ? [currentTileId, candidate.tileId] : [currentTileId],
        frontierIds: graph.getFrontierIds(),
        reason,
        candidate: candidate ?? undefined,
        candidates: selection.policyCandidates,
        selectedCandidateId: candidate?.id ?? null
      };
    }

    const frontierIds = graph.getFrontierIds().filter((tileId) => tileId !== currentTileId);
    const reason = 'reaching the best discovered frontier by shortest known path';
    const ranked = [...frontierIds]
      .map((tileId) => {
        const path = graph.findPath(currentTileId, tileId);
        return this.buildCandidate(graph, heading, tileId, path, 'frontier');
      })
      .filter((candidate) => candidate.path.length > 0)
      .sort((left, right) => this.compareCandidates(left, right));
    const selection = this.selectCandidate(ranked, {
      frontierCount: frontierIds.length,
      goalVisible: context?.observation?.goal.visible ?? false,
      reason,
      observation: context?.observation,
      snapshot: context?.snapshot,
      episodeLogFeatures: context?.episodeLogFeatures
    });
    const candidate = selection.frontierCandidate;

    if (!candidate) {
      return {
        targetKind: 'idle',
        targetTileId: null,
        path: [currentTileId],
        frontierIds,
        reason: 'no reachable frontier remains on the discovered graph',
        candidates: [],
        selectedCandidateId: null
      };
    }

    return {
      targetKind: 'frontier',
      targetTileId: candidate.tileId,
      path: candidate.path,
      frontierIds,
      reason,
      candidate: candidate ?? undefined,
      candidates: selection.policyCandidates,
      selectedCandidateId: candidate.id
    };
  }

  private selectCandidate(
    candidates: FrontierCandidate[],
    context: {
      frontierCount: number;
      goalVisible: boolean;
      reason: string;
      observation?: LocalObservation;
      snapshot?: ExplorerSnapshot;
      episodeLogFeatures?: PolicyEpisodeLogFeatures;
    }
  ): {
    frontierCandidate: FrontierCandidate | null;
    policyCandidates: PolicyActionCandidate[];
  } {
    if (candidates.length === 0) {
      return {
        frontierCandidate: null,
        policyCandidates: []
      };
    }

    const policyCandidates = candidates.map((candidate) => (
      this.toPolicyCandidate(candidate, context)
    ));

    if (!this.policyScorer || !context.observation || !context.snapshot || policyCandidates.length <= 1) {
      return {
        frontierCandidate: candidates[0] ?? null,
        policyCandidates
      };
    }

    const policyScores = this.policyScorer.scoreCandidates({
      seed: this.seed,
      step: context.observation.step,
      observation: context.observation,
      snapshot: context.snapshot,
      candidates: policyCandidates,
      episodeLogFeatures: context.episodeLogFeatures ?? null
    });
    const policyCandidatesWithScores = policyCandidates.map((candidate) => ({
      ...candidate,
      policyScore: policyScores.get(candidate.id) ?? 0
    }));
    const ranked = [...candidates].sort((left, right) => {
      const leftScore = policyScores.get(left.id) ?? 0;
      const rightScore = policyScores.get(right.id) ?? 0;
      if (leftScore !== rightScore) {
        return rightScore - leftScore;
      }

      return this.compareCandidates(left, right);
    });

    return {
      frontierCandidate: ranked[0] ?? null,
      policyCandidates: policyCandidatesWithScores.sort((left, right) => {
        const leftScore = left.policyScore ?? 0;
        const rightScore = right.policyScore ?? 0;
        if (leftScore !== rightScore) {
          return rightScore - leftScore;
        }

        return left.heuristicScore - right.heuristicScore;
      })
    };
  }

  private toPolicyCandidate(
    candidate: FrontierCandidate,
    {
      frontierCount,
      goalVisible,
      reason,
      observation
    }: {
      frontierCount: number;
      goalVisible: boolean;
      reason: string;
      observation?: LocalObservation;
    }
  ): PolicyActionCandidate {
    const advisory = normalizePolicyCandidateAdvisoryFeatures(
      observation?.candidateSignals?.[candidate.tileId] ?? null
    );

    return {
      id: candidate.id,
      targetKind: candidate.targetKind,
      targetTileId: candidate.tileId,
      path: [...candidate.path],
      nextTileId: candidate.path.length > 1 ? candidate.path[1] : null,
      reason,
      heuristicScore: candidate.score,
      policyScore: null,
      features: {
        pathCost: Math.max(0, candidate.path.length - 1),
        visitCount: candidate.visitCount,
        unexploredNeighborCount: candidate.unexploredNeighborCount,
        frontierCount,
        goalVisible,
        ...advisory
      }
    };
  }

  private buildCandidate(
    graph: BeliefGraph,
    heading: HeadingToken,
    tileId: TileId,
    path: TileId[],
    targetKind: FrontierCandidate['targetKind']
  ): FrontierCandidate {
    const visitCount = graph.getNodeVisitCount(tileId);
    const unexploredNeighborCount = graph.getUnexploredNeighborCount(tileId);
    const tieBreak = stableTokenScore(this.seed, tileId, heading);
    const pathCost = Math.max(0, path.length - 1);
    const score = (pathCost * 1000) + (visitCount * 40) - (unexploredNeighborCount * 30) + tieBreak;

    return {
      id: `${targetKind}:${tileId}:${path.join('>')}`,
      targetKind,
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
