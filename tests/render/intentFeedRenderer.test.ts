import { describe, expect, test, vi } from 'vitest';
import { clampIntentFeedSummary, resolveIntentFeedLayout } from '../../src/render/intentFeedRenderer';

vi.mock('phaser', () => ({
  default: {
    Math: {
      Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
      Linear: (left: number, right: number, t: number) => left + ((right - left) * t)
    }
  }
}));

const overlaps = (
  left: { left: number; top: number; width: number; height: number },
  right: { left: number; top: number; width: number; height: number }
): boolean => (
  left.left < right.left + right.width
  && left.left + left.width > right.left
  && left.top < right.top + right.height
  && left.top + left.height > right.top
);

describe('intent feed renderer', () => {
  test('reserves one status line above the bounded event list', () => {
    const withStatus = resolveIntentFeedLayout({ width: 1280, height: 720 }, 4, {}, true);
    const withoutStatus = resolveIntentFeedLayout({ width: 1280, height: 720 }, 4, {}, false);

    expect(withStatus.rect.height).toBeGreaterThan(withoutStatus.rect.height);
  });

  test('moves off the default dock when player and objective anchors would be occluded', () => {
    const playerRect = { left: 1120 - 32 - 40, top: 84 - 32 - 40, width: 64 + 80, height: 64 + 80 };
    const objectiveRect = { left: 1100 - 36 - 40, top: 188 - 36 - 40, width: 72 + 80, height: 72 + 80 };
    const layout = resolveIntentFeedLayout(
      { width: 1280, height: 720 },
      4,
      {
        player: { x: 1120, y: 84, width: 64, height: 64 },
        objective: { x: 1100, y: 188, width: 72, height: 72 }
      }
    );

    expect(layout.rect.left + layout.rect.width).toBeLessThanOrEqual(1280);
    expect(layout.rect.top + layout.rect.height).toBeLessThanOrEqual(720);
    expect(overlaps(layout.rect, playerRect)).toBe(false);
    expect(overlaps(layout.rect, objectiveRect)).toBe(false);
  });

  test('avoids title and install lanes when compact layouts have only one clear side lane', () => {
    const titleRect = { left: 20, top: 0, width: 350, height: 62 };
    const installRect = { left: 147, top: 809, width: 96, height: 23 };
    const layout = resolveIntentFeedLayout(
      { width: 390, height: 844 },
      4,
      {
        player: { x: 338.5, y: 302.5, width: 56, height: 56 },
        objective: { x: 340, y: 266, width: 56, height: 56 },
        avoid: [
          { x: 195, y: 31, width: 350, height: 62 },
          { x: 195, y: 820.5, width: 96, height: 23 }
        ]
      }
    );

    expect(layout.rect.top).toBeGreaterThanOrEqual(titleRect.top + titleRect.height + 18);
    expect(layout.rect.top + layout.rect.height).toBeLessThanOrEqual(844);
    expect(layout.rect.left + layout.rect.width).toBeLessThanOrEqual(390);
    expect(layout.rect.top).toBeLessThan(installRect.top);
  });

  test('clamps long summaries into a single readable line', () => {
    expect(
      clampIntentFeedSummary('  scanning   a long branch note that should not stay as a full sentence on the HUD  ', 32)
    ).toBe('scanning a long branch note t...');
    expect(clampIntentFeedSummary('short note', 32)).toBe('short note');
  });
});
