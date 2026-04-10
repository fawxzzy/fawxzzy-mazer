import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  APP_NAMESPACE,
  KNOWN_STORAGE_KEYS,
  MazerStorage,
  WRITE_THROTTLE_MS,
  type MazerStorageEnvironment
} from '../../src/storage/mazerStorage';

class MemoryStorage {
  private readonly entries = new Map<string, string>();
  public setItemCalls = 0;

  public constructor(initial: Record<string, string> = {}) {
    for (const [key, value] of Object.entries(initial)) {
      this.entries.set(key, value);
    }
  }

  public get length(): number {
    return this.entries.size;
  }

  public getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  public key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  public removeItem(key: string): void {
    this.entries.delete(key);
  }

  public setItem(key: string, value: string): void {
    this.setItemCalls += 1;
    this.entries.set(key, value);
  }
}

interface TestEnvironmentOptions {
  cacheNames?: string[];
  databaseNames?: string[];
  localStorage?: Record<string, string>;
  now?: number;
  sessionStorage?: Record<string, string>;
}

const createEnvironment = (options: TestEnvironmentOptions = {}) => {
  const localStorage = new MemoryStorage(options.localStorage);
  const sessionStorage = new MemoryStorage(options.sessionStorage);
  let cacheNames = [...(options.cacheNames ?? [])];
  let databaseNames = [...(options.databaseNames ?? [])];
  const deletedCaches: string[] = [];
  const deletedDatabases: string[] = [];
  const ownRegistration = {
    scope: 'https://mazer.test/app/',
    unregister: vi.fn(async () => true)
  };
  const otherRegistration = {
    scope: 'https://mazer.test/other/',
    unregister: vi.fn(async () => true)
  };

  const environment: MazerStorageEnvironment = {
    baseUrl: '/app/',
    cacheStorage: {
      async delete(cacheName: string): Promise<boolean> {
        deletedCaches.push(cacheName);
        cacheNames = cacheNames.filter((name) => name !== cacheName);
        return true;
      },
      async keys(): Promise<string[]> {
        return [...cacheNames];
      }
    },
    clearTimeout,
    indexedDB: {
      async databases(): Promise<IDBDatabaseInfo[]> {
        return databaseNames.map((name) => ({ name }));
      },
      deleteDatabase(name: string) {
        deletedDatabases.push(name);
        const request: {
          onblocked: ((event: Event) => unknown) | null;
          onerror: ((event: Event) => unknown) | null;
          onsuccess: ((event: Event) => unknown) | null;
        } = {
          onblocked: null,
          onerror: null,
          onsuccess: null
        };
        queueMicrotask(() => {
          request.onsuccess?.({} as Event);
        });
        databaseNames = databaseNames.filter((databaseName) => databaseName !== name);
        return request as unknown as IDBOpenDBRequest;
      }
    },
    localStorage,
    now: () => options.now ?? Date.UTC(2026, 3, 8, 12, 0, 0),
    origin: 'https://mazer.test',
    serviceWorker: {
      async getRegistrations() {
        return [ownRegistration, otherRegistration];
      }
    },
    sessionStorage,
    setTimeout
  };

  return {
    deletedCaches,
    deletedDatabases,
    environment,
    localStorage,
    ownRegistration,
    otherRegistration,
    sessionStorage
  };
};

const createEmptyBestByBucket = () => ({
  small: {
    chill: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
    standard: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
    spicy: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
    brutal: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null }
  },
  medium: {
    chill: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
    standard: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
    spicy: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
    brutal: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null }
  },
  large: {
    chill: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
    standard: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
    spicy: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
    brutal: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null }
  },
  huge: {
    chill: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
    standard: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
    spicy: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
    brutal: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null }
  }
});

const createDefaultProgress = () => ({
  bestByBucket: createEmptyBestByBucket(),
  clearsCount: 0,
  lastDifficulty: 'standard',
  lastSize: 'medium'
});

