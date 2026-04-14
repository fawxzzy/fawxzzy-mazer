import type {
  TrapActivation,
  TrapContract,
  TrapSnapshot,
  TrapStepResult,
  TrapStatus,
  TrapTopologyObservation,
  TrapVisibleSignals
} from './types';

interface TrapRuntimeState {
  triggerCount: number;
  cooldownUntilStep: number | null;
}

const cloneSignals = (signals: TrapVisibleSignals): TrapVisibleSignals => ({
  timing: signals.timing,
  landmark: signals.landmark,
  proxy: signals.proxy,
  connector: signals.connector
});

const visibleSignalCount = (signals: TrapVisibleSignals): number => (
  [signals.timing, signals.landmark, signals.proxy, signals.connector].filter(Boolean).length
);

const hasAnyVisibilitySignal = (contract: TrapContract): boolean => (
  Boolean(
    contract.visibility.timing
    || contract.visibility.landmarkId
    || contract.visibility.proxyId
    || contract.visibility.connectorId
  )
);

const validateTiming = (contract: TrapContract): string[] => {
  const timing = contract.visibility.timing;
  if (!timing) {
    return [];
  }

  const errors: string[] = [];
  if (!Number.isInteger(timing.period) || timing.period <= 0) {
    errors.push(`trap "${contract.id}" timing.period must be a positive integer`);
  }

  if (timing.activeResidues.length === 0) {
    errors.push(`trap "${contract.id}" timing.activeResidues must contain at least one residue`);
  }

  if (timing.activeResidues.some((value) => !Number.isInteger(value) || value < 0)) {
    errors.push(`trap "${contract.id}" timing.activeResidues must contain non-negative integers`);
  }

  return errors;
};

const validateContracts = (contracts: readonly TrapContract[]): void => {
  const seen = new Set<string>();
  const errors: string[] = [];

  for (const contract of contracts) {
    if (seen.has(contract.id)) {
      errors.push(`duplicate trap id "${contract.id}"`);
    }
    seen.add(contract.id);

    if (!hasAnyVisibilitySignal(contract)) {
      errors.push(`trap "${contract.id}" must expose at least one inferable visibility signal`);
    }

    const cooldown = contract.cooldownSteps ?? 0;
    if (!Number.isInteger(cooldown) || cooldown < 0) {
      errors.push(`trap "${contract.id}" cooldownSteps must be a non-negative integer`);
    }

    errors.push(...validateTiming(contract));
  }

  if (errors.length > 0) {
    throw new Error(`Invalid trap contracts: ${errors.join('; ')}`);
  }
};

const matchesAnchor = (contract: TrapContract, observation: TrapTopologyObservation): boolean => {
  const tileMatches = contract.anchor.tileId ? contract.anchor.tileId === observation.currentTileId : true;
  if (!tileMatches) {
    return false;
  }

  switch (contract.anchor.kind) {
    case 'junction':
      return observation.activeJunctionIds.includes(contract.anchor.junctionId);
    case 'loop':
      return observation.activeLoopIds.includes(contract.anchor.loopId);
    case 'checkpoint':
      return observation.activeCheckpointIds.includes(contract.anchor.checkpointId);
    case 'rotation-phase':
      return observation.rotationPhase === contract.anchor.rotationPhase;
  }
};

const resolveVisibleSignals = (contract: TrapContract, observation: TrapTopologyObservation): TrapVisibleSignals => {
  const timing = contract.visibility.timing;
  const timingVisible = timing
    ? timing.activeResidues.includes(observation.step % timing.period)
    : false;
  const landmarkVisible = contract.visibility.landmarkId
    ? observation.visibleLandmarkIds.includes(contract.visibility.landmarkId)
    : false;
  const proxyVisible = contract.visibility.proxyId
    ? observation.visibleProxyIds.includes(contract.visibility.proxyId)
    : false;
  const connectorVisible = contract.visibility.connectorId
    ? (
        observation.nearbyConnectorIds.includes(contract.visibility.connectorId)
        || observation.traversedConnectorId === contract.visibility.connectorId
      )
    : false;

  return {
    timing: timingVisible,
    landmark: landmarkVisible,
    proxy: proxyVisible,
    connector: connectorVisible
  };
};

