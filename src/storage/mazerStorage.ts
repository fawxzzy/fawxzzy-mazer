export interface BestTimeEntry {
  elapsedMs: number;
  seed: number;
  recordedAt: string;
}

export interface MazerSettings {}

interface MazerMeta {
  schemaVersion: number;
  namespace: string;
}

interface StorageLike {
  readonly length: number;
  getItem(key: string): string | null;
  key(index: number): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

interface CacheStorageLike {
  delete(cacheName: string): Promise<boolean>;
  keys(): Promise<string[]>;
}

interface ServiceWorkerRegistrationLike {
  scope: string;
  unregister(): Promise<boolean>;
}

interface ServiceWorkerContainerLike {
  getRegistrations(): Promise<ReadonlyArray<ServiceWorkerRegistrationLike>>;
}

export interface MazerStorageEnvironment {
  baseUrl: string;
  cacheStorage?: CacheStorageLike;
  clearTimeout: (handle: ReturnType<typeof globalThis.setTimeout>) => void;
  indexedDB?: Pick<IDBFactory, 'databases' | 'deleteDatabase'>;
  localStorage?: StorageLike;
  now: () => number;
  origin?: string;
  serviceWorker?: Pick<ServiceWorkerContainerLike, 'getRegistrations'>;
  sessionStorage?: StorageLike;
  setTimeout: typeof globalThis.setTimeout;
}

const STORAGE_VERSION = 1;
const APP_NAMESPACE = `mazer:v${STORAGE_VERSION}`;
const APP_CACHE_PREFIX = `mazer-v${STORAGE_VERSION}`;
const resolveBaseUrl = (): string => {
  if (typeof document === 'undefined') {
    return '/';
  }

  try {
    const pathname = new URL(document.baseURI).pathname;
    return pathname.endsWith('/') ? pathname : `${pathname}/`;
  } catch {
    return '/';
  }
};
const KNOWN_STORAGE_KEYS = {
  settings: `${APP_NAMESPACE}:settings`,
  bestTimes: `${APP_NAMESPACE}:bestTimes`,
  meta: `${APP_NAMESPACE}:meta`
} as const;
const CURRENT_STORAGE_KEYS = new Set<string>(Object.values(KNOWN_STORAGE_KEYS));
const OWNED_STORAGE_PREFIXES = ['mazer:', 'mazer-', 'mazer_', 'mazer.'] as const;
const BEST_TIME_LIMIT = 10;
const WRITE_THROTTLE_MS = 120;
const DEFAULT_SETTINGS: MazerSettings = {};
const DEFAULT_META: MazerMeta = {
  schemaVersion: STORAGE_VERSION,
  namespace: APP_NAMESPACE
};

const resolveEnvironment = (): MazerStorageEnvironment => ({
  baseUrl: resolveBaseUrl(),
  cacheStorage: typeof caches === 'undefined' ? undefined : caches,
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  indexedDB: typeof indexedDB === 'undefined' ? undefined : indexedDB,
  localStorage: typeof window === 'undefined' ? undefined : window.localStorage,
  now: () => Date.now(),
  origin: typeof window === 'undefined' ? undefined : window.location.origin,
  serviceWorker: typeof navigator === 'undefined' ? undefined : navigator.serviceWorker,
  sessionStorage: typeof window === 'undefined' ? undefined : window.sessionStorage,
  setTimeout: globalThis.setTimeout.bind(globalThis)
});

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
);

const isOwnedStorageKey = (key: string): boolean => OWNED_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));

const isOwnedCacheName = (cacheName: string): boolean => cacheName.startsWith('mazer-') || cacheName.startsWith('mazer:');

const isCurrentCacheName = (cacheName: string): boolean => cacheName.startsWith(APP_CACHE_PREFIX);

const isOwnedDatabaseName = (name: string): boolean => name.startsWith('mazer:') || name.startsWith('mazer-');

const toIsoTimestamp = (timestamp: number): string => new Date(timestamp).toISOString();

const formatElapsedMs = (elapsedMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const listStorageKeys = (storage?: StorageLike): string[] => {
  if (!storage) {
    return [];
  }

  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key) {
      keys.push(key);
    }
  }

  return keys;
};

