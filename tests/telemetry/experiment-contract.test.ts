import { describe, expect, test } from 'vitest';

import {
  DEFAULT_EXPERIMENT_TOGGLES,
  TELEMETRY_EVENT_KINDS,
  buildExperimentManifest,
  buildExperimentSelection,
  buildTelemetryReceipt,
  normalizeExperimentToggles,
  normalizeTelemetryEventKind,
  resolveExperimentVariantId,
  summarizeTelemetryEvents
} from '../../src/telemetry';

describe('telemetry experiment contract', () => {
  test('exposes the required event kinds in stable order', () => {
    expect(TELEMETRY_EVENT_KINDS).toEqual([
      'run_started',
      'run_ended',
      'thought_shown',
      'hazard_entered',
      'memory_recalled',
      'widget_configured',
      'live_activity_started',
      'control_used',
      'paywall_viewed',
      'plan_selected',
      'purchase_completed',
      'purchase_churned',
      'settings_changed',
      'fail_reason'
    ]);
    expect(normalizeTelemetryEventKind('run_started')).toBe('run_started');
    expect(normalizeTelemetryEventKind('nope')).toBeNull();
  });

  test('normalizes experiment toggles and resolves a stable variant id', () => {
    const toggles = normalizeExperimentToggles({
      pacing: '1.0x',
      thoughtDensity: 'richer',
      failCardTiming: '0.8s',
      memoryBeat: 'false',
      trapTelegraph: 'stronger'
    });

    expect(toggles).toEqual({
      pacing: '1.0x',
      thoughtDensity: 'richer',
      failCardTiming: '0.8s',
      memoryBeat: 'off',
      trapTelegraph: 'stronger'
    });
    expect(resolveExperimentVariantId(toggles)).toBe('p100-thought-richer-fail-08-memory-off-trap-stronger');
  });

  test('builds manifest and receipt summaries from local events', () => {
    const receipt = buildTelemetryReceipt({
      kind: 'runtime-observe',
      label: 'pacing-check',
      runId: 'run-123',
      mazeId: 'maze-9',
      attemptNo: 2,
      toggles: {
        pacing: '0.7x',
        thoughtDensity: 'sparse',
        failCardTiming: '1.8s',
        memoryBeat: 'on',
        trapTelegraph: 'baseline'
      },
      generatedAt: '2026-04-18T10:00:00.000Z',
      events: [
        {
          kind: 'run_started',
          runId: 'run-123',
          mazeId: 'maze-9',
          attemptNo: 2,
          elapsedMs: 0,
          createdAt: '2026-04-18T10:00:00.000Z',
          mode: 'watch',
          payload: { phase: 'pre-roll', variantId: 'p70-thought-sparse-fail-18-memory-on-trap-baseline' }
        },
        {
          kind: 'paywall_viewed',
          runId: 'run-123',
          elapsedMs: 500,
          createdAt: '2026-04-18T10:00:00.500Z',
          privacyMode: 'compact',
          experimentId: 'p70-thought-sparse-fail-18-memory-on-trap-baseline',
          payload: { entryPoint: 'watch-pass-preview', ctaLabel: 'Watch Pass preview', sourceCta: 'watch-pass-preview' }
        },
        {
          kind: 'control_used',
          runId: 'run-123',
          elapsedMs: 600,
          createdAt: '2026-04-18T10:00:00.600Z',
          mode: 'play',
          payload: { control: 'keyboard', actionKind: 'move_up', source: 'play-shell' }
        },
        {
          kind: 'control_used',
          runId: 'run-123',
          elapsedMs: 620,
          createdAt: '2026-04-18T10:00:00.620Z',
          mode: 'play',
          payload: { control: 'pause', actionKind: 'pause', source: 'play-shell' }
        },
        {
          kind: 'control_used',
          runId: 'run-123',
          elapsedMs: 640,
          createdAt: '2026-04-18T10:00:00.640Z',
          mode: 'play',
          payload: { control: 'toggle_thoughts', actionKind: 'toggle_thoughts', source: 'play-shell' }
        },
        {
          kind: 'plan_selected',
          runId: 'run-123',
          elapsedMs: 700,
          createdAt: '2026-04-18T10:00:00.700Z',
          privacyMode: 'compact',
          experimentId: 'p70-thought-sparse-fail-18-memory-on-trap-baseline',
          payload: { planId: 'yearly', sourceCta: 'watch-pass-preview', emphasis: 'emphasized' }
        },
        {
          kind: 'settings_changed',
          runId: 'run-123',
          elapsedMs: 1200,
          createdAt: '2026-04-18T10:00:01.200Z',
          mode: 'play',
          payload: { setting: 'mode', previousValue: 'watch', nextValue: 'play' }
        },
        {
          kind: 'thought_shown',
          runId: 'run-123',
          mazeId: 'maze-9',
          attemptNo: 2,
          elapsedMs: 2400,
          createdAt: '2026-04-18T10:00:02.400Z',
          payload: { compactThought: 'Holding the lane.', density: 'sparse' }
        },
        {
          kind: 'fail_reason',
          runId: 'run-123',
          mazeId: 'maze-9',
          attemptNo: 2,
          elapsedMs: 3600,
          createdAt: '2026-04-18T10:00:03.600Z',
          mode: 'play',
          payload: { failReason: 'trap contact', stage: 'watch' }
        },
        {
          kind: 'run_started',
          runId: 'run-123',
          mazeId: 'maze-9',
          attemptNo: 3,
          elapsedMs: 3800,
          createdAt: '2026-04-18T10:00:03.800Z',
          mode: 'play',
          payload: { phase: 'watch', variantId: 'p70-thought-sparse-fail-18-memory-on-trap-baseline' }
        },
        {
          kind: 'settings_changed',
          runId: 'run-123',
          elapsedMs: 4000,
          createdAt: '2026-04-18T10:00:04.000Z',
          privacyMode: 'private',
          payload: { setting: 'privacy_mode', nextValue: 'private' }
        }
      ],
      privacyMode: 'compact'
    });

    expect(receipt.schemaVersion).toBe(1);
    expect(receipt.kind).toBe('runtime-observe');
    expect(receipt.experimentId).toBe('p70-thought-sparse-fail-18-memory-on-trap-baseline');
    expect(receipt.experimentIds).toContain('p70-thought-sparse-fail-18-memory-on-trap-baseline');
    expect(receipt.variantId).toBe('p70-thought-sparse-fail-18-memory-on-trap-baseline');
    expect(receipt.mode).toBe('play');
    expect(receipt.privacyMode).toBe('compact');
    expect(receipt.privacyModes).toContain('private');
    expect(receipt.sourceCta).toBe('watch-pass-preview');
    expect(receipt.sourceCtas).toContain('watch-pass-preview');
    expect(receipt.planIds).toContain('yearly');
    expect(receipt.eventCount).toBe(11);
    expect(receipt.eventCounts.run_started).toBe(2);
    expect(receipt.eventCounts.paywall_viewed).toBe(1);
    expect(receipt.eventCounts.control_used).toBe(3);
    expect(receipt.eventCounts.plan_selected).toBe(1);
    expect(receipt.eventCounts.thought_shown).toBe(1);
    expect(receipt.eventCounts.fail_reason).toBe(1);
    expect(receipt.eventCounts.settings_changed).toBe(2);
    expect(receipt.eventKinds).toEqual(['run_started', 'paywall_viewed', 'control_used', 'plan_selected', 'settings_changed', 'thought_shown', 'fail_reason']);
    expect(receipt.firstCreatedAt).toBe('2026-04-18T10:00:00.000Z');
    expect(receipt.lastCreatedAt).toBe('2026-04-18T10:00:04.000Z');
    expect(receipt.timingWindows).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'run_started', count: 2, windowMs: 3800 }),
      expect.objectContaining({ kind: 'paywall_viewed', count: 1, windowMs: 0 }),
      expect.objectContaining({ kind: 'control_used', count: 3, windowMs: 40 }),
      expect.objectContaining({ kind: 'plan_selected', count: 1, windowMs: 0 }),
      expect.objectContaining({ kind: 'settings_changed', count: 2, windowMs: 2800 }),
      expect.objectContaining({ kind: 'thought_shown', count: 1, windowMs: 0 }),
      expect.objectContaining({ kind: 'fail_reason', count: 1, windowMs: 0 })
    ]));
    expect(receipt.failToRetryContinuation).toEqual({
      continuationCount: 1,
      averageMs: 200,
      minimumMs: 200,
      maximumMs: 200
    });
    expect(receipt.thoughtDwell).toEqual({
      thoughtCount: 1,
      densityPerMinute: 1,
      averageDwellMs: null,
      maximumDwellMs: null
    });
    expect(receipt.kpis.controlUsedCount).toBe(3);
    expect(receipt.kpis.control_used_count).toBe(3);
    expect(receipt.playMetrics).toMatchObject({
      controlUsedCount: 3,
      watchToPlaySwitchCount: 1,
      watchToPlaySwitchRate: 1,
      playFailureCount: 1,
      playFailToRetryContinuationCount: 1,
      playFailToRetryContinuationRate: 1
    });
    expect(receipt.kpis.paywallViewCount).toBe(1);
    expect(receipt.kpis.planSelectedCount).toBe(1);
    expect(receipt.kpis.paywallViewToPlanSelectRate).toBe(1);
    expect(receipt.kpis.paywall_view_to_purchase_completed).toBe(0);
    expect(receipt.kpis.paywallToPurchaseConversion).toBe(0);
    expect(receipt.kpis.watchToPlaySwitchRate).toBe(1);
    expect(receipt.kpis.watch_to_play_switch_rate).toBe(1);
    expect(receipt.kpis.playFailToRetryContinuationRate).toBe(1);
    expect(receipt.kpis.play_fail_to_retry_continuation_rate).toBe(1);
    expect(receipt.kpis.privateModeAdoptionRate).toBe(1);
    expect(receipt.kpis.private_mode_adoption).toBe(1);

    const manifest = buildExperimentManifest({
      kind: 'edge-live',
      label: 'surface-smoke',
      toggles: DEFAULT_EXPERIMENT_TOGGLES,
      generatedAt: '2026-04-18T11:00:00.000Z'
    });

    expect(manifest.variantId).toBe('p80-thought-sparse-fail-13-memory-on-trap-baseline');
    expect(manifest.runId).toBeNull();
    expect(buildExperimentSelection()).toEqual({
      toggles: DEFAULT_EXPERIMENT_TOGGLES,
      variantId: 'p80-thought-sparse-fail-13-memory-on-trap-baseline'
    });
    expect(summarizeTelemetryEvents([])).toMatchObject({
      eventCount: 0,
      eventKinds: []
    });
  });
});