const resolveStatus = (
  observation: TrapTopologyObservation,
  runtimeState: TrapRuntimeState
): { status: TrapStatus; cooldownRemainingSteps: number } => {
  const cooldownUntilStep = runtimeState.cooldownUntilStep;
  if (cooldownUntilStep === null || observation.step >= cooldownUntilStep) {
    return {
      status: 'armed',
      cooldownRemainingSteps: 0
    };
  }

  return {
    status: 'cooldown',
    cooldownRemainingSteps: Math.max(0, cooldownUntilStep - observation.step)
  };
};

const buildActivationSummary = (contract: TrapContract): string => {
  switch (contract.anchor.kind) {
    case 'junction':
      return `Junction trap ${contract.label} activated.`;
    case 'loop':
      return `Loop trap ${contract.label} activated.`;
    case 'checkpoint':
      return `Checkpoint trap ${contract.label} activated.`;
    case 'rotation-phase':
      return `Rotation-phase trap ${contract.label} activated.`;
  }
};

export class TrapTopologySystem {
  readonly #contracts: readonly TrapContract[];
  readonly #stateById = new Map<string, TrapRuntimeState>();
  readonly #log: TrapStepResult[] = [];

  constructor(contracts: readonly TrapContract[]) {
    validateContracts(contracts);
    this.#contracts = contracts.map((contract) => structuredClone(contract));

    for (const contract of this.#contracts) {
      this.#stateById.set(contract.id, {
        triggerCount: 0,
        cooldownUntilStep: null
      });
    }
  }

  evaluate(observation: TrapTopologyObservation): TrapStepResult {
    const triggered: TrapActivation[] = [];
    const blockedHiddenStateTrapIds: string[] = [];
    const states: TrapStepResult['states'] = [];

    for (const contract of this.#contracts) {
      const runtimeState = this.#stateById.get(contract.id);
      if (!runtimeState) {
        throw new Error(`Missing trap runtime state for "${contract.id}".`);
      }

      const { status, cooldownRemainingSteps } = resolveStatus(observation, runtimeState);
      const anchorMatched = matchesAnchor(contract, observation);
      const visibleSignals = resolveVisibleSignals(contract, observation);
      const inferable = visibleSignalCount(visibleSignals) > 0;
      const canTrigger = status === 'armed' && anchorMatched && inferable;

      if (status === 'armed' && anchorMatched && !inferable) {
        blockedHiddenStateTrapIds.push(contract.id);
      }

      if (canTrigger) {
        runtimeState.triggerCount += 1;
        const cooldownSteps = contract.cooldownSteps ?? 0;
        runtimeState.cooldownUntilStep = cooldownSteps > 0
          ? observation.step + cooldownSteps
          : null;

        triggered.push({
          trapId: contract.id,
          trapLabel: contract.label,
          severity: contract.severity,
          step: observation.step,
          tileId: observation.currentTileId,
          anchorKind: contract.anchor.kind,
          summary: buildActivationSummary(contract),
          visibleSignals: cloneSignals(visibleSignals)
        });
      }

      states.push({
        trapId: contract.id,
        status,
        anchorMatched,
        inferable,
        visibleSignals: cloneSignals(visibleSignals),
        cooldownRemainingSteps,
        triggerCount: runtimeState.triggerCount
      });
    }

    const stepResult: TrapStepResult = {
      step: observation.step,
      tileId: observation.currentTileId,
      triggered,
      blockedHiddenStateTrapIds,
      states
    };

    this.#log.push(structuredClone(stepResult));
    return stepResult;
  }

  getSnapshot(): TrapSnapshot {
    const triggerCounts: Record<string, number> = {};
    const cooldownUntilById: Record<string, number | null> = {};
    for (const contract of this.#contracts) {
      const runtimeState = this.#stateById.get(contract.id);
      if (!runtimeState) {
        continue;
      }
      triggerCounts[contract.id] = runtimeState.triggerCount;
      cooldownUntilById[contract.id] = runtimeState.cooldownUntilStep;
    }

    return {
      stepCount: this.#log.length,
      contracts: this.#contracts.map((contract) => structuredClone(contract)),
      lastStep: this.#log.at(-1)?.step ?? null,
      triggerCounts,
      cooldownUntilById
    };
  }

  getLog(): readonly TrapStepResult[] {
    return this.#log.map((entry) => structuredClone(entry));
  }
}
