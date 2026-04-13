import { describe, expect, test } from 'vitest';
import { generateAllProofManifests, generateProofManifest } from '../../src/topology-proof/index';

describe('topology proof manifests', () => {
  test('same seed yields the same manifest', () => {
    const first = generateProofManifest('dense-route-player-visibility', 'dense-visibility-v1');
    const second = generateProofManifest('dense-route-player-visibility', 'dense-visibility-v1');

    expect(second).toEqual(first);
  });

  test('district presets differ in metrics and not only in labels', () => {
    const manifests = generateAllProofManifests();
    const byId = new Map(manifests.map((manifest) => [manifest.scenarioId, manifest]));
    const metricSignatures = manifests.map((manifest) => JSON.stringify({
      solutionLength: manifest.metrics.solutionLength,
      deadEndCount: manifest.metrics.deadEndCount,
      loopCount: manifest.metrics.loopCount,
      shellTransitionCount: manifest.metrics.shellTransitionCount,
      vantageFrequency: manifest.metrics.vantageFrequency
    }));

    expect(new Set(metricSignatures).size).toBe(manifests.length);
    expect(byId.get('dense-route-player-visibility')?.metrics.loopCount).toBe(0);
    expect(byId.get('shell-connector-alignment')?.metrics.loopCount ?? 0).toBeGreaterThan(
      byId.get('discrete-rotation-readability')?.metrics.loopCount ?? 0
    );
    expect(byId.get('observatory-reorientation')?.metrics.vantageFrequency ?? 0).toBeGreaterThan(
      byId.get('dense-route-player-visibility')?.metrics.vantageFrequency ?? 0
    );
    expect(byId.get('bounded-progression-slice')?.metrics.deadEndCount ?? 0).toBeGreaterThanOrEqual(
      byId.get('dense-route-player-visibility')?.metrics.deadEndCount ?? 0
    );
  });

  test('metric summaries stay inside district target bands', () => {
    const manifests = generateAllProofManifests();

    for (const manifest of manifests) {
      const district = manifest.districts[0];
      expect(manifest.metrics.solutionLength).toBeGreaterThanOrEqual(district.topologyTargets.solutionLengthBand[0]);
      expect(manifest.metrics.solutionLength).toBeLessThanOrEqual(district.topologyTargets.solutionLengthBand[1]);
      expect(manifest.metrics.deadEndCount).toBeGreaterThanOrEqual(district.topologyTargets.deadEndBand[0]);
      expect(manifest.metrics.deadEndCount).toBeLessThanOrEqual(district.topologyTargets.deadEndBand[1]);
      expect(manifest.metrics.loopCount).toBeGreaterThanOrEqual(district.topologyTargets.loopBand[0]);
      expect(manifest.metrics.loopCount).toBeLessThanOrEqual(district.topologyTargets.loopBand[1]);
      expect(manifest.metrics.shellTransitionCount).toBeGreaterThanOrEqual(district.topologyTargets.shellTransitionBand[0]);
      expect(manifest.metrics.shellTransitionCount).toBeLessThanOrEqual(district.topologyTargets.shellTransitionBand[1]);
      expect(manifest.metrics.landmarkSpacing.minimum).toBeGreaterThanOrEqual(district.readabilityTargets.landmarkSpacingBand[0]);
      expect(manifest.metrics.landmarkSpacing.average).toBeLessThanOrEqual(district.readabilityTargets.landmarkSpacingBand[1]);
      expect(manifest.metrics.objectiveVisibilityUptime).toBeGreaterThanOrEqual(district.readabilityTargets.objectiveVisibilityBand[0]);
      expect(manifest.metrics.objectiveVisibilityUptime).toBeLessThanOrEqual(district.readabilityTargets.objectiveVisibilityBand[1]);
      expect(manifest.metrics.vantageFrequency).toBeGreaterThanOrEqual(district.readabilityTargets.vantageFrequencyBand[0]);
      expect(manifest.metrics.vantageFrequency).toBeLessThanOrEqual(district.readabilityTargets.vantageFrequencyBand[1]);
    }
  });

  test('manifests serialize cleanly', () => {
    const manifest = generateProofManifest('observatory-reorientation');
    const roundTripped = JSON.parse(JSON.stringify(manifest));

    expect(roundTripped.scenarioId).toBe(manifest.scenarioId);
    expect(roundTripped.seed).toBe(manifest.seed);
    expect(roundTripped.metrics.solutionLength).toBe(manifest.metrics.solutionLength);
  });
});
