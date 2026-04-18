import { describe, expect, test } from 'vitest';
import {
  applyPresentationContrastFloors,
  getContrastRatio,
  getPaletteReadabilityReport
} from '../../src/render/palette';
import { palette } from '../../src/render/palette';

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
});
