export type RunProjectionState = 'preroll' | 'building' | 'watching' | 'waiting' | 'failed' | 'retrying' | 'cleared';
export type LegacyRunProjectionState = 'scanning' | 'moving' | 'waiting' | 'failed' | 'cleared';
export type RunProjectionPrivacy = 'full' | 'compact' | 'private';
export type RunProjectionSourceMode = 'ai' | 'human';
export type RunProjectionMode = 'watch' | 'play';
export type RunRiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RunProjectionInput {
  runId: string;
  mazeId: string;
  attemptNo: number;
  elapsedMs: number;
  mode?: RunProjectionMode;
  state: RunProjectionState | LegacyRunProjectionState;
  failReason?: string | null;
  compactThought?: string | null;
  thought?: string | null;
  sourceMode?: RunProjectionSourceMode;
  riskLevel: RunRiskLevel;
  progressPct: number;
  miniMapHash: string;
  updatedAt: string | number | Date;
}

export interface RunProjection {
  runId: string;
  mazeId: string;
  attemptNo: number;
  elapsedMs: number;
  mode: RunProjectionMode;
  state: RunProjectionState;
  failReason: string | null;
  compactThought: string | null;
  riskLevel: RunRiskLevel;
  progressPct: number;
  miniMapHash: string;
  updatedAt: string;
}

export interface RunProjectionArtifact {
  schemaVersion: 1;
  privacy: RunProjectionPrivacy;
  projection: RunProjection;
}

const DEFAULT_THOUGHT_LIMIT_BY_SOURCE: Record<RunProjectionSourceMode, number> = {
  ai: 72,
  human: 96
};

const COMPACT_THOUGHT_LIMIT = 56;
const COMPACT_FAIL_REASON_LIMIT = 64;

const normalizeText = (value: string, maxLength: number): string => {
  const normalized = value.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/u, '');
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const sliced = normalized.slice(0, Math.max(0, maxLength - 3)).replace(/\s+\S*$/u, '').trimEnd();
  return `${sliced || normalized.slice(0, Math.max(0, maxLength - 3))}...`;
};

const normalizeOptionalText = (value: string | null | undefined, maxLength: number): string | null => (
  typeof value === 'string' && value.trim().length > 0
    ? normalizeText(value, maxLength)
    : null
);

const normalizeUpdatedAt = (value: string | number | Date): string => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'number') {
    return new Date(value).toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid updatedAt value: ${String(value)}`);
  }

  return parsed.toISOString();
};

const normalizeProgressPct = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(Math.min(100, Math.max(0, value)).toFixed(1));
};

const normalizeMode = (value: unknown): RunProjectionMode => (
  value === 'play' ? 'play' : 'watch'
);

const normalizeRiskLevel = (value: RunRiskLevel): RunRiskLevel => (
  value === 'low' || value === 'medium' || value === 'high' || value === 'critical'
    ? value
    : 'medium'
);

export const normalizeRunProjectionState = (
  value: RunProjectionState | LegacyRunProjectionState | string
): RunProjectionState => {
  switch (value) {
    case 'preroll':
    case 'building':
    case 'watching':
    case 'waiting':
    case 'failed':
    case 'retrying':
    case 'cleared':
      return value;
    case 'scanning':
      return 'preroll';
    case 'moving':
      return 'watching';
    default:
      return 'preroll';
  }
};

const resolveCompactThought = (input: Pick<RunProjectionInput, 'compactThought' | 'thought' | 'sourceMode'>): string | null => {
  const preferred = input.compactThought ?? input.thought;
  if (typeof preferred !== 'string' || preferred.trim().length === 0) {
    return null;
  }

  const limit = input.sourceMode ? DEFAULT_THOUGHT_LIMIT_BY_SOURCE[input.sourceMode] : DEFAULT_THOUGHT_LIMIT_BY_SOURCE.ai;
  return normalizeText(preferred, limit);
};

export const createRunProjection = (input: RunProjectionInput): RunProjection => ({
  runId: input.runId,
  mazeId: input.mazeId,
  attemptNo: Math.max(0, Math.trunc(input.attemptNo)),
  elapsedMs: Math.max(0, Math.trunc(input.elapsedMs)),
  mode: normalizeMode(input.mode),
  state: normalizeRunProjectionState(input.state),
  failReason: normalizeOptionalText(input.failReason, COMPACT_FAIL_REASON_LIMIT),
  compactThought: resolveCompactThought(input),
  riskLevel: normalizeRiskLevel(input.riskLevel),
  progressPct: normalizeProgressPct(input.progressPct),
  miniMapHash: input.miniMapHash.trim(),
  updatedAt: normalizeUpdatedAt(input.updatedAt)
});

export const applyRunProjectionPrivacy = (
  projection: RunProjection,
  privacy: RunProjectionPrivacy
): RunProjection => {
  if (privacy === 'private') {
    return {
      ...projection,
      failReason: null,
      compactThought: null
    };
  }

  if (privacy === 'compact') {
    return {
      ...projection,
      failReason: normalizeOptionalText(projection.failReason, 24),
      compactThought: normalizeOptionalText(projection.compactThought, COMPACT_THOUGHT_LIMIT)
    };
  }

  return projection;
};

export const createRunProjectionArtifact = (
  input: RunProjectionInput,
  privacy: RunProjectionPrivacy = 'full'
): RunProjectionArtifact => ({
  schemaVersion: 1,
  privacy,
  projection: applyRunProjectionPrivacy(createRunProjection(input), privacy)
});

export const normalizeRunProjection = (projection: RunProjection): RunProjection => ({
  ...projection,
  attemptNo: Math.max(0, Math.trunc(projection.attemptNo)),
  elapsedMs: Math.max(0, Math.trunc(projection.elapsedMs)),
  mode: normalizeMode(projection.mode),
  failReason: normalizeOptionalText(projection.failReason, COMPACT_FAIL_REASON_LIMIT),
  compactThought: normalizeOptionalText(projection.compactThought, COMPACT_THOUGHT_LIMIT),
  state: normalizeRunProjectionState(projection.state),
  riskLevel: normalizeRiskLevel(projection.riskLevel),
  progressPct: normalizeProgressPct(projection.progressPct),
  miniMapHash: projection.miniMapHash.trim(),
  updatedAt: normalizeUpdatedAt(projection.updatedAt)
});
