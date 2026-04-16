import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  BOOT_TIMING_WINDOW_KEY,
  buildBootTimingReport,
  logBootTimingReport,
  markBootTiming,
  resetBootTimingForTests,
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
});
