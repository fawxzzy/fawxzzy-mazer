import { BeliefGraph } from './BeliefGraph';
import { FrontierPlanner } from './FrontierPlanner';
import { summarizeObservationFeatures } from './PolicyScorer';
import {
  type ExplorerActionLogEntry,
  type ExplorerAgentOptions,
  type ExplorerCounters,
  type ExplorerDecision,
  type ExplorerMode,
  type ExplorerSnapshot,
  type LocalObservation,
  type PolicyActionCandidate,
  type PolicyEpisode,
  type PolicyObservationFeatures
} from './types';

interface PendingEpisode {
  episode: PolicyEpisode;
  baseline: {
    tilesDiscovered: number;
    frontierCount: number;
    replanCount: number;
    backtrackCount: number;
  };
}

const buildObservationFeatures = (observation: LocalObservation): PolicyObservationFeatures => {
  const cueSummary = summarizeObservationFeatures(observation.localCues);
  return {
    traversableCount: observation.traversableTileIds.length,
    landmarkCount: observation.visibleLandmarks.length,
    localCueCount: observation.localCues.length,
    dangerCueCount: cueSummary.dangerCueCount,
    enemyCueCount: cueSummary.enemyCueCount,
    itemCueCount: cueSummary.itemCueCount,
    puzzleCueCount: cueSummary.puzzleCueCount,
    goalVisible: observation.goal.visible
  };
};

export class ExplorerAgent {
  private readonly graph: BeliefGraph;

  private readonly planner: FrontierPlanner;

  private readonly actionLog: ExplorerActionLogEntry[] = [];

  private readonly episodeLog: PolicyEpisode[] = [];

  private readonly counters: ExplorerCounters = {
    replanCount: 0,
    backtrackCount: 0,
    frontierCount: 0,
    goalObservedStep: null,
    tilesDiscovered: 0
  };

  private lastObservation: LocalObservation | null = null;

  private lastDecision: ExplorerDecision | null = null;

  private currentMode: ExplorerMode = 'explore';

  private pendingEpisode: PendingEpisode | null = null;

  constructor(private readonly options: ExplorerAgentOptions) {
    this.graph = new BeliefGraph();
    this.planner = new FrontierPlanner(options.seed, options.policyScorer ?? null);
  }

  observe(observation: LocalObservation): ExplorerDecision {
    const priorVisitCount = this.graph.getNodeVisitCount(observation.currentTileId);

    if (this.lastObservation) {
      this.graph.recordTraversal(this.lastObservation.currentTileId, observation.currentTileId, observation.step);
      this.counters.replanCount += 1;
    }

    this.graph.observe(observation);
    this.counters.tilesDiscovered = this.graph.getDiscoveredNodeCount();

    if (observation.goal.visible && this.counters.goalObservedStep === null) {
      this.counters.goalObservedStep = observation.step;
    }

    if (priorVisitCount > 0 && this.lastObservation) {
      this.counters.backtrackCount += 1;
    }

    this.finalizePendingEpisode(observation);

    const snapshotBeforeDecision = this.buildSnapshot();
    const plan = this.planner.plan(this.graph, observation.currentTileId, observation.heading, {
      observation,
      snapshot: snapshotBeforeDecision
    });
    const nextTileId = plan.path.length > 1 ? plan.path[1] : null;
    const targetKind = nextTileId && this.graph.getNodeVisitCount(nextTileId) > 0 && plan.targetKind !== 'goal'
      ? 'backtrack'
      : plan.targetKind;
    const decision: ExplorerDecision = {
      step: observation.step,
      currentTileId: observation.currentTileId,
      targetKind,
      targetTileId: plan.targetTileId,
      path: [...plan.path],
      nextTileId,
      reason: plan.reason,
      goalVisible: observation.goal.visible
    };
    this.currentMode = decision.targetKind === 'goal' ? 'goal' : decision.targetKind === 'idle' ? 'idle' : 'explore';

    if (decision.targetKind === 'frontier') {
      this.counters.frontierCount += 1;
    }

    const logEntry: ExplorerActionLogEntry = {
      seed: this.options.seed,
      ...decision
    };
    this.actionLog.push(logEntry);
    this.lastObservation = observation;
    this.lastDecision = decision;
    this.beginEpisode(observation, decision, plan.selectedCandidateId, plan.candidates);
    return decision;
  }

