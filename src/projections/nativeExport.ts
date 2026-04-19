import {
  createActiveRunTrackerProjection,
  createAmbientTileProjection,
  createSnapshotCardProjection,
  type ActiveRunTrackerProjection,
  type AmbientTileProjection,
  type SnapshotCardProjection
} from './surfaceAdapters.ts';
import {
  applyRunProjectionPrivacy,
  createRunProjection,
  normalizeRunProjection,
  type RunProjection,
  type RunProjectionInput,
  type RunProjectionPrivacy,
  type RunProjectionState
} from './runProjection.ts';

export type NativeProjectionPayloadKind =
  | 'ios-snapshot'
  | 'ios-active-run'
  | 'android-widget'
  | 'android-progress-tracker';

export interface NativeProjectionPayloadBase {
  schemaVersion: 1;
  kind: NativeProjectionPayloadKind;
  platform: 'ios' | 'android';
  privacyMode: RunProjectionPrivacy;
  runId: string;
  mazeId: string | null;
  lifecycleState: RunProjectionState;
  attemptNumber: number;
  progressPct: number;
  compactThought: string | null;
  failReason: string | null;
  updatedAt: string;
}

export interface IosSnapshotPayload extends NativeProjectionPayloadBase {
  kind: 'ios-snapshot';
  platform: 'ios';
  title: string;
  subtitle: string | null;
  mapToken: string | null;
}

export interface IosActiveRunPayload extends NativeProjectionPayloadBase {
  kind: 'ios-active-run';
  platform: 'ios';
  statusLabel: string;
  elapsedLabel: string;
  chipLabels: string[];
}

export interface AndroidWidgetPayload extends NativeProjectionPayloadBase {
  kind: 'android-widget';
  platform: 'android';
  glyph: string;
  label: string;
  accent: string;
}

export interface AndroidProgressTrackerPayload extends NativeProjectionPayloadBase {
  kind: 'android-progress-tracker';
  platform: 'android';
  statusLabel: string;
  elapsedLabel: string;
  headline: string;
}

export type NativeProjectionPayload =
  | IosSnapshotPayload
  | IosActiveRunPayload
  | AndroidWidgetPayload
  | AndroidProgressTrackerPayload;

export interface NativeProjectionArtifact<TPayload extends NativeProjectionPayload = NativeProjectionPayload> {
  schemaVersion: 1;
  kind: NativeProjectionPayloadKind;
  privacyMode: RunProjectionPrivacy;
  source: RunProjection;
  payload: TPayload;
}

const NATIVE_EXPORT_SCHEMA_VERSION = 1 as const;

const resolveProjection = (
  input: RunProjectionInput | RunProjection,
  privacyMode: RunProjectionPrivacy
): RunProjection => applyRunProjectionPrivacy(
  normalizeRunProjection(createRunProjection(input as RunProjectionInput)),
  privacyMode
);

const createBasePayload = (
  kind: NativeProjectionPayloadKind,
  privacyMode: RunProjectionPrivacy,
  source: RunProjection
): NativeProjectionPayloadBase => ({
  schemaVersion: NATIVE_EXPORT_SCHEMA_VERSION,
  kind,
  platform: kind.startsWith('ios-') ? 'ios' : 'android',
  privacyMode,
  runId: source.runId,
  mazeId: privacyMode === 'private' ? null : source.mazeId,
  lifecycleState: source.state,
  attemptNumber: source.attemptNo,
  progressPct: source.progressPct,
  compactThought: source.compactThought,
  failReason: source.failReason,
  updatedAt: source.updatedAt
});

const createIosSnapshotPayload = (
  source: RunProjection,
  projection: SnapshotCardProjection
): IosSnapshotPayload => ({
  ...createBasePayload('ios-snapshot', projection.mode, source),
  kind: 'ios-snapshot',
  platform: 'ios',
  title: projection.headline,
  subtitle: projection.narrative ?? projection.detail,
  mapToken: projection.miniMapHash
});

const createIosActiveRunPayload = (
  source: RunProjection,
  projection: ActiveRunTrackerProjection
): IosActiveRunPayload => ({
  ...createBasePayload('ios-active-run', projection.mode, source),
  kind: 'ios-active-run',
  platform: 'ios',
  statusLabel: projection.primaryLabel,
  elapsedLabel: projection.elapsedLabel,
  chipLabels: projection.chipLabels
});

const createAndroidWidgetPayload = (
  source: RunProjection,
  projection: AmbientTileProjection
): AndroidWidgetPayload => ({
  ...createBasePayload('android-widget', projection.mode, source),
  kind: 'android-widget',
  platform: 'android',
  glyph: projection.glyph,
  label: projection.label,
  accent: projection.accent
});

const createAndroidProgressTrackerPayload = (
  source: RunProjection,
  projection: ActiveRunTrackerProjection
): AndroidProgressTrackerPayload => ({
  ...createBasePayload('android-progress-tracker', projection.mode, source),
  kind: 'android-progress-tracker',
  platform: 'android',
  statusLabel: projection.primaryLabel,
  elapsedLabel: projection.elapsedLabel,
  headline: projection.secondaryLabel ?? projection.primaryLabel
});

export const createNativeProjectionPayload = <TPayload extends NativeProjectionPayload = NativeProjectionPayload>(
  kind: NativeProjectionPayloadKind,
  input: RunProjectionInput | RunProjection,
  privacyMode: RunProjectionPrivacy = 'full'
): TPayload => {
  const source = resolveProjection(input, privacyMode);

  if (kind === 'ios-snapshot') {
    return createIosSnapshotPayload(source, createSnapshotCardProjection(source, privacyMode)) as TPayload;
  }

  if (kind === 'ios-active-run') {
    return createIosActiveRunPayload(source, createActiveRunTrackerProjection(source, privacyMode)) as TPayload;
  }

  if (kind === 'android-widget') {
    return createAndroidWidgetPayload(source, createAmbientTileProjection(source, privacyMode)) as TPayload;
  }

  return createAndroidProgressTrackerPayload(
    source,
    createActiveRunTrackerProjection(source, privacyMode)
  ) as TPayload;
};

export const createNativeProjectionArtifact = <TPayload extends NativeProjectionPayload = NativeProjectionPayload>(
  kind: NativeProjectionPayloadKind,
  input: RunProjectionInput | RunProjection,
  privacyMode: RunProjectionPrivacy = 'full'
): NativeProjectionArtifact<TPayload> => {
  const source = resolveProjection(input, privacyMode);
  return {
    schemaVersion: NATIVE_EXPORT_SCHEMA_VERSION,
    kind,
    privacyMode,
    source,
    payload: createNativeProjectionPayload<TPayload>(kind, source, privacyMode)
  };
};
