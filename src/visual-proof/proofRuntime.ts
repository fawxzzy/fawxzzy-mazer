import type { PlanetNode, PlanetProofManifest, RotationState } from './manifestTypes';
import type { FocusTarget, ProofStateDefinition } from './scenarioLibrary';
import { EpisodicPolicyScorer } from './agent/PolicyScorer';
import { ProofMazeEnvironment } from './agent/ProofMazeEnvironment';
import { ExplorerAgent } from './agent/ExplorerAgent';
import type { ExplorerDecision, ExplorerSnapshot, LocalObservation, PolicyEpisode } from './agent/types';
import type { IntentFeedState } from './intent/IntentEvent';
import { buildIntentBus, type IntentSourceState } from './intent/IntentBus';
import { buildIntentFeed } from './intent/IntentFeed';
import { TrailModel, type TrailSnapshot } from './trail/TrailModel';

export type ProofCanaryMutation =
  | 'hide-player'
  | 'hide-objective'
  | 'hide-landmark'
  | 'hide-connector'
  | 'omniscient-goal-target'
  | 'trail-head-mismatch'
  | 'collapse-cue-channels'
  | 'intent-feed-spam'
  | 'show-solution-overlay';

export interface RuntimeProofState {
  id: string;
  step: number;
  caption: string;
  cameraLabel: string;
  rotationLabel: string;
  status: string;
  cues: readonly string[];
  shellRotations: ProofStateDefinition['shellRotations'];
  player: ProofStateDefinition['player'] & { tileId: string };
  objective: ProofStateDefinition['objective'] & { tileId: string | null; kind: 'frontier' | 'goal' | 'idle' };
  activeConnectorIds: readonly string[];
  focus: {
    target: FocusTarget;
    zoom: number;
    title: string;
    note: string;
  };
  trail: TrailSnapshot;
  diagnostics: {
    currentTargetTileId: string | null;
    goalTileId: string | null;
    goalKnown: boolean;
    goalObservedStep: number | null;
    trailHeadTileId: string | null;
    trailHeadMatchesPlayer: boolean;
    replanCount: number;
    backtrackCount: number;
    frontierCount: number;
    tilesDiscovered: number;
    mode: ExplorerSnapshot['mode'];
    frontierIds: string[];
    discoveredNodeIds: string[];
    actionReason: string;
    targetKind: ExplorerDecision['targetKind'];
    solutionOverlayVisible: boolean;
    actionLog: string[];
    intentFeed: IntentFeedState;
    policyScorerId: string;
    policyEpisodeCount: number;
    policyEpisodes: PolicyEpisode[];
  };
}

export interface ProofPlayback {
  manifest: PlanetProofManifest;
  stateIds: string[];
  states: RuntimeProofState[];
  stateMap: Map<string, RuntimeProofState>;
  totalSteps: number;
  goalReached: boolean;
  actionLog: string[];
}

interface RawStepState {
  step: number;
  currentTileId: string;
  currentHeading: string;
  decision: ExplorerDecision;
  explorer: ExplorerSnapshot;
  trail: TrailSnapshot;
  observation: LocalObservation;
  traversedConnectorId: string | null;
  policyScorerId: string;
  policyEpisodes: PolicyEpisode[];
}

const FOCUS_ZOOM: Record<FocusTarget, number> = {
  player: 2.8,
  objective: 2.65,
  landmark: 2.2,
  connector: 2.95
};

const SHELL_DEPTH: Record<PlanetNode['shellId'], number> = {
  outer: 0,
  middle: 1,
  core: 2
};

const edgePairKey = (from: string, to: string): string => [from, to].sort().join('::');

const labelForNode = (node: PlanetNode): string => node.label.trim() || node.id;

const buildHeading = (fromNode: PlanetNode, toNode: PlanetNode): string => {
  if (fromNode.shellId !== toNode.shellId) {
    return SHELL_DEPTH[fromNode.shellId] < SHELL_DEPTH[toNode.shellId] ? 'inward' : 'outward';
  }

  const normalizedDelta = (((toNode.angle - fromNode.angle) % 360) + 360) % 360;
  if (normalizedDelta === 0) {
    return 'hold';
  }

  return normalizedDelta <= 180 ? 'clockwise' : 'counterclockwise';
};

const toLocalObservation = (
  step: number,
  heading: string,
  observation: ReturnType<ProofMazeEnvironment['getObservation']>
): LocalObservation => ({
  step,
  currentTileId: observation.tileId,
  heading,
  traversableTileIds: observation.traversableNeighborIds,
  localCues: observation.localCues,
  visibleLandmarks: observation.visibleLandmarks.map((landmark) => ({
    id: landmark.id,
    label: landmark.label
  })),
  goal: {
    visible: observation.goal.visible,
    tileId: observation.goal.tileId,
    label: observation.goal.label ?? undefined
  }
});