const safeJsonParse = (value: string | null): unknown => {
  if (value === null) {
    return undefined;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
};

const sanitizeSettings = (value: unknown): MazerSettings | null => {
  if (value === undefined) {
    return DEFAULT_SETTINGS;
  }

  return isPlainObject(value) ? {} : null;
};

const sanitizeMeta = (value: unknown): MazerMeta | null => {
  if (!isPlainObject(value)) {
    return DEFAULT_META;
  }

  return {
    schemaVersion: STORAGE_VERSION,
    namespace: APP_NAMESPACE
  };
};

const sanitizeBestTimes = (value: unknown): BestTimeEntry[] | null => {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const bestBySeed = new Map<number, BestTimeEntry>();
  for (const entry of value) {
    if (!isPlainObject(entry)) {
      continue;
    }

    const elapsedMs = typeof entry.elapsedMs === 'number' ? Math.round(entry.elapsedMs) : Number.NaN;
    const seed = typeof entry.seed === 'number' ? Math.round(entry.seed) : Number.NaN;
    const recordedAt = typeof entry.recordedAt === 'string' && entry.recordedAt.length > 0
      ? entry.recordedAt
      : undefined;

    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || !Number.isFinite(seed)) {
      continue;
    }

    const normalized: BestTimeEntry = {
      elapsedMs,
      seed,
      recordedAt: recordedAt ?? toIsoTimestamp(0)
    };
    const existing = bestBySeed.get(seed);
    if (!existing || normalized.elapsedMs < existing.elapsedMs) {
      bestBySeed.set(seed, normalized);
    }
  }

  return [...bestBySeed.values()]
    .sort((left, right) => left.elapsedMs - right.elapsedMs || left.recordedAt.localeCompare(right.recordedAt))
    .slice(0, BEST_TIME_LIMIT);
};

const serialize = (value: unknown): string => JSON.stringify(value);

const deleteIndexedDatabase = (database: Pick<IDBFactory, 'deleteDatabase'>, name: string): Promise<void> => new Promise((resolve) => {
  const request = database.deleteDatabase(name);
  request.onsuccess = () => resolve();
  request.onerror = () => resolve();
  request.onblocked = () => resolve();
});

export class MazerStorage {
  private bestTimes: BestTimeEntry[] = [];
  private initialized = false;
  private meta: MazerMeta = DEFAULT_META;
  private pendingAsyncCleanup?: Promise<void>;
  private readonly pendingWrites = new Map<string, ReturnType<typeof globalThis.setTimeout>>();
  private settings: MazerSettings = DEFAULT_SETTINGS;

  public constructor(private readonly env: MazerStorageEnvironment = resolveEnvironment()) {}

  public bootstrap(): Promise<void> {
    this.ensureInitialized();
    return this.pendingAsyncCleanup ?? Promise.resolve();
  }

  public clearLocalData(): Promise<void> {
    this.ensureInitialized();
    this.cancelPendingWrites();

    for (const storage of [this.env.localStorage, this.env.sessionStorage]) {
      for (const key of listStorageKeys(storage)) {
        if (isOwnedStorageKey(key)) {
          storage?.removeItem(key);
        }
      }
    }

    this.settings = DEFAULT_SETTINGS;
    this.bestTimes = [];
    this.meta = DEFAULT_META;

    return Promise.all([
      this.cleanupOwnedCaches(true),
      this.cleanupOwnedDatabases(true),
      this.unregisterAppServiceWorkers()
    ]).then(() => undefined);
  }

  public getBestTimes(): BestTimeEntry[] {
    this.ensureInitialized();
    return this.bestTimes.map((entry) => ({ ...entry }));
  }

  public getFastestBestTime(): BestTimeEntry | null {
    this.ensureInitialized();
    return this.bestTimes[0] ? { ...this.bestTimes[0] } : null;
  }

  public getSettings(): MazerSettings {
    this.ensureInitialized();
    return { ...this.settings };
  }

  public recordBestTime(result: { elapsedMs: number; seed: number; recordedAt?: string }): BestTimeEntry[] {
    this.ensureInitialized();

    const elapsedMs = Math.round(result.elapsedMs);
    const seed = Math.round(result.seed);
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || !Number.isFinite(seed)) {
      return this.getBestTimes();
    }

    const recordedAt = result.recordedAt ?? toIsoTimestamp(this.env.now());
    const nextBestTimes = sanitizeBestTimes([
      ...this.bestTimes,
      { elapsedMs, seed, recordedAt }
    ]) ?? [];

    if (serialize(nextBestTimes) === serialize(this.bestTimes)) {
      return this.getBestTimes();
    }

