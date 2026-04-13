import { BeliefGraph } from './BeliefGraph';
import { FrontierPlanner } from './FrontierPlanner';
import {
  type ExplorerActionLogEntry,
  type ExplorerAgentOptions,
  type ExplorerCounters,
  type ExplorerDecision,
  type ExplorerMode,
  type ExplorerSnapshot,
  type LocalObservation
} from './types';

export class ExplorerAgent {
  private readonly graph: BeliefGraph;

  private readonly planner: FrontierPlanner;

  private readonly actionLog: ExplorerActionLogEntry[] = [];

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

  constructor(private readonly options: ExplorerAgentOptions) {
    this.graph = new BeliefGraph();
    this.planner = new FrontierPlanner(options.seed);
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

    const plan = this.planner.plan(this.graph, observation.currentTileId, observation.heading);
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
    return decision;
  }

  getDiagnostics(): ExplorerSnapshot {
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

  getActionLog(): readonly ExplorerActionLogEntry[] {
    return [...this.actionLog];
  }

  getCurrentDecision(): ExplorerDecision | null {
    return this.lastDecision;
  }

  getBeliefGraph(): BeliefGraph {
    return this.graph;
  }
}
