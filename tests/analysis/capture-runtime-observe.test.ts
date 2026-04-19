import { describe, expect, test } from 'vitest';
// @ts-ignore Vitest imports the observer script directly for a focused helper test.
import {
  buildFeedTimelineFromRuntimeSamples,
  buildTelemetrySummaryFromRuntimeSamples,
  buildRuntimeSummary,
  resolveRuntimeObserveBaseUrl
} from '../../scripts/analysis/capture-runtime-observe.mjs';

describe('capture-runtime-observe', () => {
  test('builds runtime observe experiment metadata from CLI-style toggles', async () => {
    const { buildRuntimeObserveExperiment } = await import('../../scripts/analysis/capture-runtime-observe.mjs');

    const experiment = buildRuntimeObserveExperiment({
      label: 'pacing-check',
      runId: 'run-42',
      pacing: '1.0x',
      thoughtDensity: 'richer',
      failCardTiming: '1.8s',
      memoryBeat: 'off',
      trapTelegraph: 'stronger'
    });

    expect(experiment.variantId).toBe('p100-thought-richer-fail-18-memory-off-trap-stronger');
    expect(experiment.toggles).toEqual({
      pacing: '1.0x',
      thoughtDensity: 'richer',
      failCardTiming: '1.8s',
      memoryBeat: 'off',
      trapTelegraph: 'stronger'
    });
  });

  test('maps play-mode labels to the play shell without overriding explicit routes', () => {
    expect(resolveRuntimeObserveBaseUrl('http://127.0.0.1:4173', 'play-mode-a')).toBe(
      'http://127.0.0.1:4173/?mode=play&theme=aurora'
    );
    expect(resolveRuntimeObserveBaseUrl('http://127.0.0.1:4173/?theme=noir', 'play-mode-a')).toBe(
      'http://127.0.0.1:4173/?theme=noir'
    );
  });

  test('builds feed metrics from structured runtime diagnostics samples', () => {
    const feed = buildFeedTimelineFromRuntimeSamples([
      {
        elapsedMs: 0,
        feed: {
          visibleEntryCount: 0,
          visibleEntries: []
        }
      },
      {
        elapsedMs: 1000,
        feed: {
          visibleEntryCount: 1,
          visibleEntries: [{
            speaker: 'Runner',
            kind: 'frontier-chosen',
            importance: 'low',
            summary: 'Scanning West branch from Junction A.',
            slot: 0
          }]
        }
      },
      {
        elapsedMs: 2000,
        feed: {
          visibleEntryCount: 1,
          visibleEntries: [{
            speaker: 'Runner',
            kind: 'frontier-chosen',
            importance: 'low',
            summary: 'Scanning West branch from Junction A.',
            slot: 0
          }]
        }
      },
      {
        elapsedMs: 3000,
        feed: {
          visibleEntryCount: 2,
          visibleEntries: [
            {
              speaker: 'TrapNet',
              kind: 'trap-inferred',
              importance: 'high',
              summary: 'Reading trap rhythm from Junction A.',
              slot: 0
            },
            {
              speaker: 'Runner',
              kind: 'frontier-chosen',
              importance: 'low',
              summary: 'Scanning West branch from Junction A.',
              slot: 1
            }
          ]
        }
      },
      {
        elapsedMs: 4000,
        feed: {
          visibleEntryCount: 2,
          visibleEntries: [
            {
              speaker: 'TrapNet',
              kind: 'trap-inferred',
              importance: 'high',
              summary: 'Reading trap rhythm from Junction A.',
              slot: 0
            },
            {
              speaker: 'Runner',
              kind: 'frontier-chosen',
              importance: 'low',
              summary: 'Scanning West branch from Junction A.',
              slot: 1
            }
          ]
        }
      }
    ]);

    expect(feed.sampleCount).toBe(5);
    expect(feed.snapshotCount).toBe(2);
    expect(feed.visibleEntryCount.max).toBe(2);
    expect(feed.uniqueMessageCount).toBe(2);
    expect(feed.maxDuplicateStreak).toBe(2);
    expect(feed.maxUnchangedRunMs).toBe(2000);
    expect(feed.topMessages[0]?.text).toBe('Runner Scanning West branch from Junction A.');
  });

  test('rolls visibility counters across route-reset epochs instead of trusting the last scene', () => {
    const summary = buildRuntimeSummary([
      {
        captureEpoch: 0,
        sceneInstanceId: 1,
        revision: 4,
        runtimeMs: 1200,
        performance: {
          recentAverageFrameMs: 16,
          worstRecentFrameMs: 22,
          worstFrameMs: 24,
          spikeCount: 0,
          estimatedFps: 60
        },
        resources: {
          activeTweens: 1,
          activeTimers: 2,
          listenerCount: 3,
          trailSegmentCount: 4,
          intentEntryCount: 1,
          deferredVisualTasksRemaining: 0,
          background: {
            moving: 5
          }
        },
        visibility: {
          hidden: false,
          changeCount: 1,
          suspendCount: 0
        }
      },
      {
        captureEpoch: 0,
        sceneInstanceId: 1,
        revision: 8,
        runtimeMs: 3200,
        performance: {
          recentAverageFrameMs: 17,
          worstRecentFrameMs: 28,
          worstFrameMs: 31,
          spikeCount: 1,
          estimatedFps: 58
        },
        resources: {
          activeTweens: 1,
          activeTimers: 2,
          listenerCount: 3,
          trailSegmentCount: 4,
          intentEntryCount: 1,
          deferredVisualTasksRemaining: 0,
          background: {
            moving: 5
          }
        },
        visibility: {
          hidden: true,
          changeCount: 3,
          suspendCount: 2
        }
      },
      {
        captureEpoch: 1,
        sceneInstanceId: 1,
        revision: 2,
        runtimeMs: 400,
        performance: {
          recentAverageFrameMs: 15,
          worstRecentFrameMs: 21,
          worstFrameMs: 23,
          spikeCount: 0,
          estimatedFps: 61
        },
        resources: {
          activeTweens: 1,
          activeTimers: 2,
          listenerCount: 3,
          trailSegmentCount: 4,
          intentEntryCount: 1,
          deferredVisualTasksRemaining: 0,
          background: {
            moving: 5
          }
        },
        visibility: {
          hidden: false,
          changeCount: 0,
          suspendCount: 0
        }
      },
      {
        captureEpoch: 1,
        sceneInstanceId: 1,
        revision: 6,
        runtimeMs: 1800,
        performance: {
          recentAverageFrameMs: 16,
          worstRecentFrameMs: 24,
          worstFrameMs: 27,
          spikeCount: 0,
          estimatedFps: 60
        },
        resources: {
          activeTweens: 1,
          activeTimers: 2,
          listenerCount: 3,
          trailSegmentCount: 4,
          intentEntryCount: 1,
          deferredVisualTasksRemaining: 0,
          background: {
            moving: 5
          }
        },
        visibility: {
          hidden: true,
          changeCount: 2,
          suspendCount: 1
        }
      }
    ]);

    expect(summary.visibility.hiddenSampleCount).toBe(2);
    expect(summary.visibility.changeCount).toBe(5);
    expect(summary.visibility.suspendCount).toBe(3);
    expect(summary.visibility.epochCount).toBe(2);
    expect(summary.visibility.epochs).toEqual([
      expect.objectContaining({
        key: 'capture:0',
        captureEpoch: 0,
        changeCount: 3,
        suspendCount: 2
      }),
      expect.objectContaining({
        key: 'capture:1',
        captureEpoch: 1,
        changeCount: 2,
        suspendCount: 1
      })
    ]);
  });

  test('collects semantic telemetry summaries from sampled runtime diagnostics', () => {
    const telemetry = buildTelemetrySummaryFromRuntimeSamples([
      {
        telemetry: {
          events: [
            {
              eventId: 'evt-1',
              kind: 'run_started',
              runId: 'run-1',
              attemptNo: 1,
              elapsedMs: 0,
              createdAt: '2026-04-18T10:00:00.000Z',
              mode: 'watch',
              payload: { phase: 'pre-roll' }
            },
            {
              eventId: 'evt-2',
              kind: 'thought_shown',
              runId: 'run-1',
              attemptNo: 1,
              elapsedMs: 1000,
              createdAt: '2026-04-18T10:00:01.000Z',
              payload: { compactThought: 'Scanning branch.', density: 'sparse' }
            },
            {
              eventId: 'evt-2a',
              kind: 'control_used',
              runId: 'run-1',
              attemptNo: 1,
              elapsedMs: 1200,
              createdAt: '2026-04-18T10:00:01.200Z',
              mode: 'play',
              payload: { control: 'keyboard', actionKind: 'move_left', source: 'play-shell' }
            },
            {
              eventId: 'evt-2b',
              kind: 'control_used',
              runId: 'run-1',
              attemptNo: 1,
              elapsedMs: 1400,
              createdAt: '2026-04-18T10:00:01.400Z',
              mode: 'play',
              payload: { control: 'pause', actionKind: 'pause', source: 'play-shell' }
            },
            {
              eventId: 'evt-2c',
              kind: 'control_used',
              runId: 'run-1',
              attemptNo: 1,
              elapsedMs: 1600,
              createdAt: '2026-04-18T10:00:01.600Z',
              mode: 'play',
              payload: { control: 'toggle_thoughts', actionKind: 'toggle_thoughts', source: 'play-shell' }
            }
          ]
        },
        projection: {
          runId: 'run-1',
          mazeId: 'maze-1',
          attemptNo: 1,
          elapsedMs: 1000,
          state: 'watching',
          failReason: null,
          compactThought: 'Scanning branch.',
          riskLevel: 'medium',
          progressPct: 24,
          miniMapHash: 'abc12345',
          updatedAt: '2026-04-18T10:00:01.000Z'
        }
      },
      {
        telemetry: {
          events: [
            {
              eventId: 'evt-2',
              kind: 'thought_shown',
              runId: 'run-1',
              attemptNo: 1,
              elapsedMs: 1000,
              createdAt: '2026-04-18T10:00:01.000Z',
              payload: { compactThought: 'Scanning branch.', density: 'sparse' }
            },
            {
              eventId: 'evt-3',
              kind: 'fail_reason',
              runId: 'run-1',
              attemptNo: 1,
              elapsedMs: 3200,
              createdAt: '2026-04-18T10:00:03.200Z',
              mode: 'play',
              payload: { failReason: 'Gate closed.', stage: 'reflection-beat' }
            },
            {
              eventId: 'evt-4',
              kind: 'run_started',
              runId: 'run-2',
              attemptNo: 2,
              elapsedMs: 5200,
              createdAt: '2026-04-18T10:00:05.200Z',
              mode: 'play',
              payload: { phase: 'pre-roll' }
            }
          ]
        }
      }
    ]);

    expect(telemetry.events).toHaveLength(7);
    expect(telemetry.summary.eventCount).toBe(7);
    expect(telemetry.summary.eventCounts.run_started).toBe(2);
    expect(telemetry.summary.failToRetryContinuation.averageMs).toBe(2000);
    expect(telemetry.summary.thoughtDwell.thoughtCount).toBe(1);
    expect((telemetry as any).playMetrics).toMatchObject({
      controlUsedCount: 3,
      controlUsedByControl: {
        keyboard: 1,
        touch: 0,
        restart: 0,
        pause: 1,
        toggle_thoughts: 1
      },
      controlUsedByAction: {
        move: 1,
        pause: 1,
        restart: 0,
        toggle_thoughts: 1
      },
      watchToPlaySwitchCount: 0,
      playFailureCount: 1,
      playFailToRetryContinuationCount: 1
    });
    expect((telemetry as any).mode).toBe('play');
    expect((telemetry as any).privacyMode).toBe('full');
    expect((telemetry as any).kpis.runsWatchedPerSession).toBe(2);
    expect((telemetry as any).kpis.controlUsedCount).toBe(3);
    expect((telemetry as any).kpis.widgetAttachRate).toBe(0);
    expect(telemetry.latestProjection).toMatchObject({
      runId: 'run-1',
      state: 'watching'
    });
  });

  test('routes play-mode-b labels onto the shared play shell', async () => {
    const { resolveRuntimeObserveBaseUrl } = await import('../../scripts/analysis/capture-runtime-observe.mjs');

    expect(resolveRuntimeObserveBaseUrl('http://127.0.0.1:4173', 'play-mode-b')).toBe('http://127.0.0.1:4173/?mode=play&theme=aurora');
  });

  test('threads watch-pass funnel data through runtime observe summaries', () => {
    const telemetry = buildTelemetrySummaryFromRuntimeSamples([
      {
        telemetry: {
          events: [
            {
              eventId: 'evt-a',
              kind: 'paywall_viewed',
              runId: 'watch-pass-session',
              attemptNo: 1,
              elapsedMs: 0,
              createdAt: '2026-04-18T10:00:00.000Z',
              privacyMode: 'compact',
              experimentId: 'p80-thought-sparse-fail-13-memory-on-trap-baseline',
              mode: 'watch',
              payload: {
                entryPoint: 'watch-pass-preview',
                ctaLabel: 'Watch Pass preview',
                sourceCta: 'watch-pass-preview'
              }
            },
            {
              eventId: 'evt-b',
              kind: 'plan_selected',
              runId: 'watch-pass-session',
              attemptNo: 1,
              elapsedMs: 300,
              createdAt: '2026-04-18T10:00:00.300Z',
              privacyMode: 'compact',
              experimentId: 'p80-thought-sparse-fail-13-memory-on-trap-baseline',
              mode: 'play',
              payload: {
                planId: 'yearly',
                sourceCta: 'watch-pass-preview',
                emphasis: 'emphasized'
              }
            },
            {
              eventId: 'evt-c',
              kind: 'purchase_completed',
              runId: 'watch-pass-session',
              attemptNo: 1,
              elapsedMs: 600,
              createdAt: '2026-04-18T10:00:00.600Z',
              privacyMode: 'compact',
              mode: 'play',
              payload: {
                sku: 'watch-pass-yearly',
                origin: 'preview-placeholder',
                sourceCta: 'watch-pass-preview'
              }
            }
          ]
        }
      }
    ]);

    expect((telemetry as any).sourceCta).toBe('watch-pass-preview');
    expect((telemetry as any).sourceCtas).toEqual(['watch-pass-preview']);
    expect((telemetry as any).planIds).toEqual(['yearly']);
    expect((telemetry as any).mode).toBe('play');
    expect((telemetry as any).watchPass).toMatchObject({
      mode: 'play',
      sourceCta: 'watch-pass-preview',
      paywallViewCount: 1,
      planSelectedCount: 1,
      paywallViewToPlanSelect: 1,
      paywallViewToPurchaseCompleted: 1,
      purchaseCompletedCount: 1
    });
    expect((telemetry as any).kpis.paywall_view_to_plan_select).toBe(1);
    expect((telemetry as any).kpis.paywall_view_to_purchase_completed).toBe(1);
  });
});
