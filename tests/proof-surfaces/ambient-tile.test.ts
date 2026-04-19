import { describe, expect, test } from 'vitest';

import { createAmbientTileProjection, type RunProjectionInput } from '../../src/projections';
import { renderAmbientTileSurface } from '../../src/proof-surfaces/surfaces/ambientTile.ts';

const baseInput: RunProjectionInput = {
  runId: 'ambient-run-42',
  mazeId: 'maze-ambient',
  attemptNo: 7,
  elapsedMs: 51_200,
  state: 'building',
  failReason: 'The roofline drifted before the lane committed.',
  compactThought: 'Keeping the board readable while the lane settles.',
  riskLevel: 'medium',
  progressPct: 58.4,
  miniMapHash: 'amb-42',
  updatedAt: '2026-04-18T13:30:00.000Z'
};

describe('ambient tile proof surface', () => {
  test('renders the full surface with a calm vignette, state label, streak signal, and entry affordance', () => {
    const projection = createAmbientTileProjection(
      {
        ...baseInput,
        state: 'cleared',
        riskLevel: 'low',
        progressPct: 96.2
      },
      'full'
    );

    const result = renderAmbientTileSurface(projection);

    expect(result.surface).toBe('ambient-tile');
    expect(result.mode).toBe('full');
    expect(result.text).toEqual({
      tokenLabel: 'Maze vignette',
      stateLabel: 'Cleared',
      streakLabel: 'Win streak · steady',
      detailLabel: 'resolved 96%',
      entryLabel: 'Watch now'
    });
    expect(result.ariaLabel).toBe('Cleared. Win streak · steady. resolved 96%. Watch now');
    expect(result.html).toContain('ambient-tile__glyph');
    expect(result.html).toContain('data-token-label="Maze vignette"');
    expect(result.html).toContain('Win streak · steady');
    expect(result.html).toContain('resolved 96%');
    expect(result.html).toContain('Watch now');
  });

  test('compresses compact mode without turning the surface into a mini app', () => {
    const projection = createAmbientTileProjection(
      {
        ...baseInput,
        state: 'retrying',
        riskLevel: 'high',
        progressPct: 34.1
      },
      'compact'
    );

    const result = renderAmbientTileSurface(projection);

    expect(result.mode).toBe('compact');
    expect(result.text).toEqual({
      tokenLabel: 'Maze vignette',
      stateLabel: 'Retrying',
      streakLabel: 'Fail streak',
      detailLabel: null,
      entryLabel: 'Watch now'
    });
    expect(result.html).not.toContain('ambient-tile__detail');
    expect(result.html).toContain('Fail streak');
    expect(result.html).toContain('Watch now');
    expect(result.html.length).toBeLessThan(
      renderAmbientTileSurface(createAmbientTileProjection({ ...baseInput, state: 'cleared' }, 'full')).html.length
    );
  });

  test('keeps private mode useful while hiding reduced detail', () => {
    const projection = createAmbientTileProjection(
      {
        ...baseInput,
        state: 'failed',
        riskLevel: 'critical',
        progressPct: 11.5
      },
      'private'
    );

    const result = renderAmbientTileSurface(projection);

    expect(result.mode).toBe('private');
    expect(result.text).toEqual({
      tokenLabel: 'Maze vignette',
      stateLabel: 'Failed',
      streakLabel: 'Fail streak',
      detailLabel: null,
      entryLabel: 'Watch now'
    });
    expect(result.html).toContain('Failed');
    expect(result.html).toContain('Fail streak');
    expect(result.html).toContain('Watch now');
    expect(result.html).not.toContain('failed 11.5%');
    expect(result.html).not.toContain('maze-ambient');
  });
});
