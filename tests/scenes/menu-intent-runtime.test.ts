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

const createSpectatorEpisode = (): MazeEpisode => ({
  accepted: true,
  checkpointsCreated: 0,
  difficulty: 'standard',
  family: 'classic',
  pathLength: 8,
  placementStrategy: 'farthest-pair',
  presentationPreset: 'classic',
  raster: {
    width: 8,
    height: 1,
    tiles: new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1]),
    startIndex: 0,
    endIndex: 7,
    pathIndices: [0, 1, 2, 3, 4, 5, 6, 7]
  },
  score: 0,
  seed: 1204,
  shortcutsCreated: 0,
  size: 'medium'
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
  statusSummary?: string,
  statusKind?: IntentFeedStatus['kind']
): IntentFeedState => {
  const events = ids.map((id, index) => createEntry(id, index, summaries?.[index] ?? `scanning ${id}`));
  const status = events[0]
    ? {
        ...createStatus(events[0], statusSummary ?? events[0].summary),
        kind: statusKind ?? events[0].kind
      }
    : null;

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
    expect(secondState?.status?.kind).toBe('goal-observed');
    expect(secondState?.events?.length ?? secondState?.entries.length).toBeLessThanOrEqual(4);
    expect(secondState?.status?.summary).toContain('exit line');
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
      createFeedState(['a', 'b', 'c'], 1, ['scanning west branch', 'waiting on gate timing', 'ignored tail']),
      0
    );
    expect(first?.events?.map((entry) => entry.summary) ?? first?.entries.map((entry) => entry.summary)).toEqual(['scanning west branch', 'waiting on gate timing']);

    const identical = controller.advance(
      createFeedState(['x', 'y', 'z'], 2, ['scanning west branch', 'waiting on gate timing', 'ignored tail']),
      1_400
    );
    expect(identical?.events?.map((entry) => entry.summary) ?? identical?.entries.map((entry) => entry.summary)).toEqual(['scanning west branch', 'waiting on gate timing']);
    expect(identical?.events?.map((entry) => entry.id) ?? identical?.entries.map((entry) => entry.id)).toEqual(['a', 'b']);

    const queued = controller.advance(
      createFeedState(['m', 'n', 'o'], 3, ['scanning east gate', 'committing exit line', 'ignored tail']),
      2_200
    );
    expect(queued?.events?.map((entry) => entry.summary) ?? queued?.entries.map((entry) => entry.summary)).toEqual(['scanning west branch', 'waiting on gate timing']);

    const changed = controller.advance(
      createFeedState(['m', 'n', 'o'], 3, ['scanning east gate', 'committing exit line', 'ignored tail']),
      3_000
    );
    expect(changed?.events?.map((entry) => entry.summary) ?? changed?.entries.map((entry) => entry.summary)).toEqual(['scanning east gate', 'committing exit line']);
    expect(changed?.events?.map((entry) => entry.id) ?? changed?.entries.map((entry) => entry.id)).toEqual(['m', 'n']);
  });

  test('updates the status line independently while keeping the event list held during dwell', () => {
    const controller = new MenuIntentFeedDisplayController({
      maxVisibleEntries: 2,
      minimumDwellMs: 1_600,
      replacementDebounceMs: 700
    });

    const first = controller.advance(createFeedState(['a', 'b', 'c'], 1, ['scanning west branch', 'waiting on gate timing', 'ignored tail'], 'scanning west branch'), 0);
    expect(first?.status?.summary).toBe('scanning west branch');

    const held = controller.advance(createFeedState(['x', 'y', 'z'], 2, ['scanning west branch', 'waiting on gate timing', 'ignored tail'], 'committing exit line'), 500);
    expect(held?.status?.summary).toBe('committing exit line');
    expect(held?.events?.map((entry) => entry.id) ?? held?.entries.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  test('keeps quick thoughts stable while the route status advances independently', () => {
    const session = createMenuIntentRuntimeSession(createCorridorEpisode());

    session.advanceToStep(0);
    const first = session.getDisplayFeedState(0, 0);
    expect(first?.status).not.toBeNull();
    expect(first?.events?.length ?? first?.entries.length).toBeGreaterThan(0);

    session.advanceToStep(1);
    const held = session.getDisplayFeedState(1, 400);
    expect(held?.events?.map((entry) => entry.id) ?? held?.entries.map((entry) => entry.id)).toEqual(first?.events?.map((entry) => entry.id) ?? first?.entries.map((entry) => entry.id));
    expect(held?.status?.kind).toBe('goal-observed');
    expect(held?.step).toBe(1);

    const released = session.getDisplayFeedState(1, 2_100);
    expect(released?.status?.kind).toBe('goal-observed');
    expect(released?.step).toBe(1);
    expect(released?.events?.map((entry) => entry.id) ?? released?.entries.map((entry) => entry.id)).toEqual(first?.events?.map((entry) => entry.id) ?? first?.entries.map((entry) => entry.id));
    expect(released?.events?.length ?? released?.entries.length).toBeLessThanOrEqual(3);
  });

  test('holds commit and recall narratives longer than scan narratives', () => {
    const scanController = new MenuIntentFeedDisplayController({
      maxVisibleEntries: 2,
      minimumDwellMs: 1_600,
      replacementDebounceMs: 700
    });
    const commitController = new MenuIntentFeedDisplayController({
      maxVisibleEntries: 2,
      minimumDwellMs: 1_600,
      replacementDebounceMs: 700
    });

    const scanInitial = createFeedState(['scan-a', 'scan-b'], 1, ['scanning west branch', 'waiting on gate timing'], 'scanning west branch', 'frontier-chosen');
    const scanReplacement = createFeedState(['scan-c', 'scan-d'], 2, ['scanning east gate', 'committing exit line'], 'scanning east gate', 'frontier-chosen');
    const commitInitial = createFeedState(['commit-a', 'commit-b'], 1, ['committing exit line', 'recalling the branch'], 'committing exit line', 'route-commitment-changed');
    const commitReplacement = createFeedState(['commit-c', 'commit-d'], 2, ['committing exit line', 'recalling the branch'], 'committing exit line', 'route-commitment-changed');

    scanController.advance(scanInitial, 0);
    commitController.advance(commitInitial, 0);

    scanController.advance(scanReplacement, 800);
    commitController.advance(commitReplacement, 800);

    const scanReleased = scanController.advance(scanReplacement, 1_900);
    const commitHeld = commitController.advance(commitReplacement, 1_900);

    expect(scanReleased?.events?.map((entry) => entry.id) ?? scanReleased?.entries.map((entry) => entry.id)).toEqual(['scan-c', 'scan-d']);
    expect(commitHeld?.events?.map((entry) => entry.id) ?? commitHeld?.entries.map((entry) => entry.id)).toEqual(['commit-a', 'commit-b']);
  });

  test('emits spectator-first trap, patrol, plate, and key semantics for longer shipping paths', () => {
    const session = createMenuIntentRuntimeSession(createSpectatorEpisode());

    session.advanceToStep(6);
    const boardState = session.getBoardState(6);
    const allKinds = new Set(
      session.intentDeliveries.flatMap((delivery) => delivery.bus.records.map((record) => record.kind))
    );

    expect(boardState).not.toBeNull();
    expect(boardState?.telegraphs.some((entry) => entry.kind === 'timed-gate')).toBe(true);
    expect(boardState?.telegraphs.some((entry) => entry.kind === 'hazard-tile')).toBe(true);
    expect(boardState?.telegraphs.some((entry) => entry.kind === 'pressure-plate')).toBe(true);
    expect(boardState?.telegraphs.some((entry) => entry.kind === 'key-item')).toBe(true);
    expect(boardState?.failReasonTitle.length ?? 0).toBeGreaterThan(0);
    expect(allKinds).toContain('trap-inferred');
    expect(allKinds).toContain('enemy-seen');
    expect(allKinds).toContain('item-spotted');
    expect(allKinds).toContain('puzzle-state-observed');
  });
});
