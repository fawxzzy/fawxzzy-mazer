import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { buildIntentBus, type IntentSourceState } from '../../src/mazer-core/intent/IntentBus';

const buildSourceState = (step: number, overrides: Partial<IntentSourceState> = {}): IntentSourceState => ({
  step,
  currentTileId: `tile-${step}`,
  currentTileLabel: `Tile ${step}`,
  targetTileId: `target-${step}`,
  targetTileLabel: `Target ${step}`,
  targetKind: 'frontier',
  nextTileId: `next-${step}`,
  reason: 'expanding local frontier from current tile',
  frontierCount: 2,
  replanCount: step,
  backtrackCount: 0,
  goalVisible: false,
  goalObservedStep: null,
  visibleLandmarks: [],
  observedLandmarkIds: [],
  localCues: [],
  traversableTileIds: [`tile-${step + 1}`],
  traversedConnectorId: null,
  traversedConnectorLabel: null,
  ...overrides
});

describe('mazer-core IntentBus', () => {
  test('emits readable intent records for local observations', () => {
    const bus = buildIntentBus([
      buildSourceState(0, {
        localCues: ['trap sigil'],
        visibleLandmarks: [{ id: 'landmark-1', label: 'Switch tower' }]
      }),
      buildSourceState(1, {
        currentTileId: 'tile-1',
        targetTileId: 'tile-2',
        targetTileLabel: 'Tile 2',
        localCues: ['enemy patrol'],
        traversedConnectorId: 'connector-a',
        traversedConnectorLabel: 'North gate'
      })
    ]);

    expect(bus.totalSteps).toBe(2);
    expect(bus.records.length).toBeGreaterThan(0);
    expect(bus.records.every((record) => record.summary.length > 0)).toBe(true);
    expect(bus.records.some((record) => record.kind === 'trap-inferred')).toBe(true);
    expect(bus.records.some((record) => record.kind === 'enemy-seen')).toBe(true);
    expect(bus.records.some((record) => record.kind === 'landmark-spotted')).toBe(true);
  });

  test('debounces repeated intents without needing the visual runtime', () => {
    const bus = buildIntentBus([
      buildSourceState(0, { localCues: ['trap sigil'] }),
      buildSourceState(1, { localCues: ['trap sigil'] }),
      buildSourceState(2, { localCues: ['trap sigil'] })
    ]);

    expect(bus.debouncedEventCount).toBeGreaterThan(0);
    expect(bus.records.length).toBeLessThanOrEqual(3);
  });

  test('does not expose DOM or visual-proof dependencies', () => {
    const source = readFileSync(new URL('../../src/mazer-core/intent/IntentBus.ts', import.meta.url), 'utf8');

    expect(source).not.toMatch(/from\s+['"][^'"]*visual-proof/);
    expect(source).not.toMatch(/\bdocument\b|\bwindow\b|\bHTMLElement\b/);
  });
});
