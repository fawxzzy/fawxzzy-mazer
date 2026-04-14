import { describe, expect, test } from 'vitest';
import { ItemTopologyLedger } from '../../../src/mazer-core/items/ItemTopologyLedger';
import type { TopologyItemDefinition } from '../../../src/mazer-core/items/types';

const ITEM_DEFINITIONS: readonly TopologyItemDefinition[] = [
  {
    id: 'checkpoint-key-alpha',
    label: 'Checkpoint Key Alpha',
    kind: 'checkpoint-key',
    visibility: 'visible',
    anchor: {
      tileId: 'checkpoint-a',
      checkpointId: 'checkpoint-a'
    },
    proxyCues: [],
    tags: ['checkpoint', 'key']
  },
  {
    id: 'signal-node-prime',
    label: 'Signal Node Prime',
    kind: 'signal-node',
    visibility: 'proxied',
    anchor: {
      tileId: 'junction-a'
    },
    proxyCues: [
      {
        kind: 'landmark',
        id: 'signal-tower',
        label: 'Signal tower',
        confidence: 0.84
      }
    ],
    tags: ['signal', 'timing']
  },
  {
    id: 'shell-unlock-north',
    label: 'North Shell Unlock',
    kind: 'shell-unlock',
    visibility: 'proxied',
    anchor: {
      tileId: 'junction-b',
      shellId: 'north-shell'
    },
    proxyCues: [
      {
        kind: 'connector',
        id: 'north-shell-gate',
        label: 'North shell gate',
        confidence: 0.9
      }
    ],
    tags: ['shell', 'unlock']
  }
];

describe('ItemTopologyLedger', () => {
  test('rejects proxied items without proxy cues', () => {
    expect(() => new ItemTopologyLedger([
      {
        id: 'broken-item',
        label: 'Broken',
        kind: 'checkpoint-key',
        visibility: 'proxied',
        anchor: { tileId: 'a' },
        proxyCues: [],
        tags: []
      }
    ])).toThrow(/visible or proxied/i);
  });

  test('produces deterministic observation and ranked usefulness', () => {
    const ledger = new ItemTopologyLedger(ITEM_DEFINITIONS);
    const context = {
      step: 4,
      currentTileId: 'junction-a',
      neighborTileIds: ['junction-b', 'checkpoint-a'],
      visibleLandmarkIds: ['signal-tower'],
      visibleConnectorIds: [],
      localCues: ['signal tower hum'],
      requestedCheckpointIds: ['checkpoint-a'],
      requestedSignalNodeIds: ['signal-node-prime'],
      requestedShellIds: ['north-shell']
    } as const;

    const first = ledger.observeAndRank(context);
    const second = ledger.observeAndRank(context);

    expect(first).toEqual(second);
    expect(first.observedItemIds).toContain('signal-node-prime');
    expect(first.evidenceByItemId['signal-node-prime'].visibility).toBe('proxied');
    expect(first.rankedUsefulness.map((entry) => entry.itemId)).toEqual([
      'signal-node-prime'
    ]);
  });

  test('tracks checkpoint keys, signal nodes, and shell unlocks deterministically', () => {
    const ledger = new ItemTopologyLedger(ITEM_DEFINITIONS);

    ledger.recordCheckpointKeyAcquired(2, 'checkpoint-key-alpha');
    ledger.recordSignalNodeActivated(3, 'signal-node-prime');
    ledger.recordShellUnlocked(5, 'shell-unlock-north');

    const snapshot = ledger.getStateSnapshot();
    expect(snapshot).toEqual([
      {
        itemId: 'checkpoint-key-alpha',
        acquiredStep: 2,
        signalActivatedStep: null,
        shellUnlockedStep: null,
        lastEvidenceStep: null
      },
      {
        itemId: 'shell-unlock-north',
        acquiredStep: null,
        signalActivatedStep: null,
        shellUnlockedStep: 5,
        lastEvidenceStep: null
      },
      {
        itemId: 'signal-node-prime',
        acquiredStep: null,
        signalActivatedStep: 3,
        shellUnlockedStep: null,
        lastEvidenceStep: null
      }
    ]);

    const observation = ledger.observeAndRank({
      step: 6,
      currentTileId: 'junction-b',
      neighborTileIds: ['junction-a'],
      visibleLandmarkIds: [],
      visibleConnectorIds: ['north-shell-gate'],
      localCues: [],
      requestedCheckpointIds: ['checkpoint-a'],
      requestedSignalNodeIds: ['signal-node-prime'],
      requestedShellIds: ['north-shell']
    });

    expect(observation.progress.checkpointKeyIds).toEqual(['checkpoint-key-alpha']);
    expect(observation.progress.signalNodeIds).toEqual(['signal-node-prime']);
    expect(observation.progress.shellUnlockIds).toEqual(['shell-unlock-north']);
  });

  test('emits bounded ranking features for scorer-side consumption', () => {
    const ledger = new ItemTopologyLedger(ITEM_DEFINITIONS);
    const observation = ledger.observeAndRank({
      step: 1,
      currentTileId: 'junction-b',
      neighborTileIds: ['junction-a'],
      visibleLandmarkIds: [],
      visibleConnectorIds: ['north-shell-gate'],
      localCues: [],
      requestedCheckpointIds: [],
      requestedSignalNodeIds: [],
      requestedShellIds: ['north-shell']
    });

    expect(observation.rankedUsefulness.length).toBeGreaterThan(0);
    for (const ranked of observation.rankedUsefulness) {
      expect(ranked.score).toBeGreaterThanOrEqual(0);
      expect(ranked.score).toBeLessThanOrEqual(1);
      expect(ranked.features.directVisibility).toBeGreaterThanOrEqual(0);
      expect(ranked.features.directVisibility).toBeLessThanOrEqual(1);
      expect(ranked.features.proxyVisibility).toBeGreaterThanOrEqual(0);
      expect(ranked.features.proxyVisibility).toBeLessThanOrEqual(1);
      expect(ranked.features.topologyProximity).toBeGreaterThanOrEqual(0);
      expect(ranked.features.topologyProximity).toBeLessThanOrEqual(1);
      expect(ranked.features.checkpointDemand).toBeGreaterThanOrEqual(0);
      expect(ranked.features.checkpointDemand).toBeLessThanOrEqual(1);
      expect(ranked.features.signalDemand).toBeGreaterThanOrEqual(0);
      expect(ranked.features.signalDemand).toBeLessThanOrEqual(1);
      expect(ranked.features.shellDemand).toBeGreaterThanOrEqual(0);
      expect(ranked.features.shellDemand).toBeLessThanOrEqual(1);
      expect(ranked.features.unresolvedNeed).toBeGreaterThanOrEqual(0);
      expect(ranked.features.unresolvedNeed).toBeLessThanOrEqual(1);
    }
  });
});
