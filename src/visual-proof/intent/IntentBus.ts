import {
  INTENT_TTL_STEPS,
  type IntentAnchor,
  type IntentBusRecord,
  type IntentCategory,
  type IntentImportance,
  type IntentKind,
  type IntentSpeaker
} from './IntentEvent';

interface NamedReference {
  id: string;
  label: string;
}

export interface IntentSourceState {
  step: number;
  currentTileId: string;
  currentTileLabel: string;
  targetTileId: string | null;
  targetTileLabel: string | null;
  targetKind: 'frontier' | 'goal' | 'backtrack' | 'idle';
  nextTileId: string | null;
  reason: string;
  frontierCount: number;
  replanCount: number;
  backtrackCount: number;
  goalVisible: boolean;
  goalObservedStep: number | null;
  visibleLandmarks: NamedReference[];
  observedLandmarkIds: string[];
  localCues: string[];
  traversableTileIds: string[];
  traversedConnectorId: string | null;
  traversedConnectorLabel: string | null;
}

interface IntentCandidate {
  priority: number;
  debounceKey: string;
  record: IntentBusRecord;
}

export interface IntentBusBuildResult {
  records: IntentBusRecord[];
  totalSteps: number;
  debouncedEventCount: number;
  debouncedWorldPingCount: number;
}

interface IntentBuildOptions {
  canary?: string | null;
}

const DANGER_CUE_KEYWORDS = ['trap', 'hazard', 'spike', 'ward', 'mine', 'alarm', 'laser', 'timing'];
const ENEMY_CUE_KEYWORDS = ['enemy', 'warden', 'guard', 'hunter', 'scout', 'sentry', 'patrol'];
const ITEM_CUE_KEYWORDS = ['item', 'key', 'cache', 'relic', 'shard', 'beacon', 'token'];
const PUZZLE_CUE_KEYWORDS = ['puzzle', 'glyph', 'switch', 'lever', 'plate', 'cipher', 'rune'];
const DEBOUNCE_WINDOW_STEPS = 2;
const MAX_RECORDS_PER_STEP = 2;
const CANARY_RECORDS_PER_STEP = 3;
const NON_SEMANTIC_CUE_PREFIXES = ['tile:', 'label:', 'kind:', 'neighbors:', 'neighbor-ids:', 'landmarks:', 'goal:'];

const normalizeLabel = (value: string | null | undefined, fallback: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback;
  }

  return value.trim();
};

const includesKeyword = (values: readonly string[], keywords: readonly string[]): string | null => {
  for (const value of values) {
    const normalized = value.toLowerCase();
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return value;
    }
  }

  return null;
};

const toSemanticCues = (values: readonly string[]): string[] => values.filter((value) => !NON_SEMANTIC_CUE_PREFIXES.some((prefix) => value.startsWith(prefix)));

const sanitizeId = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const clampConfidence = (value: number): number => Number(Math.min(0.99, Math.max(0.51, value)).toFixed(2));

const makeIntentRecord = (
  step: number,
  {
    speaker,
    kind,
    category,
    importance,
    summary,
    confidence,
    anchor
  }: {
    speaker: IntentSpeaker;
    kind: IntentKind;
    category: IntentCategory;
    importance: IntentImportance;
    summary: string;
    confidence: number;
    anchor?: IntentAnchor;
  }
): IntentBusRecord => ({
  id: `${speaker}:${kind}:${step}:${sanitizeId(summary)}`,
  speaker,
  category,
  kind,
  importance,
  summary,
  confidence: clampConfidence(confidence),
  step,
  ttlSteps: INTENT_TTL_STEPS[importance],
  anchor
});

const buildCanaryRunnerAnchor = (
  state: IntentSourceState,
  fallbackKind: IntentAnchor['kind'] = 'tile'
): IntentAnchor => {
  if (state.traversedConnectorId) {
    return {
      kind: 'connector',
      connectorId: state.traversedConnectorId
    };
  }

  if (state.goalVisible && state.targetTileId) {
    return {
      kind: 'objective',
      tileId: state.targetTileId
    };
  }

  if (state.targetTileId) {
    return {
      kind: fallbackKind,
      tileId: state.targetTileId
    };
  }

  return {
    kind: 'tile',
    tileId: state.currentTileId
  };
};

const matchesDebounceWindow = (
  records: readonly IntentBusRecord[],
  debounceKeyById: ReadonlyMap<string, string>,
  debounceKey: string,
  step: number
): boolean => records.some((record) => (
  step - record.step <= DEBOUNCE_WINDOW_STEPS && debounceKeyById.get(record.id) === debounceKey
));

