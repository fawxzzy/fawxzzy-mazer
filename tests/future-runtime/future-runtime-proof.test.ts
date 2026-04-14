import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

interface FutureRuntimeModule {
  FUTURE_RUNTIME_ARTIFACT_ROOT: string;
  FUTURE_RUNTIME_BASELINE_POINTER: string;
  buildFutureRuntimeSemanticScore: (input: {
    metadataSeed: {
      scenario: any;
      viewport: any;
      runId: string;
    };
    sceneScores: any[];
  }) => any;
  evaluateFuturePhaserSnapshot: (snapshot: any) => any;
  evaluatePlanet3DFrame: (frame: any) => any;
}

interface PacketsModule {
  resolveBaselinePointerPath: (repoRoot: string, baselinePointerRelative?: string) => string;
}

const loadHelpers = async (): Promise<{
  futureRuntime: FutureRuntimeModule;
  packets: PacketsModule;
}> => {
  // @ts-expect-error The helper modules are plain .mjs files without TS declarations.
  const futureRuntime = await import('../../tools/visual-pipeline/futureRuntime.mjs');
  // @ts-expect-error The helper modules are plain .mjs files without TS declarations.
  const packets = await import('../../tools/visual-pipeline/packets.mjs');
  return {
    futureRuntime: futureRuntime as FutureRuntimeModule,
    packets: packets as PacketsModule
  };
};

