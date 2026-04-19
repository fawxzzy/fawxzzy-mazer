import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  createRunProjection,
  createRunProjectionArtifact,
  normalizeRunProjection,
  type RunProjectionArtifact,
  type RunProjection,
  type RunProjectionInput,
  type RunProjectionPrivacy
} from './runProjection.ts';
import {
  createNativeProjectionArtifact,
  type NativeProjectionArtifact,
  type NativeProjectionPayload,
  type NativeProjectionPayloadKind
} from './nativeExport.ts';
import {
  createSurfaceProjectionArtifact,
  type SurfaceProjection,
  type SurfaceProjectionArtifact,
  type SurfaceProjectionKind
} from './surfaceAdapters.ts';

export const writeRunProjectionArtifact = async (
  filePath: string,
  input: RunProjectionInput,
  privacy: RunProjectionPrivacy = 'full'
): Promise<RunProjectionArtifact> => {
  const artifact = createRunProjectionArtifact(input, privacy);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return artifact;
};

export const readRunProjectionArtifact = async (filePath: string): Promise<RunProjectionArtifact> => {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as RunProjectionArtifact;
};

export const writeSurfaceProjectionArtifact = async <TProjection extends SurfaceProjection = SurfaceProjection>(
  filePath: string,
  surface: SurfaceProjectionKind,
  input: RunProjectionInput | RunProjection,
  mode: RunProjectionPrivacy = 'full'
): Promise<SurfaceProjectionArtifact<TProjection>> => {
  const artifact = createSurfaceProjectionArtifact<TProjection>(surface, input, mode);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return artifact;
};

export const writeSurfaceProjectionArtifactSet = async (
  directoryPath: string,
  input: RunProjectionInput | RunProjection,
  modes: readonly RunProjectionPrivacy[] = ['full', 'compact', 'private']
): Promise<Record<SurfaceProjectionKind, Record<RunProjectionPrivacy, string>>> => {
  const normalizedInput = normalizeRunProjection(createRunProjection(input as RunProjectionInput));
  const surfaces: SurfaceProjectionKind[] = ['snapshot-card', 'active-run-tracker', 'ambient-tile'];
  const manifest = {
    'snapshot-card': { full: '', compact: '', private: '' },
    'active-run-tracker': { full: '', compact: '', private: '' },
    'ambient-tile': { full: '', compact: '', private: '' }
  };

  for (const surface of surfaces) {
    for (const mode of modes) {
      const filePath = `${directoryPath}/${surface}.${mode}.json`;
      await writeSurfaceProjectionArtifact(filePath, surface, normalizedInput, mode);
      manifest[surface][mode] = filePath;
    }
  }

  return manifest;
};

export const writeNativeProjectionArtifact = async <
  TPayload extends NativeProjectionPayload = NativeProjectionPayload
>(
  filePath: string,
  kind: NativeProjectionPayloadKind,
  input: RunProjectionInput | RunProjection,
  privacyMode: RunProjectionPrivacy = 'full'
): Promise<NativeProjectionArtifact<TPayload>> => {
  const artifact = createNativeProjectionArtifact<TPayload>(kind, input, privacyMode);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return artifact;
};

export const writeNativeProjectionArtifactSet = async (
  directoryPath: string,
  input: RunProjectionInput | RunProjection,
  modes: readonly RunProjectionPrivacy[] = ['full', 'compact', 'private']
): Promise<Record<NativeProjectionPayloadKind, Record<RunProjectionPrivacy, string>>> => {
  const normalizedInput = normalizeRunProjection(createRunProjection(input as RunProjectionInput));
  const kinds: NativeProjectionPayloadKind[] = [
    'ios-snapshot',
    'ios-active-run',
    'android-widget',
    'android-progress-tracker'
  ];
  const manifest = {
    'ios-snapshot': { full: '', compact: '', private: '' },
    'ios-active-run': { full: '', compact: '', private: '' },
    'android-widget': { full: '', compact: '', private: '' },
    'android-progress-tracker': { full: '', compact: '', private: '' }
  };

  for (const kind of kinds) {
    for (const privacyMode of modes) {
      const filePath = `${directoryPath}/${kind}.${privacyMode}.json`;
      await writeNativeProjectionArtifact(filePath, kind, normalizedInput, privacyMode);
      manifest[kind][privacyMode] = filePath;
    }
  }

  return manifest;
};
