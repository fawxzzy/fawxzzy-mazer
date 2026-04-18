import {
  INTENT_SUMMARY_VERB_FIRST_WORDS,
  INTENT_TTL_STEPS,
  INTENT_SLOT_OPACITIES,
  MAX_INTENT_VISIBLE_ENTRIES,
  MAX_WORLD_PINGS,
  WORLD_PING_OPACITIES,
  WORLD_PING_TTL_STEPS,
  type IntentKind,
  type IntentFeedStatus,
  type IntentBusRecord,
  type IntentFeedMetrics,
  type IntentFeedState,
  type IntentVisibleEntry,
  type IntentVisiblePing
} from './IntentEvent';
import type { IntentBusBuildResult } from './IntentBus';
import { getIntentPingLabel } from './IntentEvent';

export interface IntentFeedBuildResult {
  records: IntentBusRecord[];
  states: Map<number, IntentFeedState>;
  metrics: IntentFeedMetrics;
}

interface IntentFeedBuildOptions {
  canary?: string | null;
}

const VERB_FIRST_WORDS = new Set(INTENT_SUMMARY_VERB_FIRST_WORDS);
const INTENT_SPAM_RATE_LIMIT = 0.75;
const INTENT_MAX_STREAK = 3;
const WORLD_PING_RATE_LIMIT = 1.05;
const DEBOUNCE_WINDOW_STEPS = 2;
const IMPORTANT_RECORDS = new Set(['goal-observed', 'enemy-seen', 'trap-inferred', 'item-spotted', 'puzzle-state-observed']);
const PERSISTENT_STATUS_KINDS = new Set([
  'goal-observed',
  'route-commitment-changed',
  'replan-triggered',
  'dead-end-confirmed',
  'frontier-chosen'
]);
export type IntentFeedRole = 'scan' | 'hypothesis' | 'commit' | 'recall';
const INTENT_ROLE_ORDER: Record<IntentFeedRole, number> = {
  scan: 0,
  hypothesis: 1,
  commit: 2,
  recall: 3
};
const INTENT_ROLE_BY_KIND: Record<IntentKind, IntentFeedRole> = {
  'frontier-chosen': 'scan',
  'landmark-spotted': 'scan',
  'item-spotted': 'scan',
  'trap-inferred': 'hypothesis',
  'enemy-seen': 'hypothesis',
  'puzzle-state-observed': 'hypothesis',
  'replan-triggered': 'hypothesis',
  'route-commitment-changed': 'commit',
  'goal-observed': 'commit',
  'gate-aligned': 'commit',
  'dead-end-confirmed': 'recall'
};

const isFeedRecord = (record: IntentBusRecord): boolean => record.kind !== 'gate-aligned';

export const resolveIntentFeedRole = (kind: IntentKind | null | undefined): IntentFeedRole => (
  kind ? INTENT_ROLE_BY_KIND[kind] ?? 'scan' : 'scan'
);

export const resolveIntentFeedRoleOrder = (kind: IntentKind | null | undefined): number => (
  INTENT_ROLE_ORDER[resolveIntentFeedRole(kind)]
);

export const resolveIntentFeedRoleRank = (role: IntentFeedRole): number => (
  INTENT_ROLE_ORDER[role]
);

export const formatIntentFeedRole = (kind: IntentKind | null | undefined): string => (
  resolveIntentFeedRole(kind).toUpperCase()
);

const compareVisibleRecords = (left: IntentBusRecord, right: IntentBusRecord): number => (
  right.step - left.step
  || (IMPORTANT_RECORDS.has(right.kind) ? 1 : 0) - (IMPORTANT_RECORDS.has(left.kind) ? 1 : 0)
);

const toVisibleStatus = (record: IntentBusRecord): IntentFeedStatus => ({
  speaker: record.speaker,
  category: record.category,
  kind: record.kind,
  importance: record.importance,
  summary: record.summary,
  confidence: record.confidence,
  step: record.step,
  anchor: record.anchor
});

const isVerbFirst = (summary: string): boolean => {
  const firstWord = summary.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return VERB_FIRST_WORDS.has(firstWord);
};

const getWorldPingTtl = (record: IntentBusRecord): number => (
  Math.min(record.ttlSteps, WORLD_PING_TTL_STEPS[record.importance])
);

