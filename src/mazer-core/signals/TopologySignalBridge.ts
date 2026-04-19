import {
  createEmptyPolicyCandidateAdvisoryFeatures,
  mergePolicyCandidateAdvisoryFeatures,
  type PolicyCandidateAdvisoryFeatures,
  type TileId
} from '../agent/types';
import type { WardenDecision } from '../enemies';
import type { ItemObservation, TopologyItemDefinition } from '../items';
import type { PuzzleObservation, TopologyPuzzleDefinition } from '../puzzles';
import type { TrapSnapshot, TrapStepResult } from '../traps';

export interface TopologySignalBridgeInput {
  trapSnapshot?: TrapSnapshot | null;
  trapStep?: TrapStepResult | null;
  wardenDecision?: WardenDecision | null;
  itemDefinitions?: readonly TopologyItemDefinition[] | null;
  itemObservation?: ItemObservation | null;
  puzzleDefinitions?: readonly TopologyPuzzleDefinition[] | null;
  puzzleObservation?: PuzzleObservation | null;
}

export interface TopologySignalBundle {
  localCues: string[];
  candidateSignals: Partial<Record<TileId, PolicyCandidateAdvisoryFeatures>>;
}

const TRAP_SEVERITY_RISK = Object.freeze({
  low: 0.42,
  medium: 0.68,
  high: 0.92
});

const pushCue = (target: string[], seen: Set<string>, value: string): void => {
  const normalized = value.trim();
  if (!normalized || seen.has(normalized)) {
    return;
  }

  seen.add(normalized);
  target.push(normalized);
};

const applyTileSignal = (
  target: Partial<Record<TileId, PolicyCandidateAdvisoryFeatures>>,
  tileId: TileId | null | undefined,
  value: Partial<PolicyCandidateAdvisoryFeatures> | null | undefined
): void => {
  if (!tileId) {
    return;
  }

  target[tileId] = mergePolicyCandidateAdvisoryFeatures(
    target[tileId] ?? createEmptyPolicyCandidateAdvisoryFeatures(),
    value
  );
};

const pushMechanicCue = (
  cues: string[],
  seenCues: Set<string>,
  label: string,
  fallback: string
): void => {
  const normalized = label.trim().toLowerCase();
  if (!normalized) {
    return;
  }

  pushCue(cues, seenCues, normalized.includes('gate') ? 'gate cycle' : fallback);
  if (normalized.includes('gate')) {
    pushCue(cues, seenCues, 'gate cycle');
    pushCue(cues, seenCues, 'gate link');
  }
  if (normalized.includes('hazard')) {
    pushCue(cues, seenCues, 'hazard arming');
  }
  if (normalized.includes('door')) {
    pushCue(cues, seenCues, 'door link');
  }
  if (normalized.includes('plate')) {
    pushCue(cues, seenCues, 'plate link');
  }
};

const buildTrapSignals = (
  cues: string[],
  seenCues: Set<string>,
  candidateSignals: Partial<Record<TileId, PolicyCandidateAdvisoryFeatures>>,
  snapshot: TrapSnapshot,
  step: TrapStepResult
): void => {
  const contractById = new Map(snapshot.contracts.map((contract) => [contract.id, contract]));
  const triggeredTrapIds = new Set(step.triggered.map((activation) => activation.trapId));

  for (const activation of step.triggered) {
    const contract = contractById.get(activation.trapId);
    const tileId = contract?.anchor.tileId ?? activation.tileId;

    pushCue(cues, seenCues, `trap ${activation.trapLabel}`);
    pushCue(cues, seenCues, `hazard ${activation.anchorKind}`);
    pushMechanicCue(cues, seenCues, activation.trapLabel, `trap ${activation.trapLabel}`);
    if (activation.visibleSignals.timing) {
      pushCue(cues, seenCues, `timing ${contract?.visibility.timing?.label ?? 'trap window'}`);
      pushCue(cues, seenCues, 'gate cycle');
    }

    applyTileSignal(candidateSignals, tileId, {
      trapRisk: TRAP_SEVERITY_RISK[activation.severity],
      timingWindow: activation.visibleSignals.timing ? 1 : 0
    });
  }

  for (const state of step.states) {
    if (triggeredTrapIds.has(state.trapId) || !state.inferable) {
      continue;
    }

    const contract = contractById.get(state.trapId);
    if (!contract) {
      continue;
    }

    const tileId = contract.anchor.tileId ?? step.tileId;
    const visibilityScore = (
      (state.visibleSignals.timing ? 0.42 : 0)
      + (state.visibleSignals.landmark ? 0.24 : 0)
      + (state.visibleSignals.proxy ? 0.18 : 0)
      + (state.visibleSignals.connector ? 0.16 : 0)
    );
    const boundedRisk = Math.min(
      TRAP_SEVERITY_RISK[contract.severity] * (state.anchorMatched ? 0.86 : 0.58),
      TRAP_SEVERITY_RISK[contract.severity]
    );

    pushCue(cues, seenCues, `trap ${contract.label}`);
    pushCue(cues, seenCues, `hazard ${contract.anchor.kind}`);
    pushMechanicCue(cues, seenCues, contract.label, `trap ${contract.label}`);
    if (state.visibleSignals.timing) {
      pushCue(cues, seenCues, `timing ${contract.visibility.timing?.label ?? 'trap window'}`);
      pushCue(cues, seenCues, 'gate cycle');
    }
    if (state.visibleSignals.connector && contract.visibility.connectorId) {
      pushCue(cues, seenCues, `connector ${contract.label}`);
      pushCue(cues, seenCues, contract.label.toLowerCase().includes('gate') ? 'gate link' : 'door link');
    }

    applyTileSignal(candidateSignals, tileId, {
      trapRisk: Number(Math.max(0.18, boundedRisk).toFixed(4)),
      timingWindow: Number(Math.min(1, visibilityScore).toFixed(4))
    });
  }
};

