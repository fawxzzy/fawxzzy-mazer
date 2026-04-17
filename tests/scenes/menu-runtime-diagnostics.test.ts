import { describe, expect, test } from 'vitest';
import {
  MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY,
  resolveMenuScenePerformanceMode,
  resolveMenuSceneRuntimeConfig,
  summarizeMenuSceneFrameWindow
} from '../../src/scenes/menuRuntimeDiagnostics';
import { legacyTuning } from '../../src/config/tuning';

describe('menu runtime diagnostics', () => {
  test('parses soak diagnostics and low-power flags from query params', () => {
    expect(MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY).toBe('__MAZER_RUNTIME_DIAGNOSTICS__');

    const config = resolveMenuSceneRuntimeConfig('?runtimeDiagnostics=1&lowPower=1', {
      hardwareConcurrency: 8,
      saveData: false,
      lowPowerHardwareConcurrencyMax: legacyTuning.menu.runtime.lowPowerHardwareConcurrencyMax
    });

    expect(config.enabled).toBe(true);
    expect(config.lowPowerForced).toBe(true);
    expect(config.lowPowerActive).toBe(true);
    expect(config.lowPowerDetected).toBe(false);
  });

  test('treats save-data and low core counts as detected low-power mode', () => {
    const saveDataConfig = resolveMenuSceneRuntimeConfig('?soak=1', {
      hardwareConcurrency: 8,
      saveData: true,
      lowPowerHardwareConcurrencyMax: legacyTuning.menu.runtime.lowPowerHardwareConcurrencyMax
    });
    const lowCoreConfig = resolveMenuSceneRuntimeConfig('', {
      hardwareConcurrency: 4,
      saveData: false,
      lowPowerHardwareConcurrencyMax: legacyTuning.menu.runtime.lowPowerHardwareConcurrencyMax
    });

    expect(saveDataConfig.lowPowerDetected).toBe(true);
    expect(lowCoreConfig.lowPowerDetected).toBe(true);
    expect(lowCoreConfig.lowPowerActive).toBe(true);
  });

  test('uses hysteresis when switching between full, throttled, and hidden modes', () => {
    expect(resolveMenuScenePerformanceMode('full', {
      hidden: false,
      lowPowerActive: false,
      recentAverageFrameMs: legacyTuning.menu.runtime.degradeAverageFrameMs + 2,
      tuning: legacyTuning.menu.runtime
    })).toBe('throttled');

    expect(resolveMenuScenePerformanceMode('throttled', {
      hidden: false,
      lowPowerActive: false,
      recentAverageFrameMs: legacyTuning.menu.runtime.recoverAverageFrameMs + 0.25,
      tuning: legacyTuning.menu.runtime
    })).toBe('throttled');

    expect(resolveMenuScenePerformanceMode('throttled', {
      hidden: false,
      lowPowerActive: false,
      recentAverageFrameMs: legacyTuning.menu.runtime.recoverAverageFrameMs - 1,
      tuning: legacyTuning.menu.runtime
    })).toBe('full');

    expect(resolveMenuScenePerformanceMode('full', {
      hidden: true,
      lowPowerActive: false,
      recentAverageFrameMs: 12,
      tuning: legacyTuning.menu.runtime
    })).toBe('hidden');
  });

  test('summarizes recent frame windows with spike counts and fps estimates', () => {
    const summary = summarizeMenuSceneFrameWindow([16, 17, 18, 58], legacyTuning.menu.runtime.spikeFrameMs);

    expect(summary.count).toBe(4);
    expect(summary.averageMs).toBe(27.25);
    expect(summary.worstMs).toBe(58);
    expect(summary.spikeCount).toBe(1);
    expect(summary.fps).toBeCloseTo(36.7, 1);
  });
});
