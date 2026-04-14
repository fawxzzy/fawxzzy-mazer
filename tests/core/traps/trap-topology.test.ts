import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  TrapTopologySystem,
  type TrapContract,
  type TrapTopologyObservation
} from '../../../src/mazer-core/traps';

const makeObservation = (
  step: number,
  overrides: Partial<TrapTopologyObservation> = {}
): TrapTopologyObservation => ({
  step,
  currentTileId: overrides.currentTileId ?? 'start',
  rotationPhase: overrides.rotationPhase ?? 'north',
  activeJunctionIds: overrides.activeJunctionIds ?? [],
  activeLoopIds: overrides.activeLoopIds ?? [],
  activeCheckpointIds: overrides.activeCheckpointIds ?? [],
  visibleLandmarkIds: overrides.visibleLandmarkIds ?? [],
  visibleProxyIds: overrides.visibleProxyIds ?? [],
  nearbyConnectorIds: overrides.nearbyConnectorIds ?? [],
  traversedConnectorId: overrides.traversedConnectorId ?? null
});

const contracts: TrapContract[] = [
  {
    id: 'junction-spike',
    label: 'Junction Spike',
    severity: 'high',
    anchor: {
      kind: 'junction',
      junctionId: 'junction-alpha',
      tileId: 'junction-a'
    },
    visibility: {
      landmarkId: 'hazard-marker-j1'
    },
    cooldownSteps: 2
  },
  {
    id: 'loop-net',
    label: 'Loop Net',
    severity: 'medium',
    anchor: {
      kind: 'loop',
      loopId: 'loop-west',
      tileId: 'loop-return'
    },
    visibility: {
      connectorId: 'connector-loop-west'
    }
  },
  {
    id: 'checkpoint-shock',
    label: 'Checkpoint Shock',
    severity: 'medium',
    anchor: {
      kind: 'checkpoint',
      checkpointId: 'checkpoint-west',
      tileId: 'checkpoint-west'
    },
    visibility: {
      proxyId: 'proxy-checkpoint-west'
    },
    cooldownSteps: 1
  },
  {
    id: 'phase-pulse',
    label: 'Phase Pulse',
    severity: 'low',
    anchor: {
      kind: 'rotation-phase',
      rotationPhase: 'east',
      tileId: 'orbital-lane'
    },
    visibility: {
      timing: {
        period: 4,
        activeResidues: [1],
        label: 'phase pulse'
      }
    },
    cooldownSteps: 1
  }
];

