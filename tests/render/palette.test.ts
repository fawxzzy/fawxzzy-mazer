import { describe, expect, test } from 'vitest';
import {
  getContrastRatio,
  getPaletteReadabilityReport
} from '../../src/render/palette';
import { palette } from '../../src/render/palette';

describe('presentation palette', () => {
  test('keeps the player more dominant than the trail and passes readability gates', () => {
    const report = getPaletteReadabilityReport(palette);
    const trailVsPlayer = report.checkpoints.find((checkpoint) => checkpoint.key === 'trail-vs-player');
    const floorVsPlayer = report.checkpoints.find((checkpoint) => checkpoint.key === 'floor-vs-player');

    expect(trailVsPlayer).toBeDefined();
    expect(floorVsPlayer).toBeDefined();
    expect(trailVsPlayer?.passes).toBe(true);
    expect(floorVsPlayer?.passes).toBe(true);
    expect(getContrastRatio(palette.board.player, palette.board.floor)).toBeGreaterThan(
      getContrastRatio(palette.board.trail, palette.board.floor)
    );
    expect(getContrastRatio(palette.board.playerCore, palette.board.floor)).toBeGreaterThan(
      getContrastRatio(palette.board.trailCore, palette.board.floor)
    );
  });
});
