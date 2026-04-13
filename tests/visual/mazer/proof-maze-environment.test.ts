import { describe, expect, test } from 'vitest';
import { generateProofManifest } from '../../../src/topology-proof/index';
import { ObservationProjector } from '../../../src/visual-proof/agent/ObservationProjector';
import { ProofMazeEnvironment } from '../../../src/visual-proof/agent/ProofMazeEnvironment';

describe('proof maze environment', () => {
  const manifest = generateProofManifest('bounded-progression-slice');

  test('exposes only local observation state', () => {
    const env = new ProofMazeEnvironment(manifest);
    const observation = env.getObservation();
    const observationRecord = observation as unknown as Record<string, unknown>;

    expect(Object.keys(observation).sort()).toEqual([
      'goal',
      'localCues',
      'tileId',
      'tileKind',
      'tileLabel',
      'traversableNeighborIds',
      'visibleLandmarks'
    ]);
    expect(observationRecord.graph).toBeUndefined();
    expect(observationRecord.solutionNodeIds).toBeUndefined();
    expect(observationRecord.solutionEdgeIds).toBeUndefined();
    expect(observation.goal.visible).toBe(false);
  });

  test('moves one tile at a time', () => {
    const env = new ProofMazeEnvironment(manifest);
    const startTileId = env.getCurrentTileId();
    const startObservation = env.getObservation();
    const nextTileId = startObservation.traversableNeighborIds[0];

    expect(nextTileId).toBeTruthy();
    expect(env.commitMove(nextTileId).currentTileId).toBe(nextTileId);
    expect(env.getCurrentTileId()).toBe(nextTileId);
    expect(env.getStepCount()).toBe(1);

    const neighbors = new ObservationProjector(manifest).getTraversableNeighborIds(nextTileId);
    expect(neighbors.includes(startTileId)).toBe(true);

    const distantTileId = manifest.graph.objectiveNodeId;
    if (distantTileId !== nextTileId) {
      expect(() => env.commitMove(distantTileId)).toThrow(/one step/i);
    }
  });

  test('returns deterministic observation snapshots', () => {
    const first = new ProofMazeEnvironment(manifest);
    const second = new ProofMazeEnvironment(manifest);

    expect(first.getObservation()).toEqual(second.getObservation());

    const firstStep = first.getObservation().traversableNeighborIds[0];
    const secondStep = second.getObservation().traversableNeighborIds[0];

    first.commitMove(firstStep);
    second.commitMove(secondStep);

    expect(first.getObservation()).toEqual(second.getObservation());
    expect(first.getObservation().traversableNeighborIds).toEqual(second.getObservation().traversableNeighborIds);
  });
});
