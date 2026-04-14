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
    expect(new Set(bus.records.map((record) => record.speaker))).not.toContain('Maze');
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

  test('separates runner, trap, warden, inventory, and puzzle voices without duplicate speakers per step', () => {
    const bus = buildIntentBus([
      buildSourceState(0, {
        targetKind: 'frontier',
        targetTileId: 'west-branch',
        targetTileLabel: 'West branch'
      }),
      buildSourceState(1, {
        currentTileId: 'junction-a',
        currentTileLabel: 'Junction A',
        localCues: ['trap rhythm', 'beacon cache'],
        traversedConnectorId: 'gate-east',
        traversedConnectorLabel: 'East gate'
      }),
      buildSourceState(2, {
        currentTileId: 'junction-b',
        currentTileLabel: 'Junction B',
        localCues: ['enemy patrol']
      }),
      buildSourceState(3, {
        currentTileId: 'junction-c',
        currentTileLabel: 'Junction C',
        localCues: ['switch state']
      }),
      buildSourceState(4, {
        currentTileId: 'junction-d',
        currentTileLabel: 'Junction D',
        visibleLandmarks: [{ id: 'spire', label: 'Signal spire' }],
        observedLandmarkIds: ['spire']
      })
    ]);

    const speakers = new Set(bus.records.map((record) => record.speaker));
    const verbFirstPattern = /^(Scanning|Screening|Reading|Valuing|Parsing|Marking|Noting|Replanning|Tracking|Locking|Timing)\b/;

    expect(speakers).toEqual(new Set(['Runner', 'TrapNet', 'Warden', 'Inventory', 'Puzzle']));
    expect(bus.records.every((record) => verbFirstPattern.test(record.summary))).toBe(true);
    expect(bus.records.filter((record) => record.step === 1).map((record) => record.speaker)).toEqual(['TrapNet', 'Inventory']);
    expect(bus.records.filter((record) => record.step === 4).map((record) => record.speaker)).toEqual(['Runner']);
  });

  test('does not expose DOM or visual-proof dependencies', () => {
    const source = readFileSync(new URL('../../src/mazer-core/intent/IntentBus.ts', import.meta.url), 'utf8');

    expect(source).not.toMatch(/from\s+['"][^'"]*visual-proof/);
    expect(source).not.toMatch(/\bdocument\b|\bwindow\b|\bHTMLElement\b/);
  });
});
