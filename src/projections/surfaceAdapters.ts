import {
  applyRunProjectionPrivacy,
  createRunProjection,
  normalizeRunProjection,
  type RunProjection,
  type RunProjectionInput,
  type RunProjectionPrivacy,
  type RunProjectionState
} from './runProjection.ts';

export type SurfaceProjectionKind = 'snapshot-card' | 'active-run-tracker' | 'ambient-tile';

export interface SurfaceProjectionBase {
  schemaVersion: 1;
  surface: SurfaceProjectionKind;
  mode: RunProjectionPrivacy;
  runId: string;
  mazeId: string | null;
  attemptNo: number;
  state: RunProjectionState;
  progressPct: number;
  riskLevel: RunProjection['riskLevel'];
  updatedAt: string;
}

export interface SnapshotCardProjection extends SurfaceProjectionBase {
  surface: 'snapshot-card';
  eyebrow: string;
  headline: string;
  detail: string | null;
  narrative: string | null;
  miniMapHash: string | null;
}

export interface ActiveRunTrackerProjection extends SurfaceProjectionBase {
  surface: 'active-run-tracker';
  primaryLabel: string;
  secondaryLabel: string | null;
  elapsedLabel: string;
  chipLabels: string[];
  narrative: string | null;
}

export interface AmbientTileProjection extends SurfaceProjectionBase {
  surface: 'ambient-tile';
  glyph: string;
  label: string;
  accent: string;
  narrative: string | null;
}

export type SurfaceProjection =
  | SnapshotCardProjection
  | ActiveRunTrackerProjection
  | AmbientTileProjection;

export interface SurfaceProjectionArtifact<TProjection extends SurfaceProjection = SurfaceProjection> {
  schemaVersion: 1;
  surface: SurfaceProjectionKind;
  mode: RunProjectionPrivacy;
  source: RunProjection;
  projection: TProjection;
}

const SURFACE_PROJECTION_SCHEMA_VERSION = 1 as const;

const SNAPSHOT_EYEBROW_BY_STATE: Record<RunProjectionState, string> = {
  preroll: 'Queueing run',
  building: 'Building maze',
  watching: 'Watching live',
  waiting: 'Holding frame',
  failed: 'Trap readable',
  retrying: 'Retrying route',
  cleared: 'Run cleared'
};

const TRACKER_LABEL_BY_STATE: Record<RunProjectionState, string> = {
  preroll: 'Pre-roll',
  building: 'Build reveal',
  watching: 'Active watch',
  waiting: 'Stand by',
  failed: 'Fail hold',
  retrying: 'Retrying',
  cleared: 'Cleared'
};

const AMBIENT_GLYPH_BY_STATE: Record<RunProjectionState, string> = {
  preroll: '...',
  building: '+++',
  watching: '>>>',
  waiting: '||',
  failed: '!!',
  retrying: '><',
  cleared: 'OK'
};

const AMBIENT_ACCENT_BY_STATE: Record<RunProjectionState, string> = {
  preroll: 'quiet',
  building: 'rising',
  watching: 'live',
  waiting: 'held',
  failed: 'alert',
  retrying: 'reset',
  cleared: 'resolved'
};

const TRACKER_CHIP_LABEL_BY_RISK = {
  low: 'Risk low',
  medium: 'Risk medium',
  high: 'Risk high',
  critical: 'Risk critical'
} as const;

const clampText = (value: string | null | undefined, maxLength: number): string | null => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};

const resolveProjection = (input: RunProjectionInput | RunProjection, mode: RunProjectionPrivacy): RunProjection => (
  applyRunProjectionPrivacy(normalizeRunProjection(createRunProjection(input as RunProjectionInput)), mode)
);

