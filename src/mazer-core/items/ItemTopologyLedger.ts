import type {
  ItemEvidence,
  ItemObservation,
  ItemObservationContext,
  ItemStateSnapshot,
  ItemUsefulnessFeatures,
  RankedItemUsefulness,
  TopologyItemDefinition
} from './types';

interface MutableItemState {
  acquiredStep: number | null;
  signalActivatedStep: number | null;
  shellUnlockedStep: number | null;
  lastEvidenceStep: number | null;
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

const buildEmptyState = (): MutableItemState => ({
  acquiredStep: null,
  signalActivatedStep: null,
  shellUnlockedStep: null,
  lastEvidenceStep: null
});

const ensureDefinitionContracts = (definitions: readonly TopologyItemDefinition[]): void => {
  const ids = new Set<string>();

  for (const definition of definitions) {
    if (ids.has(definition.id)) {
      throw new Error(`Duplicate item id "${definition.id}" is not allowed.`);
    }

    ids.add(definition.id);

    if (definition.visibility === 'proxied' && definition.proxyCues.length === 0) {
      throw new Error(
        `Item "${definition.id}" is proxied but defines no proxy cues. Items must remain visible or proxied, never hidden.`
      );
    }

    if (!definition.anchor.tileId) {
      throw new Error(`Item "${definition.id}" must define anchor.tileId.`);
    }
  }
};

const compareRankedItems = (left: RankedItemUsefulness, right: RankedItemUsefulness): number => {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  return left.itemId.localeCompare(right.itemId);
};

export class ItemTopologyLedger {
  readonly #definitions: readonly TopologyItemDefinition[];
  readonly #definitionById: ReadonlyMap<string, TopologyItemDefinition>;
  readonly #stateById = new Map<string, MutableItemState>();

  constructor(definitions: readonly TopologyItemDefinition[]) {
    ensureDefinitionContracts(definitions);
    this.#definitions = [...definitions].sort((left, right) => left.id.localeCompare(right.id));
    this.#definitionById = new Map(this.#definitions.map((definition) => [definition.id, definition]));

    for (const definition of this.#definitions) {
      this.#stateById.set(definition.id, buildEmptyState());
    }
  }

