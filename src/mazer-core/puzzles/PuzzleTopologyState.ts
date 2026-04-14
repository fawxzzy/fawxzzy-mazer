import type {
  PuzzleObservation,
  PuzzleObservationContext,
  PuzzleStateSnapshot,
  PuzzleUsefulnessFeatures,
  RankedPuzzleOpportunity,
  TopologyPuzzleDefinition
} from './types';

interface MutablePuzzleState {
  solvedStep: number | null;
  lastVisibleStep: number | null;
  lastProxiedStep: number | null;
}

const clamp01 = (value: number): number => Number(Math.min(1, Math.max(0, value)).toFixed(4));

const normalizeToken = (value: string): string => value.trim().toLowerCase();

const includesCueToken = (haystack: readonly string[], needle: string): boolean => {
  const normalizedNeedle = normalizeToken(needle);
  if (!normalizedNeedle) {
    return false;
  }

  return haystack.some((entry) => normalizeToken(entry).includes(normalizedNeedle));
};

const sortUniqueStrings = (values: Iterable<string>): string[] => [...new Set(values)].sort((left, right) => left.localeCompare(right));

const ensureDefinitionContracts = (definitions: readonly TopologyPuzzleDefinition[]): void => {
  const ids = new Set<string>();

  for (const definition of definitions) {
    if (ids.has(definition.id)) {
      throw new Error(`Duplicate puzzle id "${definition.id}" is not allowed.`);
    }

    ids.add(definition.id);

    if (definition.visibility === 'proxied' && definition.proxyCues.length === 0) {
      throw new Error(
        `Puzzle "${definition.id}" is proxied but has no proxy cues. Puzzle state must remain visible or proxied.`
      );
    }
  }
};

const compareRankedPuzzles = (left: RankedPuzzleOpportunity, right: RankedPuzzleOpportunity): number => {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  return left.puzzleId.localeCompare(right.puzzleId);
};

export class PuzzleTopologyState {
  readonly #definitions: readonly TopologyPuzzleDefinition[];
  readonly #stateById = new Map<string, MutablePuzzleState>();
  readonly #checkpointKeys = new Set<string>();
  readonly #activeSignals = new Set<string>();
  readonly #shellUnlocks = new Set<string>();

