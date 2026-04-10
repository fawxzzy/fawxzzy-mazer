export type MoveDirection = 0 | 1 | 2 | 3;

export interface MoveRepeatState {
  heldDirection: MoveDirection | null;
  nextRepeatAtMs: number;
}

export const resetMoveRepeatState = (state: MoveRepeatState): void => {
  state.heldDirection = null;
  state.nextRepeatAtMs = 0;
};

const resolveHeldDirection = (
  preferredDirection: MoveDirection | null,
  upPressed: boolean,
  downPressed: boolean,
  leftPressed: boolean,
  rightPressed: boolean
): MoveDirection | null => {
  if (preferredDirection === 0 && upPressed) return 0;
  if (preferredDirection === 1 && downPressed) return 1;
  if (preferredDirection === 2 && leftPressed) return 2;
  if (preferredDirection === 3 && rightPressed) return 3;
  if (upPressed) return 0;
  if (downPressed) return 1;
  if (leftPressed) return 2;
  if (rightPressed) return 3;
  return null;
};

export const pollMoveRepeatDirection = (
  state: MoveRepeatState,
  time: number,
  tappedDirection: MoveDirection | null,
  upPressed: boolean,
  downPressed: boolean,
  leftPressed: boolean,
  rightPressed: boolean,
  initialDelayMs: number,
  repeatRateMs: number
): MoveDirection | null => {
  if (tappedDirection !== null) {
    state.heldDirection = tappedDirection;
    state.nextRepeatAtMs = time + initialDelayMs;
    return tappedDirection;
  }

  const heldDirection = resolveHeldDirection(state.heldDirection, upPressed, downPressed, leftPressed, rightPressed);
  if (heldDirection === null) {
    resetMoveRepeatState(state);
    return null;
  }

  if (state.heldDirection !== heldDirection) {
    state.heldDirection = heldDirection;
    state.nextRepeatAtMs = time + initialDelayMs;
    return heldDirection;
  }

  if (time < state.nextRepeatAtMs) {
    return null;
  }

  while (state.nextRepeatAtMs <= time) {
    state.nextRepeatAtMs += Math.max(1, repeatRateMs);
  }
  return heldDirection;
};
