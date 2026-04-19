import { describe, expect, test } from 'vitest';

import {
  HumanInputRepeatGate,
  resolveHumanKeyboardAction,
  resolveHumanKeyboardActionKind
} from '../../src/input-human';

describe('input-human keyboard bridge', () => {
  test('maps desktop movement and control keys into the shared action schema', () => {
    expect(resolveHumanKeyboardActionKind({ code: 'ArrowUp' })).toBe('move_up');
    expect(resolveHumanKeyboardActionKind({ code: 'KeyW' })).toBe('move_up');
    expect(resolveHumanKeyboardActionKind({ code: 'ArrowLeft' })).toBe('move_left');
    expect(resolveHumanKeyboardActionKind({ code: 'KeyP' })).toBe('pause');
    expect(resolveHumanKeyboardActionKind({ code: 'KeyR' })).toBe('restart_attempt');
    expect(resolveHumanKeyboardActionKind({ code: 'KeyT' })).toBe('toggle_thoughts');
    expect(resolveHumanKeyboardActionKind({ code: 'KeyQ' })).toBeNull();
  });

  test('builds normalized keyboard actions with stable timing metadata', () => {
    expect(resolveHumanKeyboardAction({
      code: 'KeyD',
      key: 'd',
      repeat: false,
      timeStamp: 128
    })).toEqual({
      kind: 'move_right',
      source: 'keyboard',
      atMs: 128,
      repeat: false,
      key: 'KeyD'
    });
  });

  test('bounds repeated movement actions but blocks repeated toggles', () => {
    const gate = new HumanInputRepeatGate({ moveRepeatMinIntervalMs: 120 });
    const move = resolveHumanKeyboardAction({ code: 'ArrowRight', repeat: false, timeStamp: 100 })!;
    const earlyRepeat = resolveHumanKeyboardAction({ code: 'ArrowRight', repeat: true, timeStamp: 180 })!;
    const lateRepeat = resolveHumanKeyboardAction({ code: 'ArrowRight', repeat: true, timeStamp: 240 })!;
    const pauseRepeat = resolveHumanKeyboardAction({ code: 'KeyP', repeat: true, timeStamp: 260 })!;

    expect(gate.accept(move)).toBe(true);
    expect(gate.accept(earlyRepeat)).toBe(false);
    expect(gate.accept(lateRepeat)).toBe(true);
    expect(gate.accept(pauseRepeat)).toBe(false);
  });
});