export const resolveVisibleIntentEntries = (
  records: readonly IntentBusRecord[],
  step: number,
  maxVisibleEntries = MAX_INTENT_VISIBLE_ENTRIES
): IntentVisibleEntry[] => {
  const visible = [...records]
    .filter((record) => isFeedRecord(record))
    .filter((record) => record.step <= step && (step - record.step) <= record.ttlSteps)
    .sort(compareVisibleRecords);
  const statusRecord = visible.find((record) => PERSISTENT_STATUS_KINDS.has(record.kind)) ?? visible[0] ?? null;
  const quickThoughts = visible
    .filter((record) => record.id !== statusRecord?.id)
    .slice(0, maxVisibleEntries);
  const resolvedVisible = quickThoughts.length > 0
    ? quickThoughts
    : visible.slice(0, maxVisibleEntries);

  return resolvedVisible.map((record, index) => ({
    ...record,
    ageSteps: step - record.step,
    slot: index,
    opacity: INTENT_SLOT_OPACITIES[index] ?? INTENT_SLOT_OPACITIES[INTENT_SLOT_OPACITIES.length - 1] ?? 0.15
  }));
};

export const resolveVisibleIntentStatus = (
  records: readonly IntentBusRecord[],
  step: number
): IntentFeedStatus | null => {
  const visible = [...records]
    .filter((record) => isFeedRecord(record))
    .filter((record) => record.step <= step)
    .sort(compareVisibleRecords);

  const statusRecord = visible.find((record) => PERSISTENT_STATUS_KINDS.has(record.kind)) ?? visible[0] ?? null;
  return statusRecord ? toVisibleStatus(statusRecord) : null;
};

export const resolveVisibleWorldPings = (
  records: readonly IntentBusRecord[],
  step: number,
  maxVisiblePings = MAX_WORLD_PINGS
): IntentVisiblePing[] => {
  const visible = [...records]
    .filter((record): record is IntentBusRecord & { anchor: NonNullable<IntentBusRecord['anchor']> } => (
      Boolean(record.anchor) && record.step <= step && (step - record.step) <= getWorldPingTtl(record)
    ))
    .sort((left, right) => right.step - left.step)
    .slice(0, maxVisiblePings);

  return visible.map((record, index) => ({
    ...record,
    anchor: record.anchor,
    ageSteps: step - record.step,
    opacity: WORLD_PING_OPACITIES[index] ?? WORLD_PING_OPACITIES[WORLD_PING_OPACITIES.length - 1] ?? 0.68,
    pingLabel: getIntentPingLabel(record)
  }));
};

const calculateMaxEmissionStreak = (records: readonly IntentBusRecord[]): number => {
  const emittedSteps = [...new Set(records.map((record) => record.step))].sort((left, right) => left - right);
  if (emittedSteps.length === 0) {
    return 0;
  }

  let maxStreak = 1;
  let currentStreak = 1;
  for (let index = 1; index < emittedSteps.length; index += 1) {
    if (emittedSteps[index] === (emittedSteps[index - 1] + 1)) {
      currentStreak += 1;
      maxStreak = Math.max(maxStreak, currentStreak);
      continue;
    }

    currentStreak = 1;
  }

  return maxStreak;
};

const normalizeSummary = (value: string): string => value.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/u, '').toLowerCase();

const hasRepeatedSummary = (records: readonly IntentBusRecord[]): boolean => records.some((record, index) => (
  index > 0
  && normalizeSummary(records[index - 1].summary) === normalizeSummary(record.summary)
  && records[index - 1].speaker === record.speaker
  && (record.step - records[index - 1].step) <= DEBOUNCE_WINDOW_STEPS
));

