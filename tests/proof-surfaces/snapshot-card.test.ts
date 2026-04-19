import { describe, expect, test } from 'vitest';

import { createSnapshotCardProjection, type SnapshotCardProjection } from '../../src/projections';
import { renderSnapshotCardSurface } from '../../src/proof-surfaces/surfaces/snapshotCard.ts';

const baseInput = {
  runId: 'run-20260418-09',
  mazeId: 'maze-7f',
  attemptNo: 4,
  elapsedMs: 33_400,
  state: 'building' as const,
  failReason: 'The gate cadence closed before the commit landed.',
  compactThought: 'Watching the timing lane before the branch commit.',
  riskLevel: 'critical' as const,
  progressPct: 63.2,
  miniMapHash: 'proof-2fd1',
  updatedAt: '2026-04-18T12:00:00.000Z'
};

describe('snapshot card proof surface', () => {
  test('renders a reduced glance surface for full, compact, and private modes', () => {
    const full = renderSnapshotCardSurface(createSnapshotCardProjection(baseInput, 'full'));
    const compact = renderSnapshotCardSurface(createSnapshotCardProjection(baseInput, 'compact'));
    const privateSurface = renderSnapshotCardSurface(createSnapshotCardProjection(baseInput, 'private'));

    expect(full).toContain('data-state="building"');
    expect(full).toContain('Maze maze-7f');
    expect(full).toContain('proof-2f');
    expect(full).toContain('Attempt 4');
    expect(full).toContain('Building maze');
    expect(full).toContain('Watching the timing lane before the branch commit');
    expect(full).toContain('Maze maze-7f - 63.2%');

    expect(compact).toContain('data-mode="compact"');
    expect(compact).toContain('Watching the timing lane before the bra...');
    expect(compact).toContain('Building maze');
    expect(compact).toContain('Attempt 4');
    expect(compact).toContain('Maze maze-7f');

    expect(privateSurface).toContain('data-mode="private"');
    expect(privateSurface).toContain('Private maze');
    expect(privateSurface).toContain('Thought hidden');
    expect(privateSurface).toContain('Private glance');
    expect(privateSurface).not.toContain('maze-7f');
    expect(privateSurface).not.toContain('proof-2fd1');
    expect(privateSurface).not.toContain('Watching the timing lane before the branch commit');
  });

  test('keeps lifecycle state labels readable across the reduced state set', () => {
    const expectations: Array<[SnapshotCardProjection['state'], string]> = [
      ['preroll', 'Queueing run'],
      ['building', 'Building maze'],
      ['watching', 'Watching live'],
      ['waiting', 'Holding frame'],
      ['failed', 'Trap readable'],
      ['retrying', 'Retrying route'],
      ['cleared', 'Run cleared']
    ];

    for (const [state, label] of expectations) {
      const surface = renderSnapshotCardSurface(createSnapshotCardProjection({
        ...baseInput,
        state
      }, 'compact'));

      expect(surface).toContain(`data-state="${state}"`);
      expect(surface).toContain(label);
    }
  });
});