const selectIntentCandidates = (
  state: IntentSourceState,
  previous: IntentSourceState | null,
  aggressiveMode: boolean
): IntentCandidate[] => {
  const targetLabel = normalizeLabel(state.targetTileLabel, 'the next frontier');
  const currentLabel = normalizeLabel(state.currentTileLabel, 'this branch');
  const connectorLabel = normalizeLabel(state.traversedConnectorLabel, 'connector');
  const semanticCues = toSemanticCues(state.localCues);
  const previousLandmarkIds = new Set(previous?.observedLandmarkIds ?? []);
  const newlyObservedLandmark = state.visibleLandmarks.find((landmark) => !previousLandmarkIds.has(landmark.id)) ?? null;
  const newDangerCue = includesKeyword(semanticCues, DANGER_CUE_KEYWORDS);
  const newEnemyCue = includesKeyword(semanticCues, ENEMY_CUE_KEYWORDS);
  const newItemCue = includesKeyword(semanticCues, ITEM_CUE_KEYWORDS);
  const newPuzzleCue = includesKeyword(semanticCues, PUZZLE_CUE_KEYWORDS);
  const sawDeadEndCue = semanticCues.some((cue) => cue.toLowerCase().includes('dead-end'));
  const confirmedDeadEnd = state.targetKind === 'backtrack'
    && (sawDeadEndCue || state.traversableTileIds.length <= 1);
  const hasHigherSignalObservation = Boolean(
    newlyObservedLandmark
    || newDangerCue
    || newEnemyCue
    || newItemCue
    || newPuzzleCue
    || state.traversedConnectorId
    || state.goalVisible
  );
  const targetChanged = Boolean(previous && state.targetTileId !== previous.targetTileId);
  const kindChanged = Boolean(previous && state.targetKind !== previous.targetKind);
  const routeCommitmentChanged = Boolean(previous && state.targetTileId && previous.targetTileId !== state.targetTileId);
  const shouldEmitInitialFrontier = (!previous && state.targetKind === 'frontier' && Boolean(state.targetTileId))
    || (aggressiveMode && state.targetKind === 'frontier' && Boolean(state.targetTileId));
  const shouldEmitReplan = aggressiveMode
    ? Boolean(state.targetTileId && state.targetKind === 'frontier')
    : Boolean(
        previous
        && state.targetTileId
        && previous.targetTileId
        && targetChanged
        && state.targetKind !== 'goal'
        && previous.targetKind !== 'goal'
      );
  const shouldEmitCommit = aggressiveMode
    ? Boolean(state.targetTileId && state.targetKind !== 'idle')
    : Boolean(
        previous
        && state.targetTileId
        && (kindChanged || (routeCommitmentChanged && state.targetKind === 'goal'))
      );
  const candidates: IntentCandidate[] = [];

  if (state.goalVisible && previous?.goalVisible !== true) {
    candidates.push({
      priority: 100,
      debounceKey: 'goal-observed',
      record: makeIntentRecord(state.step, {
        speaker: 'Runner',
        kind: 'goal-observed',
        category: 'goal',
        importance: 'high',
        summary: 'Locking exit route.',
        confidence: 0.99,
        anchor: {
          kind: 'objective',
          tileId: state.targetTileId
        }
      })
    });
  }

  if (newEnemyCue) {
    candidates.push({
      priority: 92,
      debounceKey: 'enemy-seen',
      record: makeIntentRecord(state.step, {
        speaker: 'Warden',
        kind: 'enemy-seen',
        category: 'danger',
        importance: 'high',
        summary: `Avoiding ${newEnemyCue} pressure.`,
        confidence: 0.86,
        anchor: {
          kind: 'tile',
          tileId: state.currentTileId
        }
      })
    });
  }

  if (newDangerCue) {
    candidates.push({
      priority: 88,
      debounceKey: 'trap-inferred',
      record: makeIntentRecord(state.step, {
        speaker: 'TrapNet',
        kind: 'trap-inferred',
        category: 'danger',
        importance: 'high',
        summary: `Learning ${newDangerCue} at ${currentLabel}.`,
        confidence: 0.78,
        anchor: {
          kind: 'tile',
          tileId: state.currentTileId
        }
      })
    });
  }

  if (newItemCue) {
    candidates.push({
      priority: 80,
      debounceKey: 'item-spotted',
      record: makeIntentRecord(state.step, {
        speaker: 'Inventory',
        kind: 'item-spotted',
        category: 'item',
        importance: 'medium',
        summary: `Prioritizing ${newItemCue}.`,
        confidence: 0.74,
        anchor: {
          kind: 'tile',
          tileId: state.currentTileId
        }
      })
    });
  }

  if (newPuzzleCue) {
    candidates.push({
      priority: 76,
      debounceKey: 'puzzle-state-observed',
      record: makeIntentRecord(state.step, {
        speaker: 'Puzzle',
        kind: 'puzzle-state-observed',
        category: 'infer',
        importance: 'medium',
        summary: `Parsing ${newPuzzleCue} state.`,
        confidence: 0.72,
        anchor: {
          kind: 'tile',
          tileId: state.currentTileId
        }
      })
    });
  }

  if (confirmedDeadEnd) {
    candidates.push({
      priority: 72,
      debounceKey: 'dead-end-confirmed',
      record: makeIntentRecord(state.step, {
        speaker: 'Runner',
        kind: 'dead-end-confirmed',
        category: 'infer',
        importance: 'medium',
        summary: `Marking ${currentLabel} low value.`,
        confidence: 0.89
      })
    });
  }

  if (newlyObservedLandmark && state.targetKind !== 'goal' && !state.goalVisible) {
    candidates.push({
      priority: 66,
      debounceKey: 'landmark-spotted',
      record: makeIntentRecord(state.step, {
        speaker: 'Maze',
        kind: 'landmark-spotted',
        category: 'observe',
        importance: 'medium',
        summary: `Tracking ${newlyObservedLandmark.label}.`,
        confidence: 0.68,
        anchor: {
          kind: 'landmark',
          landmarkId: newlyObservedLandmark.id
        }
      })
    });
  }

  if (shouldEmitReplan) {
    candidates.push({
      priority: 58,
      debounceKey: 'replan-triggered',
      record: makeIntentRecord(state.step, {
        speaker: 'Runner',
        kind: 'replan-triggered',
        category: 'replan',
        importance: 'medium',
        summary: `Replanning through ${targetLabel}.`,
        confidence: 0.79,
        anchor: aggressiveMode ? buildCanaryRunnerAnchor(state) : undefined
      })
    });
  }

  if (shouldEmitCommit) {
    const goalCommit = state.targetKind === 'goal';
    candidates.push({
      priority: 48,
      debounceKey: 'route-commitment-changed',
      record: makeIntentRecord(state.step, {
        speaker: 'Runner',
        kind: 'route-commitment-changed',
        category: goalCommit ? 'goal' : 'replan',
        importance: goalCommit ? 'high' : 'medium',
        summary: goalCommit ? `Locking route to ${targetLabel}.` : `Tracking ${targetLabel}.`,
        confidence: goalCommit ? 0.91 : 0.73,
        anchor: aggressiveMode ? buildCanaryRunnerAnchor(state, goalCommit ? 'objective' : 'tile') : undefined
      })
    });
  }

  if (state.traversedConnectorId) {
    candidates.push({
      priority: 42,
      debounceKey: 'gate-aligned',
      record: makeIntentRecord(state.step, {
        speaker: 'Maze',
        kind: 'gate-aligned',
        category: 'observe',
        importance: 'medium',
        summary: `Aligning ${connectorLabel}.`,
        confidence: 0.83,
        anchor: {
          kind: 'connector',
          connectorId: state.traversedConnectorId
        }
      })
    });
  }

  if (shouldEmitInitialFrontier && !hasHigherSignalObservation) {
    candidates.push({
      priority: 36,
      debounceKey: 'frontier-chosen',
      record: makeIntentRecord(state.step, {
        speaker: 'Runner',
        kind: 'frontier-chosen',
        category: 'observe',
        importance: 'low',
        summary: `Scanning ${targetLabel}.`,
        confidence: 0.61,
        anchor: aggressiveMode ? buildCanaryRunnerAnchor(state) : undefined
      })
    });
  }

  return candidates.sort((left, right) => right.priority - left.priority);
};

