import type { HumanInputAction, KeyboardInputLike } from './actions';
import {
  isMovementActionKind
} from './actions';
import { resolveHumanInputActionKindFromKeyboard } from './keyboard';
import type { HumanRunState } from './reducer';

export interface SimulationPolicy<TState, TAction> {
  readonly id: string;
  readonly kind: 'ai' | 'human';
  selectAction(state: TState): TAction | null;
  reset(): void;
}

export interface KeyboardSimulationPolicy extends SimulationPolicy<HumanRunState, HumanInputAction> {
  handleKeyDown(input: KeyboardInputLike): HumanInputAction | null;
  handleKeyUp(input: KeyboardInputLike): void;
}

export interface ScriptedSimulationPolicyOptions<TAction> {
  id?: string;
  kind?: 'ai' | 'human';
  actions: readonly TAction[];
}

export interface KeyboardSimulationPolicyOptions {
  id?: string;
  maxRepeatBurst?: number;
}

const buildKeyId = (input: KeyboardInputLike): string => {
  const code = typeof input.code === 'string' ? input.code.trim().toLowerCase() : '';
  const key = typeof input.key === 'string' ? input.key.trim().toLowerCase() : '';
  return code || key;
};

export const createScriptedSimulationPolicy = <TState, TAction>(
  options: ScriptedSimulationPolicyOptions<TAction>
): SimulationPolicy<TState, TAction> => {
  const queue = [...options.actions];

  return {
    id: options.id ?? 'scripted-policy',
    kind: options.kind ?? 'ai',
    selectAction: () => queue.shift() ?? null,
    reset: () => {
      queue.length = 0;
      queue.push(...options.actions);
    }
  };
};

export const createKeyboardSimulationPolicy = (
  options: KeyboardSimulationPolicyOptions = {}
): KeyboardSimulationPolicy => {
  const queue: HumanInputAction[] = [];
  const heldKeys = new Map<string, { kind: HumanInputAction['kind']; repeatCount: number }>();
  const maxRepeatBurst = Math.max(0, Math.trunc(options.maxRepeatBurst ?? 2));

  const emitAction = (
    kind: HumanInputAction['kind'],
    repeatIndex: number
  ): HumanInputAction => {
    const action: HumanInputAction = {
      kind,
      source: 'keyboard',
      repeatIndex
    };
    queue.push(action);
    return action;
  };

  const handleKeyDown = (input: KeyboardInputLike): HumanInputAction | null => {
    const kind = resolveHumanInputActionKindFromKeyboard(input);
    if (!kind) {
      return null;
    }

    const keyId = buildKeyId(input);
    const held = heldKeys.get(keyId);
    const repeatRequested = Boolean(input.repeat);
    const repeatCount = held?.kind === kind ? held.repeatCount : 0;

    if (!repeatRequested && held && held.kind === kind) {
      return null;
    }

    if (repeatRequested && isMovementActionKind(kind)) {
      if (repeatCount >= (maxRepeatBurst + 1)) {
        return null;
      }
    } else if (repeatRequested) {
      return null;
    }

    heldKeys.set(keyId, {
      kind,
      repeatCount: repeatCount + 1
    });

    return emitAction(kind, repeatCount);
  };

  const handleKeyUp = (input: KeyboardInputLike): void => {
    const keyId = buildKeyId(input);
    if (keyId.length === 0) {
      return;
    }

    heldKeys.delete(keyId);
  };

  return {
    id: options.id ?? 'keyboard-policy',
    kind: 'human',
    selectAction(state: HumanRunState): HumanInputAction | null {
      while (queue.length > 0) {
        const nextAction = queue.shift() ?? null;
        if (!nextAction) {
          continue;
        }

        if (state.paused && isMovementActionKind(nextAction.kind)) {
          continue;
        }

        return nextAction;
      }

      return null;
    },
    reset(): void {
      queue.length = 0;
      heldKeys.clear();
    },
    handleKeyDown,
    handleKeyUp
  };
};

export const advanceSimulationPolicy = <TState, TAction>(
  state: TState,
  policy: SimulationPolicy<TState, TAction>,
  reducer: (nextState: TState, action: TAction) => TState
): { state: TState; action: TAction | null } => {
  const action = policy.selectAction(state);
  return {
    state: action ? reducer(state, action) : state,
    action
  };
};
