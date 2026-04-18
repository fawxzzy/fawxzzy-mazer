import { describe, expect, test } from 'vitest';
// @ts-ignore Vitest imports the observer script directly for a focused helper test.
import {
  buildFeedTimelineFromRuntimeSamples,
  buildRuntimeSummary
} from '../../scripts/analysis/capture-runtime-observe.mjs';

describe('capture-runtime-observe', () => {
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
});
