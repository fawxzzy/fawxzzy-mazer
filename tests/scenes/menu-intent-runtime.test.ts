import { describe, expect, test } from 'vitest';
import type { MazeEpisode } from '../../src/domain/maze';
import type { IntentFeedState, IntentFeedStatus, IntentVisibleEntry } from '../../src/mazer-core/intent';
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

const createStatus = (entry: IntentVisibleEntry, summary = entry.summary): IntentFeedStatus => ({
  speaker: entry.speaker,
  category: entry.category,
  kind: entry.kind,
  importance: entry.importance,
  summary,
  confidence: entry.confidence,
  step: entry.step,
  anchor: entry.anchor
});

const createFeedState = (
  ids: string[],
  step = ids.length,
  summaries?: string[],
  statusSummary?: string
): IntentFeedState => {
  const events = ids.map((id, index) => createEntry(id, index, summaries?.[index] ?? `scanning ${id}`));
  const status = events[0] ? createStatus(events[0], statusSummary ?? events[0].summary) : null;

  return {
    step,
    status,
    events,
    entries: events,
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
      statusRepeatCount: 0,
      verbFirstPass: true,
      statusPresencePass: true,
      importanceTtlPass: true,
      slotOpacityPass: true,
      feedReadabilityPass: true,
      intentDebouncePass: true,
      worldPingSpamPass: true,
      highImportanceStickyPass: true,
      intentStackOverlapPass: true
    }
  };
};

describe('menu intent runtime', () => {
  test('builds bounded feed state against the shipping maze episode path', () => {
    const session = createMenuIntentRuntimeSession(createCorridorEpisode());

    session.advanceToStep(0);
    const firstState = session.getFeedState(0);
    expect(firstState).not.toBeNull();
    expect(firstState?.status).not.toBeNull();
    expect(firstState?.events?.length ?? firstState?.entries.length).toBeGreaterThan(0);
    expect(firstState?.events?.length ?? firstState?.entries.length).toBeLessThanOrEqual(4);

    session.advanceToStep(1);
    const secondState = session.getFeedState(1);
    expect(secondState).not.toBeNull();
    expect(secondState?.status).not.toBeNull();
    expect(secondState?.events?.length ?? secondState?.entries.length).toBeLessThanOrEqual(4);
    expect((secondState?.events ?? secondState?.entries ?? []).some((entry) => entry.kind === 'goal-observed')).toBe(true);
  });

  test('holds feed entries for a minimum dwell and coalesces rapid replacements', () => {
    const controller = new MenuIntentFeedDisplayController({
      maxVisibleEntries: 2,
      minimumDwellMs: 1_600,
      replacementDebounceMs: 700
    });

    const first = controller.advance(createFeedState(['a', 'b', 'c'], 1), 0);
    expect(first?.events?.map((entry) => entry.id) ?? first?.entries.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(first?.status?.summary).toBe('scanning a');

    const held = controller.advance(createFeedState(['d', 'e', 'f'], 2), 500);
    expect(held?.events?.map((entry) => entry.id) ?? held?.entries.map((entry) => entry.id)).toEqual(['a', 'b']);

    const coalesced = controller.advance(createFeedState(['g', 'h', 'i'], 3), 900);
    expect(coalesced?.events?.map((entry) => entry.id) ?? coalesced?.entries.map((entry) => entry.id)).toEqual(['a', 'b']);

    const swapped = controller.advance(createFeedState(['g', 'h', 'i'], 3), 1_650);
    expect(swapped?.events?.map((entry) => entry.id) ?? swapped?.entries.map((entry) => entry.id)).toEqual(['g', 'h']);
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
    expect(first?.events?.map((entry) => entry.summary) ?? first?.entries.map((entry) => entry.summary)).toEqual(['scanning west branch', 'reading gate timing']);

    const identical = controller.advance(
      createFeedState(['x', 'y', 'z'], 2, ['scanning west branch', 'reading gate timing', 'ignored tail']),
      1_400
    );
    expect(identical?.events?.map((entry) => entry.summary) ?? identical?.entries.map((entry) => entry.summary)).toEqual(['scanning west branch', 'reading gate timing']);
    expect(identical?.events?.map((entry) => entry.id) ?? identical?.entries.map((entry) => entry.id)).toEqual(['a', 'b']);

    const queued = controller.advance(
      createFeedState(['m', 'n', 'o'], 3, ['scanning east gate', 'tracking exit line', 'ignored tail']),
      2_200
    );
    expect(queued?.events?.map((entry) => entry.summary) ?? queued?.entries.map((entry) => entry.summary)).toEqual(['scanning west branch', 'reading gate timing']);

    const changed = controller.advance(
      createFeedState(['m', 'n', 'o'], 3, ['scanning east gate', 'tracking exit line', 'ignored tail']),
      3_000
    );
    expect(changed?.events?.map((entry) => entry.summary) ?? changed?.entries.map((entry) => entry.summary)).toEqual(['scanning east gate', 'tracking exit line']);
    expect(changed?.events?.map((entry) => entry.id) ?? changed?.entries.map((entry) => entry.id)).toEqual(['m', 'n']);
  });

  test('updates the status line independently while keeping the event list held during dwell', () => {
    const controller = new MenuIntentFeedDisplayController({
      maxVisibleEntries: 2,
      minimumDwellMs: 1_600,
      replacementDebounceMs: 700
    });

    const first = controller.advance(createFeedState(['a', 'b', 'c'], 1, ['scanning west branch', 'reading gate timing', 'ignored tail'], 'scanning west branch'), 0);
    expect(first?.status?.summary).toBe('scanning west branch');

    const held = controller.advance(createFeedState(['x', 'y', 'z'], 2, ['scanning west branch', 'reading gate timing', 'ignored tail'], 'locking exit route'), 500);
    expect(held?.status?.summary).toBe('locking exit route');
    expect(held?.events?.map((entry) => entry.id) ?? held?.entries.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  test('stabilizes the session feed at human pace instead of replacing every raw step', () => {
    const session = createMenuIntentRuntimeSession(createCorridorEpisode());

    session.advanceToStep(0);
    const first = session.getDisplayFeedState(0, 0);
    expect(first?.status).not.toBeNull();
    expect(first?.events?.length ?? first?.entries.length).toBeGreaterThan(0);

    session.advanceToStep(1);
    const held = session.getDisplayFeedState(1, 400);
    expect(held?.events?.map((entry) => entry.id) ?? held?.entries.map((entry) => entry.id)).toEqual(first?.events?.map((entry) => entry.id) ?? first?.entries.map((entry) => entry.id));

    const released = session.getDisplayFeedState(1, 2_100);
    expect(released?.events?.map((entry) => entry.id) ?? released?.entries.map((entry) => entry.id)).not.toEqual(first?.events?.map((entry) => entry.id) ?? first?.entries.map((entry) => entry.id));
    expect(released?.events?.length ?? released?.entries.length).toBeLessThanOrEqual(3);
  });
});
