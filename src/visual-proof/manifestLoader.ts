import type { LoadedProofScenario, PlanetProofManifest } from './manifestTypes';
import type { ScenarioDefinition } from './scenarioLibrary';
import { getScenarioDefinition } from './scenarioLibrary';

const decodeBase64Utf8 = (value: string): string => {
  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  throw new Error(`Base64 manifest decoding is unavailable in this environment for payload ${value.slice(0, 12)}...`);
};

const isManifest = (value: unknown): value is PlanetProofManifest => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<PlanetProofManifest>;
  return candidate.schemaVersion === 1
    && typeof candidate.scenarioId === 'string'
    && typeof candidate.seed === 'string'
    && Array.isArray(candidate.nodes)
    && Array.isArray(candidate.edges)
    && Array.isArray(candidate.connectors)
    && Array.isArray(candidate.landmarks)
    && Array.isArray(candidate.rotationStates)
    && Array.isArray(candidate.districts)
    && Boolean(candidate.proof);
};

const toScenarioDefinition = (manifest: PlanetProofManifest): ScenarioDefinition => ({
  id: manifest.scenarioId,
  title: manifest.title,
  subtitle: manifest.subtitle,
  motion: manifest.proof.motion,
  evidence: manifest.proof.evidence,
  shells: manifest.shells,
  routes: manifest.proof.routes,
  landmarks: manifest.landmarks,
  connectors: manifest.connectors,
  states: manifest.proof.states,
  humanJudgment: manifest.proof.humanJudgment,
  semanticGate: manifest.proof.semanticGate
});

export const buildLoadedProofScenarioFromManifest = (
  manifest: PlanetProofManifest,
  manifestPath: string | null
): LoadedProofScenario => ({
  definition: toScenarioDefinition(manifest),
  manifest,
  source: {
    kind: 'manifest',
    manifestPath,
    seed: manifest.seed,
    districtType: manifest.districtType,
    rotationStateIds: manifest.rotationStates.map((state) => state.id)
  }
});

export const loadFallbackProofScenario = (scenarioId: string): LoadedProofScenario => ({
  definition: getScenarioDefinition(scenarioId),
  manifest: null,
  source: {
    kind: 'fallback',
    manifestPath: null,
    seed: null,
    districtType: null,
    rotationStateIds: []
  }
});

const parseManifestPayload = (payload: unknown, manifestPath: string | null): LoadedProofScenario => {
  if (!isManifest(payload)) {
    throw new Error('Manifest payload is missing required proof fields.');
  }

  return buildLoadedProofScenarioFromManifest(payload, manifestPath);
};

export const loadProofScenario = async ({
  search,
  fallbackScenarioId,
  fetcher = fetch
}: {
  search: string;
  fallbackScenarioId: string;
  fetcher?: typeof fetch;
}): Promise<LoadedProofScenario> => {
  const params = new URLSearchParams(search);
  const manifestData = params.get('manifestData');
  if (manifestData) {
    const raw = decodeBase64Utf8(manifestData);
    return parseManifestPayload(JSON.parse(raw), 'inline:manifestData');
  }

  const manifestPath = params.get('manifest');
  if (manifestPath) {
    const response = await fetcher(manifestPath);
    if (!response.ok) {
      throw new Error(`Failed to load proof manifest ${manifestPath}: ${response.status}.`);
    }

    return parseManifestPayload(await response.json(), manifestPath);
  }

  return loadFallbackProofScenario(params.get('scenario') ?? fallbackScenarioId);
};
