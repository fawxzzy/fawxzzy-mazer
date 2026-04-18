import { describe, expect, test } from 'vitest';
// @ts-expect-error Vitest imports the observer script directly for a focused helper test.
import { buildFeedTimelineFromRuntimeSamples } from '../../scripts/analysis/capture-runtime-observe.mjs';

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
});