describe('future runtime proof contract', () => {
  test('builds passing semantic scores from phaser and planet3d runtime truth', async () => {
    const { futureRuntime } = await loadHelpers();
    const phaserSnapshot = {
      currentStep: 3,
      currentTileId: 'goal',
      currentHeading: 'north',
      contentProof: {
        trapInferencePass: true,
        wardenReadabilityPass: true,
        itemProxyPass: true,
        puzzleProxyPass: true,
        signalOverloadPass: true
      },
      results: [
        {
          step: 3,
          observation: {
            currentTileLabel: 'Goal',
            observation: {
              currentTileId: 'goal',
              goal: {
                visible: true
              }
            }
          },
          trail: {
            trailHeadTileId: 'goal'
          },
          decision: {
            goalVisible: true
          }
        }
      ],
      intentDeliveries: [
        {
          bus: {
            records: [
              { summary: 'Runner reaches the goal' },
              { summary: 'Maze confirms the gate' }
            ],
            debouncedWorldPingCount: 1,
            debouncedEventCount: 2
          }
        }
      ],
      episodeDeliveries: [
        {
          latestEpisode: {
            step: 3
          }
        }
      ]
    };
    const planetFrame = {
      step: 4,
      rotationState: 'north',
      contentProof: {
        trapInferencePass: true,
        wardenReadabilityPass: true,
        itemProxyPass: true,
        puzzleProxyPass: true,
        signalOverloadPass: true
      },
      player: {
        tileId: 'goal',
        label: 'Core destination'
      },
      objectiveProxy: {
        visible: true
      },
      trail: {
        headTileId: 'goal',
        points: []
      },
      intentFeed: {
        entries: [
          { step: 4, speaker: 'Runner', summary: 'Core projection reached', importance: 'high' }
        ],
        worldPings: [
          { id: 'ping-1', label: 'Gate aligned', importance: 'medium' }
        ],
        primaryPlacement: 'screen-space'
      }
    };

    const phaserScene = futureRuntime.evaluateFuturePhaserSnapshot(phaserSnapshot);
    const planetScene = futureRuntime.evaluatePlanet3DFrame(planetFrame);
    const score = futureRuntime.buildFutureRuntimeSemanticScore({
      metadataSeed: {
        scenario: {
          id: 'future-runtime-proof',
          label: 'Future runtime proof',
          kind: 'mixed',
          motion: true,
          route: '/future'
        },
        viewport: {
          id: 'desktop',
          label: 'Desktop',
          width: 1440,
          height: 900
        },
        runId: 'run-1'
      },
      sceneScores: [phaserScene, planetScene]
    });

    expect(phaserScene.passed).toBe(true);
    expect(planetScene.passed).toBe(true);
    expect(score.summary.passed).toBe(true);
    expect(score.gates.playerReadableEveryScene).toBe(true);
    expect(score.gates.objectiveProxyVisibleEveryScene).toBe(true);
    expect(score.gates.intentFeedReadableEveryScene).toBe(true);
    expect(score.gates.worldPingSubordinateEveryScene).toBe(true);
    expect(score.gates.rotationRecoveredEveryScene).toBe(true);
    expect(score.gates.trapInferencePassEveryScene).toBe(true);
    expect(score.gates.wardenReadabilityPassEveryScene).toBe(true);
    expect(score.gates.itemProxyPassEveryScene).toBe(true);
    expect(score.gates.puzzleProxyPassEveryScene).toBe(true);
    expect(score.gates.signalOverloadPassEveryScene).toBe(true);
  });

  test('judges future-phaser intent readability from the visible tail of the feed', async () => {
    const { futureRuntime } = await loadHelpers();
    const scene = futureRuntime.evaluateFuturePhaserSnapshot({
      currentStep: 6,
      currentTileId: 'goal',
      currentHeading: 'north',
      results: [
        {
          step: 6,
          observation: {
            currentTileLabel: 'Goal',
            observation: {
              currentTileId: 'goal',
              goal: {
                visible: true
              }
            }
          },
          trail: {
            trailHeadTileId: 'goal'
          },
          decision: {
            goalVisible: true
          }
        }
      ],
      intentDeliveries: [
        {
          bus: {
            records: [
              { summary: 'Opening note' },
              { summary: 'Middle note' },
              { summary: 'Tail note 1' },
              { summary: 'Tail note 2' },
              { summary: 'Tail note 3' }
            ],
            debouncedWorldPingCount: 2,
            debouncedEventCount: 5
          }
        }
      ],
      episodeDeliveries: [
        {
          latestEpisode: {
            step: 6
          }
        }
      ]
    });

    expect(scene.intentFeedReadable).toBe(true);
    expect(scene.diagnostics.visibleIntentRecordCount).toBe(3);
    expect(scene.diagnostics.intentHistoryCount).toBe(5);
  });

  test('fails when the future runtime loses rotation recovery and world-ping subordination', async () => {
    const { futureRuntime } = await loadHelpers();
    const score = futureRuntime.buildFutureRuntimeSemanticScore({
      metadataSeed: {
        scenario: {
          id: 'broken-runtime',
          label: 'Broken runtime',
          kind: 'planet3d',
          motion: true,
          route: '/planet3d.html'
        },
        viewport: {
          id: 'desktop',
          label: 'Desktop',
          width: 1440,
          height: 900
        },
        runId: 'run-2'
      },
      sceneScores: [
        futureRuntime.evaluatePlanet3DFrame({
          step: 2,
          rotationState: 'east',
          player: {
            tileId: 'gallery',
            label: 'Gallery arc'
          },
          objectiveProxy: {
            visible: false
          },
          trail: {
            headTileId: 'gallery',
            points: []
          },
          intentFeed: {
            entries: [
              { step: 2, speaker: 'Runner', summary: 'Gallery arc', importance: 'medium' }
            ],
            worldPings: [
              { id: 'ping-1', label: 'Gate aligned', importance: 'medium' },
              { id: 'ping-2', label: 'Gate aligned', importance: 'medium' }
            ],
            primaryPlacement: 'screen-space'
          }
        })
      ]
    });

    expect(score.summary.passed).toBe(false);
    expect(score.failures).toContain('rotation-recovered-every-scene');
    expect(score.failures).toContain('world-ping-subordinate-every-scene');
  });

  test('keeps the future runtime baseline pointer separate from the visual-proof baseline', async () => {
    const { futureRuntime, packets } = await loadHelpers();
    const repoRoot = resolve(process.cwd());
    expect(packets.resolveBaselinePointerPath(repoRoot)).toBe(resolve(repoRoot, 'artifacts/visual/baseline.json'));
    expect(packets.resolveBaselinePointerPath(repoRoot, futureRuntime.FUTURE_RUNTIME_BASELINE_POINTER)).toBe(resolve(repoRoot, futureRuntime.FUTURE_RUNTIME_BASELINE_POINTER));
    expect(futureRuntime.FUTURE_RUNTIME_ARTIFACT_ROOT).toBe('tmp/captures/mazer-future-runtime');
  });
});
