import { describe, expect, test } from 'vitest';
import { generateProofManifest } from '../../../src/topology-proof/index';
import {
  buildLoadedProofScenarioFromManifest,
  loadFallbackProofScenario
} from '../../../src/visual-proof/manifestLoader';

describe('manifest loader', () => {
  test('builds a proof scenario from a manifest', () => {
    const manifest = generateProofManifest('bounded-progression-slice');
    const loaded = buildLoadedProofScenarioFromManifest(manifest, '/topology-proof/manifests/bounded-progression-slice.json');

    expect(loaded.source.kind).toBe('manifest');
    expect(loaded.source.seed).toBe(manifest.seed);
    expect(loaded.source.manifestPath).toContain('bounded-progression-slice.json');
    expect(loaded.definition.id).toBe(manifest.scenarioId);
    expect(loaded.definition.motion).toBe(manifest.proof.motion);
    expect(loaded.definition.states.map((state) => state.id)).toEqual(
      manifest.proof.states.map((state) => state.id)
    );
    expect(loaded.definition.connectors.map((connector) => connector.id)).toEqual(
      manifest.connectors.map((connector) => connector.id)
    );
  });

  test('keeps scenario library available as fallback smoke data', () => {
    const loaded = loadFallbackProofScenario('dense-route-player-visibility');

    expect(loaded.source.kind).toBe('fallback');
    expect(loaded.definition.id).toBe('dense-route-player-visibility');
    expect(loaded.manifest).toBeNull();
  });
});