describe('mazer storage', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('removes malformed and legacy Mazer-owned data without touching unrelated keys', async () => {
    const { deletedCaches, deletedDatabases, environment, localStorage, sessionStorage } = createEnvironment({
      cacheNames: ['mazer-v1-runtime', 'mazer-v2-precache', 'other-cache'],
      databaseNames: ['mazer:v1:data', 'mazer:v2:data', 'other-db'],
      localStorage: {
        'other:key': 'keep',
        'mazer:v1:progress': '{}',
        'mazer:debug': '[]',
        [KNOWN_STORAGE_KEYS.meta]: '[]',
        [KNOWN_STORAGE_KEYS.progress]: '{bad json',
        [KNOWN_STORAGE_KEYS.settings]: '42'
      },
      sessionStorage: {
        'other:session': 'keep',
        'mazer:ephemeral': '1'
      }
    });

    const storage = new MazerStorage(environment);
    await storage.bootstrap();

    expect(localStorage.getItem('other:key')).toBe('keep');
    expect(localStorage.getItem('mazer:v1:progress')).toBeNull();
    expect(localStorage.getItem('mazer:debug')).toBeNull();
    expect(localStorage.getItem(KNOWN_STORAGE_KEYS.progress)).toBe(JSON.stringify(createDefaultProgress()));
    expect(localStorage.getItem(KNOWN_STORAGE_KEYS.settings)).toBeNull();
    expect(localStorage.getItem(KNOWN_STORAGE_KEYS.meta)).toBe(JSON.stringify({
      namespace: APP_NAMESPACE,
      schemaVersion: 2
    }));
    expect(sessionStorage.getItem('other:session')).toBe('keep');
    expect(sessionStorage.getItem('mazer:ephemeral')).toBeNull();
    expect(deletedCaches).toEqual(['mazer-v1-runtime']);
    expect(deletedDatabases).toEqual(['mazer:v1:data']);
  });

  test('sanitizes stored progress into a tiny bounded object', async () => {
    const { environment, localStorage } = createEnvironment({
      localStorage: {
        [KNOWN_STORAGE_KEYS.progress]: JSON.stringify({
          bestByBucket: {
            small: {
              chill: { bestEfficiencyPct: -4, bestMoves: -1, bestRank: 'SS', bestScore: -3, bestTimeMs: 0 },
              standard: { bestEfficiencyPct: 95.6, bestMoves: 77.2, bestRank: 'A', bestScore: 6_420.4, bestTimeMs: 28_500.6 },
              spicy: { bestEfficiencyPct: 88, bestMoves: 91, bestRank: 'B', bestScore: 7_330, bestTimeMs: 49_200 },
              brutal: { bestEfficiencyPct: 'bad', bestMoves: [], bestRank: null, bestScore: {}, bestTimeMs: 'bad' }
            }
          },
          clearsCount: 1_500_000,
          lastDifficulty: 'unknown',
          lastSize: 'corrupt'
        })
      }
    });

    const storage = new MazerStorage(environment);
    await storage.bootstrap();

    expect(storage.getProgress()).toEqual({
      bestByBucket: {
        ...createEmptyBestByBucket(),
        small: {
          chill: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
          standard: { bestEfficiencyPct: 96, bestMoves: 77, bestRank: 'A', bestScore: 6_420, bestTimeMs: 28_501 },
          spicy: { bestEfficiencyPct: 88, bestMoves: 91, bestRank: 'B', bestScore: 7_330, bestTimeMs: 49_200 },
          brutal: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null }
        }
      },
      clearsCount: 999_999,
      lastDifficulty: 'standard',
      lastSize: 'medium'
    });

    const persisted = JSON.parse(localStorage.getItem(KNOWN_STORAGE_KEYS.progress) ?? '{}') as { clearsCount: number };
    expect(Array.isArray(persisted)).toBe(false);
    expect(persisted.clearsCount).toBe(999_999);
  });

  test('sanitizes stored settings into bounded mute and reduced-motion flags', async () => {
    const { environment, localStorage } = createEnvironment({
      localStorage: {
        [KNOWN_STORAGE_KEYS.settings]: JSON.stringify({
          muted: 'loud',
          reducedMotion: true,
          junk: ['ignore me']
        })
      }
    });

    const storage = new MazerStorage(environment);
    await storage.bootstrap();

    expect(storage.getSettings()).toEqual({
      muted: false,
      reducedMotion: true
    });
    expect(localStorage.getItem(KNOWN_STORAGE_KEYS.settings)).toBe(JSON.stringify({
      muted: false,
      reducedMotion: true
    }));
  });

  test('records personal bests by difficulty and persists the last played size and difficulty', async () => {
    const { environment } = createEnvironment();
    const storage = new MazerStorage(environment);
    await storage.bootstrap();

    storage.setLastPlayedSelection('spicy', 'large');
    const first = storage.recordRunResult({
      difficulty: 'spicy',
      elapsedMs: 45_000,
      efficiencyPercent: 92,
      moveCount: 132,
      rank: 'A',
      score: 8_240,
      size: 'large'
    });
    const second = storage.recordRunResult({
      difficulty: 'spicy',
      elapsedMs: 47_000,
      efficiencyPercent: 95,
      moveCount: 128,
      rank: 'S',
      score: 8_660,
      size: 'large'
    });

    expect(first.isNewBestTime).toBe(true);
    expect(first.isNewBestMoves).toBe(true);
    expect(first.isNewBestScore).toBe(true);
    expect(second.isNewBestTime).toBe(false);
    expect(second.isNewBestMoves).toBe(true);
    expect(second.isNewBestEfficiency).toBe(true);
    expect(second.isNewBestRank).toBe(true);
    expect(second.progress.lastDifficulty).toBe('spicy');
    expect(second.progress.lastSize).toBe('large');
    expect(second.progress.clearsCount).toBe(2);
    expect(second.progress.bestByBucket.large.spicy).toEqual({
      bestEfficiencyPct: 95,
      bestMoves: 128,
      bestRank: 'S',
      bestScore: 8_660,
      bestTimeMs: 45_000
    });
  });

  test('clears only Mazer-owned local data and app-scoped artifacts', async () => {
    const { deletedCaches, deletedDatabases, environment, localStorage, ownRegistration, otherRegistration, sessionStorage } = createEnvironment({
      cacheNames: ['mazer-v2-precache', 'other-cache'],
      databaseNames: ['mazer:v2:data', 'other-db'],
      localStorage: {
        [KNOWN_STORAGE_KEYS.progress]: JSON.stringify({
          bestByBucket: {
            ...createEmptyBestByBucket(),
            small: {
              chill: { bestEfficiencyPct: 97, bestMoves: 88, bestRank: 'S', bestScore: 8_900, bestTimeMs: 24_000 },
              standard: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
              spicy: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null },
              brutal: { bestEfficiencyPct: null, bestMoves: null, bestRank: null, bestScore: null, bestTimeMs: null }
            }
          },
          clearsCount: 4,
          lastDifficulty: 'chill',
          lastSize: 'small'
        }),
        [KNOWN_STORAGE_KEYS.meta]: JSON.stringify({ namespace: APP_NAMESPACE, schemaVersion: 2 }),
        'other:key': 'keep'
      },
      sessionStorage: {
        'mazer:session': '1',
        'other:session': 'keep'
      }
    });

    const storage = new MazerStorage(environment);
    await storage.bootstrap();
    await storage.clearLocalData();

    expect(localStorage.getItem(KNOWN_STORAGE_KEYS.progress)).toBeNull();
    expect(localStorage.getItem(KNOWN_STORAGE_KEYS.meta)).toBeNull();
    expect(localStorage.getItem('other:key')).toBe('keep');
    expect(sessionStorage.getItem('mazer:session')).toBeNull();
    expect(sessionStorage.getItem('other:session')).toBe('keep');
    expect(deletedCaches).toEqual(['mazer-v2-precache']);
    expect(deletedDatabases).toEqual(['mazer:v2:data']);
    expect(ownRegistration.unregister).toHaveBeenCalledTimes(1);
    expect(otherRegistration.unregister).not.toHaveBeenCalled();
  });

  test('throttles progress writes and keeps the payload bounded', async () => {
    vi.useFakeTimers();
    const { environment, localStorage } = createEnvironment();
    const storage = new MazerStorage(environment);
    await storage.bootstrap();
    const baselineWrites = localStorage.setItemCalls;

    storage.setLastPlayedSelection('brutal', 'huge');
    for (let index = 0; index < 6; index += 1) {
      storage.recordRunResult({
        difficulty: 'brutal',
        elapsedMs: 90_000 - (index * 1000),
        efficiencyPercent: 72 + index,
        moveCount: 220 - index,
        rank: index >= 4 ? 'B' : 'C',
        score: 6_000 + (index * 180),
        size: 'huge'
      });
    }

    expect(localStorage.setItemCalls).toBe(baselineWrites);
    expect(localStorage.getItem(KNOWN_STORAGE_KEYS.progress)).toBeNull();

    vi.advanceTimersByTime(WRITE_THROTTLE_MS - 1);
    expect(localStorage.setItemCalls).toBe(baselineWrites);

    vi.advanceTimersByTime(1);

    expect(localStorage.setItemCalls).toBe(baselineWrites + 1);
    const persisted = JSON.parse(localStorage.getItem(KNOWN_STORAGE_KEYS.progress) ?? '{}') as {
      bestByBucket: { huge: { brutal: { bestEfficiencyPct: number; bestMoves: number; bestRank: string; bestScore: number; bestTimeMs: number } } };
      clearsCount: number;
      lastDifficulty: string;
      lastSize: string;
    };
    expect(Array.isArray(persisted)).toBe(false);
    expect(Object.keys(persisted.bestByBucket)).toHaveLength(4);
    expect(persisted.bestByBucket.huge.brutal).toEqual({
      bestEfficiencyPct: 77,
      bestMoves: 215,
      bestRank: 'B',
      bestScore: 6_900,
      bestTimeMs: 85_000
    });
    expect(persisted.clearsCount).toBe(6);
    expect(persisted.lastDifficulty).toBe('brutal');
    expect(persisted.lastSize).toBe('huge');
  });

  test('persists mute and reduced-motion settings with throttled tiny writes', async () => {
    vi.useFakeTimers();
    const { environment, localStorage } = createEnvironment();
    const storage = new MazerStorage(environment);
    await storage.bootstrap();
    const baselineWrites = localStorage.setItemCalls;

    expect(storage.setSettings({ muted: true })).toEqual({
      muted: true,
      reducedMotion: false
    });
    expect(storage.setSettings({ reducedMotion: true })).toEqual({
      muted: true,
      reducedMotion: true
    });
    expect(localStorage.getItem(KNOWN_STORAGE_KEYS.settings)).toBeNull();

    vi.advanceTimersByTime(WRITE_THROTTLE_MS);

    expect(localStorage.setItemCalls).toBe(baselineWrites + 1);
    expect(localStorage.getItem(KNOWN_STORAGE_KEYS.settings)).toBe(JSON.stringify({
      muted: true,
      reducedMotion: true
    }));
  });
});
