import { describe, expect, test } from 'vitest';

import { createActiveRunTrackerProjection } from '../../src/projections/surfaceAdapters.ts';
import { renderActiveRunTrackerSurface } from '../../src/proof-surfaces/surfaces/activeRunTracker.ts';
import type { RunProjectionInput } from '../../src/projections/runProjection.ts';

const baseInput: RunProjectionInput = {
  runId: 'run-proof-42',
  mazeId: 'maze-17',
  attemptNo: 7,
  elapsedMs: 33_400,
  state: 'building',
  failReason: 'The gate cadence closed before the commit landed.',
  compactThought: 'Watching the timing lane before the branch commit.',
  riskLevel: 'critical',
  progressPct: 63.2,
  miniMapHash: 'proof-2fd1',
  updatedAt: '2026-04-18T12:00:00.000Z'
};

describe('active run tracker proof surface', () => {
  test('renders a readable reduced lifecycle surface across the core run states', () => {
    const states: Array<[RunProjectionInput['state'], string, string]> = [
      ['preroll', 'Pre-roll', 'Pre-roll'],
      ['building', 'Building', 'Building'],
      ['watching', 'Watching live', 'Watching live'],
      ['waiting', 'Waiting', 'Waiting'],
      ['failed', 'Failed', 'Failed'],
      ['retrying', 'Retrying', 'Retrying'],
      ['cleared', 'Cleared', 'Cleared']
    ];

    for (const [state, lifecycleLabel, stateLabel] of states) {
      const projection = createActiveRunTrackerProjection({
        ...baseInput,
        state
      }, 'full');

      const html = renderActiveRunTrackerSurface(projection);

      expect(html).toContain('data-surface="active-run-tracker"');
      expect(html).toContain(`data-mode="full"`);
      expect(html).toContain(`data-state="${state}"`);
      expect(html).toContain(`aria-label="Active run tracker, ${stateLabel}, 63.2% complete"`);
      expect(html).toContain('Active run');
      expect(html).toContain(lifecycleLabel);
      expect(html).toContain('00:33');
      expect(html).toContain('63.2%');
      expect(html).toContain('Tap-through placeholder');
    }
  });

  test('keeps the proof surface privacy-safe while still showing the ended failure reason in public modes', () => {
    const fullProjection = createActiveRunTrackerProjection({
      ...baseInput,
      state: 'failed'
    }, 'full');
    const privateProjection = createActiveRunTrackerProjection({
      ...baseInput,
      state: 'failed'
    }, 'private');

    const fullRender = renderActiveRunTrackerSurface(fullProjection);
    const privateRender = renderActiveRunTrackerSurface(privateProjection);

    expect(fullRender).toContain('The gate cadence closed before the commit landed');
    expect(fullRender).toContain('Maze maze-17');
    expect(fullRender).toContain('Fail hold');

    expect(privateRender).toContain('Private run');
    expect(privateRender).not.toContain('Maze maze-17');
    expect(privateRender).not.toContain('The gate cadence closed before the commit landed');
    expect(privateRender).not.toContain('Watching the timing lane before the branch commit.');
  });
});