  constructor(definitions: readonly TopologyPuzzleDefinition[]) {
    ensureDefinitionContracts(definitions);
    this.#definitions = [...definitions].sort((left, right) => left.id.localeCompare(right.id));

    for (const definition of this.#definitions) {
      this.#stateById.set(definition.id, {
        solvedStep: null,
        lastVisibleStep: null,
        lastProxiedStep: null
      });
    }
  }

  recordCheckpointKeyAcquired(keyId: string): void {
    this.#checkpointKeys.add(keyId);
  }

  recordSignalNodeState(signalNodeId: string, active: boolean): void {
    if (active) {
      this.#activeSignals.add(signalNodeId);
      return;
    }

    this.#activeSignals.delete(signalNodeId);
  }

  recordShellUnlocked(shellUnlockId: string): void {
    this.#shellUnlocks.add(shellUnlockId);
  }

  getStateSnapshot(): readonly PuzzleStateSnapshot[] {
    return this.#definitions.map((definition) => this.#buildPuzzleState(definition));
  }

  observeAndRank(context: PuzzleObservationContext): PuzzleObservation {
    const observedPuzzleIds = new Set<string>();
    const solvedPuzzleIds = new Set<string>();
    const ranked: RankedPuzzleOpportunity[] = [];

    for (const definition of this.#definitions) {
      const state = this.#requireState(definition.id);
      const visibility = this.#resolveVisibility(definition, context);
      if (visibility !== 'none') {
        observedPuzzleIds.add(definition.id);
      }

      if (visibility === 'visible') {
        state.lastVisibleStep = context.step;
      } else if (visibility === 'proxied') {
        state.lastProxiedStep = context.step;
      }

      const currentSnapshot = this.#buildPuzzleState(definition);
      const canSolveNow = (
        currentSnapshot.missingCheckpointKeyIds.length === 0
        && currentSnapshot.missingSignalNodeIds.length === 0
        && currentSnapshot.missingShellUnlockIds.length === 0
        && visibility !== 'none'
      );

      if (canSolveNow && state.solvedStep === null) {
        state.solvedStep = context.step;
      }

      if (state.solvedStep !== null) {
        solvedPuzzleIds.add(definition.id);
      }

      if (visibility === 'none' && state.solvedStep === null) {
        continue;
      }

      const refreshedSnapshot = this.#buildPuzzleState(definition);
      ranked.push({
        puzzleId: definition.id,
        score: this.#scorePuzzle(definition, refreshedSnapshot, context, visibility),
        visibility,
        canSolveNow,
        features: this.#buildFeatureVector(definition, refreshedSnapshot, context, visibility)
      });
    }

    ranked.sort(compareRankedPuzzles);

    return {
      step: context.step,
      observedPuzzleIds: sortUniqueStrings(observedPuzzleIds),
      solvedPuzzleIds: sortUniqueStrings(solvedPuzzleIds),
      rankedOpportunities: ranked.map((entry) => ({
        ...entry,
        features: { ...entry.features }
      })),
      states: this.getStateSnapshot()
    };
  }

  #resolveVisibility(definition: TopologyPuzzleDefinition, context: PuzzleObservationContext): 'none' | 'visible' | 'proxied' {
    const directVisible = definition.anchor.tileId === context.currentTileId
      || (
        Boolean(definition.anchor.connectorId)
        && context.visibleConnectorIds.includes(definition.anchor.connectorId as string)
      );
    if (directVisible) {
      return 'visible';
    }

    const proxied = definition.proxyCues.some((proxy) => (
      (proxy.kind === 'landmark' && context.visibleLandmarkIds.includes(proxy.id))
      || (proxy.kind === 'connector' && context.visibleConnectorIds.includes(proxy.id))
      || (typeof proxy.tileId === 'string' && proxy.tileId === context.currentTileId)
      || includesCueToken(context.localCues, proxy.id)
      || includesCueToken(context.localCues, proxy.label)
    ));

    return proxied ? 'proxied' : 'none';
  }

  #buildPuzzleState(definition: TopologyPuzzleDefinition): PuzzleStateSnapshot {
    const mutableState = this.#requireState(definition.id);

    const missingCheckpointKeyIds = sortUniqueStrings(
      definition.requiredCheckpointKeyIds.filter((id) => !this.#checkpointKeys.has(id))
    );
    const missingSignalNodeIds = sortUniqueStrings(
      definition.requiredSignalNodeIds.filter((id) => !this.#activeSignals.has(id))
    );
    const missingShellUnlockIds = sortUniqueStrings(
      definition.requiredShellUnlockIds.filter((id) => !this.#shellUnlocks.has(id))
    );

    return {
      puzzleId: definition.id,
      solvedStep: mutableState.solvedStep,
      lastVisibleStep: mutableState.lastVisibleStep,
      lastProxiedStep: mutableState.lastProxiedStep,
      missingCheckpointKeyIds,
      missingSignalNodeIds,
      missingShellUnlockIds
    };
  }

  #scorePuzzle(
    definition: TopologyPuzzleDefinition,
    state: PuzzleStateSnapshot,
    context: PuzzleObservationContext,
    visibility: 'none' | 'visible' | 'proxied'
  ): number {
    const features = this.#buildFeatureVector(definition, state, context, visibility);
    const rawScore = (
      (features.directVisibility * 0.24)
      + (features.proxyVisibility * 0.16)
      + (features.topologyProximity * 0.14)
      + (features.requirementCompletion * 0.3)
      + (features.shellRelevance * 0.12)
      + (features.unresolvedNeed * 0.04)
    );

    return clamp01(rawScore);
  }

  #buildFeatureVector(
    definition: TopologyPuzzleDefinition,
    state: PuzzleStateSnapshot,
    context: PuzzleObservationContext,
    visibility: 'none' | 'visible' | 'proxied'
  ): PuzzleUsefulnessFeatures {
    const requiredCount = (
      definition.requiredCheckpointKeyIds.length
      + definition.requiredSignalNodeIds.length
      + definition.requiredShellUnlockIds.length
    );
    const missingCount = (
      state.missingCheckpointKeyIds.length
      + state.missingSignalNodeIds.length
      + state.missingShellUnlockIds.length
    );
    const requirementCompletion = requiredCount === 0
      ? 1
      : clamp01((requiredCount - missingCount) / requiredCount);

    const topologyProximity = definition.anchor.tileId === context.currentTileId
      ? 1
      : context.neighborTileIds.includes(definition.anchor.tileId)
        ? 0.7
        : visibility === 'proxied'
          ? 0.45
          : 0.2;

    return {
      directVisibility: visibility === 'visible' ? 1 : 0,
      proxyVisibility: visibility === 'proxied' ? 0.75 : 0,
      topologyProximity,
      requirementCompletion,
      shellRelevance: context.targetShellId && definition.outputShellId === context.targetShellId ? 1 : 0,
      unresolvedNeed: state.solvedStep === null ? 1 : 0
    };
  }

  #requireState(puzzleId: string): MutablePuzzleState {
    const state = this.#stateById.get(puzzleId);
    if (!state) {
      throw new Error(`Missing puzzle state for "${puzzleId}".`);
    }

    return state;
  }
}