  getDefinitions(): readonly TopologyItemDefinition[] {
    return this.#definitions.map((definition) => ({
      ...definition,
      anchor: { ...definition.anchor },
      proxyCues: definition.proxyCues.map((proxy) => ({ ...proxy })),
      tags: [...definition.tags]
    }));
  }

  getStateSnapshot(): readonly ItemStateSnapshot[] {
    return this.#definitions.map((definition) => {
      const state = this.#requireState(definition.id);
      return {
        itemId: definition.id,
        acquiredStep: state.acquiredStep,
        signalActivatedStep: state.signalActivatedStep,
        shellUnlockedStep: state.shellUnlockedStep,
        lastEvidenceStep: state.lastEvidenceStep
      };
    });
  }

  recordCheckpointKeyAcquired(step: number, itemId: string): void {
    const definition = this.#requireDefinition(itemId);
    if (definition.kind !== 'checkpoint-key') {
      throw new Error(`Item "${itemId}" is not a checkpoint key.`);
    }

    const state = this.#requireState(itemId);
    if (state.acquiredStep === null) {
      state.acquiredStep = step;
    }
  }

  recordSignalNodeActivated(step: number, itemId: string): void {
    const definition = this.#requireDefinition(itemId);
    if (definition.kind !== 'signal-node') {
      throw new Error(`Item "${itemId}" is not a signal node.`);
    }

    const state = this.#requireState(itemId);
    state.signalActivatedStep = state.signalActivatedStep ?? step;
  }

  recordShellUnlocked(step: number, itemId: string): void {
    const definition = this.#requireDefinition(itemId);
    if (definition.kind !== 'shell-unlock') {
      throw new Error(`Item "${itemId}" is not a shell unlock.`);
    }

    const state = this.#requireState(itemId);
    state.shellUnlockedStep = state.shellUnlockedStep ?? step;
  }

  observeAndRank(context: ItemObservationContext): ItemObservation {
    const evidenceByItemId: Record<string, ItemEvidence> = {};
    const ranked: RankedItemUsefulness[] = [];
    const observedItemIds = new Set<string>();

    for (const definition of this.#definitions) {
      const state = this.#requireState(definition.id);
      const evidence = this.#buildEvidence(definition, context);
      evidenceByItemId[definition.id] = evidence;

      if (evidence.visibility !== 'none') {
        observedItemIds.add(definition.id);
        state.lastEvidenceStep = context.step;
      }

      if (
        evidence.visibility === 'none'
        && state.acquiredStep === null
        && state.signalActivatedStep === null
        && state.shellUnlockedStep === null
      ) {
        continue;
      }

      ranked.push({
        itemId: definition.id,
        score: this.#scoreItem(definition, state, context, evidence),
        visibility: evidence.visibility,
        features: this.#buildFeatureVector(definition, state, context, evidence)
      });
    }

    ranked.sort(compareRankedItems);

    const checkpointKeyIds = sortUniqueStrings(
      this.#definitions
        .filter((definition) => definition.kind === 'checkpoint-key')
        .filter((definition) => this.#requireState(definition.id).acquiredStep !== null)
        .map((definition) => definition.id)
    );
    const signalNodeIds = sortUniqueStrings(
      this.#definitions
        .filter((definition) => definition.kind === 'signal-node')
        .filter((definition) => this.#requireState(definition.id).signalActivatedStep !== null)
        .map((definition) => definition.id)
    );
    const shellUnlockIds = sortUniqueStrings(
      this.#definitions
        .filter((definition) => definition.kind === 'shell-unlock')
        .filter((definition) => this.#requireState(definition.id).shellUnlockedStep !== null)
        .map((definition) => definition.id)
    );

    return {
      step: context.step,
      observedItemIds: sortUniqueStrings(observedItemIds),
      evidenceByItemId,
      rankedUsefulness: ranked.map((entry) => ({
        ...entry,
        features: { ...entry.features }
      })),
      progress: {
        checkpointKeyIds,
        signalNodeIds,
        shellUnlockIds
      },
      states: this.getStateSnapshot()
    };
  }

  #buildEvidence(definition: TopologyItemDefinition, context: ItemObservationContext): ItemEvidence {
    const directVisible = definition.visibility === 'visible'
      && (
        definition.anchor.tileId === context.currentTileId
        || (
          Boolean(definition.anchor.connectorId)
          && context.visibleConnectorIds.includes(definition.anchor.connectorId as string)
        )
      );

    const matchedProxyIds = definition.proxyCues
      .filter((proxy) => (
        (proxy.kind === 'landmark' && context.visibleLandmarkIds.includes(proxy.id))
        || (proxy.kind === 'connector' && context.visibleConnectorIds.includes(proxy.id))
        || (typeof proxy.tileId === 'string' && proxy.tileId === context.currentTileId)
        || includesCueToken(context.localCues, proxy.id)
        || includesCueToken(context.localCues, proxy.label)
      ))
      .map((proxy) => proxy.id);

    const proxyStrength = clamp01(
      definition.proxyCues
        .filter((proxy) => matchedProxyIds.includes(proxy.id))
        .reduce((maxConfidence, proxy) => Math.max(maxConfidence, clamp01(proxy.confidence)), 0)
    );

    const visibility = directVisible
      ? 'visible'
      : proxyStrength > 0
        ? 'proxied'
        : 'none';

    return {
      visibility,
      directVisible,
      proxyStrength,
      matchedProxyIds: sortUniqueStrings(matchedProxyIds)
    };
  }

  #scoreItem(
    definition: TopologyItemDefinition,
    state: MutableItemState,
    context: ItemObservationContext,
    evidence: ItemEvidence
  ): number {
    const features = this.#buildFeatureVector(definition, state, context, evidence);
    const rawScore = (
      (features.directVisibility * 0.24)
      + (features.proxyVisibility * 0.18)
      + (features.topologyProximity * 0.16)
      + (features.checkpointDemand * 0.13)
      + (features.signalDemand * 0.13)
      + (features.shellDemand * 0.13)
      + (features.unresolvedNeed * 0.03)
    );

    return clamp01(rawScore);
  }

  #buildFeatureVector(
    definition: TopologyItemDefinition,
    state: MutableItemState,
    context: ItemObservationContext,
    evidence: ItemEvidence
  ): ItemUsefulnessFeatures {
    const requestedCheckpointIds = context.requestedCheckpointIds ?? [];
    const requestedSignalNodeIds = context.requestedSignalNodeIds ?? [];
    const requestedShellIds = context.requestedShellIds ?? [];

    const isResolved = (
      (definition.kind === 'checkpoint-key' && state.acquiredStep !== null)
      || (definition.kind === 'signal-node' && state.signalActivatedStep !== null)
      || (definition.kind === 'shell-unlock' && state.shellUnlockedStep !== null)
    );

    const topologyProximity = definition.anchor.tileId === context.currentTileId
      ? 1
      : context.neighborTileIds.includes(definition.anchor.tileId)
        ? 0.7
        : evidence.proxyStrength > 0
          ? 0.45
          : 0.2;

    return {
      directVisibility: evidence.directVisible ? 1 : 0,
      proxyVisibility: evidence.proxyStrength,
      topologyProximity,
      checkpointDemand: definition.kind === 'checkpoint-key' && definition.anchor.checkpointId
        && requestedCheckpointIds.includes(definition.anchor.checkpointId)
        ? 1
        : 0,
      signalDemand: definition.kind === 'signal-node' && requestedSignalNodeIds.includes(definition.id) ? 1 : 0,
      shellDemand: definition.kind === 'shell-unlock' && definition.anchor.shellId
        && requestedShellIds.includes(definition.anchor.shellId)
        ? 1
        : 0,
      unresolvedNeed: isResolved ? 0 : 1
    };
  }

  #requireDefinition(itemId: string): TopologyItemDefinition {
    const definition = this.#definitionById.get(itemId);
    if (!definition) {
      throw new Error(`Unknown item "${itemId}".`);
    }

    return definition;
  }

  #requireState(itemId: string): MutableItemState {
    const state = this.#stateById.get(itemId);
    if (!state) {
      throw new Error(`Missing state for item "${itemId}".`);
    }

    return state;
  }
}
