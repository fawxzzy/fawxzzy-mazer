export const HUMAN_INPUT_ACTION_KINDS = [
  'move_up',
  'move_down',
  'move_left',
  'move_right',
  'pause',
  'restart_attempt',
  'toggle_thoughts'
] as const;

export type HumanInputActionKind = (typeof HUMAN_INPUT_ACTION_KINDS)[number];
export type RuntimeMode = 'watch' | 'play';
export type HumanInputSource = 'keyboard' | 'touch' | 'ai';

export interface KeyboardInputLike {
  code?: string | null;
  key?: string | null;
  repeat?: boolean;
  timeStamp?: number;
}

export interface HumanInputAction {
  kind: HumanInputActionKind;
  source: HumanInputSource;
  atMs?: number;
  repeat?: boolean;
  key?: string;
  repeatIndex?: number;
}

export const isHumanInputActionKind = (value: unknown): value is HumanInputActionKind => (
  typeof value === 'string' && (HUMAN_INPUT_ACTION_KINDS as readonly string[]).includes(value)
);

export const isMovementActionKind = (
  value: HumanInputActionKind | null | undefined
): value is Extract<HumanInputActionKind, 'move_up' | 'move_down' | 'move_left' | 'move_right'> => (
  value === 'move_up'
  || value === 'move_down'
  || value === 'move_left'
  || value === 'move_right'
);