export const buildIntentBus = (
  sourceStates: readonly IntentSourceState[],
  options: IntentBuildOptions = {}
): IntentBusBuildResult => {
  const records: IntentBusRecord[] = [];
  const debounceKeyById = new Map<string, string>();
  const aggressiveMode = options.canary === 'intent-feed-spam';
  let debouncedEventCount = 0;
  let debouncedWorldPingCount = 0;

  for (const [index, state] of sourceStates.entries()) {
    const previous = sourceStates[index - 1] ?? null;
    const emittedSpeakers = new Set<IntentSpeaker>();
    const candidates = selectIntentCandidates(state, previous, aggressiveMode);
    const stepBudget = aggressiveMode ? CANARY_RECORDS_PER_STEP : MAX_RECORDS_PER_STEP;

    for (const candidate of candidates) {
      if (!aggressiveMode && emittedSpeakers.has(candidate.record.speaker)) {
        continue;
      }

      if (!aggressiveMode && records.filter((record) => record.step === state.step).length >= stepBudget) {
        break;
      }

      const blocked = !aggressiveMode
        && matchesDebounceWindow(records, debounceKeyById, candidate.debounceKey, state.step);
      if (blocked) {
        debouncedEventCount += 1;
        if (candidate.record.anchor) {
          debouncedWorldPingCount += 1;
        }
        continue;
      }

      debounceKeyById.set(candidate.record.id, candidate.debounceKey);
      records.push(candidate.record);
      emittedSpeakers.add(candidate.record.speaker);
    }
  }

  return {
    records,
    totalSteps: Math.max(1, sourceStates.length),
    debouncedEventCount,
    debouncedWorldPingCount
  };
};