  getDiagnostics(): ExplorerSnapshot {
    return this.buildSnapshot();
  }

  getActionLog(): readonly ExplorerActionLogEntry[] {
    return [...this.actionLog];
  }

  getEpisodeLog(): readonly PolicyEpisode[] {
    return this.episodeLog.map((episode) => ({
      ...episode,
      observation: { ...episode.observation },
      candidates: episode.candidates.map((candidate) => ({
        ...candidate,
        path: [...candidate.path],
        features: { ...candidate.features }
      })),
      chosenAction: { ...episode.chosenAction },
      outcome: episode.outcome
        ? {
            ...episode.outcome,
            localCues: [...episode.outcome.localCues]
          }
        : null
    }));
  }

  getCurrentDecision(): ExplorerDecision | null {
    return this.lastDecision;
  }

  getBeliefGraph(): BeliefGraph {
    return this.graph;
  }

  private beginEpisode(
    observation: LocalObservation,
    decision: ExplorerDecision,
    selectedCandidateId: string | null,
    candidates: PolicyActionCandidate[]
  ): void {
    this.pendingEpisode = {
      episode: {
        step: observation.step,
        seed: this.options.seed,
        scorerId: this.options.policyScorer?.id ?? 'disabled',
        currentTileId: observation.currentTileId,
        heading: observation.heading,
        observation: buildObservationFeatures(observation),
        candidates: candidates.map((candidate) => ({
          ...candidate,
          path: [...candidate.path],
          features: { ...candidate.features }
        })),
        chosenCandidateId: selectedCandidateId,
        chosenAction: {
          targetKind: decision.targetKind,
          targetTileId: decision.targetTileId,
          nextTileId: decision.nextTileId,
          reason: decision.reason
        },
        outcome: null
      },
      baseline: {
        tilesDiscovered: this.counters.tilesDiscovered,
        frontierCount: this.graph.getFrontierCount(),
        replanCount: this.counters.replanCount,
        backtrackCount: this.counters.backtrackCount
      }
    };
  }

  private finalizePendingEpisode(observation: LocalObservation): void {
    if (!this.pendingEpisode) {
      return;
    }

    const cueSummary = summarizeObservationFeatures(observation.localCues);
    const finalizedEpisode: PolicyEpisode = {
      ...this.pendingEpisode.episode,
      observation: { ...this.pendingEpisode.episode.observation },
      candidates: this.pendingEpisode.episode.candidates.map((candidate) => ({
        ...candidate,
        path: [...candidate.path],
        features: { ...candidate.features }
      })),
      chosenAction: { ...this.pendingEpisode.episode.chosenAction },
      outcome: {
        arrivedTileId: observation.currentTileId,
        discoveredTilesDelta: this.counters.tilesDiscovered - this.pendingEpisode.baseline.tilesDiscovered,
        frontierDelta: this.graph.getFrontierCount() - this.pendingEpisode.baseline.frontierCount,
        replanDelta: this.counters.replanCount - this.pendingEpisode.baseline.replanCount,
        backtrackDelta: this.counters.backtrackCount - this.pendingEpisode.baseline.backtrackCount,
        goalVisible: observation.goal.visible,
        goalObservedStep: this.counters.goalObservedStep,
        trapCueCount: cueSummary.dangerCueCount,
        enemyCueCount: cueSummary.enemyCueCount,
        itemCueCount: cueSummary.itemCueCount,
        puzzleCueCount: cueSummary.puzzleCueCount,
        localCues: [...observation.localCues]
      }
    };

    this.episodeLog.push(finalizedEpisode);
    this.options.policyScorer?.recordEpisode?.(finalizedEpisode);
    this.pendingEpisode = null;
  }

  private buildSnapshot(): ExplorerSnapshot {
    return {
      seed: this.options.seed,
      currentTileId: this.graph.getCurrentTileId(),
      currentHeading: this.graph.getCurrentHeading(),
      mode: this.currentMode,
      counters: { ...this.counters },
      discoveredNodeIds: this.graph.getDiscoveredNodeIds(),
      frontierIds: this.graph.getFrontierIds(),
      goalTileId: this.graph.getGoalTileId(),
      observedLandmarkIds: this.graph.getObservedLandmarkIds(),
      observedCues: this.graph.getObservedCues()
    };
  }
}
