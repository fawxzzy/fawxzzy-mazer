import { describe, expect, test } from 'vitest';
import { createPlanet3DPrototype } from '../../../src/future-runtime/planet3d/index.ts';

describe('planet3d future runtime', () => {
  test('runs a three-shell bridge-backed prototype with discrete rotation and readable connector output', () => {
    const prototype = createPlanet3DPrototype({ seed: 'planet3d-seed-42' });

    const firstStep = prototype.prototype.runStep();
    expect(firstStep.observation.observation.traversableTileIds).toContain('gallery');
    expect(prototype.host.rotationState).toBe('east');

    const results = prototype.prototype.runUntilIdle(24);
    expect(results.length).toBeGreaterThan(0);

    const frame = prototype.prototype.renderFrame();
    expect(frame.shells).toHaveLength(3);
    expect(frame.shells.map((shell) => shell.id)).toEqual(['outer-shell', 'middle-shell', 'inner-shell']);
    expect(frame.shell.id).toBe('inner-shell');
    expect(frame.shell.rotationStates).toHaveLength(4);
    expect(frame.shell.transitionCount).toBe(1);
    expect(frame.shellRelationship.relationshipReadable).toBe(true);
    expect(frame.shellRelationship.connectorReadable).toBe(true);
    expect(frame.shellRelationship.connectorAccessible).toBe(false);
    expect(frame.objectiveProxy.visible).toBe(true);
    expect(frame.objectiveProxy.proxied).toBe(false);
    expect(frame.objectiveProxy.label).toBe('Three-shell core projection');
    expect(frame.intentFeed.primaryPlacement).toBe('screen-space');
    expect(frame.intentFeed.entries.length).toBeGreaterThan(0);
    expect(frame.intentFeed.entries.length).toBeLessThanOrEqual(4);
    expect(frame.intentFeed.worldPings.length).toBeLessThanOrEqual(2);
    expect(frame.intentFeed.entries.length).toBeGreaterThanOrEqual(frame.intentFeed.worldPings.length);
    expect(new Set(frame.intentFeed.entries.map((entry) => entry.speaker))).not.toContain('Maze');
    expect(frame.contentProof.trapInferencePass).toBe(true);
    expect(frame.contentProof.wardenReadabilityPass).toBe(true);
    expect(frame.contentProof.itemProxyPass).toBe(true);
    expect(frame.contentProof.puzzleProxyPass).toBe(true);
    expect(frame.contentProof.shellRelationshipPass).toBe(true);
    expect(frame.contentProof.shellHierarchyPass).toBe(true);
    expect(frame.contentProof.connectorReadabilityPass).toBe(true);
    expect(frame.contentProof.rotationRecoveryPass).toBe(true);
    expect(frame.contentProof.objectiveProxyPass).toBe(true);
    expect(frame.contentProof.signalOverloadPass).toBe(true);
    expect(frame.trail.points.at(-1)?.tileId).toBe(frame.player.tileId);
    expect(prototype.prototype.getTrail()).not.toHaveLength(0);
    expect(prototype.prototype.getIntents()).not.toHaveLength(0);
    expect(prototype.prototype.getEpisodes()).not.toHaveLength(0);
    expect(prototype.prototype.getIntents().some((delivery) => (
      delivery.bus.records.some((record) => record.speaker === 'TrapNet' || record.kind === 'trap-inferred')
    ))).toBe(true);
    expect(prototype.prototype.getIntents().some((delivery) => (
      delivery.bus.records.some((record) => record.speaker === 'Warden' || record.kind === 'enemy-seen')
    ))).toBe(true);
    expect(prototype.prototype.getIntents().some((delivery) => (
      delivery.bus.records.some((record) => record.speaker === 'Inventory' || record.kind === 'item-spotted')
    ))).toBe(true);
    expect(prototype.prototype.getIntents().some((delivery) => (
      delivery.bus.records.some((record) => record.speaker === 'Puzzle' || record.kind === 'puzzle-state-observed')
    ))).toBe(true);
  });
});