    this.bestTimes = nextBestTimes;
    this.scheduleWrite(KNOWN_STORAGE_KEYS.bestTimes, this.bestTimes);
    return this.getBestTimes();
  }

  private cancelPendingWrites(): void {
    for (const handle of this.pendingWrites.values()) {
      this.env.clearTimeout(handle);
    }
    this.pendingWrites.clear();
  }

  private cleanupOwnedStorage(storage: StorageLike | undefined, persistMeta: boolean): void {
    if (!storage) {
      return;
    }

    let metaNeedsPersist = persistMeta && storage.getItem(KNOWN_STORAGE_KEYS.meta) === null;
    const keys = listStorageKeys(storage);
    for (const key of keys) {
      if (!isOwnedStorageKey(key)) {
        continue;
      }

      if (!CURRENT_STORAGE_KEYS.has(key)) {
        storage.removeItem(key);
        continue;
      }

      const parsed = safeJsonParse(storage.getItem(key));
      if (key === KNOWN_STORAGE_KEYS.settings) {
        const settings = sanitizeSettings(parsed);
        if (settings === null) {
          storage.removeItem(key);
          continue;
        }
        this.settings = settings;
        continue;
      }

      if (key === KNOWN_STORAGE_KEYS.bestTimes) {
        const bestTimes = sanitizeBestTimes(parsed);
        if (bestTimes === null) {
          storage.removeItem(key);
          continue;
        }

        this.bestTimes = bestTimes;
        const serialized = serialize(bestTimes);
        if (storage.getItem(key) !== serialized) {
          storage.setItem(key, serialized);
        }
        continue;
      }

      if (key === KNOWN_STORAGE_KEYS.meta) {
        const meta = sanitizeMeta(parsed);
        if (meta === null) {
          storage.removeItem(key);
          metaNeedsPersist = persistMeta;
          continue;
        }

        this.meta = meta;
        const serialized = serialize(meta);
        if (storage.getItem(key) !== serialized) {
          storage.setItem(key, serialized);
        }
      }
    }

    if (metaNeedsPersist) {
      storage.setItem(KNOWN_STORAGE_KEYS.meta, serialize(this.meta));
    }
  }

  private async cleanupOwnedCaches(includeCurrentVersion: boolean): Promise<void> {
    if (!this.env.cacheStorage) {
      return;
    }

    const cacheNames = await this.env.cacheStorage.keys();
    const deletions = cacheNames
      .filter((cacheName) => isOwnedCacheName(cacheName) && (includeCurrentVersion || !isCurrentCacheName(cacheName)))
      .map((cacheName) => this.env.cacheStorage!.delete(cacheName));
    await Promise.all(deletions);
  }

  private async cleanupOwnedDatabases(includeCurrentVersion: boolean): Promise<void> {
    if (!this.env.indexedDB?.databases) {
      return;
    }

    const databases = await this.env.indexedDB.databases();
    const deletions = databases
      .map((database) => database.name ?? '')
      .filter((name) => isOwnedDatabaseName(name) && (includeCurrentVersion || !name.startsWith(APP_NAMESPACE)))
      .map((name) => deleteIndexedDatabase(this.env.indexedDB!, name));
    await Promise.all(deletions);
  }

  private ensureInitialized(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.cleanupOwnedStorage(this.env.localStorage, true);
    this.cleanupOwnedStorage(this.env.sessionStorage, false);
    this.pendingAsyncCleanup = Promise.all([
      this.cleanupOwnedCaches(false),
      this.cleanupOwnedDatabases(false)
    ])
      .then(() => undefined)
      .catch(() => undefined);
  }

  private scheduleWrite(key: string, value: unknown): void {
    const existing = this.pendingWrites.get(key);
    if (existing) {
      this.env.clearTimeout(existing);
    }

    const handle = this.env.setTimeout(() => {
      this.env.localStorage?.setItem(key, serialize(value));
      this.pendingWrites.delete(key);
    }, WRITE_THROTTLE_MS);
    this.pendingWrites.set(key, handle);
  }

  private async unregisterAppServiceWorkers(): Promise<void> {
    if (!this.env.serviceWorker) {
      return;
    }

    const registrations = await this.env.serviceWorker.getRegistrations();
    const appScopePrefix = this.env.origin ? `${this.env.origin}${this.env.baseUrl}` : undefined;
    const ownRegistrations = registrations.filter((registration) => {
      if (!appScopePrefix) {
        return true;
      }

      return registration.scope.startsWith(appScopePrefix);
    });

    await Promise.all(ownRegistrations.map((registration) => registration.unregister()));
  }
}

export const mazerStorage = new MazerStorage();
export { APP_CACHE_PREFIX, APP_NAMESPACE, BEST_TIME_LIMIT, KNOWN_STORAGE_KEYS, WRITE_THROTTLE_MS, formatElapsedMs };
