import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  BOOT_TIMING_METRIC_LABELS,
  BOOT_TIMING_WINDOW_KEY,
  buildBootTimingReport,
  createBootTimingArtifact,
  diffBootTimingArtifacts,
  logBootTimingReport,
  markBootTiming,
  resetBootTimingForTests,
  resolveBootTimingMetrics,
  startBootTiming
} from '../../src/boot/bootTiming';

afterEach(() => {
  resetBootTimingForTests();
  vi.restoreAllMocks();
});

describe('boot timing', () => {
  test('records ordered checkpoints with deltas and elapsed durations', () => {
    startBootTiming('boot:main-start', { enabled: true, now: 10 });
    markBootTiming('boot-scene:preload-start', { now: 14 });
    markBootTiming('boot-scene:preload-end', { now: 17 });
    markBootTiming('menu-scene:init-start', { now: 27 });
    markBootTiming('menu-scene:init-end', { now: 31 });
    markBootTiming('menu-scene:create-start', { now: 40 });
    markBootTiming('menu-scene:create-core-ready', { now: 62 });
    markBootTiming('menu-scene:first-interactive-frame', { now: 79 });
    markBootTiming('menu-scene:deferred-visual-setup', { now: 96 });

    const report = buildBootTimingReport({ now: 104 });

    expect(report?.enabled).toBe(true);
    expect(report?.checkpoints.map((checkpoint) => checkpoint.label)).toEqual([
      'boot:main-start',
      'boot-scene:preload-start',
      'boot-scene:preload-end',
      'menu-scene:init-start',
      'menu-scene:init-end',
      'menu-scene:create-start',
      'menu-scene:create-core-ready',
      'menu-scene:first-interactive-frame',
      'menu-scene:deferred-visual-setup'
    ]);
    expect(report?.checkpoints[1]?.deltaMs).toBe(4);
    expect(report?.checkpoints[6]?.deltaMs).toBe(22);
    expect(report?.checkpoints[7]?.deltaMs).toBe(17);
    expect(report?.totalMs).toBe(94);
    expect(report?.summary).toContain('menu-scene:first-interactive-frame +17.0ms');
  });

  test('logs the report once when enabled', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const table = vi.spyOn(console, 'table').mockImplementation(() => undefined);

    startBootTiming('boot:main-start', { enabled: true, now: 1 });
    markBootTiming('menu-scene:create-core-ready', { now: 4 });

    expect(logBootTimingReport('Mazer 2D boot timing', { now: 8 })).toBeDefined();
    expect(logBootTimingReport('Mazer 2D boot timing', { now: 9 })).toBeDefined();

    expect(info).toHaveBeenCalledTimes(1);
    expect(table).toHaveBeenCalledTimes(1);
  });

  test('publishes the latest report snapshot onto window state when available', () => {
    const runtime = {} as Window;
    vi.stubGlobal('window', runtime);

    startBootTiming('boot:main-start', { enabled: true, now: 1 });
    markBootTiming('menu-scene:create-core-ready', { now: 5 });

    expect(runtime[BOOT_TIMING_WINDOW_KEY]?.checkpoints.at(-1)?.label).toBe('menu-scene:create-core-ready');

    resetBootTimingForTests();

    expect(runtime[BOOT_TIMING_WINDOW_KEY]).toBeUndefined();
  });

  test('maps the shipping timing report onto stable metric keys', () => {
    startBootTiming('boot:main-start', { enabled: true, now: 1 });
    markBootTiming(BOOT_TIMING_METRIC_LABELS.preloadStart, { now: 12 });
    markBootTiming(BOOT_TIMING_METRIC_LABELS.createCoreReady, { now: 48 });
    markBootTiming(BOOT_TIMING_METRIC_LABELS.firstInteractiveFrame, { now: 65 });
    markBootTiming(BOOT_TIMING_METRIC_LABELS.deferredVisualSetup, { now: 88 });

    const metrics = resolveBootTimingMetrics(buildBootTimingReport({ now: 92 }));

    expect(metrics.preloadStart?.elapsedMs).toBe(11);
    expect(metrics.createCoreReady?.elapsedMs).toBe(47);
    expect(metrics.firstInteractiveFrame?.label).toBe('menu-scene:first-interactive-frame');
    expect(metrics.deferredVisualSetup?.deltaMs).toBe(23);
  });

  test('builds before/after timing artifacts with comparable metric deltas', () => {
    const beforeReport = {
      enabled: true,
      startedAtMs: 0,
      finishedAtMs: 100,
      totalMs: 100,
      summary: 'before',
      checkpoints: [
        { label: BOOT_TIMING_METRIC_LABELS.preloadStart, atMs: 10, elapsedMs: 10, deltaMs: 10 },
        { label: BOOT_TIMING_METRIC_LABELS.createCoreReady, atMs: 60, elapsedMs: 60, deltaMs: 50 },
        { label: BOOT_TIMING_METRIC_LABELS.firstInteractiveFrame, atMs: 70, elapsedMs: 70, deltaMs: 10 },
        { label: BOOT_TIMING_METRIC_LABELS.deferredVisualSetup, atMs: 90, elapsedMs: 90, deltaMs: 20 }
      ]
    };
    const afterReport = {
      enabled: true,
      startedAtMs: 0,
      finishedAtMs: 84,
      totalMs: 84,
      summary: 'after',
      checkpoints: [
        { label: BOOT_TIMING_METRIC_LABELS.preloadStart, atMs: 10, elapsedMs: 10, deltaMs: 10 },
        { label: BOOT_TIMING_METRIC_LABELS.createCoreReady, atMs: 42, elapsedMs: 42, deltaMs: 32 },
        { label: BOOT_TIMING_METRIC_LABELS.firstInteractiveFrame, atMs: 55, elapsedMs: 55, deltaMs: 13 },
        { label: BOOT_TIMING_METRIC_LABELS.deferredVisualSetup, atMs: 80, elapsedMs: 80, deltaMs: 25 }
      ]
    };

    const beforeArtifact = createBootTimingArtifact(beforeReport, { createdAt: '2026-04-16T00:00:00.000Z' });
    const afterArtifact = createBootTimingArtifact(afterReport, { createdAt: '2026-04-16T00:05:00.000Z' });
    const diff = diffBootTimingArtifacts(beforeArtifact, afterArtifact);

    expect(beforeArtifact?.metrics.createCoreReady?.elapsedMs).toBe(60);
    expect(afterArtifact?.metrics.firstInteractiveFrame?.elapsedMs).toBe(55);
    expect(diff).toEqual({
      totalMsDelta: -16,
      metricDeltas: {
        preloadStart: 0,
        createCoreReady: -18,
        deferredVisualSetup: -10,
        firstInteractiveFrame: -15
      }
    });
  });
});
