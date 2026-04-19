import type { HumanInputAction, HumanInputActionKind } from './actions';

export interface HumanRunState {
  step: number;
  paused: boolean;
  attempt: number;
  thoughtsVisible: boolean;
  lastActionKind: HumanInputActionKind | null;
  movementCount: number;
}

export const createHumanRunState = (overrides: Partial<HumanRunState> = {}): HumanRunState => ({
  step: 0,
  paused: false,
  attempt: 1,
  thoughtsVisible: true,
  lastActionKind: null,
  movementCount: 0,
  ...overrides
});

export const applyHumanInputAction = (
  state: HumanRunState,
  action: HumanInputAction
): HumanRunState => {
  const nextState: HumanRunState = {
    ...state,
    step: state.step + 1,
    lastActionKind: action.kind
  };

  switch (action.kind) {
    case 'move_up':
    case 'move_down':
    case 'move_left':
    case 'move_right':
      return {
        ...nextState,
        movementCount: state.movementCount + 1
      };
    case 'pause':
      return {
        ...nextState,
        paused: !state.paused
      };
    case 'restart_attempt':
      return {
        ...nextState,
        paused: false,
        attempt: state.attempt + 1,
        movementCount: 0
      };
    case 'toggle_thoughts':
      return {
        ...nextState,
        thoughtsVisible: !state.thoughtsVisible
      };
    default:
      return nextState;
  }
};

