import { describe, expect, test } from 'vitest';

import {
  DEFAULT_WATCH_PASS_PREFERENCES,
  WATCH_PASS_PREFERENCE_STORAGE_KEY,
  mergeWatchPassPreferences,
  readWatchPassPreferences,
  resolveWatchPassPreferencesFromSearch,
  writeWatchPassPreferences
} from '../../src/settings/preferences.ts';

describe('watch pass preferences', () => {
  test('normalizes local search params into persisted preview settings', () => {
    expect(resolveWatchPassPreferencesFromSearch('?platformFrame=android-like&privacy=private&reducedMotion=true&thoughtDensity=richer&pacingPreset=brisk')).toEqual({
      platformFrame: 'android-like',
      privacyMode: 'private',
      reducedMotion: true,
      thoughtDensity: 'richer',
      pacingPreset: 'brisk',
      selectedPlanId: 'yearly',
      mockEntitled: false
    });
  });

  test('reads and writes bounded local preview preferences', () => {
    const storage = new Map<string, string>();
    const mockStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      }
    };

    expect(readWatchPassPreferences(mockStorage)).toEqual(DEFAULT_WATCH_PASS_PREFERENCES);

    writeWatchPassPreferences(mockStorage, mergeWatchPassPreferences(DEFAULT_WATCH_PASS_PREFERENCES, {
      platformFrame: 'android-like',
      privacyMode: 'compact',
      reducedMotion: true
    }));

    expect(storage.has(WATCH_PASS_PREFERENCE_STORAGE_KEY)).toBe(true);
    expect(readWatchPassPreferences(mockStorage)).toMatchObject({
      platformFrame: 'android-like',
      privacyMode: 'compact',
      reducedMotion: true
    });
  });
});
