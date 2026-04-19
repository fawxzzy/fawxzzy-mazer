import { describe, expect, test } from 'vitest';

import { buildTelemetryBusinessKpis, type TelemetryEvent } from '../../src/telemetry';

describe('telemetry business kpis', () => {
  test('computes business-facing rates from bounded local receipts', () => {
    const events: TelemetryEvent[] = [
      {
        kind: 'paywall_viewed',
        runId: 'session-a',
        elapsedMs: 0,
        createdAt: '2026-04-18T12:00:00.000Z',
        privacyMode: 'compact',
        payload: { entryPoint: 'watch-pass-preview', ctaLabel: 'Watch Pass preview', sourceCta: 'watch-pass-preview' }
      },
      {
        kind: 'plan_selected',
        runId: 'session-a',
        elapsedMs: 350,
        createdAt: '2026-04-18T12:00:00.350Z',
        privacyMode: 'compact',
        payload: { planId: 'yearly', sourceCta: 'watch-pass-preview', emphasis: 'emphasized' }
      },
      {
        kind: 'run_started',
        runId: 'session-a-attempt-1',
        attemptNo: 1,
        elapsedMs: 500,
        createdAt: '2026-04-18T12:00:00.500Z',
        mode: 'watch',
        payload: { phase: 'watch', variantId: 'p80-thought-richer-fail-13-memory-on-trap-baseline' }
      },
      {
        kind: 'control_used',
        runId: 'session-a',
        elapsedMs: 650,
        createdAt: '2026-04-18T12:00:00.650Z',
        mode: 'play',
        payload: { control: 'keyboard', actionKind: 'move_left', source: 'play-shell' }
      },
      {
        kind: 'control_used',
        runId: 'session-a',
        elapsedMs: 675,
        createdAt: '2026-04-18T12:00:00.675Z',
        mode: 'play',
        payload: { control: 'pause', actionKind: 'pause', source: 'play-shell' }
      },
      {
        kind: 'control_used',
        runId: 'session-a',
        elapsedMs: 700,
        createdAt: '2026-04-18T12:00:00.700Z',
        mode: 'play',
        payload: { control: 'restart', actionKind: 'restart_attempt', source: 'play-shell' }
      },
      {
        kind: 'control_used',
        runId: 'session-a',
        elapsedMs: 725,
        createdAt: '2026-04-18T12:00:00.725Z',
        mode: 'play',
        payload: { control: 'toggle_thoughts', actionKind: 'toggle_thoughts', source: 'play-shell' }
      },
      {
        kind: 'settings_changed',
        runId: 'session-a-settings',
        elapsedMs: 750,
        createdAt: '2026-04-18T12:00:00.750Z',
        mode: 'play',
        payload: { setting: 'mode', previousValue: 'watch', nextValue: 'play' }
      },
      {
        kind: 'live_activity_started',
        runId: 'session-a',
        elapsedMs: 900,
        createdAt: '2026-04-18T12:00:00.900Z',
        payload: { surface: 'ios-active-run', placement: 'preview-shell' }
      },
      {
        kind: 'widget_configured',
        runId: 'session-a',
        elapsedMs: 1200,
        createdAt: '2026-04-18T12:00:01.200Z',
        payload: { surface: 'android-widget', placement: 'preview-shell' }
      },
      {
        kind: 'settings_changed',
        runId: 'session-a-settings',
        elapsedMs: 1500,
        createdAt: '2026-04-18T12:00:01.500Z',
        privacyMode: 'private',
        payload: { setting: 'privacy_mode', nextValue: 'private' }
      },
      {
        kind: 'settings_changed',
        runId: 'session-a-settings',
        elapsedMs: 1700,
        createdAt: '2026-04-18T12:00:01.700Z',
        payload: { setting: 'reduced_motion', nextValue: true }
      },
      {
        kind: 'fail_reason',
        runId: 'session-a-attempt-1',
        attemptNo: 1,
        elapsedMs: 2100,
        createdAt: '2026-04-18T12:00:02.100Z',
        mode: 'play',
        payload: { failReason: 'trap contact', stage: 'play' }
      },
      {
        kind: 'run_started',
        runId: 'session-a-attempt-2',
        attemptNo: 2,
        elapsedMs: 2600,
        createdAt: '2026-04-18T12:00:02.600Z',
        mode: 'play',
        payload: { phase: 'watch', variantId: 'p80-thought-richer-fail-13-memory-on-trap-baseline' }
      },
      {
        kind: 'thought_shown',
        runId: 'session-a-attempt-1',
        attemptNo: 1,
        elapsedMs: 3000,
        createdAt: '2026-04-18T12:00:03.000Z',
        payload: { compactThought: 'Holding the lane.', density: 'richer' }
      },
      {
        kind: 'run_ended',
        runId: 'session-a-attempt-1',
        attemptNo: 1,
        elapsedMs: 6200,
        createdAt: '2026-04-18T12:00:06.200Z',
        payload: { outcome: 'cleared', durationMs: 6200 }
      },
      {
        kind: 'purchase_completed',
        runId: 'session-a',
        elapsedMs: 7000,
        createdAt: '2026-04-18T12:00:07.000Z',
        payload: { sku: 'watch-pass-preview', origin: 'preview-placeholder' }
      }
    ];

    const summary = buildTelemetryBusinessKpis(events, {
      privacyMode: 'compact',
      sessionCount: 1
    });

    expect(summary.averageWatchTimeMs).toBe(6200);
    expect(summary.runsWatchedPerSession).toBe(2);
    expect(summary.widgetConfiguredCount).toBe(1);
    expect(summary.widgetAttachRate).toBe(1);
    expect(summary.widget_attach_rate).toBe(1);
    expect(summary.activeRunStartRate).toBe(1);
    expect(summary.liveActivityStartRate).toBe(1);
    expect(summary.live_activity_start_rate).toBe(1);
    expect(summary.controlUsedCount).toBe(4);
    expect(summary.control_used_count).toBe(4);
    expect(summary.controlUsedByControl).toEqual({
      keyboard: 1,
      touch: 0,
      restart: 1,
      pause: 1,
      toggle_thoughts: 1
    });
    expect(summary.control_used_by_control).toEqual({
      keyboard: 1,
      touch: 0,
      restart: 1,
      pause: 1,
      toggle_thoughts: 1
    });
    expect(summary.controlUsedByAction).toEqual({
      move: 1,
      pause: 1,
      restart: 1,
      toggle_thoughts: 1
    });
    expect(summary.control_used_by_action).toEqual({
      move: 1,
      pause: 1,
      restart: 1,
      toggle_thoughts: 1
    });
    expect(summary.pauseControlCount).toBe(1);
    expect(summary.restartControlCount).toBe(1);
    expect(summary.toggleThoughtsControlCount).toBe(1);
    expect(summary.paywallViewCount).toBe(1);
    expect(summary.planSelectedCount).toBe(1);
    expect(summary.paywallViewToPlanSelectRate).toBe(1);
    expect(summary.paywall_view_to_plan_select).toBe(1);
    expect(summary.purchaseCompletedCount).toBe(1);
    expect(summary.paywallViewToPurchaseCompletedRate).toBe(1);
    expect(summary.paywall_view_to_purchase_completed).toBe(1);
    expect(summary.paywallToPurchaseConversion).toBe(1);
    expect(summary.watchToPlaySwitchCount).toBe(1);
    expect(summary.watchToPlaySwitchRate).toBe(1);
    expect(summary.watch_to_play_switch_rate).toBe(1);
    expect(summary.playFailureCount).toBe(1);
    expect(summary.playFailToRetryContinuationCount).toBe(1);
    expect(summary.playFailToRetryContinuationRate).toBe(1);
    expect(summary.play_fail_to_retry_continuation_rate).toBe(1);
    expect(summary.reducedMotionAdoptionRate).toBe(1);
    expect(summary.reduced_motion_adoption).toBe(1);
    expect(summary.privateModeAdoptionRate).toBe(1);
    expect(summary.private_mode_adoption).toBe(1);
    expect(summary.currentPrivacyMode).toBe('private');
  });
});
