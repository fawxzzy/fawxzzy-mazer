import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { buildIntentBus, type IntentSourceState } from '../../../src/visual-proof/intent/IntentBus';
import { buildIntentFeed, resolveVisibleIntentEntries } from '../../../src/visual-proof/intent/IntentFeed';
import { INTENT_SLOT_OPACITIES } from '../../../src/visual-proof/intent/IntentEvent';
import { renderIntentFeedMarkup } from '../../../src/visual-proof/intent/IntentRenderer';
import { resolveIntentFeedRole } from '../../../src/mazer-core/intent/IntentFeed';

const makeState = (overrides: Partial<IntentSourceState> & Pick<IntentSourceState, 'step'>): IntentSourceState => ({
  step: overrides.step,
  currentTileId: overrides.currentTileId ?? `tile-${overrides.step}`,
  currentTileLabel: overrides.currentTileLabel ?? `Tile ${overrides.step}`,
  targetTileId: overrides.targetTileId ?? null,
  targetTileLabel: overrides.targetTileLabel ?? null,
  targetKind: overrides.targetKind ?? 'idle',
  nextTileId: overrides.nextTileId ?? overrides.targetTileId ?? null,
  reason: overrides.reason ?? 'holding position',
  frontierCount: overrides.frontierCount ?? 0,
  replanCount: overrides.replanCount ?? 0,
  backtrackCount: overrides.backtrackCount ?? 0,
  goalVisible: overrides.goalVisible ?? false,
  goalObservedStep: overrides.goalObservedStep ?? null,
  visibleLandmarks: overrides.visibleLandmarks ?? [],
  observedLandmarkIds: overrides.observedLandmarkIds ?? [],
  localCues: overrides.localCues ?? [],
  traversableTileIds: overrides.traversableTileIds ?? ['north', 'south'],
  traversedConnectorId: overrides.traversedConnectorId ?? null,
  traversedConnectorLabel: overrides.traversedConnectorLabel ?? null
});

const buildFeedFromStates = (states: IntentSourceState[], canary: string | null = null) => {
  const bus = buildIntentBus(states, { canary });
  const feed = buildIntentFeed(bus, states.map((state) => state.step), { canary });
  return { bus, feed };
};

