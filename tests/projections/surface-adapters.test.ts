import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

import {
  createActiveRunTrackerProjection,
  createAmbientTileProjection,
  createSnapshotCardProjection,
  writeSurfaceProjectionArtifactSet,
  type RunProjectionInput
} from '../../src/projections';

const baseInput: RunProjectionInput = {
  runId: 'proof-run-17',
  mazeId: 'maze-proof',
  attemptNo: 4,
  elapsedMs: 33_400,
  state: 'building',
  failReason: 'The gate cadence closed before the commit landed.',
  compactThought: 'Watching the timing lane before the branch commit.',
  riskLevel: 'critical',
  progressPct: 63.2,
  miniMapHash: 'proof-2fd1',
  updatedAt: '2026-04-18T12:00:00.000Z'
};

describe('surface adapters', () => {
  test('maps run projections into snapshot card, tracker, and ambient tile outputs', () => {
    const snapshot = createSnapshotCardProjection(baseInput, 'full');
    const tracker = createActiveRunTrackerProjection(baseInput, 'compact');
    const ambient = createAmbientTileProjection({
      ...baseInput,
      state: 'retrying'
    }, 'private');

    expect(snapshot).toMatchObject({
      surface: 'snapshot-card',
      mode: 'full',
      state: 'building',
      eyebrow: 'Building maze',
      miniMapHash: 'proof-2fd1'
    });
    expect(tracker).toMatchObject({
      surface: 'active-run-tracker',
      mode: 'compact',
      primaryLabel: 'Build reveal',
      elapsedLabel: '00:33'
    });
    expect(ambient).toMatchObject({
      surface: 'ambient-tile',
      mode: 'private',
      state: 'retrying',
      glyph: '><',
      narrative: null
    });
  });

  test('writes stable local proof artifacts for every reduced surface and privacy mode', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mazer-surface-proof-'));

    try {
      const manifest = await writeSurfaceProjectionArtifactSet(dir, {
        ...baseInput,
        state: 'failed'
      });

      expect(manifest['snapshot-card'].full).toContain('snapshot-card.full.json');
      expect(manifest['active-run-tracker'].compact).toContain('active-run-tracker.compact.json');
      expect(manifest['ambient-tile'].private).toContain('ambient-tile.private.json');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