const formatElapsedLabel = (elapsedMs: number): string => {
  const totalSeconds = Math.max(0, Math.round(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const resolveNarrative = (projection: RunProjection, mode: RunProjectionPrivacy, maxLength: number): string | null => {
  if (mode === 'private') {
    return null;
  }

  if (projection.state === 'failed' || projection.state === 'retrying') {
    return clampText(projection.failReason, maxLength);
  }

  return clampText(projection.compactThought, maxLength);
};

const resolveMazeId = (projection: RunProjection, mode: RunProjectionPrivacy): string | null => (
  mode === 'private' ? null : projection.mazeId
);

const resolveMiniMapHash = (projection: RunProjection, mode: RunProjectionPrivacy): string | null => (
  mode === 'private' ? null : projection.miniMapHash
);

const createBaseProjection = (
  mode: RunProjectionPrivacy,
  projection: RunProjection
): Omit<SurfaceProjectionBase, 'surface'> => ({
  schemaVersion: SURFACE_PROJECTION_SCHEMA_VERSION,
  mode,
  runId: projection.runId,
  mazeId: resolveMazeId(projection, mode),
  attemptNo: projection.attemptNo,
  state: projection.state,
  progressPct: projection.progressPct,
  riskLevel: projection.riskLevel,
  updatedAt: projection.updatedAt
});

export const createSnapshotCardProjection = (
  input: RunProjectionInput | RunProjection,
  mode: RunProjectionPrivacy = 'full'
): SnapshotCardProjection => {
  const projection = resolveProjection(input, mode);
  const detail = mode === 'private'
    ? 'Private surface'
    : projection.state === 'failed' || projection.state === 'retrying'
      ? `${projection.progressPct}% complete`
      : resolveMazeId(projection, mode)
        ? `Maze ${projection.mazeId} · ${projection.progressPct}%`
        : `${projection.progressPct}% complete`;

  return {
    ...createBaseProjection(mode, projection),
    surface: 'snapshot-card',
    eyebrow: SNAPSHOT_EYEBROW_BY_STATE[projection.state],
    headline: mode === 'private'
      ? SNAPSHOT_EYEBROW_BY_STATE[projection.state]
      : `Attempt ${projection.attemptNo} · ${SNAPSHOT_EYEBROW_BY_STATE[projection.state]}`,
    detail,
    narrative: resolveNarrative(projection, mode, mode === 'compact' ? 48 : 84),
    miniMapHash: resolveMiniMapHash(projection, mode)
  };
};

export const createActiveRunTrackerProjection = (
  input: RunProjectionInput | RunProjection,
  mode: RunProjectionPrivacy = 'full'
): ActiveRunTrackerProjection => {
  const projection = resolveProjection(input, mode);
  const chips = [
    TRACKER_CHIP_LABEL_BY_RISK[projection.riskLevel],
    `Progress ${Math.round(projection.progressPct)}%`,
    projection.state === 'cleared' ? 'Exit found' : TRACKER_LABEL_BY_STATE[projection.state]
  ];

  return {
    ...createBaseProjection(mode, projection),
    surface: 'active-run-tracker',
    primaryLabel: TRACKER_LABEL_BY_STATE[projection.state],
    secondaryLabel: mode === 'private'
      ? null
      : resolveMazeId(projection, mode)
        ? `Maze ${projection.mazeId}`
        : null,
    elapsedLabel: formatElapsedLabel(projection.elapsedMs),
    chipLabels: chips,
    narrative: resolveNarrative(projection, mode, mode === 'compact' ? 40 : 72)
  };
};

export const createAmbientTileProjection = (
  input: RunProjectionInput | RunProjection,
  mode: RunProjectionPrivacy = 'full'
): AmbientTileProjection => {
  const projection = resolveProjection(input, mode);
  return {
    ...createBaseProjection(mode, projection),
    surface: 'ambient-tile',
    glyph: AMBIENT_GLYPH_BY_STATE[projection.state],
    label: mode === 'private'
      ? AMBIENT_ACCENT_BY_STATE[projection.state]
      : `${AMBIENT_ACCENT_BY_STATE[projection.state]} ${Math.round(projection.progressPct)}%`,
    accent: projection.riskLevel,
    narrative: resolveNarrative(projection, mode, mode === 'compact' ? 32 : 56)
  };
};

export const createSurfaceProjectionArtifact = <
  TProjection extends SurfaceProjection = SurfaceProjection
>(
  surface: SurfaceProjectionKind,
  input: RunProjectionInput | RunProjection,
  mode: RunProjectionPrivacy = 'full'
): SurfaceProjectionArtifact<TProjection> => {
  const source = resolveProjection(input, mode);
  const projection = (
    surface === 'snapshot-card'
      ? createSnapshotCardProjection(source, mode)
      : surface === 'active-run-tracker'
        ? createActiveRunTrackerProjection(source, mode)
        : createAmbientTileProjection(source, mode)
  ) as TProjection;

  return {
    schemaVersion: SURFACE_PROJECTION_SCHEMA_VERSION,
    surface,
    mode,
    source,
    projection
  };
};
