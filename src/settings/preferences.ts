import type { RunProjectionPrivacy } from '../projections/runProjection.ts';

export const WATCH_PASS_PREFERENCE_STORAGE_KEY = 'mazer.watch-pass.preferences.v1';

export const WATCH_PASS_PLATFORM_FRAME_OPTIONS = ['ios-like', 'android-like'] as const;
export const WATCH_PASS_THOUGHT_DENSITY_OPTIONS = ['sparse', 'richer'] as const;
export const WATCH_PASS_PACING_PRESET_OPTIONS = ['calm', 'balanced', 'brisk'] as const;
export const WATCH_PASS_PLAN_OPTIONS = ['monthly', 'yearly', 'not-now'] as const;

export type WatchPassPlatformFrame = (typeof WATCH_PASS_PLATFORM_FRAME_OPTIONS)[number];
export type WatchPassThoughtDensity = (typeof WATCH_PASS_THOUGHT_DENSITY_OPTIONS)[number];
export type WatchPassPacingPreset = (typeof WATCH_PASS_PACING_PRESET_OPTIONS)[number];
export type WatchPassPlanId = (typeof WATCH_PASS_PLAN_OPTIONS)[number];

export interface WatchPassPreferences {
  platformFrame: WatchPassPlatformFrame;
  privacyMode: RunProjectionPrivacy;
  reducedMotion: boolean;
  thoughtDensity: WatchPassThoughtDensity;
  pacingPreset: WatchPassPacingPreset;
  selectedPlanId: WatchPassPlanId | null;
  mockEntitled: boolean;
}

export const DEFAULT_WATCH_PASS_PREFERENCES: WatchPassPreferences = Object.freeze({
  platformFrame: 'ios-like',
  privacyMode: 'full',
  reducedMotion: false,
  thoughtDensity: 'sparse',
  pacingPreset: 'balanced',
  selectedPlanId: 'yearly',
  mockEntitled: false
});

const isPrivacyMode = (value: unknown): value is RunProjectionPrivacy => (
  value === 'full' || value === 'compact' || value === 'private'
);

const isPlatformFrame = (value: unknown): value is WatchPassPlatformFrame => (
  value === 'ios-like' || value === 'android-like'
);

const isThoughtDensity = (value: unknown): value is WatchPassThoughtDensity => (
  value === 'sparse' || value === 'richer'
);

const isPacingPreset = (value: unknown): value is WatchPassPacingPreset => (
  value === 'calm' || value === 'balanced' || value === 'brisk'
);

const isWatchPassPlanId = (value: unknown): value is WatchPassPlanId => (
  value === 'monthly' || value === 'yearly' || value === 'not-now'
);

const normalizeBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  return fallback;
};

export const normalizeWatchPassPreferences = (
  value?: Partial<WatchPassPreferences> | null
): WatchPassPreferences => ({
  platformFrame: isPlatformFrame(value?.platformFrame)
    ? value.platformFrame
    : DEFAULT_WATCH_PASS_PREFERENCES.platformFrame,
  privacyMode: isPrivacyMode(value?.privacyMode)
    ? value.privacyMode
    : DEFAULT_WATCH_PASS_PREFERENCES.privacyMode,
  reducedMotion: normalizeBoolean(value?.reducedMotion, DEFAULT_WATCH_PASS_PREFERENCES.reducedMotion),
  thoughtDensity: isThoughtDensity(value?.thoughtDensity)
    ? value.thoughtDensity
    : DEFAULT_WATCH_PASS_PREFERENCES.thoughtDensity,
  pacingPreset: isPacingPreset(value?.pacingPreset)
    ? value.pacingPreset
    : DEFAULT_WATCH_PASS_PREFERENCES.pacingPreset,
  selectedPlanId: isWatchPassPlanId(value?.selectedPlanId)
    ? value.selectedPlanId
    : DEFAULT_WATCH_PASS_PREFERENCES.selectedPlanId,
  mockEntitled: normalizeBoolean(value?.mockEntitled, DEFAULT_WATCH_PASS_PREFERENCES.mockEntitled)
});

export const mergeWatchPassPreferences = (
  base: WatchPassPreferences,
  value?: Partial<WatchPassPreferences> | null
): WatchPassPreferences => normalizeWatchPassPreferences({
  ...base,
  ...value
});

export const resolveWatchPassPreferencesFromSearch = (
  search: string | URLSearchParams
): Partial<WatchPassPreferences> => {
  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

  const platformFrame = params.get('platformFrame') ?? params.get('platform');
  const privacyMode = params.get('privacy');
  const reducedMotion = params.get('reducedMotion');
  const thoughtDensity = params.get('thoughtDensity');
  const pacingPreset = params.get('pacingPreset');
  const selectedPlanId = params.get('plan') ?? params.get('selectedPlanId');
  const mockEntitled = params.get('entitled');

  return normalizeWatchPassPreferences({
    ...(platformFrame === 'ios' ? { platformFrame: 'ios-like' } : {}),
    ...(platformFrame === 'android' ? { platformFrame: 'android-like' } : {}),
    ...(isPlatformFrame(platformFrame) ? { platformFrame } : {}),
    ...(isPrivacyMode(privacyMode) ? { privacyMode } : {}),
    ...(typeof reducedMotion === 'string' ? { reducedMotion: normalizeBoolean(reducedMotion, DEFAULT_WATCH_PASS_PREFERENCES.reducedMotion) } : {}),
    ...(isThoughtDensity(thoughtDensity) ? { thoughtDensity } : {}),
    ...(isPacingPreset(pacingPreset) ? { pacingPreset } : {}),
    ...(isWatchPassPlanId(selectedPlanId) ? { selectedPlanId } : {}),
    ...(typeof mockEntitled === 'string' ? { mockEntitled: normalizeBoolean(mockEntitled, DEFAULT_WATCH_PASS_PREFERENCES.mockEntitled) } : {})
  });
};

export const readWatchPassPreferences = (
  storage?: Pick<Storage, 'getItem'>
): WatchPassPreferences => {
  if (!storage) {
    return DEFAULT_WATCH_PASS_PREFERENCES;
  }

  try {
    const raw = storage.getItem(WATCH_PASS_PREFERENCE_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_WATCH_PASS_PREFERENCES;
    }

    return normalizeWatchPassPreferences(JSON.parse(raw) as Partial<WatchPassPreferences>);
  } catch {
    return DEFAULT_WATCH_PASS_PREFERENCES;
  }
};

export const writeWatchPassPreferences = (
  storage: Pick<Storage, 'setItem'> | undefined,
  preferences: WatchPassPreferences
): WatchPassPreferences => {
  const normalized = normalizeWatchPassPreferences(preferences);
  if (!storage) {
    return normalized;
  }

  try {
    storage.setItem(WATCH_PASS_PREFERENCE_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Storage is best-effort only for the local preview shell.
  }

  return normalized;
};
