import { beforeAll, describe, expect, test, vi } from 'vitest';
import {
  applyPresentationContrastFloors,
  getContrastRatio,
  getPaletteReadabilityReport,
  resolveLocalBoardSupportColors
} from '../../src/render/palette';
import { palette } from '../../src/render/palette';

vi.mock('phaser', () => ({
  default: {
    AUTO: 'AUTO',
    Math: {
      Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
      Linear: (from: number, to: number, t: number) => from + ((to - from) * t)
    },
    Scale: {
      RESIZE: 'RESIZE',
      CENTER_BOTH: 'CENTER_BOTH'
    },
    Scene: class {}
  }
}));

let resolveAmbientThemeProfile: typeof import('../../src/scenes/MenuScene').resolveAmbientThemeProfile;

beforeAll(async () => {
  ({ resolveAmbientThemeProfile } = await import('../../src/scenes/MenuScene'));
});

describe('presentation palette', () => {
  test('keeps the player more dominant than the trail and passes readability gates', () => {
    const report = getPaletteReadabilityReport(palette);
    const trailVsPlayer = report.checkpoints.find((checkpoint) => checkpoint.key === 'trail-vs-player');

    expect(trailVsPlayer).toBeDefined();
    expect(trailVsPlayer?.passes).toBe(true);
    expect(report.failures.map((failure) => failure.key)).not.toContain('trail-vs-player');
  });

  test('repairs player priority under harder board combinations', () => {
    const rawPlayerTrailRatio = getContrastRatio(0x4c6479, 0x5166af);
    const rawGoalPlayerRatio = getContrastRatio(0xa24f69, 0x4c6479);
    const repaired = applyPresentationContrastFloors({
      ...palette,
      board: {
        ...palette.board,
        wall: 0x1b1f28,
        floor: 0xc7d0d8,
        trail: 0x5166af,
        player: 0x4c6479,
        goal: 0xa24f69
      }
    });
    const report = getPaletteReadabilityReport(repaired);
    const trailVsPlayer = report.checkpoints.find((checkpoint) => checkpoint.key === 'trail-vs-player');
    const goalVsPlayer = report.checkpoints.find((checkpoint) => checkpoint.key === 'goal-vs-player');

    expect(getContrastRatio(repaired.board.player, repaired.board.floor)).toBeGreaterThanOrEqual(2.85);
    expect(getContrastRatio(repaired.board.player, repaired.board.trail)).toBeGreaterThan(rawPlayerTrailRatio);
    expect(getContrastRatio(repaired.board.goal, repaired.board.player)).toBeGreaterThan(rawGoalPlayerRatio);
    expect(trailVsPlayer?.ratio).toBeGreaterThan(rawPlayerTrailRatio);
    expect(goalVsPlayer?.ratio).toBeGreaterThan(rawGoalPlayerRatio);
  });

  test('keeps shipping theme palettes readable for ember and adjacent board palettes', () => {
    for (const theme of ['ember', 'aurora', 'vellum', 'monolith'] as const) {
      const report = getPaletteReadabilityReport(resolveAmbientThemeProfile(theme).palette);
      const trailVsPlayer = report.checkpoints.find((checkpoint) => checkpoint.key === 'trail-vs-player');
      const goalVsPlayer = report.checkpoints.find((checkpoint) => checkpoint.key === 'goal-vs-player');
      const trailVsPlayerLuminance = report.checkpoints.find(
        (checkpoint) => checkpoint.key === 'trail-vs-player-luminance'
      );

      expect(report.failures, theme).toEqual([]);
      expect(trailVsPlayer?.passes, `${theme}: trail-vs-player`).toBe(true);
      expect(goalVsPlayer?.passes, `${theme}: goal-vs-player`).toBe(true);
      expect(trailVsPlayerLuminance?.passes, `${theme}: trail-vs-player-luminance`).toBe(true);
    }
  });

  test('selects opposing local support colors for light and dark board luminance', () => {
    const lightPlayerSupport = resolveLocalBoardSupportColors(palette.board, 'player', 0.62);
    const darkPlayerSupport = resolveLocalBoardSupportColors(palette.board, 'player', 0.08);
    const lightTrailSupport = resolveLocalBoardSupportColors(palette.board, 'trail', 0.6);
    const darkTrailSupport = resolveLocalBoardSupportColors(palette.board, 'trail', 0.1);

    expect(lightPlayerSupport.mode).toBe('dark');
    expect(darkPlayerSupport.mode).toBe('light');
    expect(lightTrailSupport.mode).toBe('dark');
    expect(darkTrailSupport.mode).toBe('light');
  });

  test('holds the prior local support mode inside the deadband', () => {
    const heldDark = resolveLocalBoardSupportColors(palette.board, 'player', 0.3, {
      previousMode: 'dark',
      deadband: 10
    });
    const heldLight = resolveLocalBoardSupportColors(palette.board, 'trail', 0.3, {
      previousMode: 'light',
      deadband: 10
    });

    expect(heldDark.mode).toBe('dark');
    expect(heldLight.mode).toBe('light');
  });
});
