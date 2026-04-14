import { stableTokenScore, uniqueStrings, type TileId, type VisibleLandmark } from '../agent/types';
import type {
  WardenDecision,
  WardenGraphAgentOptions,
  WardenLocalObservation,
  WardenMoveCandidate,
  WardenMoveFeatures,
  WardenNodeMemory,
  WardenRotationPhase,
  WardenSnapshot
} from './types';

const JUNCTION_KEYWORDS = ['junction', 'crossroad', 'fork'];
const LOOP_KEYWORDS = ['loop', 'ring', 'cycle'];
const SIGHTLINE_KEYWORDS = ['sightline', 'occluded', 'blind', 'cover', 'corner', 'vantage'];
const STABLE_ROTATION_KEYWORDS = ['stable', 'checkpoint', 'anchor', 'align'];
const INTERCEPT_ROTATION_KEYWORDS = ['intercept', 'goal', 'lane', 'choke'];

const normalizeCue = (value: string): string => value.trim().toLowerCase();

const cueHasKeyword = (value: string, keywords: readonly string[]): boolean => {
  const normalized = normalizeCue(value);
  return keywords.some((keyword) => normalized.includes(keyword));
};

const listHasKeyword = (values: readonly string[], keywords: readonly string[]): boolean => (
  values.some((value) => cueHasKeyword(value, keywords))
);

const landmarkCuePool = (landmarks: readonly VisibleLandmark[], tileId: TileId): string[] => landmarks
  .filter((landmark) => landmark.tileId === tileId && typeof landmark.cue === 'string')
  .map((landmark) => normalizeCue(landmark.cue as string));

const resolveRotationPhase = (
  inputPhase: WardenRotationPhase,
  localCues: readonly string[]
): 'stable' | 'turning' | 'recovery' => {
  const normalizedInput = typeof inputPhase === 'string' ? normalizeCue(inputPhase) : '';
  if (normalizedInput.includes('turn')) {
    return 'turning';
  }

  if (normalizedInput.includes('recover')) {
    return 'recovery';
  }

  if (listHasKeyword(localCues, ['rotation:turn', 'phase:turn', 'turning'])) {
    return 'turning';
  }

  if (listHasKeyword(localCues, ['rotation:recover', 'phase:recover', 'recover'])) {
    return 'recovery';
  }

  return 'stable';
};

const asIntent = (features: WardenMoveFeatures): WardenDecision['intent'] => {
  if (features.directPlayerContact) {
    return 'pursue';
  }

  if (features.lastKnownPlayerContact) {
    return 'intercept';
  }

  if (features.loopCandidate || features.sightlineRecoveryCandidate) {
    return 'contain';
  }

  return 'patrol';
};

const compareCandidates = (left: WardenMoveCandidate, right: WardenMoveCandidate): number => {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  if (left.tieBreak !== right.tieBreak) {
    return right.tieBreak - left.tieBreak;
  }

  return left.nextTileId.localeCompare(right.nextTileId);
};

export class WardenGraphAgent {
  readonly #nodes = new Map<TileId, WardenNodeMemory>();
  readonly #decisionLog: WardenDecision[] = [];
  #currentTileId: TileId | null;

  constructor(private readonly options: WardenGraphAgentOptions) {
    this.#currentTileId = options.startTileId;
  }

  observeAndDecide(observation: WardenLocalObservation): WardenDecision {
    this.observeTopology(observation);

    const legalMoves = uniqueStrings(observation.traversableTileIds);
    if (legalMoves.length === 0) {
      const idleDecision: WardenDecision = {
        step: observation.step,
        currentTileId: observation.currentTileId,
        intent: 'hold',
        nextTileId: null,
        reason: 'no legal topology edge available',
        candidates: []
      };
      this.#decisionLog.push(idleDecision);
      this.#currentTileId = observation.currentTileId;
      return idleDecision;
    }

    const candidateContext = this.buildCandidateContext(observation);
    const candidates = legalMoves.map((nextTileId) => this.buildCandidate(nextTileId, observation, candidateContext))
      .sort(compareCandidates);
    const selected = candidates[0];

    const decision: WardenDecision = {
      step: observation.step,
      currentTileId: observation.currentTileId,
      intent: asIntent(selected.features),
      nextTileId: selected.nextTileId,
      reason: selected.reason,
      candidates: candidates.map((candidate) => ({
        ...candidate,
        features: { ...candidate.features }
      }))
    };

    this.#decisionLog.push(decision);
    this.#currentTileId = selected.nextTileId;
    return decision;
  }

