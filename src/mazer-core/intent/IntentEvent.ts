export type IntentSpeaker = 'Runner' | 'Warden' | 'TrapNet' | 'Puzzle' | 'Inventory';
export type IntentCategory = 'observe' | 'replan' | 'danger' | 'item' | 'goal' | 'infer';
export type IntentImportance = 'low' | 'medium' | 'high';
export type IntentKind =
  | 'frontier-chosen'
  | 'dead-end-confirmed'
  | 'replan-triggered'
  | 'landmark-spotted'
  | 'trap-inferred'
  | 'enemy-seen'
  | 'item-spotted'
  | 'goal-observed'
  | 'route-commitment-changed'
  | 'gate-aligned'
  | 'puzzle-state-observed';

export interface IntentAnchor {
  kind: 'player' | 'objective' | 'tile' | 'landmark' | 'connector';
  tileId?: string | null;
  landmarkId?: string | null;
  connectorId?: string | null;
}

export interface IntentBusRecord {
  id: string;
  speaker: IntentSpeaker;
  category: IntentCategory;
  kind: IntentKind;
  importance: IntentImportance;
  summary: string;
  confidence: number;
  step: number;
  ttlSteps: number;
  anchor?: IntentAnchor;
}

export interface IntentVisibleEntry extends IntentBusRecord {
  ageSteps: number;
  slot: number;
  opacity: number;
}

export interface IntentFeedStatus {
  speaker: IntentSpeaker;
  category: IntentCategory;
  kind: IntentKind;
  importance: IntentImportance;
  summary: string;
  confidence: number;
  step: number;
  anchor?: IntentAnchor;
}

export interface IntentVisiblePing extends IntentBusRecord {
  anchor: IntentAnchor;
  ageSteps: number;
  opacity: number;
  pingLabel: string;
}

export interface IntentFeedLayoutMetrics {
  feedRect: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
  criticalRects: Array<{
    key: string;
    left: number;
    top: number;
    width: number;
    height: number;
  }>;
  overlapTargets: string[];
  intentStackOverlapPass: boolean;
}

export interface IntentFeedMetrics {
  emittedCount: number;
  highImportanceEventCount: number;
  speakerCount: number;
  totalSteps: number;
  intentEmissionRate: number;
  worldPingCount: number;
  worldPingEmissionRate: number;
  maxConsecutiveEmissionStreak: number;
  maxVisibleWorldPings: number;
  debouncedEventCount: number;
  debouncedWorldPingCount: number;
  statusRepeatCount: number;
  verbFirstPass: boolean;
  statusPresencePass: boolean;
  importanceTtlPass: boolean;
  slotOpacityPass: boolean;
  feedReadabilityPass: boolean;
  intentDebouncePass: boolean;
  worldPingSpamPass: boolean;
  highImportanceStickyPass: boolean;
  intentStackOverlapPass: boolean;
}

export interface IntentFeedState {
  step: number;
  status?: IntentFeedStatus | null;
  events?: IntentVisibleEntry[];
  entries: IntentVisibleEntry[];
  pings: IntentVisiblePing[];
  metrics: IntentFeedMetrics;
  layout?: IntentFeedLayoutMetrics;
}

export const MAX_INTENT_VISIBLE_ENTRIES = 4;
export const MAX_WORLD_PINGS = 2;
export const INTENT_PING_LABELS: Record<IntentKind, string> = Object.freeze({
  'goal-observed': 'Exit seen',
  'enemy-seen': 'Warden seen',
  'trap-inferred': 'Trap inferred',
  'item-spotted': 'Item spotted',
  'landmark-spotted': 'Landmark seen',
  'gate-aligned': 'Gate aligned',
  'puzzle-state-observed': 'Puzzle state',
  'frontier-chosen': 'Route marked',
  'dead-end-confirmed': 'Dead end',
  'replan-triggered': 'Route shifted',
  'route-commitment-changed': 'Route locked'
});
export const INTENT_SUMMARY_VERB_FIRST_WORDS = Object.freeze([
  'scanning',
  'screening',
  'reading',
  'valuing',
  'parsing',
  'marking',
  'noting',
  'replanning',
  'tracking',
  'locking',
  'timing',
  'aligning',
  'observing',
  'avoiding',
  'learning',
  'prioritizing'
]);
export const INTENT_SLOT_OPACITIES = Object.freeze([1, 0.7, 0.4, 0.15]);
export const WORLD_PING_OPACITIES = Object.freeze([1, 0.72]);
export const INTENT_TTL_STEPS: Record<IntentImportance, number> = Object.freeze({
  low: 2,
  medium: 4,
  high: 7
});
export const WORLD_PING_TTL_STEPS: Record<IntentImportance, number> = Object.freeze({
  low: 1,
  medium: 2,
  high: 3
});

export const formatIntentSpeakerHandle = (speaker: IntentSpeaker): string => `@${speaker}`;

export const getIntentPingLabel = (record: Pick<IntentBusRecord, 'kind' | 'summary'>): string => (
  INTENT_PING_LABELS[record.kind] ?? record.summary
);