describe('TrapTopologySystem', () => {
  test('validates topology-bound contracts and rejects hidden-state traps', () => {
    expect(() => new TrapTopologySystem([
      {
        id: 'hidden-trap',
        label: 'Hidden Trap',
        severity: 'high',
        anchor: {
          kind: 'junction',
          junctionId: 'junction-alpha'
        },
        visibility: {}
      }
    ])).toThrow(/inferable visibility signal/i);

    expect(() => new TrapTopologySystem([
      {
        id: 'duplicate',
        label: 'A',
        severity: 'low',
        anchor: {
          kind: 'loop',
          loopId: 'loop-a'
        },
        visibility: {
          connectorId: 'loop-gate'
        }
      },
      {
        id: 'duplicate',
        label: 'B',
        severity: 'low',
        anchor: {
          kind: 'checkpoint',
          checkpointId: 'checkpoint-a'
        },
        visibility: {
          proxyId: 'proxy-a'
        }
      }
    ])).toThrow(/duplicate trap id/i);
  });

  test('triggers only when topology anchors and inferable signals both match', () => {
    const system = new TrapTopologySystem(contracts);

    const step0 = system.evaluate(makeObservation(0));
    const step1 = system.evaluate(makeObservation(1, {
      currentTileId: 'junction-a',
      activeJunctionIds: ['junction-alpha'],
      visibleLandmarkIds: ['hazard-marker-j1']
    }));
    const step2 = system.evaluate(makeObservation(2, {
      currentTileId: 'junction-a',
      activeJunctionIds: ['junction-alpha'],
      visibleLandmarkIds: ['hazard-marker-j1']
    }));
    const step3 = system.evaluate(makeObservation(3, {
      currentTileId: 'loop-return',
      activeLoopIds: ['loop-west'],
      nearbyConnectorIds: ['connector-loop-west']
    }));
    const step4 = system.evaluate(makeObservation(4, {
      currentTileId: 'checkpoint-west',
      activeCheckpointIds: ['checkpoint-west'],
      visibleProxyIds: ['proxy-checkpoint-west']
    }));
    const step5 = system.evaluate(makeObservation(5, {
      currentTileId: 'orbital-lane',
      rotationPhase: 'east'
    }));

    expect(step0.triggered).toHaveLength(0);
    expect(step1.triggered.map((entry) => entry.trapId)).toEqual(['junction-spike']);
    expect(step1.triggered[0]?.visibleSignals.landmark).toBe(true);
    expect(step2.triggered).toHaveLength(0);
    expect(step2.states.find((state) => state.trapId === 'junction-spike')?.status).toBe('cooldown');
    expect(step3.triggered.map((entry) => entry.trapId)).toEqual(['loop-net']);
    expect(step3.triggered[0]?.visibleSignals.connector).toBe(true);
    expect(step4.triggered.map((entry) => entry.trapId)).toEqual(['checkpoint-shock']);
    expect(step4.triggered[0]?.visibleSignals.proxy).toBe(true);
    expect(step5.triggered.map((entry) => entry.trapId)).toEqual(['phase-pulse']);
    expect(step5.triggered[0]?.visibleSignals.timing).toBe(true);

    expect(system.getSnapshot().triggerCounts).toEqual({
      'junction-spike': 1,
      'loop-net': 1,
      'checkpoint-shock': 1,
      'phase-pulse': 1
    });
  });

  test('blocks anchor-matched traps when inferable signals are absent', () => {
    const system = new TrapTopologySystem([
      {
        id: 'checkpoint-surge',
        label: 'Checkpoint Surge',
        severity: 'high',
        anchor: {
          kind: 'checkpoint',
          checkpointId: 'checkpoint-east',
          tileId: 'checkpoint-east'
        },
        visibility: {
          proxyId: 'proxy-checkpoint-east'
        }
      }
    ]);

    const result = system.evaluate(makeObservation(12, {
      currentTileId: 'checkpoint-east',
      activeCheckpointIds: ['checkpoint-east'],
      visibleProxyIds: []
    }));

    expect(result.triggered).toHaveLength(0);
    expect(result.blockedHiddenStateTrapIds).toEqual(['checkpoint-surge']);
    expect(result.states[0]?.anchorMatched).toBe(true);
    expect(result.states[0]?.inferable).toBe(false);
  });

  test('keeps replay/logging deterministic for identical observation sequences', () => {
    const sequence = [
      makeObservation(0),
      makeObservation(1, {
        currentTileId: 'junction-a',
        activeJunctionIds: ['junction-alpha'],
        visibleLandmarkIds: ['hazard-marker-j1']
      }),
      makeObservation(2, {
        currentTileId: 'loop-return',
        activeLoopIds: ['loop-west'],
        nearbyConnectorIds: ['connector-loop-west']
      }),
      makeObservation(3, {
        currentTileId: 'checkpoint-west',
        activeCheckpointIds: ['checkpoint-west'],
        visibleProxyIds: ['proxy-checkpoint-west']
      }),
      makeObservation(5, {
        currentTileId: 'orbital-lane',
        rotationPhase: 'east'
      })
    ];

    const first = new TrapTopologySystem(contracts);
    const second = new TrapTopologySystem(contracts);

    for (const observation of sequence) {
      first.evaluate(observation);
      second.evaluate(observation);
    }

    expect(first.getLog()).toEqual(second.getLog());
    expect(first.getSnapshot()).toEqual(second.getSnapshot());
  });

  test('stays bounded away from proof/runtime lane imports', () => {
    const boundedFiles = [
      '../../../src/mazer-core/traps/index.ts',
      '../../../src/mazer-core/traps/types.ts',
      '../../../src/mazer-core/traps/TrapTopologySystem.ts'
    ];

    for (const relativePath of boundedFiles) {
      const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
      expect(source).not.toMatch(/from\s+['"][^'"]*(visual-proof|topology-proof|manifestLoader|manifestTypes|proofRuntime|future-runtime)['"]/);
    }
  });
});