const buildStateIds = (frameIds: readonly string[]): string[] => {
  const unique = new Set<string>();
  for (const frameId of frameIds) {
    unique.add(frameId);
  }

  return [...unique];
};

const sampleIndices = (frameCount: number, totalStates: number): number[] => {
  if (frameCount <= 1) {
    return [0];
  }

  if (totalStates <= 1) {
    return new Array(frameCount).fill(0);
  }

  const indices: number[] = [];
  for (let index = 0; index < frameCount; index += 1) {
    const ratio = frameCount === 1 ? 0 : index / (frameCount - 1);
    indices.push(Math.round(ratio * (totalStates - 1)));
  }

  indices[0] = 0;
  indices[indices.length - 1] = totalStates - 1;
  return indices;
};

const buildRotationStates = (
  manifest: PlanetProofManifest,
  rawStates: readonly RawStepState[]
): RotationState[] => {
  if (manifest.rotationStates.length === 0) {
    return [];
  }

  const lastIndex = manifest.rotationStates.length - 1;
  let currentIndex = 0;

  return rawStates.map((state, index) => {
    const progressIndex = lastIndex === 0
      ? 0
      : Math.floor((index / Math.max(1, rawStates.length - 1)) * lastIndex);
    currentIndex = Math.max(currentIndex, progressIndex);

    if (state.traversedConnectorId) {
      const connectorIndex = manifest.rotationStates.findIndex((rotationState) => (
        rotationState.activeConnectorIds.includes(state.traversedConnectorId as string)
      ));
      if (connectorIndex >= 0) {
        currentIndex = Math.max(currentIndex, connectorIndex);
      }
    }

    return manifest.rotationStates[currentIndex];
  });
};

const buildActionLines = (rawState: RawStepState): string[] => {
  const diagnostics = rawState.explorer;
  return [
    `step ${rawState.step}: ${rawState.decision.reason}`,
    `target ${rawState.decision.targetKind}: ${rawState.decision.targetTileId ?? 'none'}`,
    `next tile: ${rawState.decision.nextTileId ?? 'stop'}`,
    `frontiers: ${diagnostics.frontierIds.length}`,
    `tiles discovered: ${diagnostics.counters.tilesDiscovered}`
  ];
};

const buildCaption = (state: RawStepState, goalReached: boolean): string => {
  if (state.step === 0) {
    return 'The explorer starts with only local observations and no solved route overlay.';
  }

  if (goalReached && state.decision.targetKind === 'idle') {
    return 'The explorer has reached the exit using only committed movement history and discovered graph truth.';
  }

  if (state.decision.targetKind === 'goal') {
    return 'The explorer has observed the exit and is now routing to it on the discovered graph only.';
  }

  if (state.decision.targetKind === 'backtrack') {
    return 'The explorer is backtracking through known space to reach the best remaining frontier.';
  }

  if (state.decision.targetKind === 'frontier') {
    return 'The explorer is expanding the best-scoring frontier without access to the full maze truth.';
  }

  return 'No discovered frontier remains.';
};

const buildStatus = (state: RawStepState, goalReached: boolean): string => {
  if (goalReached && state.decision.targetKind === 'idle') {
    return 'Committed path complete. Breadcrumb truth stays committed while the live trail head remains welded to the player.';
  }

  return [
    `Mode ${state.explorer.mode}.`,
    `Target ${state.decision.targetTileId ?? 'none'}.`,
    'Trail render uses a live player tether over committed breadcrumbs.',
    `Replans ${state.explorer.counters.replanCount}.`,
    `Backtracks ${state.explorer.counters.backtrackCount}.`
  ].join(' ');
};

const buildCameraLabel = (state: RawStepState): string => {
  if (state.decision.targetKind === 'goal') {
    return 'observed exit';
  }

  if (state.decision.targetKind === 'backtrack') {
    return 'belief backtrack';
  }

  return 'frontier search';
};

const buildFocusTitle = (target: FocusTarget, state: RawStepState): string => {
  if (target === 'objective') {
    return state.decision.targetKind === 'goal' ? 'Observed exit' : 'Frontier target';
  }

  if (target === 'connector') {
    return 'Connector truth';
  }

  if (target === 'landmark') {
    return 'Landmark bearing';
  }

  return 'Player anchor';
};

const buildFocusNote = (target: FocusTarget, state: RawStepState): string => {
  if (target === 'objective') {
    return state.decision.reason;
  }

  if (target === 'connector') {
    return 'Connector state remains discrete while the route itself comes only from committed exploration.';
  }

  if (target === 'landmark') {
    return 'Landmarks stay readable while the explorer remains information-limited.';
  }

  return 'Committed breadcrumbs remain tile-true while the visible trail head stays attached to the live player transform.';
};