  getDecisionLog(): readonly WardenDecision[] {
    return this.#decisionLog.map((decision) => ({
      ...decision,
      candidates: decision.candidates.map((candidate) => ({
        ...candidate,
        features: { ...candidate.features }
      }))
    }));
  }

  getSnapshot(): WardenSnapshot {
    const nodes: Record<TileId, WardenNodeMemory> = {};
    for (const [tileId, node] of this.#nodes.entries()) {
      nodes[tileId] = {
        ...node,
        cues: [...node.cues]
      };
    }

    return {
      seed: this.options.seed,
      currentTileId: this.#currentTileId,
      totalDecisions: this.#decisionLog.length,
      nodes
    };
  }

  private observeTopology(observation: WardenLocalObservation): void {
    const node = this.ensureNode(observation.currentTileId, observation.step);
    node.visitCount += 1;
    node.lastSeenStep = observation.step;
    node.knownNeighborCount = Math.max(node.knownNeighborCount, observation.traversableTileIds.length);
    node.cues = uniqueStrings([
      ...node.cues,
      ...observation.localCues.map(normalizeCue),
      ...observation.visibleLandmarks
        .filter((landmark) => landmark.tileId === observation.currentTileId && typeof landmark.cue === 'string')
        .map((landmark) => normalizeCue(landmark.cue as string))
    ]);

    for (const neighborId of observation.traversableTileIds) {
      this.ensureNode(neighborId, observation.step);
    }
  }

  private buildCandidateContext(observation: WardenLocalObservation): {
    atJunction: boolean;
    loopContext: boolean;
    sightlineContext: boolean;
    rotationPhase: 'stable' | 'turning' | 'recovery';
  } {
    const atJunction = observation.traversableTileIds.length >= 3
      || listHasKeyword(observation.localCues, JUNCTION_KEYWORDS);
    const loopContext = listHasKeyword(observation.localCues, LOOP_KEYWORDS);
    const sightlineContext = observation.sightlineBroken
      || listHasKeyword(observation.localCues, SIGHTLINE_KEYWORDS);
    const rotationPhase = resolveRotationPhase(observation.rotationPhase, observation.localCues);

    return {
      atJunction,
      loopContext,
      sightlineContext,
      rotationPhase
    };
  }

  private buildCandidate(
    nextTileId: TileId,
    observation: WardenLocalObservation,
    context: {
      atJunction: boolean;
      loopContext: boolean;
      sightlineContext: boolean;
      rotationPhase: 'stable' | 'turning' | 'recovery';
    }
  ): WardenMoveCandidate {
    const node = this.ensureNode(nextTileId, observation.step);
    const cues = uniqueStrings([
      ...node.cues,
      ...landmarkCuePool(observation.visibleLandmarks, nextTileId)
    ]);

    const directPlayerContact = observation.playerVisible && observation.playerTileId === nextTileId;
    const lastKnownPlayerContact = !directPlayerContact
      && Boolean(observation.playerLastKnownTileId && observation.playerLastKnownTileId === nextTileId);
    const loopCandidate = context.loopContext && listHasKeyword(cues, LOOP_KEYWORDS);
    const sightlineRecoveryCandidate = context.sightlineContext
      && listHasKeyword(cues, SIGHTLINE_KEYWORDS);

    const rotationAligned = context.rotationPhase === 'stable'
      || (
        context.rotationPhase === 'turning'
          ? listHasKeyword(cues, STABLE_ROTATION_KEYWORDS) || context.atJunction
          : listHasKeyword(cues, INTERCEPT_ROTATION_KEYWORDS)
      );

    const features: WardenMoveFeatures = {
      visitCount: node.visitCount,
      directPlayerContact,
      lastKnownPlayerContact,
      junctionCandidate: context.atJunction,
      loopCandidate,
      sightlineRecoveryCandidate,
      rotationAligned
    };

    const tieBreak = stableTokenScore(
      this.options.seed,
      nextTileId,
      `${observation.currentTileId}|${context.rotationPhase}|${observation.step}`
    );

    const lastKnownWeight = context.sightlineContext ? 0.3 : 0.9;
    const sightlineWeight = context.sightlineContext ? 0.88 : 0.5;

    const score = Number((
      (directPlayerContact ? 1.25 : 0)
      + (lastKnownPlayerContact ? lastKnownWeight : 0)
      + (context.atJunction ? Math.max(0, 0.26 - (node.visitCount * 0.05)) : 0)
      + (loopCandidate ? 0.45 : 0)
      + (sightlineRecoveryCandidate ? sightlineWeight : 0)
      + (rotationAligned ? 0.3 : -0.15)
      + (node.visitCount === 0 ? 0.12 : 0)
      - (node.visitCount * 0.07)
      + (tieBreak * 0.0001)
    ).toFixed(4));

    const reason = directPlayerContact
      ? 'player visible on legal edge'
      : sightlineRecoveryCandidate
          ? 'recovering line-of-sight through topology cue'
          : lastKnownPlayerContact
            ? 'intercepting last-known player tile'
          : loopCandidate
            ? 'containing loop corridor'
            : context.atJunction
              ? 'patrolling junction exits'
              : 'patrolling legal edge';

    return {
      id: `${observation.step}:${observation.currentTileId}->${nextTileId}`,
      nextTileId,
      score,
      tieBreak,
      features,
      reason
    };
  }

  private ensureNode(tileId: TileId, step: number): WardenNodeMemory {
    const existing = this.#nodes.get(tileId);
    if (existing) {
      return existing;
    }

    const node: WardenNodeMemory = {
      id: tileId,
      visitCount: 0,
      firstSeenStep: step,
      lastSeenStep: step,
      knownNeighborCount: 0,
      cues: []
    };
    this.#nodes.set(tileId, node);
    return node;
  }
}
