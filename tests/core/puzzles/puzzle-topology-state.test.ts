import { describe, expect, test } from 'vitest';
import { PuzzleTopologyState } from '../../../src/mazer-core/puzzles/PuzzleTopologyState';
import type { TopologyPuzzleDefinition } from '../../../src/mazer-core/puzzles/types';

const PUZZLE_DEFINITIONS: readonly TopologyPuzzleDefinition[] = [
  {
    id: 'checkpoint-shell-puzzle',
    label: 'Checkpoint Shell Puzzle',
    visibility: 'proxied',
    anchor: {
      tileId: 'junction-a',
      checkpointId: 'checkpoint-a',
      shellId: 'north-shell'
    },
    proxyCues: [
      {
        kind: 'landmark',
        id: 'puzzle-obelisk',
        label: 'Puzzle obelisk',
        confidence: 0.86
      }
    ],
    requiredCheckpointKeyIds: ['checkpoint-key-alpha'],
    requiredSignalNodeIds: ['signal-node-prime'],
    requiredShellUnlockIds: ['shell-unlock-north'],
    outputShellId: 'north-shell'
  },
  {
    id: 'signal-loop-puzzle',
    label: 'Signal Loop Puzzle',
    visibility: 'visible',
    anchor: {
      tileId: 'loop-hub'
    },
    proxyCues: [],
    requiredCheckpointKeyIds: [],
    requiredSignalNodeIds: ['signal-node-prime'],
    requiredShellUnlockIds: [],
    outputShellId: 'loop-shell'
  }
];

describe('PuzzleTopologyState', () => {
  test('rejects proxied puzzles without proxy cues', () => {
    expect(() => new PuzzleTopologyState([
      {
        id: 'broken-puzzle',
        label: 'Broken',
        visibility: 'proxied',
        anchor: { tileId: 'a' },
        proxyCues: [],
        requiredCheckpointKeyIds: [],
        requiredSignalNodeIds: [],
        requiredShellUnlockIds: []
      }
    ])).toThrow(/visible or proxied/i);
  });

  test('keeps deterministic puzzle observations and ranking', () => {
    const state = new PuzzleTopologyState(PUZZLE_DEFINITIONS);

    const context = {
      step: 1,
      currentTileId: 'junction-a',
      neighborTileIds: ['loop-hub'],
      visibleLandmarkIds: ['puzzle-obelisk'],
      visibleConnectorIds: [],
      localCues: ['puzzle obelisk resonance'],
      targetShellId: 'north-shell'
    } as const;

    const first = state.observeAndRank(context);
    const second = state.observeAndRank(context);

    expect(first).toEqual(second);
    expect(first.observedPuzzleIds).toContain('checkpoint-shell-puzzle');
    expect(first.rankedOpportunities[0]?.puzzleId).toBe('checkpoint-shell-puzzle');
  });

  test('solves only after required keys/signals/unlocks and visible proxy evidence', () => {
    const state = new PuzzleTopologyState(PUZZLE_DEFINITIONS);

    state.recordCheckpointKeyAcquired('checkpoint-key-alpha');
    state.recordSignalNodeState('signal-node-prime', true);
    state.recordShellUnlocked('shell-unlock-north');

    const noEvidence = state.observeAndRank({
      step: 3,
      currentTileId: 'distant-tile',
      neighborTileIds: [],
      visibleLandmarkIds: [],
      visibleConnectorIds: [],
      localCues: [],
      targetShellId: 'north-shell'
    });
    expect(noEvidence.solvedPuzzleIds).toEqual([]);

    const proxiedEvidence = state.observeAndRank({
      step: 4,
      currentTileId: 'junction-a',
      neighborTileIds: [],
      visibleLandmarkIds: ['puzzle-obelisk'],
      visibleConnectorIds: [],
      localCues: [],
      targetShellId: 'north-shell'
    });

    expect(proxiedEvidence.solvedPuzzleIds).toContain('checkpoint-shell-puzzle');
    const solvedState = proxiedEvidence.states.find((entry) => entry.puzzleId === 'checkpoint-shell-puzzle');
    expect(solvedState?.solvedStep).toBe(4);
  });

  test('emits bounded features with deterministic rank ordering', () => {
    const state = new PuzzleTopologyState(PUZZLE_DEFINITIONS);
    state.recordSignalNodeState('signal-node-prime', true);

    const observation = state.observeAndRank({
      step: 2,
      currentTileId: 'loop-hub',
      neighborTileIds: ['junction-a'],
      visibleLandmarkIds: [],
      visibleConnectorIds: [],
      localCues: [],
      targetShellId: 'loop-shell'
    });

    expect(observation.rankedOpportunities.map((entry) => entry.puzzleId)).toEqual([
      'signal-loop-puzzle'
    ]);

    for (const ranked of observation.rankedOpportunities) {
      expect(ranked.score).toBeGreaterThanOrEqual(0);
      expect(ranked.score).toBeLessThanOrEqual(1);
      expect(ranked.features.directVisibility).toBeGreaterThanOrEqual(0);
      expect(ranked.features.directVisibility).toBeLessThanOrEqual(1);
      expect(ranked.features.proxyVisibility).toBeGreaterThanOrEqual(0);
      expect(ranked.features.proxyVisibility).toBeLessThanOrEqual(1);
      expect(ranked.features.topologyProximity).toBeGreaterThanOrEqual(0);
      expect(ranked.features.topologyProximity).toBeLessThanOrEqual(1);
      expect(ranked.features.requirementCompletion).toBeGreaterThanOrEqual(0);
      expect(ranked.features.requirementCompletion).toBeLessThanOrEqual(1);
      expect(ranked.features.shellRelevance).toBeGreaterThanOrEqual(0);
      expect(ranked.features.shellRelevance).toBeLessThanOrEqual(1);
      expect(ranked.features.unresolvedNeed).toBeGreaterThanOrEqual(0);
      expect(ranked.features.unresolvedNeed).toBeLessThanOrEqual(1);
    }
  });
});
