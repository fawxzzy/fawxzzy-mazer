import { describe, expect, test } from 'vitest';
// @ts-ignore Vitest imports the soak script directly for a focused helper test.
import { buildSummary } from '../../scripts/analysis/capture-runtime-soak.mjs';

describe('capture-runtime-soak', () => {
  test('keeps hidden and suspend rollups truthful across route-reset epochs', () => {
    const summary = buildSummary({
      samples: [
        {
          captureEpoch: 0,
          sceneInstanceId: 1,
          revision: 5,
          runtimeMs: 1100,
          performance: {
            recentAverageFrameMs: 16,
            worstFrameMs: 22,
            spikeCount: 0,
            estimatedFps: 60
          },
          resources: {
            activeTweens: 1,
            activeTimers: 2,
            listenerCount: 3,
            trailSegmentCount: 4,
            trailSegmentCap: 8,
            intentEntryCount: 1,
            intentEntryCap: 4,
            background: {
              moving: 5,
              movingCap: 8
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
          revision: 9,
          runtimeMs: 2600,
          performance: {
            recentAverageFrameMs: 18,
            worstFrameMs: 29,
            spikeCount: 1,
            estimatedFps: 56
          },
          resources: {
            activeTweens: 1,
            activeTimers: 2,
            listenerCount: 3,
            trailSegmentCount: 4,
            trailSegmentCap: 8,
            intentEntryCount: 1,
            intentEntryCap: 4,
            background: {
              moving: 5,
              movingCap: 8
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
          revision: 3,
          runtimeMs: 500,
          performance: {
            recentAverageFrameMs: 15,
            worstFrameMs: 21,
            spikeCount: 0,
            estimatedFps: 61
          },
          resources: {
            activeTweens: 1,
            activeTimers: 2,
            listenerCount: 3,
            trailSegmentCount: 4,
            trailSegmentCap: 8,
            intentEntryCount: 1,
            intentEntryCap: 4,
            background: {
              moving: 5,
              movingCap: 8
            }
          },
          visibility: {
            hidden: true,
            changeCount: 1,
            suspendCount: 1
          }
        }
      ],
      durationSeconds: 10,
      lowPower: false,
      restartCycles: 1,
      restartMode: 'route-reset',
      completedRestartCycles: 1,
      hiddenWindowMs: 1000
    });

    expect(summary.visibility.hiddenSampleCount).toBe(2);
    expect(summary.visibility.changeCount).toBe(4);
    expect(summary.visibility.suspendCount).toBe(3);
    expect(summary.visibility.epochCount).toBe(2);
    expect(summary.restart.pass).toBe(true);
  });
});
