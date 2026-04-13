import { describe, expect, test } from 'vitest';
import { TrailModel } from '../../../src/visual-proof/trail/TrailModel';
import { buildTrailPoints, renderTrailMarkup } from '../../../src/visual-proof/trail/TrailRenderer';

describe('trail model', () => {
  test('keeps trail head synced to the current player tile on every committed move', () => {
    const model = new TrailModel({ initialTileId: 'tile-a' });

    const first = model.tileCommitted('tile-b');
    expect(first.currentPlayerTileId).toBe('tile-b');
    expect(first.trailHeadTileId).toBe('tile-b');
    expect(first.occupancyHistory.at(-1)).toBe('tile-b');

    const second = model.tileCommitted('tile-c');
    expect(second.currentPlayerTileId).toBe('tile-c');
    expect(second.trailHeadTileId).toBe('tile-c');
    expect(second.occupancyHistory.at(-1)).toBe('tile-c');
    expect(second.trailTailTileIds.at(-1)).toBe('tile-b');
  });

  test('does not mutate trail state on non-commit frames', () => {
    const model = new TrailModel({ initialTileId: 'tile-a' });
    model.tileCommitted('tile-b');

    const before = model.syncCurrentTile('tile-b');
    const after = model.syncCurrentTile('tile-b');

    expect(after).toEqual(before);
    expect(model.currentPlayerTileId).toBe('tile-b');
    expect(model.trailHeadTileId).toBe('tile-b');
    expect(model.occupancyHistory).toEqual(['tile-a', 'tile-b']);
  });

  test('retains only the most recent committed tiles in the ring buffer', () => {
    const model = new TrailModel({ initialTileId: 'tile-a', capacity: 4 });

    model.tileCommitted('tile-b');
    model.tileCommitted('tile-c');
    model.tileCommitted('tile-d');
    const snapshot = model.tileCommitted('tile-e');

    expect(snapshot.currentPlayerTileId).toBe('tile-e');
    expect(snapshot.trailHeadTileId).toBe('tile-e');
    expect(snapshot.occupancyHistory).toEqual(['tile-b', 'tile-c', 'tile-d', 'tile-e']);
    expect(snapshot.trailTailTileIds).toEqual(['tile-b', 'tile-c', 'tile-d']);
    expect(snapshot.committedTileCount).toBe(5);
  });

  test('truncates tail history without inventing projected future tiles', () => {
    const model = new TrailModel({ initialTileId: 'tile-start', capacity: 3 });
    model.tileCommitted('tile-1');
    model.tileCommitted('tile-2');
    const snapshot = model.tileCommitted('tile-3');

    expect(snapshot.occupancyHistory).toEqual(['tile-1', 'tile-2', 'tile-3']);
    expect(snapshot.trailTailTileIds).toEqual(['tile-1', 'tile-2']);
    expect(snapshot.trailHeadTileId).toBe('tile-3');
    expect(snapshot.currentPlayerTileId).toBe('tile-3');
    expect(snapshot.occupancyHistory).not.toContain('tile-future');
  });
});

describe('trail renderer', () => {
  test('consumes committed occupancy history only', () => {
    const model = new TrailModel({ initialTileId: 'tile-a' });
    model.tileCommitted('tile-b');
    model.tileCommitted('tile-c');

    const points = buildTrailPoints(model.snapshot(), (tileId) => ({ x: tileId.length * 10, y: tileId.length * 5 }));
    const markup = renderTrailMarkup(model.snapshot(), (tileId) => ({ x: tileId.length * 10, y: tileId.length * 5 }));

    expect(points).toHaveLength(3);
    expect(markup).toContain('data-trail-head-tile-id="tile-c"');
    expect(markup).toContain('data-trail-length="3"');
    expect(markup).not.toContain('tile-future');
  });
});
