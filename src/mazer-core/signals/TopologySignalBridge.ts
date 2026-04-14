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

const buildTrapSignals = (
  cues: string[],
  seenCues: Set<string>,
  candidateSignals: Partial<Record<TileId, PolicyCandidateAdvisoryFeatures>>,
  snapshot: TrapSnapshot,
  step: TrapStepResult
): void => {
  const contractById = new Map(snapshot.contracts.map((contract) => [contract.id, contract]));

  for (const activation of step.triggered) {
    const contract = contractById.get(activation.trapId);
    const tileId = contract?.anchor.tileId ?? activation.tileId;

    pushCue(cues, seenCues, `trap ${activation.trapLabel}`);
    pushCue(cues, seenCues, `hazard ${activation.anchorKind}`);
    if (activation.visibleSignals.timing) {
      pushCue(cues, seenCues, `timing ${contract?.visibility.timing?.label ?? 'trap window'}`);
    }

    applyTileSignal(candidateSignals, tileId, {
      trapRisk: TRAP_SEVERITY_RISK[activation.severity],
      timingWindow: activation.visibleSignals.timing ? 1 : 0
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
  }
};

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
