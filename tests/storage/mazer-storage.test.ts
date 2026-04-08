import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  APP_NAMESPACE,
  BEST_TIME_LIMIT,
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

describe('mazer storage', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('removes malformed and legacy Mazer-owned data without touching unrelated keys', async () => {
    const { deletedCaches, deletedDatabases, environment, localStorage, sessionStorage } = createEnvironment({
      cacheNames: ['mazer-v0-runtime', 'mazer-v1-precache', 'other-cache'],
      databaseNames: ['mazer:v0:data', 'mazer:v1:data', 'other-db'],
      localStorage: {
        'other:key': 'keep',
        'mazer:v0:settings': '{}',
        'mazer:debug': '[]',
        'mazer:v1:obsolete': '[]',
        [KNOWN_STORAGE_KEYS.bestTimes]: '{bad json',
        [KNOWN_STORAGE_KEYS.meta]: '[]',
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
    expect(localStorage.getItem('mazer:v0:settings')).toBeNull();
    expect(localStorage.getItem('mazer:debug')).toBeNull();
    expect(localStorage.getItem('mazer:v1:obsolete')).toBeNull();
    expect(localStorage.getItem(KNOWN_STORAGE_KEYS.bestTimes)).toBe('[]');
    expect(localStorage.getItem(KNOWN_STORAGE_KEYS.settings)).toBeNull();
    expect(localStorage.getItem(KNOWN_STORAGE_KEYS.meta)).toBe(JSON.stringify({
      schemaVersion: 1,
      namespace: APP_NAMESPACE
    }));
    expect(sessionStorage.getItem('other:session')).toBe('keep');
    expect(sessionStorage.getItem('mazer:ephemeral')).toBeNull();
    expect(sessionStorage.getItem(KNOWN_STORAGE_KEYS.meta)).toBeNull();
    expect(deletedCaches).toEqual(['mazer-v0-runtime']);
    expect(deletedDatabases).toEqual(['mazer:v0:data']);
    expect(storage.getBestTimes()).toEqual([]);
  });

  test('sanitizes stored best times into a capped sorted list', async () => {
    const seededEntries = Array.from({ length: BEST_TIME_LIMIT + 4 }, (_, index) => ({
      elapsedMs: 20000 + (index * 1000),
      seed: index,
      recordedAt: `2026-04-08T12:${String(index).padStart(2, '0')}:00.000Z`
    }));
    const rawEntries = [
      { elapsedMs: -1, seed: 999, recordedAt: 'bad' },
      { elapsedMs: 48000, seed: 2, recordedAt: '2026-04-08T13:00:00.000Z' },
      { elapsedMs: 19000, seed: 2, recordedAt: '2026-04-08T11:59:00.000Z' },
      ...seededEntries,
      { nope: true }
    ];
    const { environment, localStorage } = createEnvironment({
      localStorage: {
        [KNOWN_STORAGE_KEYS.bestTimes]: JSON.stringify(rawEntries)
      }
    });

    const storage = new MazerStorage(environment);
    await storage.bootstrap();

    const bestTimes = storage.getBestTimes();
    expect(bestTimes).toHaveLength(BEST_TIME_LIMIT);
    expect(bestTimes[0]).toEqual({
      elapsedMs: 19000,
      seed: 2,
      recordedAt: '2026-04-08T11:59:00.000Z'
    });
    expect(bestTimes.every((entry, index, entries) => index === 0 || entries[index - 1].elapsedMs <= entry.elapsedMs)).toBe(true);

    const persisted = JSON.parse(localStorage.getItem(KNOWN_STORAGE_KEYS.bestTimes) ?? '[]') as Array<{ seed: number }>;
    expect(persisted).toHaveLength(BEST_TIME_LIMIT);
    expect(persisted.filter((entry) => entry.seed === 2)).toHaveLength(1);
  });

  test('clears only Mazer-owned local data and app-scoped artifacts', async () => {
    const { deletedCaches, deletedDatabases, environment, localStorage, ownRegistration, otherRegistration, sessionStorage } = createEnvironment({
      cacheNames: ['mazer-v1-precache', 'other-cache'],
      databaseNames: ['mazer:v1:data', 'other-db'],
      localStorage: {
        [KNOWN_STORAGE_KEYS.bestTimes]: JSON.stringify([{ elapsedMs: 22000, seed: 7, recordedAt: '2026-04-08T12:00:00.000Z' }]),
        [KNOWN_STORAGE_KEYS.meta]: JSON.stringify({ schemaVersion: 1, namespace: APP_NAMESPACE }),
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

    expect(localStorage.getItem(KNOWN_STORAGE_KEYS.bestTimes)).toBeNull();
    expect(localStorage.getItem(KNOWN_STORAGE_KEYS.meta)).toBeNull();
    expect(localStorage.getItem('other:key')).toBe('keep');
    expect(sessionStorage.getItem('mazer:session')).toBeNull();
    expect(sessionStorage.getItem('other:session')).toBe('keep');
    expect(deletedCaches).toEqual(['mazer-v1-precache']);
    expect(deletedDatabases).toEqual(['mazer:v1:data']);
    expect(ownRegistration.unregister).toHaveBeenCalledTimes(1);
    expect(otherRegistration.unregister).not.toHaveBeenCalled();
    expect(storage.getBestTimes()).toEqual([]);
  });

  test('throttles best-time writes and keeps the persisted list bounded', async () => {
    vi.useFakeTimers();
    const { environment, localStorage } = createEnvironment();
    const storage = new MazerStorage(environment);
    await storage.bootstrap();
    const baselineWrites = localStorage.setItemCalls;

    for (let index = 0; index < BEST_TIME_LIMIT + 3; index += 1) {
      storage.recordBestTime({
        elapsedMs: 60000 - (index * 1000),
        seed: index,
        recordedAt: `2026-04-08T12:${String(index).padStart(2, '0')}:00.000Z`
      });
    }
    storage.recordBestTime({
      elapsedMs: 12000,
      seed: 3,
      recordedAt: '2026-04-08T11:58:00.000Z'
    });

    expect(localStorage.setItemCalls).toBe(baselineWrites);
    expect(localStorage.getItem(KNOWN_STORAGE_KEYS.bestTimes)).toBeNull();

    vi.advanceTimersByTime(WRITE_THROTTLE_MS - 1);
    expect(localStorage.setItemCalls).toBe(baselineWrites);

    vi.advanceTimersByTime(1);

    expect(localStorage.setItemCalls).toBe(baselineWrites + 1);
    const persisted = JSON.parse(localStorage.getItem(KNOWN_STORAGE_KEYS.bestTimes) ?? '[]') as Array<{ elapsedMs: number; seed: number }>;
    expect(persisted).toHaveLength(BEST_TIME_LIMIT);
    expect(persisted.find((entry) => entry.seed === 3)?.elapsedMs).toBe(12000);
  });
});
