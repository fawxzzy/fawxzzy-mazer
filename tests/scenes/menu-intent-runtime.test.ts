import { describe, expect, test } from 'vitest';
import type { MazeEpisode } from '../../src/domain/maze';
import type { IntentFeedState, IntentVisibleEntry } from '../../src/mazer-core/intent';
import {
  MenuIntentFeedDisplayController,
  createMenuIntentRuntimeSession
} from '../../src/scenes/menuIntentRuntime';

const createCorridorEpisode = (): MazeEpisode => ({
  accepted: true,
  checkpointsCreated: 0,
  difficulty: 'standard',
  family: 'classic',
  pathLength: 3,
  placementStrategy: 'farthest-pair',
  presentationPreset: 'classic',
  raster: {
    width: 3,
    height: 1,
    tiles: new Uint8Array([1, 1, 1]),
    startIndex: 0,
    endIndex: 2,
    pathIndices: [0, 1, 2]
  },
  score: 0,
  seed: 12,
  shortcutsCreated: 0,
  size: 'small'
} as unknown as MazeEpisode);

const createEntry = (id: string, slot = 0, summary = `scanning ${id}`): IntentVisibleEntry => ({
  id,
  speaker: 'Runner',
  category: 'observe',
  kind: 'frontier-chosen',
  importance: 'medium',
  summary,
  confidence: 0.8,
  step: slot,
  ttlSteps: 4,
  ageSteps: 0,
  slot,
  opacity: 1
});

const createFeedState = (ids: string[], step = ids.length, summaries?: string[]): IntentFeedState => ({
  step,
  entries: ids.map((id, index) => createEntry(id, index, summaries?.[index] ?? `scanning ${id}`)),
  pings: [],
  metrics: {
    emittedCount: ids.length,
    highImportanceEventCount: 0,
    speakerCount: 1,
    totalSteps: Math.max(1, step),
    intentEmissionRate: 0.5,
    worldPingCount: 0,
    worldPingEmissionRate: 0,
    maxConsecutiveEmissionStreak: 1,
    maxVisibleWorldPings: 0,
    debouncedEventCount: 0,
    debouncedWorldPingCount: 0,
    verbFirstPass: true,
    importanceTtlPass: true,
    slotOpacityPass: true,
    feedReadabilityPass: true,
    intentDebouncePass: true,
    worldPingSpamPass: true,
    highImportanceStickyPass: true,
    intentStackOverlapPass: true
  }
});

describe('menu intent runtime', () => {
  test('builds bounded feed state against the shipping maze episode path', () => {
    const session = createMenuIntentRuntimeSession(createCorridorEpisode());

    session.advanceToStep(0);
    const firstState = session.getFeedState(0);
    expect(firstState).not.toBeNull();
    expect(firstState?.entries.length).toBeGreaterThan(0);
    expect(firstState?.entries.length).toBeLessThanOrEqual(4);

    session.advanceToStep(1);
    const secondState = session.getFeedState(1);
    expect(secondState).not.toBeNull();
    expect(secondState?.entries.length).toBeLessThanOrEqual(4);
    expect(secondState?.entries.some((entry) => entry.kind === 'goal-observed')).toBe(true);
  });

  test('holds feed entries for a minimum dwell and coalesces rapid replacements', () => {
    const controller = new MenuIntentFeedDisplayController({
      maxVisibleEntries: 2,
      minimumDwellMs: 1_600,
      replacementDebounceMs: 700
    });

    const first = controller.advance(createFeedState(['a', 'b', 'c'], 1), 0);
    expect(first?.entries.map((entry) => entry.id)).toEqual(['a', 'b']);

    const held = controller.advance(createFeedState(['d', 'e', 'f'], 2), 500);
    expect(held?.entries.map((entry) => entry.id)).toEqual(['a', 'b']);

    const coalesced = controller.advance(createFeedState(['g', 'h', 'i'], 3), 900);
    expect(coalesced?.entries.map((entry) => entry.id)).toEqual(['a', 'b']);

    const swapped = controller.advance(createFeedState(['g', 'h', 'i'], 3), 1_650);
    expect(swapped?.entries.map((entry) => entry.id)).toEqual(['g', 'h']);
  });

  test('keeps semantically identical text stable even when the raw ids change', () => {
    const controller = new MenuIntentFeedDisplayController({
      maxVisibleEntries: 2,
      minimumDwellMs: 1_600,
      replacementDebounceMs: 700
    });

    const first = controller.advance(
      createFeedState(['a', 'b', 'c'], 1, ['scanning west branch', 'reading gate timing', 'ignored tail']),
      0
    );
    expect(first?.entries.map((entry) => entry.summary)).toEqual(['scanning west branch', 'reading gate timing']);

    const identical = controller.advance(
      createFeedState(['x', 'y', 'z'], 2, ['scanning west branch', 'reading gate timing', 'ignored tail']),
      1_400
    );
    expect(identical?.entries.map((entry) => entry.summary)).toEqual(['scanning west branch', 'reading gate timing']);
    expect(identical?.entries.map((entry) => entry.id)).toEqual(['a', 'b']);

    const queued = controller.advance(
      createFeedState(['m', 'n', 'o'], 3, ['scanning east gate', 'tracking exit line', 'ignored tail']),
      2_200
    );
    expect(queued?.entries.map((entry) => entry.summary)).toEqual(['scanning west branch', 'reading gate timing']);

    const changed = controller.advance(
      createFeedState(['m', 'n', 'o'], 3, ['scanning east gate', 'tracking exit line', 'ignored tail']),
      3_000
    );
    expect(changed?.entries.map((entry) => entry.summary)).toEqual(['scanning east gate', 'tracking exit line']);
    expect(changed?.entries.map((entry) => entry.id)).toEqual(['m', 'n']);
  });

  test('stabilizes the session feed at human pace instead of replacing every raw step', () => {
    const session = createMenuIntentRuntimeSession(createCorridorEpisode());

    session.advanceToStep(0);
    const first = session.getDisplayFeedState(0, 0);
    expect(first?.entries.length).toBeGreaterThan(0);

    session.advanceToStep(1);
    const held = session.getDisplayFeedState(1, 400);
    expect(held?.entries.map((entry) => entry.id)).toEqual(first?.entries.map((entry) => entry.id));

    const released = session.getDisplayFeedState(1, 2_100);
    expect(released?.entries.map((entry) => entry.id)).not.toEqual(first?.entries.map((entry) => entry.id));
    expect(released?.entries.length).toBeLessThanOrEqual(3);
  });
});