describe('intent bus', () => {
  test('emits only meaningful policy deltas and preserves the shared contract', () => {
    const { bus, feed } = buildFeedFromStates([
      makeState({
        step: 0,
        targetKind: 'frontier',
        targetTileId: 'west-branch',
        targetTileLabel: 'West branch',
        frontierCount: 2
      }),
      makeState({
        step: 1,
        targetKind: 'frontier',
        targetTileId: 'west-branch',
        targetTileLabel: 'West branch',
        frontierCount: 2
      }),
      makeState({
        step: 2,
        targetKind: 'frontier',
        targetTileId: 'west-branch',
        targetTileLabel: 'West branch',
        frontierCount: 2
      })
    ]);

    expect(bus.records).toHaveLength(1);
    expect(bus.records[0].kind).toBe('frontier-chosen');
    expect(bus.records[0].speaker).toBe('Runner');
    expect(bus.records[0].confidence).toBeGreaterThan(0.5);
    expect(feed.metrics.intentDebouncePass).toBe(true);
    expect(feed.metrics.feedReadabilityPass).toBe(true);
  });

  test('caps the visible queue at four entries and allows multiple speakers without visual chaos', () => {
    const { bus, feed } = buildFeedFromStates([
      makeState({
        step: 0,
        targetKind: 'frontier',
        targetTileId: 'west-branch',
        targetTileLabel: 'West branch'
      }),
      makeState({
        step: 1,
        currentTileId: 'junction-a',
        currentTileLabel: 'Junction A',
        targetKind: 'frontier',
        targetTileId: 'east-gate',
        targetTileLabel: 'East gate',
        localCues: ['trap rhythm', 'beacon cache'],
        traversedConnectorId: 'gate-east',
        traversedConnectorLabel: 'East gate'
      }),
      makeState({
        step: 2,
        currentTileId: 'junction-a',
        currentTileLabel: 'Junction A',
        targetKind: 'frontier',
        targetTileId: 'north-spoke',
        targetTileLabel: 'North spoke',
        visibleLandmarks: [{ id: 'signal-post', label: 'Signal post' }],
        observedLandmarkIds: ['signal-post'],
        localCues: ['enemy patrol']
      }),
      makeState({
        step: 3,
        currentTileLabel: 'Dead branch',
        targetKind: 'backtrack',
        targetTileId: 'junction-a',
        targetTileLabel: 'Junction A',
        localCues: ['dead-end', 'switch state'],
        traversableTileIds: ['junction-a']
      }),
      makeState({
        step: 4,
        targetKind: 'goal',
        targetTileId: 'exit',
        targetTileLabel: 'Exit',
        goalVisible: true,
        goalObservedStep: 4
      })
    ]);

    const visible = resolveVisibleIntentEntries(bus.records, 4);
    const stepOneSpeakers = new Set(bus.records.filter((record) => record.step === 1).map((record) => record.speaker));

    expect(visible).toHaveLength(4);
    expect(visible.map((entry) => entry.opacity)).toEqual(INTENT_SLOT_OPACITIES);
    expect(stepOneSpeakers).toEqual(new Set(['TrapNet', 'Inventory']));
    expect(feed.metrics.speakerCount).toBe(5);
    expect(feed.states.get(4)?.pings.length).toBeLessThanOrEqual(2);

    const markup = renderIntentFeedMarkup(feed.states.get(4)!);
    expect(markup).toContain('Intent Bus');
    expect(markup).toContain('proof-intent-status');
    expect(markup).toContain('data-intent-status-present="true"');
    expect(markup).toContain('data-status-presence-pass="true"');
    expect(markup).toContain('@Runner');
    expect(markup).toContain('@Warden');
    expect(markup).not.toContain('@Maze');
    expect(markup).toContain('data-intent-speaker-count="');
  });

  test('keeps high-importance entries around longer than low-importance chatter', () => {
    const { bus, feed } = buildFeedFromStates([
      makeState({
        step: 0,
        targetKind: 'frontier',
        targetTileId: 'west-branch',
        targetTileLabel: 'West branch'
      }),
      makeState({
        step: 1,
        targetKind: 'frontier',
        targetTileId: 'west-branch',
        targetTileLabel: 'West branch'
      }),
      makeState({
        step: 2,
        targetKind: 'goal',
        targetTileId: 'exit',
        targetTileLabel: 'Exit',
        goalVisible: true,
        goalObservedStep: 2
      }),
      makeState({
        step: 3,
        targetKind: 'goal',
        targetTileId: 'exit',
        targetTileLabel: 'Exit',
        goalVisible: true,
        goalObservedStep: 2
      }),
      makeState({
        step: 4,
        targetKind: 'goal',
        targetTileId: 'exit',
        targetTileLabel: 'Exit',
        goalVisible: true,
        goalObservedStep: 2
      })
    ]);

    const visibleAtStepFour = resolveVisibleIntentEntries(bus.records, 4);

    expect(visibleAtStepFour.some((entry) => entry.kind === 'goal-observed')).toBe(true);
    expect(visibleAtStepFour.some((entry) => entry.kind === 'frontier-chosen')).toBe(false);
    expect(feed.metrics.highImportanceStickyPass).toBe(true);
    expect(feed.metrics.importanceTtlPass).toBe(true);
  });

  test('keeps route context in status while newer observations become quick thoughts', () => {
    const { bus, feed } = buildFeedFromStates([
      makeState({
        step: 0,
        currentTileId: 'junction-a',
        currentTileLabel: 'Junction A',
        targetKind: 'frontier',
        targetTileId: 'west-branch',
        targetTileLabel: 'West branch'
      }),
      makeState({
        step: 1,
        currentTileId: 'junction-a',
        currentTileLabel: 'Junction A',
        targetKind: 'frontier',
        targetTileId: 'west-branch',
        targetTileLabel: 'West branch',
        localCues: ['trap rhythm']
      })
    ]);

    const state = feed.states.get(1);
    const visible = resolveVisibleIntentEntries(bus.records, 1);

    expect(state?.status?.kind).toBe('frontier-chosen');
    expect(state?.status?.summary).toContain('West branch');
    expect(visible[0]?.kind).toBe('trap-inferred');
    expect(visible[0]?.summary).toContain('hazard');
    expect(visible[0]?.summary).not.toBe(state?.status?.summary);
    expect(resolveIntentFeedRole(state?.status?.kind ?? null)).toBe('scan');
    expect(resolveIntentFeedRole(visible[0]?.kind ?? null)).toBe('hypothesis');
  });

  test('flags synthetic per-step chatter as spam in the canary lane', () => {
    const { bus, feed } = buildFeedFromStates([
      makeState({ step: 0, targetKind: 'frontier', targetTileId: 'a', targetTileLabel: 'A' }),
      makeState({ step: 1, targetKind: 'frontier', targetTileId: 'b', targetTileLabel: 'B', localCues: ['trap rhythm'] }),
      makeState({ step: 2, targetKind: 'frontier', targetTileId: 'c', targetTileLabel: 'C', localCues: ['beacon cache'] }),
      makeState({ step: 3, targetKind: 'frontier', targetTileId: 'd', targetTileLabel: 'D', localCues: ['switch state'] }),
      makeState({ step: 4, targetKind: 'frontier', targetTileId: 'e', targetTileLabel: 'E', traversedConnectorId: 'gate-a', traversedConnectorLabel: 'Gate A' })
    ], 'intent-feed-spam');

    expect(bus.records.length).toBeGreaterThanOrEqual(5);
    expect(feed.metrics.intentEmissionRate).toBeGreaterThan(0.6);
    expect(feed.metrics.intentDebouncePass).toBe(false);
    expect(feed.metrics.maxVisibleWorldPings).toBeGreaterThan(2);
    expect(feed.metrics.worldPingEmissionRate).toBeGreaterThan(1);
    expect(feed.metrics.worldPingSpamPass).toBe(false);
    expect(feed.metrics.statusPresencePass).toBe(true);
    expect(feed.metrics.feedReadabilityPass).toBe(false);
  });

  test('anchors world pings to concrete local events and keeps speaker provenance', () => {
    const { feed } = buildFeedFromStates([
      makeState({
        step: 0,
        targetKind: 'frontier',
        targetTileId: 'west-branch',
        targetTileLabel: 'West branch'
      }),
      makeState({
        step: 1,
        currentTileId: 'junction-a',
        currentTileLabel: 'Junction A',
        targetKind: 'frontier',
        targetTileId: 'east-gate',
        targetTileLabel: 'East gate',
        localCues: ['trap rhythm'],
        traversedConnectorId: 'gate-east',
        traversedConnectorLabel: 'East gate'
      }),
      makeState({
        step: 2,
        currentTileId: 'junction-a',
        currentTileLabel: 'Junction A',
        targetKind: 'goal',
        targetTileId: 'exit',
        targetTileLabel: 'Exit',
        goalVisible: true,
        goalObservedStep: 2
      })
    ]);

    const pings = feed.states.get(2)?.pings ?? [];
    expect(pings.some((ping) => ping.pingLabel === 'Trap inferred' && ping.anchor.kind === 'tile' && ping.speaker === 'TrapNet')).toBe(true);
    expect(pings.some((ping) => ping.pingLabel === 'Exit seen' && ping.anchor.kind === 'objective' && ping.speaker === 'Runner')).toBe(true);
  });

  test('keeps visual-proof intent contracts as thin adapters over mazer-core', () => {
    const adapterFiles = [
      '../../../src/visual-proof/intent/IntentBus.ts',
      '../../../src/visual-proof/intent/IntentEvent.ts',
      '../../../src/visual-proof/intent/IntentFeed.ts'
    ];

    for (const relativePath of adapterFiles) {
      const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
      expect(source).toMatch(/mazer-core/);
    expect(source).not.toMatch(/makeIntentRecord|INTENT_TTL_STEPS:\s*Record<IntentImportance/);
    }
  });

  test('suppresses repeated connector chatter when the state does not materially change', () => {
    const { bus, feed } = buildFeedFromStates([
      makeState({
        step: 0,
        currentTileId: 'junction-a',
        currentTileLabel: 'Junction A',
        targetKind: 'frontier',
        targetTileId: 'west-branch',
        targetTileLabel: 'West branch',
        traversedConnectorId: 'gate-a',
        traversedConnectorLabel: 'Gate A'
      }),
      makeState({
        step: 1,
        currentTileId: 'junction-a',
        currentTileLabel: 'Junction A',
        targetKind: 'frontier',
        targetTileId: 'west-branch',
        targetTileLabel: 'West branch',
        traversedConnectorId: 'gate-a',
        traversedConnectorLabel: 'Gate A'
      }),
      makeState({
        step: 2,
        currentTileId: 'junction-a',
        currentTileLabel: 'Junction A',
        targetKind: 'frontier',
        targetTileId: 'west-branch',
        targetTileLabel: 'West branch',
        traversedConnectorId: 'gate-a',
        traversedConnectorLabel: 'Gate A'
      })
    ]);

    expect(bus.records.filter((record) => record.kind === 'gate-aligned')).toHaveLength(1);
    expect(new Set(bus.records.map((record) => record.summary)).size).toBe(bus.records.length);
    expect(feed.metrics.intentDebouncePass).toBe(true);
  });

  test('keeps summaries varied across the common frontier landmark trap and goal transitions', () => {
    const { bus, feed } = buildFeedFromStates([
      makeState({
        step: 0,
        targetKind: 'frontier',
        targetTileId: 'west-branch',
        targetTileLabel: 'West branch'
      }),
      makeState({
        step: 1,
        currentTileId: 'junction-a',
        currentTileLabel: 'Junction A',
        targetKind: 'frontier',
        targetTileId: 'east-gate',
        targetTileLabel: 'East gate',
        visibleLandmarks: [{ id: 'signal-post', label: 'Signal post' }],
        observedLandmarkIds: ['signal-post']
      }),
      makeState({
        step: 2,
        currentTileId: 'junction-a',
        currentTileLabel: 'Junction A',
        targetKind: 'frontier',
        targetTileId: 'east-gate',
        targetTileLabel: 'East gate',
        localCues: ['trap rhythm']
      }),
      makeState({
        step: 3,
        currentTileId: 'junction-a',
        currentTileLabel: 'Junction A',
        targetKind: 'goal',
        targetTileId: 'exit',
        targetTileLabel: 'Exit',
        goalVisible: true,
        goalObservedStep: 3
      })
    ]);

    const summaries = bus.records.map((entry) => entry.summary);
    expect(new Set(summaries).size).toBe(summaries.length);
    expect(summaries.some((summary) => summary.includes('West branch'))).toBe(true);
    expect(summaries.some((summary) => summary.includes('Signal post'))).toBe(true);
    expect(summaries.some((summary) => summary.includes('hazard'))).toBe(true);
    expect(summaries.some((summary) => summary.includes('exit'))).toBe(true);
    expect(feed.metrics.verbFirstPass).toBe(true);
  });
});