const calculateIntentMetrics = (
  bus: IntentBusBuildResult,
  steps: readonly number[],
  aggressiveMode: boolean
): IntentFeedMetrics => {
  const stackRecords = bus.records.filter((record) => isFeedRecord(record));
  const totalSteps = Math.max(1, steps.length);
  const emittedSteps = new Set(stackRecords.map((record) => record.step));
  const intentEmissionRate = Number((emittedSteps.size / totalSteps).toFixed(3));
  const worldPingRecords = bus.records.filter((record) => Boolean(record.anchor));
  const worldPingEmissionRate = Number((worldPingRecords.length / totalSteps).toFixed(3));
  const statusHistory = steps
    .map((step) => resolveVisibleIntentStatus(bus.records, step))
    .filter((status): status is IntentFeedStatus => Boolean(status));
  const statusRepeatCount = statusHistory.reduce((repeatCount, status, index) => {
    if (index === 0) {
      return repeatCount;
    }

    return normalizeSummary(statusHistory[index - 1].summary) === normalizeSummary(status.summary)
      && statusHistory[index - 1].speaker === status.speaker
      ? repeatCount + 1
      : repeatCount;
  }, 0);
  const statusPresencePass = steps.every((step) => {
    const visibleRecord = resolveVisibleIntentStatus(bus.records, step);
    const hasSeenEvent = stackRecords.some((record) => record.step <= step);
    return !hasSeenEvent || Boolean(visibleRecord);
  });
  const maxConsecutiveEmissionStreak = calculateMaxEmissionStreak(stackRecords);
  const highImportanceEvents = stackRecords.filter((record) => record.importance === 'high');
  const highImportanceStickyPass = highImportanceEvents.every((record) => {
    const futureSteps = steps.filter((step) => step > record.step).slice(0, 2);
    return futureSteps.every((step) => (
      resolveVisibleIntentEntries(stackRecords, step).some((entry) => entry.id === record.id)
    ));
  });
  const slotOpacityPass = INTENT_SLOT_OPACITIES.every((opacity, index, all) => (
    index === 0 || opacity < all[index - 1]
  ));
  const importanceTtlPass = INTENT_TTL_STEPS.low < INTENT_TTL_STEPS.medium
    && INTENT_TTL_STEPS.medium < INTENT_TTL_STEPS.high
    && WORLD_PING_TTL_STEPS.low < WORLD_PING_TTL_STEPS.medium
    && WORLD_PING_TTL_STEPS.medium < WORLD_PING_TTL_STEPS.high;
  const verbFirstPass = stackRecords.every((record) => isVerbFirst(record.summary));
  const maxVisibleWorldPings = steps.reduce((maxVisible, step) => (
    Math.max(maxVisible, resolveVisibleWorldPings(bus.records, step, aggressiveMode ? 3 : MAX_WORLD_PINGS).length)
  ), 0);
  const feedReadabilityPass = verbFirstPass
    && slotOpacityPass
    && importanceTtlPass
    && statusPresencePass
    && steps.every((step) => resolveVisibleIntentEntries(stackRecords, step).length <= MAX_INTENT_VISIBLE_ENTRIES)
    && intentEmissionRate <= INTENT_SPAM_RATE_LIMIT;

  return {
    emittedCount: stackRecords.length,
    highImportanceEventCount: highImportanceEvents.length,
    speakerCount: new Set(stackRecords.map((record) => record.speaker)).size,
    totalSteps,
    intentEmissionRate,
    worldPingCount: worldPingRecords.length,
    worldPingEmissionRate,
    maxConsecutiveEmissionStreak,
    maxVisibleWorldPings,
    debouncedEventCount: bus.debouncedEventCount,
    debouncedWorldPingCount: bus.debouncedWorldPingCount,
    statusRepeatCount,
    verbFirstPass,
    statusPresencePass,
    importanceTtlPass,
    slotOpacityPass,
    feedReadabilityPass,
    intentDebouncePass: !hasRepeatedSummary(stackRecords) && maxConsecutiveEmissionStreak <= INTENT_MAX_STREAK,
    worldPingSpamPass: !hasRepeatedSummary(worldPingRecords) && worldPingEmissionRate <= WORLD_PING_RATE_LIMIT && maxVisibleWorldPings <= MAX_WORLD_PINGS,
    highImportanceStickyPass,
    intentStackOverlapPass: true
  };
};

export const buildIntentFeed = (
  bus: IntentBusBuildResult,
  steps: readonly number[],
  options: IntentFeedBuildOptions = {}
): IntentFeedBuildResult => {
  const aggressiveMode = options.canary === 'intent-feed-spam';
  const metrics = calculateIntentMetrics(bus, steps, aggressiveMode);
  const states = new Map<number, IntentFeedState>();

  for (const step of steps) {
    const status = resolveVisibleIntentStatus(bus.records, step);
    const events = resolveVisibleIntentEntries(bus.records, step);
    states.set(step, {
      step,
      status,
      events,
      entries: events,
      pings: resolveVisibleWorldPings(bus.records, step, aggressiveMode ? 3 : MAX_WORLD_PINGS),
      metrics
    });
  }

  return {
    records: bus.records,
    states,
    metrics
  };
};
