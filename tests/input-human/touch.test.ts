import { describe, expect, test } from 'vitest';

import {
  createTouchInputState,
  releaseTouchPointer,
  resolveHumanTouchAction,
  resolveTouchControlLayout,
  resolveTouchControlKindAtPoint,
  resolveTouchInputCapability
} from '../../src/input-human';

describe('input-human touch bridge', () => {
  test('detects touch-capable runtimes and resolves a stable mobile layout', () => {
    expect(resolveTouchInputCapability({
      navigator: { maxTouchPoints: 2 }
    })).toBe(true);
    expect(resolveTouchInputCapability({
      navigator: { maxTouchPoints: 0 },
      matchMedia: () => ({ matches: true })
    })).toBe(true);
    expect(resolveTouchInputCapability({
      navigator: { maxTouchPoints: 0 },
      matchMedia: () => ({ matches: false })
    })).toBe(false);

    const layout = resolveTouchControlLayout({
      width: 390,
      height: 844
    });

    expect(layout.frame.width).toBeGreaterThan(0);
    expect(layout.controls.move_up.centerY).toBeLessThan(layout.controls.move_down.centerY);
    expect(layout.controls.move_left.centerX).toBeLessThan(layout.controls.move_right.centerX);
    expect(resolveTouchControlKindAtPoint(layout, layout.controls.pause.centerX, layout.controls.pause.centerY)).toBe('pause');
  });

  test('maps touch points into the shared human action schema and releases held pointers', () => {
    const layout = resolveTouchControlLayout({
      width: 390,
      height: 844
    });
    const state = createTouchInputState();
    const movePoint = layout.controls.move_right;

    const move = resolveHumanTouchAction({
      x: movePoint.centerX,
      y: movePoint.centerY,
      pointerId: 7,
      timeStamp: 128
    }, layout, state, 128);

    expect(move).toEqual({
      kind: 'move_right',
      source: 'touch',
      atMs: 128,
      repeat: false,
      key: 'touch:move_right'
    });
    expect(resolveHumanTouchAction({
      x: movePoint.centerX,
      y: movePoint.centerY,
      pointerId: 7,
      timeStamp: 160
    }, layout, state, 160)).toBeNull();

    releaseTouchPointer(state, 7);

    const pausePoint = layout.controls.pause;
    expect(resolveHumanTouchAction({
      x: pausePoint.centerX,
      y: pausePoint.centerY,
      pointerId: 9,
      timeStamp: 300
    }, layout, state, 300)?.kind).toBe('pause');
  });
});
