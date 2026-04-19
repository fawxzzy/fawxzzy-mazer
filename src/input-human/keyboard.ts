import {
  isMovementActionKind,
  type KeyboardInputLike,
  type HumanInputAction,
  type HumanInputActionKind
} from './actions';

export interface HumanInputRepeatGateOptions {
  moveRepeatMinIntervalMs?: number;
}

const KEYBOARD_CODE_TO_ACTION: Record<string, HumanInputActionKind> = {
  ArrowUp: 'move_up',
  ArrowDown: 'move_down',
  ArrowLeft: 'move_left',
  ArrowRight: 'move_right',
  KeyW: 'move_up',
  KeyS: 'move_down',
  KeyA: 'move_left',
  KeyD: 'move_right',
  KeyP: 'pause',
  Space: 'pause',
  KeyR: 'restart_attempt',
  KeyT: 'toggle_thoughts'
};

const KEYBOARD_KEY_TO_ACTION: Record<string, HumanInputActionKind> = {
  arrowup: 'move_up',
  arrowdown: 'move_down',
  arrowleft: 'move_left',
  arrowright: 'move_right',
  w: 'move_up',
  s: 'move_down',
  a: 'move_left',
  d: 'move_right',
  p: 'pause',
  ' ': 'pause',
  r: 'restart_attempt',
  t: 'toggle_thoughts'
};

const normalizeKey = (value: string | null | undefined): string => {
  if (typeof value !== 'string') {
    return '';
  }

  return value === ' ' ? ' ' : value.trim().toLowerCase();
};

export const resolveHumanKeyboardActionKind = (
  event: KeyboardInputLike
): HumanInputActionKind | null => {
  const code = typeof event.code === 'string' ? event.code.trim() : '';
  if (code.length > 0 && KEYBOARD_CODE_TO_ACTION[code]) {
    return KEYBOARD_CODE_TO_ACTION[code];
  }

  const normalizedKey = normalizeKey(event.key);
  return KEYBOARD_KEY_TO_ACTION[normalizedKey] ?? null;
};

export const resolveHumanKeyboardAction = (
  event: KeyboardInputLike,
  nowMs = Date.now()
): HumanInputAction | null => {
  const kind = resolveHumanKeyboardActionKind(event);
  if (!kind) {
    return null;
  }

  return {
    kind,
    source: 'keyboard',
    atMs: Number.isFinite(event.timeStamp) ? Math.max(0, Math.round(event.timeStamp ?? nowMs)) : nowMs,
    repeat: event.repeat === true,
    key: typeof event.code === 'string' && event.code.trim().length > 0
      ? event.code.trim()
      : typeof event.key === 'string' && event.key.trim().length > 0
        ? event.key.trim()
        : kind
  };
};

export class HumanInputRepeatGate {
  private readonly moveRepeatMinIntervalMs: number;

  private readonly lastAcceptedAtMs = new Map<HumanInputActionKind, number>();

  constructor(options: HumanInputRepeatGateOptions = {}) {
    this.moveRepeatMinIntervalMs = Math.max(48, Math.round(options.moveRepeatMinIntervalMs ?? 132));
  }

  accept(action: HumanInputAction, nowMs = action.atMs ?? Date.now()): boolean {
    const acceptedAtMs = Number.isFinite(nowMs) ? Math.max(0, Math.round(nowMs)) : Date.now();
    const lastAcceptedAt = this.lastAcceptedAtMs.get(action.kind) ?? null;

    if (!action.repeat) {
      this.lastAcceptedAtMs.set(action.kind, acceptedAtMs);
      return true;
    }

    if (!isMovementActionKind(action.kind)) {
      return false;
    }

    if (lastAcceptedAt !== null && (acceptedAtMs - lastAcceptedAt) < this.moveRepeatMinIntervalMs) {
      return false;
    }

    this.lastAcceptedAtMs.set(action.kind, acceptedAtMs);
    return true;
  }
}

export const resolveHumanInputActionKindFromKeyboard = resolveHumanKeyboardActionKind;
