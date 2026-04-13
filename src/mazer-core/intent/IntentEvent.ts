export type IntentSpeaker = 'Runner' | 'Maze' | 'TrapNet' | 'Warden' | 'Inventory' | 'Puzzle';
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
  verbFirstPass: boolean;
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
  entries: IntentVisibleEntry[];
  pings: IntentVisiblePing[];
  metrics: IntentFeedMetrics;
  layout?: IntentFeedLayoutMetrics;
}

export const MAX_INTENT_VISIBLE_ENTRIES = 4;
export const MAX_WORLD_PINGS = 2;
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