export const buildProofPlayback = ({
  manifest,
  frameIds,
  canary,
  debugSolution = false
}: {
  manifest: PlanetProofManifest;
  frameIds: readonly string[];
  canary: ProofCanaryMutation | null;
  debugSolution?: boolean;
}): ProofPlayback => {
  const nodeById = new Map(manifest.nodes.map((node) => [node.id, node]));
  const edgeByPair = new Map(manifest.edges.map((edge) => [edgePairKey(edge.from, edge.to), edge]));
  const connectorById = new Map(manifest.connectors.map((connector) => [connector.id, connector]));
  const env = new ProofMazeEnvironment(manifest);
  const startTileId = env.getCurrentTileId();
  const trail = new TrailModel({ initialTileId: startTileId });
  const policyScorer = new EpisodicPolicyScorer();
  const agent = new ExplorerAgent({
    seed: manifest.seed,
    startTileId,
    startHeading: 'start',
    policyScorer
  });
  const rawStates: RawStepState[] = [];
  let heading = 'start';
  const maxSteps = Math.max(manifest.nodes.length * 4, 8);

  for (let step = 0; step <= maxSteps; step += 1) {
    const observation = toLocalObservation(step, heading, env.getObservation());
    const decision = agent.observe(observation);
    const explorer = agent.getDiagnostics();
    const trailSnapshot = trail.syncCurrentTile(env.getCurrentTileId());
    rawStates.push({
      step,
      currentTileId: env.getCurrentTileId(),
      currentHeading: heading,
      decision,
      explorer,
      trail: trailSnapshot,
      observation,
      traversedConnectorId: null,
      policyScorerId: policyScorer.id,
      policyEpisodes: [...agent.getEpisodeLog()]
    });

    if (!decision.nextTileId) {
      break;
    }

    const fromTileId = env.getCurrentTileId();
    const moveResult = env.commitMove(decision.nextTileId);
    const traversedEdge = edgeByPair.get(edgePairKey(fromTileId, moveResult.currentTileId)) ?? null;
    trail.tileCommitted(moveResult.currentTileId);
    rawStates[rawStates.length - 1].traversedConnectorId = traversedEdge?.shellTransition ? traversedEdge.id : null;

    const fromNode = nodeById.get(fromTileId);
    const toNode = nodeById.get(moveResult.currentTileId);
    if (!fromNode || !toNode) {
      throw new Error(`Missing manifest node for committed move ${fromTileId} -> ${moveResult.currentTileId}.`);
    }

    heading = buildHeading(fromNode, toNode);
  }

  const rotationStates = buildRotationStates(manifest, rawStates);
  const sampledIds = buildStateIds(frameIds);
  const sampledIndices = sampleIndices(sampledIds.length, rawStates.length);
  const actionLog = agent.getActionLog().map((entry) => (
    `step ${entry.step}: ${entry.targetKind} -> ${entry.targetTileId ?? 'none'} (${entry.reason})`
  ));
  const goalReached = rawStates.at(-1)?.currentTileId === manifest.graph.objectiveNodeId;
  const intentSourceStates = rawStates.map<IntentSourceState>((rawState) => {
    const currentNode = nodeById.get(rawState.currentTileId);
    const targetNode = rawState.decision.targetTileId ? nodeById.get(rawState.decision.targetTileId) ?? null : null;
    const traversedConnector = rawState.traversedConnectorId
      ? connectorById.get(rawState.traversedConnectorId) ?? null
      : null;

    return {
      step: rawState.step,
      currentTileId: rawState.currentTileId,
      currentTileLabel: currentNode ? labelForNode(currentNode) : rawState.currentTileId,
      targetTileId: rawState.decision.targetTileId,
      targetTileLabel: targetNode ? labelForNode(targetNode) : rawState.decision.targetTileId,
      targetKind: rawState.decision.targetKind,
      nextTileId: rawState.decision.nextTileId,
      reason: rawState.decision.reason,
      frontierCount: rawState.explorer.frontierIds.length,
      replanCount: rawState.explorer.counters.replanCount,
      backtrackCount: rawState.explorer.counters.backtrackCount,
      goalVisible: rawState.observation.goal.visible,
      goalObservedStep: rawState.explorer.counters.goalObservedStep,
      visibleLandmarks: rawState.observation.visibleLandmarks.map((landmark) => ({
        id: landmark.id,
        label: landmark.label
      })),
      observedLandmarkIds: [...rawState.explorer.observedLandmarkIds],
      localCues: [...rawState.observation.localCues],
      traversableTileIds: [...rawState.observation.traversableTileIds],
      traversedConnectorId: rawState.traversedConnectorId,
      traversedConnectorLabel: traversedConnector?.label ?? null
    };
  });
  const intentBus = buildIntentBus(intentSourceStates, {
    canary
  });
  const intentFeed = buildIntentFeed(intentBus, intentSourceStates.map((state) => state.step), {
    canary
  });
  const states = sampledIds.map((stateId, index) => {
    const rawState = rawStates[sampledIndices[index]];
    const rotationState = rotationStates[sampledIndices[index]] ?? manifest.rotationStates.at(-1);
    const playerNode = nodeById.get(rawState.currentTileId);
    if (!playerNode) {
      throw new Error(`Missing player node ${rawState.currentTileId}.`);
    }

    const targetTileId = canary === 'omniscient-goal-target' && rawState.step === 0
      ? manifest.graph.objectiveNodeId
      : rawState.decision.targetTileId;
    const targetNode = targetTileId ? nodeById.get(targetTileId) ?? null : null;
    const trailHeadTileId = canary === 'trail-head-mismatch'
      ? rawState.trail.trailTailTileIds.at(-1) ?? null
      : rawState.trail.trailHeadTileId;
    const targetKind = canary === 'omniscient-goal-target' && rawState.step === 0
      ? 'goal'
      : rawState.decision.targetKind;
    const objectiveKind: RuntimeProofState['objective']['kind'] = targetKind === 'goal'
      ? 'goal'
      : targetKind === 'idle'
        ? 'idle'
        : 'frontier';
    const targetLabel = targetNode ? labelForNode(targetNode) : 'No target';
    const intentFeedState = intentFeed.states.get(rawState.step) ?? {
      step: rawState.step,
      entries: [],
      pings: [],
      metrics: intentFeed.metrics
    };

    return {
      id: stateId,
      step: rawState.step,
      caption: buildCaption(rawState, goalReached),
      cameraLabel: buildCameraLabel(rawState),
      rotationLabel: rotationState?.label ?? 'static',
      status: buildStatus(rawState, goalReached),
      cues: [
        ...buildActionLines(rawState),
        ...rawState.observation.localCues.slice(0, 3)
      ],
      shellRotations: rotationState?.shellRotations ?? { outer: 0, middle: 0, core: 0 },
      player: {
        tileId: playerNode.id,
        shellId: playerNode.shellId,
        angle: playerNode.angle,
        label: labelForNode(playerNode),
        emphasis: 1
      },
      objective: {
        tileId: targetNode?.id ?? null,
        shellId: targetNode?.shellId ?? playerNode.shellId,
        angle: targetNode?.angle ?? playerNode.angle,
        label: targetLabel,
        visible: targetNode !== null,
        kind: objectiveKind
      },
      activeConnectorIds: rotationState?.activeConnectorIds ?? [],
      focus: {
        target: manifest.proof.semanticGate.focusTarget,
        zoom: FOCUS_ZOOM[manifest.proof.semanticGate.focusTarget],
        title: buildFocusTitle(manifest.proof.semanticGate.focusTarget, rawState),
        note: buildFocusNote(manifest.proof.semanticGate.focusTarget, rawState)
      },
      trail: {
        ...rawState.trail,
        trailHeadTileId
      },
      diagnostics: {
        currentTargetTileId: targetTileId,
        goalTileId: manifest.graph.objectiveNodeId,
        goalKnown: rawState.explorer.goalTileId !== null,
        goalObservedStep: rawState.explorer.counters.goalObservedStep,
        trailHeadTileId,
        trailHeadMatchesPlayer: trailHeadTileId === playerNode.id,
        replanCount: rawState.explorer.counters.replanCount,
        backtrackCount: rawState.explorer.counters.backtrackCount,
        frontierCount: rawState.explorer.counters.frontierCount,
        tilesDiscovered: rawState.explorer.counters.tilesDiscovered,
        mode: rawState.explorer.mode,
        frontierIds: [...rawState.explorer.frontierIds],
        discoveredNodeIds: [...rawState.explorer.discoveredNodeIds],
        actionReason: rawState.decision.reason,
        targetKind,
        solutionOverlayVisible: debugSolution || canary === 'show-solution-overlay',
        actionLog: actionLog.slice(Math.max(0, actionLog.length - 6)),
        intentFeed: intentFeedState,
        policyScorerId: rawState.policyScorerId,
        policyEpisodeCount: rawState.policyEpisodes.length,
        policyEpisodes: rawState.policyEpisodes.map((episode) => ({
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
        }))
      }
    };
  });

  return {
    manifest,
    stateIds: sampledIds,
    states,
    stateMap: new Map(states.map((state) => [state.id, state])),
    totalSteps: rawStates.length - 1,
    goalReached,
    actionLog
  };
};