const buildWardenSignals = (
  cues: string[],
  seenCues: Set<string>,
  candidateSignals: Partial<Record<TileId, PolicyCandidateAdvisoryFeatures>>,
  decision: WardenDecision
): void => {
  pushCue(cues, seenCues, `warden ${decision.intent}`);
  pushCue(cues, seenCues, `enemy ${decision.reason}`);
  pushCue(cues, seenCues, 'patrol lane');

  for (const candidate of decision.candidates) {
    const enemyPressure = candidate.features.directPlayerContact
      ? 1
      : candidate.features.lastKnownPlayerContact
        ? 0.82
        : candidate.features.sightlineRecoveryCandidate
          ? 0.74
          : candidate.features.loopCandidate
            ? 0.68
            : candidate.features.junctionCandidate
              ? 0.52
              : 0.36;

    if (candidate.features.directPlayerContact || candidate.features.lastKnownPlayerContact) {
      pushCue(cues, seenCues, 'patrol crossing');
    }

    applyTileSignal(candidateSignals, candidate.nextTileId, {
      enemyPressure,
      timingWindow: candidate.features.rotationAligned ? 0.55 : 0
    });
  }
};

const buildItemSignals = (
  cues: string[],
  seenCues: Set<string>,
  candidateSignals: Partial<Record<TileId, PolicyCandidateAdvisoryFeatures>>,
  definitions: readonly TopologyItemDefinition[],
  observation: ItemObservation
): void => {
  const definitionById = new Map(definitions.map((definition) => [definition.id, definition]));

  for (const ranked of observation.rankedUsefulness) {
    const definition = definitionById.get(ranked.itemId);
    if (!definition) {
      continue;
    }

    applyTileSignal(candidateSignals, definition.anchor.tileId, {
      itemOpportunity: ranked.score,
      timingWindow: definition.proxyCues.some((proxy) => proxy.kind === 'timing')
        ? ranked.features.proxyVisibility
        : 0
    });
  }

  for (const itemId of observation.observedItemIds) {
    const definition = definitionById.get(itemId);
    if (!definition) {
      continue;
    }

    pushCue(cues, seenCues, `item ${definition.label}`);
    if (definition.kind === 'checkpoint-key') {
      pushCue(cues, seenCues, `key ${definition.label}`);
    }
    if (definition.kind === 'signal-node') {
      pushCue(cues, seenCues, `signal ${definition.label}`);
      pushCue(cues, seenCues, `switch ${definition.label}`);
    }
    if (definition.kind === 'shell-unlock') {
      pushCue(cues, seenCues, `shell unlock ${definition.label}`);
    }
  }
};

const buildPuzzleSignals = (
  cues: string[],
  seenCues: Set<string>,
  candidateSignals: Partial<Record<TileId, PolicyCandidateAdvisoryFeatures>>,
  definitions: readonly TopologyPuzzleDefinition[],
  observation: PuzzleObservation
): void => {
  const definitionById = new Map(definitions.map((definition) => [definition.id, definition]));

  for (const ranked of observation.rankedOpportunities) {
    const definition = definitionById.get(ranked.puzzleId);
    if (!definition) {
      continue;
    }

    applyTileSignal(candidateSignals, definition.anchor.tileId, {
      puzzleOpportunity: ranked.score,
      timingWindow: definition.proxyCues.some((proxy) => proxy.kind === 'timing')
        ? ranked.features.proxyVisibility
        : 0
    });
  }

  for (const puzzleId of observation.observedPuzzleIds) {
    const definition = definitionById.get(puzzleId);
    if (!definition) {
      continue;
    }

    pushCue(cues, seenCues, `puzzle ${definition.label}`);
    pushCue(cues, seenCues, `door ${definition.label}`);
  }
}

export const buildTopologySignalBundle = ({
  trapSnapshot,
  trapStep,
  wardenDecision,
  itemDefinitions,
  itemObservation,
  puzzleDefinitions,
  puzzleObservation
}: TopologySignalBridgeInput): TopologySignalBundle => {
  const localCues: string[] = [];
  const seenCues = new Set<string>();
  const candidateSignals: Partial<Record<TileId, PolicyCandidateAdvisoryFeatures>> = {};

  if (trapSnapshot && trapStep) {
    buildTrapSignals(localCues, seenCues, candidateSignals, trapSnapshot, trapStep);
  }

  if (wardenDecision) {
    buildWardenSignals(localCues, seenCues, candidateSignals, wardenDecision);
  }

  if (itemDefinitions && itemObservation) {
    buildItemSignals(localCues, seenCues, candidateSignals, itemDefinitions, itemObservation);
  }

  if (puzzleDefinitions && puzzleObservation) {
    buildPuzzleSignals(localCues, seenCues, candidateSignals, puzzleDefinitions, puzzleObservation);
  }

  return {
    localCues,
    candidateSignals
  };
};
