import { describe, expect, test, vi } from 'vitest';
import {
  clampIntentFeedSummary,
  resolveIntentFeedLayout,
  resolveIntentFeedRoleLabel
} from '../../src/render/intentFeedRenderer';

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
  test('reserves one persistent status line above the bounded quick-thought stack', () => {
    const withStatus = resolveIntentFeedLayout({ width: 1280, height: 720 }, 4, {}, true);
    const withoutStatus = resolveIntentFeedLayout({ width: 1280, height: 720 }, 4, {}, false);

    expect(withStatus.rect.height).toBeGreaterThan(withoutStatus.rect.height);
    expect(withStatus.mode).toBe('rail');
    expect(withoutStatus.mode).toBe('rail');
  });

  test('defaults to a bottom-center dock and uses one quick-thought line on standard phone heights', () => {
    const layout = resolveIntentFeedLayout(
      { width: 390, height: 844 },
      4,
      {
        board: { x: 195, y: 328, width: 278, height: 278 },
        install: { x: 195, y: 820, width: 168, height: 24 }
      }
    );

    expect(layout.dock).toBe('bottom-center');
    expect(layout.mode).toBe('bottom');
    expect(layout.maxVisibleEvents).toBe(1);
    expect(layout.rect.left + layout.rect.width).toBeLessThanOrEqual(390);
    expect(layout.rect.top + layout.rect.height).toBeLessThanOrEqual(844);
    expect(layout.rect.top).toBeGreaterThanOrEqual(328 + (278 / 2) + 10);
  });

  test('promotes landscape desktops into a right-side commentary rail', () => {
    const layout = resolveIntentFeedLayout(
      { width: 1440, height: 900 },
      4,
      {
        board: { x: 620, y: 430, width: 560, height: 560 },
        title: { x: 120, y: 52, width: 220, height: 56 },
        install: { x: 1320, y: 860, width: 160, height: 36 }
      }
    );

    expect(layout.mode).toBe('rail');
    expect(layout.dock).toBe('right-rail');
    expect(layout.rect.left).toBeGreaterThan(900);
    expect(layout.rect.top).toBeGreaterThan(200);
  });

  test('keeps short phone landscape layouts in the bottom panel instead of forcing a rail', () => {
    const layout = resolveIntentFeedLayout(
      { width: 844, height: 390 },
      4,
      {
        board: { x: 422, y: 156, width: 280, height: 280 },
        install: { x: 422, y: 366, width: 168, height: 24 }
      }
    );

    expect(layout.mode).toBe('bottom');
    expect(layout.dock.startsWith('bottom-')).toBe(true);
    expect(layout.rect.top + layout.rect.height).toBeLessThanOrEqual(390);
  });

  test('adds the optional micro-thought line only on taller mobile viewports', () => {
    const layout = resolveIntentFeedLayout(
      { width: 430, height: 932 },
      4,
      {
        board: { x: 215, y: 350, width: 298, height: 298 },
        install: { x: 215, y: 906, width: 168, height: 24 }
      }
    );

    expect(layout.dock).toBe('bottom-center');
    expect(layout.maxVisibleEvents).toBe(2);
    expect(layout.rect.top + layout.rect.height).toBeLessThanOrEqual(932);
  });

  test('shifts off dead-center when the lower board lane would cover the player or objective', () => {
    const playerRect = { left: 196 - 28 - 36, top: 708 - 28 - 36, width: 56 + 72, height: 56 + 72 };
    const objectiveRect = { left: 224 - 28 - 36, top: 684 - 28 - 36, width: 56 + 72, height: 56 + 72 };
    const layout = resolveIntentFeedLayout(
      { width: 430, height: 932 },
      4,
      {
        board: { x: 215, y: 350, width: 298, height: 298 },
        install: { x: 215, y: 906, width: 168, height: 24 },
        player: { x: 196, y: 708, width: 56, height: 56 },
        objective: { x: 224, y: 684, width: 56, height: 56 }
      }
    );

    expect(layout.rect.left + layout.rect.width).toBeLessThanOrEqual(430);
    expect(layout.rect.top + layout.rect.height).toBeLessThanOrEqual(932);
    expect(overlaps(layout.rect, playerRect)).toBe(false);
    expect(overlaps(layout.rect, objectiveRect)).toBe(false);
  });

  test('clamps long summaries into a single readable line', () => {
    expect(
      clampIntentFeedSummary('  scanning   a long branch note that should not stay as a full sentence on the HUD  ', 32)
    ).toBe('scanning a long branch note t...');
    expect(clampIntentFeedSummary('short note', 32)).toBe('short note');
  });

  test('maps roles onto the scan hypothesis commit and recall grammar', () => {
    expect(resolveIntentFeedRoleLabel('frontier-chosen')).toBe('SCAN');
    expect(resolveIntentFeedRoleLabel('trap-inferred')).toBe('HYPOTHESIS');
    expect(resolveIntentFeedRoleLabel('route-commitment-changed')).toBe('COMMIT');
    expect(resolveIntentFeedRoleLabel('dead-end-confirmed')).toBe('RECALL');
  });
});
