import type { MazeDifficulty, MazeSize } from '../domain/maze';
import { normalizeMazeSize } from '../domain/maze';

export interface DifficultyProgress {
  bestMoves: number | null;
  bestTimeMs: number | null;
}

export interface MazerProgress {
  bestByDifficulty: Record<MazeDifficulty, DifficultyProgress>;
  clearsCount: number;
  lastDifficulty: MazeDifficulty;
  lastSize: MazeSize;
}

export interface RunRecordUpdate {
  bestMoves: number | null;
  bestTimeMs: number | null;
  isNewBestMoves: boolean;
  isNewBestTime: boolean;
  previousBestMoves: number | null;
  previousBestTimeMs: number | null;
  progress: MazerProgress;
}

export interface MazerSettings {}

interface MazerMeta {
  namespace: string;
  schemaVersion: number;
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

const STORAGE_VERSION = 2;
const APP_NAMESPACE = `mazer:v${STORAGE_VERSION}`;
const APP_CACHE_PREFIX = `mazer-v${STORAGE_VERSION}`;
const DIFFICULTY_ORDER = ['chill', 'standard', 'spicy', 'brutal'] as const satisfies readonly MazeDifficulty[];
const SIZE_ORDER = ['small', 'medium', 'large', 'huge'] as const satisfies readonly MazeSize[];
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
  meta: `${APP_NAMESPACE}:meta`,
  progress: `${APP_NAMESPACE}:progress`,
  settings: `${APP_NAMESPACE}:settings`
} as const;
const CURRENT_STORAGE_KEYS = new Set<string>(Object.values(KNOWN_STORAGE_KEYS));
const OWNED_STORAGE_PREFIXES = ['mazer:', 'mazer-', 'mazer_', 'mazer.'] as const;
const WRITE_THROTTLE_MS = 120;
const DEFAULT_SETTINGS: MazerSettings = {};
const DEFAULT_META: MazerMeta = {
  namespace: APP_NAMESPACE,
  schemaVersion: STORAGE_VERSION
};
const DEFAULT_PROGRESS: MazerProgress = {
  bestByDifficulty: {
    chill: { bestMoves: null, bestTimeMs: null },
    standard: { bestMoves: null, bestTimeMs: null },
    spicy: { bestMoves: null, bestTimeMs: null },
    brutal: { bestMoves: null, bestTimeMs: null }
  },
  clearsCount: 0,
  lastDifficulty: 'standard',
  lastSize: 'medium'
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

const cloneProgress = (progress: MazerProgress): MazerProgress => ({
  bestByDifficulty: {
    chill: { ...progress.bestByDifficulty.chill },
    standard: { ...progress.bestByDifficulty.standard },
    spicy: { ...progress.bestByDifficulty.spicy },
    brutal: { ...progress.bestByDifficulty.brutal }
  },
  clearsCount: progress.clearsCount,
  lastDifficulty: progress.lastDifficulty,
  lastSize: progress.lastSize
});

const cloneSettings = (settings: MazerSettings): MazerSettings => ({ ...settings });

const sanitizeMetric = (value: unknown): number | null => {
  if (typeof value !== 'number') {
    return null;
  }

  const normalized = Math.round(value);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
};

const sanitizeDifficultyProgress = (value: unknown): DifficultyProgress => {
  if (!isPlainObject(value)) {
    return { bestMoves: null, bestTimeMs: null };
  }

  return {
    bestMoves: sanitizeMetric(value.bestMoves),
    bestTimeMs: sanitizeMetric(value.bestTimeMs)
  };
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

const sanitizeMeta = (value: unknown): MazerMeta => {
  if (!isPlainObject(value)) {
    return DEFAULT_META;
  }

  return {
    namespace: APP_NAMESPACE,
    schemaVersion: STORAGE_VERSION
  };
};

const sanitizeProgress = (value: unknown): MazerProgress | null => {
  if (value === undefined) {
    return cloneProgress(DEFAULT_PROGRESS);
  }

  if (!isPlainObject(value)) {
    return null;
  }

  const bestByDifficulty = isPlainObject(value.bestByDifficulty) ? value.bestByDifficulty : {};
  const lastDifficulty = typeof value.lastDifficulty === 'string' && DIFFICULTY_ORDER.includes(value.lastDifficulty as MazeDifficulty)
    ? value.lastDifficulty as MazeDifficulty
    : DEFAULT_PROGRESS.lastDifficulty;
  const lastSize = typeof value.lastSize === 'string' && SIZE_ORDER.includes(value.lastSize as MazeSize)
    ? normalizeMazeSize(value.lastSize)
    : DEFAULT_PROGRESS.lastSize;
  const clearsCount = typeof value.clearsCount === 'number' && Number.isFinite(value.clearsCount) && value.clearsCount >= 0
    ? Math.min(999_999, Math.round(value.clearsCount))
    : 0;

  return {
    bestByDifficulty: {
      chill: sanitizeDifficultyProgress(bestByDifficulty.chill),
      standard: sanitizeDifficultyProgress(bestByDifficulty.standard),
      spicy: sanitizeDifficultyProgress(bestByDifficulty.spicy),
      brutal: sanitizeDifficultyProgress(bestByDifficulty.brutal)
    },
    clearsCount,
    lastDifficulty,
    lastSize
  };
};

const serialize = (value: unknown): string => JSON.stringify(value);

const deleteIndexedDatabase = (database: Pick<IDBFactory, 'deleteDatabase'>, name: string): Promise<void> => new Promise((resolve) => {
  const request = database.deleteDatabase(name);
  request.onsuccess = () => resolve();
  request.onerror = () => resolve();
  request.onblocked = () => resolve();
});

export const formatElapsedMs = (elapsedMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export class MazerStorage {
  private initialized = false;
  private meta: MazerMeta = DEFAULT_META;
  private pendingAsyncCleanup?: Promise<void>;
  private readonly pendingWrites = new Map<string, ReturnType<typeof globalThis.setTimeout>>();
  private progress: MazerProgress = cloneProgress(DEFAULT_PROGRESS);
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
    this.progress = cloneProgress(DEFAULT_PROGRESS);
    this.meta = DEFAULT_META;

    return Promise.all([
      this.cleanupOwnedCaches(true),
      this.cleanupOwnedDatabases(true),
      this.unregisterAppServiceWorkers()
    ]).then(() => undefined);
  }

  public getProgress(): MazerProgress {
    this.ensureInitialized();
    return cloneProgress(this.progress);
  }

  public getSettings(): MazerSettings {
    this.ensureInitialized();
    return cloneSettings(this.settings);
  }

  public recordRunResult(result: {
    difficulty: MazeDifficulty;
    elapsedMs: number;
    moveCount: number;
  }): RunRecordUpdate {
    this.ensureInitialized();

    const elapsedMs = sanitizeMetric(result.elapsedMs);
    const moveCount = sanitizeMetric(result.moveCount);
    if (!elapsedMs || !moveCount) {
      const snapshot = this.getProgress();
      const bucket = snapshot.bestByDifficulty[result.difficulty];
      return {
        bestMoves: bucket.bestMoves,
        bestTimeMs: bucket.bestTimeMs,
        isNewBestMoves: false,
        isNewBestTime: false,
        previousBestMoves: bucket.bestMoves,
        previousBestTimeMs: bucket.bestTimeMs,
        progress: snapshot
      };
    }

    const nextProgress = cloneProgress(this.progress);
    const bucket = nextProgress.bestByDifficulty[result.difficulty];
    const previousBestTimeMs = bucket.bestTimeMs;
    const previousBestMoves = bucket.bestMoves;
    const isNewBestTime = previousBestTimeMs === null || elapsedMs < previousBestTimeMs;
    const isNewBestMoves = previousBestMoves === null || moveCount < previousBestMoves;

    bucket.bestTimeMs = isNewBestTime ? elapsedMs : previousBestTimeMs;
    bucket.bestMoves = isNewBestMoves ? moveCount : previousBestMoves;
    nextProgress.clearsCount += 1;
    nextProgress.lastDifficulty = result.difficulty;

    if (serialize(nextProgress) !== serialize(this.progress)) {
      this.progress = nextProgress;
      this.scheduleWrite(KNOWN_STORAGE_KEYS.progress, this.progress);
    }

    return {
      bestMoves: bucket.bestMoves,
      bestTimeMs: bucket.bestTimeMs,
      isNewBestMoves,
      isNewBestTime,
      previousBestMoves,
      previousBestTimeMs,
      progress: this.getProgress()
    };
  }

  public setLastPlayedSelection(difficulty: MazeDifficulty, size: MazeSize): MazerProgress {
    this.ensureInitialized();
    if (this.progress.lastDifficulty === difficulty && this.progress.lastSize === size) {
      return this.getProgress();
    }

    this.progress = {
      ...cloneProgress(this.progress),
      lastDifficulty: difficulty,
      lastSize: normalizeMazeSize(size)
    };
    this.scheduleWrite(KNOWN_STORAGE_KEYS.progress, this.progress);
    return this.getProgress();
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

      if (key === KNOWN_STORAGE_KEYS.progress) {
        const progress = sanitizeProgress(parsed);
        if (progress === null) {
          storage.removeItem(key);
          continue;
        }

        this.progress = progress;
        const serialized = serialize(progress);
        if (storage.getItem(key) !== serialized) {
          storage.setItem(key, serialized);
        }
        continue;
      }

      if (key === KNOWN_STORAGE_KEYS.meta) {
        const meta = sanitizeMeta(parsed);
        this.meta = meta;
        const serialized = serialize(meta);
        if (storage.getItem(key) !== serialized) {
          storage.setItem(key, serialized);
        }
        continue;
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
export { APP_CACHE_PREFIX, APP_NAMESPACE, KNOWN_STORAGE_KEYS, WRITE_THROTTLE_MS };
