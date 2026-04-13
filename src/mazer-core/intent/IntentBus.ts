import { PlaybookAdapter } from '../playbook/PlaybookAdapter';
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

const playbookAdapter = new PlaybookAdapter();

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

const matchesDebounceWindow = (
  records: readonly IntentBusRecord[],
  debounceKeyById: ReadonlyMap<string, string>,
  debounceKey: string,
  step: number
): boolean => records.some((record) => (
  step - record.step <= DEBOUNCE_WINDOW_STEPS && debounceKeyById.get(record.id) === debounceKey
));

const makePlaybookIntentCandidate = (
  step: number,
  priority: number,
  debounceKey: string,
  input: Parameters<PlaybookAdapter['summarizeIntent']>[0]
): IntentCandidate => ({
  priority,
  debounceKey,
  record: makeIntentRecord(step, playbookAdapter.summarizeIntent(input))
});

const selectIntentCandidates = (
  state: IntentSourceState,
  previous: IntentSourceState | null,
  aggressiveMode: boolean
): IntentCandidate[] => {
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
    candidates.push(makePlaybookIntentCandidate(state.step, 100, 'goal-observed', {
      kind: 'goal-observed',
      state,
      aggressiveMode
    }));
  }

  if (newEnemyCue) {
    candidates.push(makePlaybookIntentCandidate(state.step, 92, 'enemy-seen', {
      kind: 'enemy-seen',
      state,
      cue: newEnemyCue,
      aggressiveMode
    }));
  }

  if (newDangerCue) {
    candidates.push(makePlaybookIntentCandidate(state.step, 88, 'trap-inferred', {
      kind: 'trap-inferred',
      state,
      cue: newDangerCue,
      aggressiveMode
    }));
  }

  if (newItemCue) {
    candidates.push(makePlaybookIntentCandidate(state.step, 80, 'item-spotted', {
      kind: 'item-spotted',
      state,
      cue: newItemCue,
      aggressiveMode
    }));
  }

  if (newPuzzleCue) {
    candidates.push(makePlaybookIntentCandidate(state.step, 76, 'puzzle-state-observed', {
      kind: 'puzzle-state-observed',
      state,
      cue: newPuzzleCue,
      aggressiveMode
    }));
  }

  if (confirmedDeadEnd) {
    candidates.push(makePlaybookIntentCandidate(state.step, 72, 'dead-end-confirmed', {
      kind: 'dead-end-confirmed',
      state,
      aggressiveMode
    }));
  }

  if (newlyObservedLandmark && state.targetKind !== 'goal' && !state.goalVisible) {
    candidates.push(makePlaybookIntentCandidate(state.step, 66, 'landmark-spotted', {
      kind: 'landmark-spotted',
      state,
      landmark: newlyObservedLandmark,
      aggressiveMode
    }));
  }

  if (shouldEmitReplan) {
    candidates.push(makePlaybookIntentCandidate(state.step, 58, 'replan-triggered', {
      kind: 'replan-triggered',
      state,
      aggressiveMode
    }));
  }

  if (shouldEmitCommit) {
    candidates.push(makePlaybookIntentCandidate(state.step, 48, 'route-commitment-changed', {
      kind: 'route-commitment-changed',
      state,
      aggressiveMode
    }));
  }

  if (state.traversedConnectorId) {
    candidates.push(makePlaybookIntentCandidate(state.step, 42, 'gate-aligned', {
      kind: 'gate-aligned',
      state,
      aggressiveMode
    }));
  }

  if (shouldEmitInitialFrontier && !hasHigherSignalObservation) {
    candidates.push(makePlaybookIntentCandidate(state.step, 36, 'frontier-chosen', {
      kind: 'frontier-chosen',
      state,
      aggressiveMode
    }));
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
