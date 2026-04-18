import { RuntimeAdapterBridge, type RuntimeAdapterHost } from '../mazer-core/adapters';
import { EpisodicPolicyScorer } from '../mazer-core/agent/PolicyScorer';
import type { HeadingToken, LocalObservation, TileId, VisibleLandmark } from '../mazer-core/agent/types';
import { legacyTuning } from '../config/tuning';
import type {
  RuntimeEpisodeDelivery,
  RuntimeIntentDelivery,
  RuntimeMoveApplication,
  RuntimeObservationProjection,
  RuntimeTrailDelivery
} from '../mazer-core/adapters';
import {
  MAX_INTENT_VISIBLE_ENTRIES,
  buildIntentFeed,
  type IntentFeedBuildResult,
  type IntentFeedState
} from '../mazer-core/intent';
import {
  getNeighborIndex,
  isTileFloor,
  xFromIndex,
  yFromIndex,
  type MazeEpisode
} from '../domain/maze';

interface TileRuntimeDescriptor {
  id: TileId;
  index: number;
  label: string;
  kind: 'start' | 'goal' | 'junction' | 'dead-end' | 'corridor';
  neighbors: TileId[];
}

const TILE_ID_PREFIX = 'tile-';
const LANDMARK_ID_PREFIX = 'landmark-';
const LANDMARK_VISIBILITY_RADIUS = 1;
const GOAL_VISIBILITY_RADIUS = 1;

interface MenuIntentFeedDisplaySnapshot {
  statusSignature: string;
  eventsSignature: string;
  state: IntentFeedState;
}

export interface MenuIntentFeedDisplayControllerOptions {
  maxVisibleEntries?: number;
  minimumDwellMs?: number;
  replacementDebounceMs?: number;
}

const normalizeFeedStateForDisplay = (
  state: IntentFeedState,
  maxVisibleEntries: number
): IntentFeedState => ({
  ...state,
  status: state.status ? { ...state.status } : null,
  events: (state.events ?? state.entries)
    .slice(0, maxVisibleEntries)
    .map((entry, slot) => ({
      ...entry,
      slot
    })),
  entries: (state.events ?? state.entries)
    .slice(0, maxVisibleEntries)
    .map((entry, slot) => ({
      ...entry,
      slot
    }))
});

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, ' ').toLowerCase();

const serializeAnchor = (entry: { anchor?: { kind: string; tileId?: string | null; landmarkId?: string | null; connectorId?: string | null } | null | undefined }): string => {
  if (!entry.anchor) {
    return '';
  }

  const { kind, tileId, landmarkId, connectorId } = entry.anchor;
  return [
    kind,
    tileId ?? '',
    landmarkId ?? '',
    connectorId ?? ''
  ].join(':');
};

const createStatusSignature = (state: IntentFeedState | null): string => (
  state?.status
    ? [
        state.status.speaker,
        state.status.kind,
        state.status.importance,
        normalizeText(state.status.summary),
        serializeAnchor(state.status)
      ].join('|')
    : ''
);

const createEventsSignature = (state: IntentFeedState | null, maxVisibleEntries: number): string => {
  const entries = state?.events ?? state?.entries ?? [];
  return entries
    .slice(0, maxVisibleEntries)
    .map((entry) => [
      entry.speaker,
      entry.kind,
      entry.importance,
      normalizeText(entry.summary),
      serializeAnchor(entry)
    ].join('|'))
    .join('|');
};

export class MenuIntentFeedDisplayController {
  private readonly maxVisibleEntries: number;

  private readonly minimumDwellMs: number;

  private readonly replacementDebounceMs: number;

  private current: (MenuIntentFeedDisplaySnapshot & { shownAtMs: number }) | null = null;

  private pending: (MenuIntentFeedDisplaySnapshot & { queuedAtMs: number }) | null = null;

  constructor(options: MenuIntentFeedDisplayControllerOptions = {}) {
    this.maxVisibleEntries = Math.max(
      1,
      Math.min(
        MAX_INTENT_VISIBLE_ENTRIES,
        Math.trunc(options.maxVisibleEntries ?? legacyTuning.menu.intentFeed.maxVisibleEntries)
      )
    );
    this.minimumDwellMs = Math.max(0, Math.trunc(options.minimumDwellMs ?? legacyTuning.menu.intentFeed.minimumDwellMs));
    this.replacementDebounceMs = Math.max(
      0,
      Math.trunc(options.replacementDebounceMs ?? legacyTuning.menu.intentFeed.replacementDebounceMs)
    );
  }

  advance(rawState: IntentFeedState | null, nowMs: number): IntentFeedState | null {
    const rawEntries = rawState?.events ?? rawState?.entries ?? [];
    if (!rawState || (rawEntries.length === 0 && !rawState.status)) {
      this.pending = null;
      if (this.current && (nowMs - this.current.shownAtMs) >= this.minimumDwellMs) {
        this.current = null;
      }
      return this.current?.state ?? null;
    }

    const statusSignature = createStatusSignature(rawState);
    const eventsSignature = createEventsSignature(rawState, this.maxVisibleEntries);
    const state = normalizeFeedStateForDisplay(rawState, this.maxVisibleEntries);

    if (!this.current) {
      this.current = {
        statusSignature,
        eventsSignature,
        state,
        shownAtMs: nowMs
      };
      return state;
    }

    if (eventsSignature === this.current.eventsSignature) {
      if (statusSignature !== this.current.statusSignature) {
        this.current = {
          ...this.current,
          statusSignature,
          state: {
            ...this.current.state,
            status: state.status ?? null
          }
        };
      }

      this.pending = null;
      return this.current.state;
    }

    if (!this.pending || this.pending.eventsSignature !== eventsSignature) {
      this.pending = {
        statusSignature,
        eventsSignature,
        state,
        queuedAtMs: nowMs
      };
    } else {
      this.pending = {
        ...this.pending,
        state,
        statusSignature
      };
    }

    const currentDwellElapsed = nowMs - this.current.shownAtMs;
    const pendingDebounceElapsed = nowMs - this.pending.queuedAtMs;
    if (currentDwellElapsed >= this.minimumDwellMs && pendingDebounceElapsed >= this.replacementDebounceMs) {
      this.current = {
        statusSignature: this.pending.statusSignature,
        eventsSignature: this.pending.eventsSignature,
        state: this.pending.state,
        shownAtMs: nowMs
      };
      this.pending = null;
      return this.current.state;
    }

    if (statusSignature !== this.current.statusSignature) {
      this.current = {
        ...this.current,
        statusSignature,
        state: {
          ...this.current.state,
          status: state.status ?? null
        }
      };
    }

    return this.current.state;
  }
}

export const createMenuIntentFeedDisplayController = (
  options: MenuIntentFeedDisplayControllerOptions = {}
): MenuIntentFeedDisplayController => new MenuIntentFeedDisplayController(options);

const toTileId = (index: number): TileId => `${TILE_ID_PREFIX}${index}`;

const fromTileId = (tileId: TileId): number => {
  if (!tileId.startsWith(TILE_ID_PREFIX)) {
    throw new Error(`Menu intent runtime received unsupported tile id: ${tileId}.`);
  }

  const parsed = Number.parseInt(tileId.slice(TILE_ID_PREFIX.length), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Menu intent runtime could not parse tile id: ${tileId}.`);
  }

  return parsed;
};

const resolveHeadingBetween = (fromIndex: number, toIndex: number, width: number): HeadingToken => {
  const fromX = xFromIndex(fromIndex, width);
  const fromY = yFromIndex(fromIndex, width);
  const toX = xFromIndex(toIndex, width);
  const toY = yFromIndex(toIndex, width);

  if (toY < fromY) {
    return 'north';
  }
  if (toY > fromY) {
    return 'south';
  }
  if (toX < fromX) {
    return 'west';
  }
  if (toX > fromX) {
    return 'east';
  }
  return 'idle';
};

const collectFloorNeighbors = (
  index: number,
  width: number,
  height: number,
  tiles: Uint8Array
): number[] => {
  const neighbors: number[] = [];

  for (let direction = 0; direction < 4; direction += 1) {
    const nextIndex = getNeighborIndex(index, width, height, direction as 0 | 1 | 2 | 3);
    if (nextIndex !== -1 && isTileFloor(tiles, nextIndex)) {
      neighbors.push(nextIndex);
    }
  }

  return neighbors;
};

const collectVisibleTileIds = (
  startIndex: number,
  descriptorsByIndex: ReadonlyMap<number, TileRuntimeDescriptor>,
  radius: number
): Set<TileId> => {
  const visible = new Set<TileId>();
  const frontier = [{ index: startIndex, depth: 0 }];
  const visited = new Set<number>([startIndex]);

  while (frontier.length > 0) {
    const current = frontier.shift()!;
    const descriptor = descriptorsByIndex.get(current.index);
    if (!descriptor) {
      continue;
    }

    visible.add(descriptor.id);
    if (current.depth >= radius) {
      continue;
    }

    for (const neighborId of descriptor.neighbors) {
      const neighborIndex = fromTileId(neighborId);
      if (visited.has(neighborIndex)) {
        continue;
      }

      visited.add(neighborIndex);
      frontier.push({ index: neighborIndex, depth: current.depth + 1 });
    }
  }

  return visible;
};

class MazeIntentRuntimeHost implements RuntimeAdapterHost {
  readonly config;

  readonly trailDeliveries: RuntimeTrailDelivery[] = [];

  readonly intentDeliveries: RuntimeIntentDelivery[] = [];

  readonly episodeDeliveries: RuntimeEpisodeDelivery[] = [];

  private currentTileId: TileId;

  private currentHeading: HeadingToken;

  private readonly descriptorsById = new Map<TileId, TileRuntimeDescriptor>();

  private readonly descriptorsByIndex = new Map<number, TileRuntimeDescriptor>();

  private readonly landmarksByTileId = new Map<TileId, VisibleLandmark[]>();

  private readonly goalTileId: TileId;

  constructor(private readonly episode: MazeEpisode) {
    const startIndex = episode.raster.startIndex;
    const startTileId = toTileId(startIndex);
    const width = episode.raster.width;
    const initialHeading = episode.raster.pathIndices.length > 1
      ? resolveHeadingBetween(episode.raster.pathIndices[0], episode.raster.pathIndices[1], width)
      : 'idle';

    this.currentTileId = startTileId;
    this.currentHeading = initialHeading;
    this.goalTileId = toTileId(episode.raster.endIndex);
    this.config = {
      seed: `menu-intent-${episode.seed}`,
      startTileId,
      startHeading: initialHeading,
      intentCanary: null
    };

    this.buildDescriptors();
  }

  projectObservation(step: number): RuntimeObservationProjection {
    const descriptor = this.describeRequiredTile(this.currentTileId);
    const visibleTileIds = collectVisibleTileIds(descriptor.index, this.descriptorsByIndex, LANDMARK_VISIBILITY_RADIUS);
    const goalVisible = collectVisibleTileIds(descriptor.index, this.descriptorsByIndex, GOAL_VISIBILITY_RADIUS).has(this.goalTileId);

    return {
      currentTileLabel: descriptor.label,
      observation: {
        step,
        currentTileId: descriptor.id,
        heading: this.currentHeading,
        traversableTileIds: [...descriptor.neighbors],
        localCues: this.buildLocalCues(descriptor),
        visibleLandmarks: [...this.collectVisibleLandmarks(visibleTileIds)],
        goal: {
          visible: goalVisible,
          tileId: goalVisible ? this.goalTileId : null,
          label: goalVisible ? this.describeRequiredTile(this.goalTileId).label : undefined
        }
      } satisfies LocalObservation
    };
  }

  applyLegalMove(nextTileId: TileId): RuntimeMoveApplication {
    const descriptor = this.describeRequiredTile(this.currentTileId);
    if (!descriptor.neighbors.includes(nextTileId)) {
      throw new Error(`Menu intent runtime rejected illegal move ${descriptor.id} -> ${nextTileId}.`);
    }

    this.currentHeading = resolveHeadingBetween(descriptor.index, fromTileId(nextTileId), this.episode.raster.width);
    this.currentTileId = nextTileId;
    return {
      currentTileId: nextTileId,
      traversedConnectorId: null,
      traversedConnectorLabel: null
    };
  }

  receiveTrailUpdate(delivery: RuntimeTrailDelivery): void {
    this.trailDeliveries.push(delivery);
  }

  receiveIntentDelivery(delivery: RuntimeIntentDelivery): void {
    this.intentDeliveries.push(delivery);
  }

  receiveEpisodeLog(delivery: RuntimeEpisodeDelivery): void {
    this.episodeDeliveries.push(delivery);
  }

  describeTile(tileId: TileId) {
    const descriptor = this.descriptorsById.get(tileId);
    return descriptor
      ? {
          id: descriptor.id,
          label: descriptor.label
        }
      : null;
  }

  private buildDescriptors(): void {
    const { width, height, tiles, startIndex, endIndex } = this.episode.raster;

    for (let index = 0; index < tiles.length; index += 1) {
      if (!isTileFloor(tiles, index)) {
        continue;
      }

      const neighbors = collectFloorNeighbors(index, width, height, tiles).map((neighborIndex) => toTileId(neighborIndex));
      const x = xFromIndex(index, width);
      const y = yFromIndex(index, width);
      const kind = index === startIndex
        ? 'start'
        : index === endIndex
          ? 'goal'
          : neighbors.length >= 3
            ? 'junction'
            : neighbors.length <= 1
              ? 'dead-end'
              : 'corridor';
      const label = kind === 'start'
        ? 'Start lane'
        : kind === 'goal'
          ? 'Exit lane'
          : kind === 'junction'
            ? `Junction ${x}:${y}`
            : kind === 'dead-end'
              ? `Dead branch ${x}:${y}`
              : `Corridor ${x}:${y}`;
      const descriptor: TileRuntimeDescriptor = {
        id: toTileId(index),
        index,
        label,
        kind,
        neighbors
      };

      this.descriptorsById.set(descriptor.id, descriptor);
      this.descriptorsByIndex.set(index, descriptor);

      const landmarks: VisibleLandmark[] = [];
      if (kind === 'start' || kind === 'goal' || kind === 'junction') {
        landmarks.push({
          id: `${LANDMARK_ID_PREFIX}${index}`,
          label,
          tileId: descriptor.id,
          cue: kind === 'goal' ? 'exit beacon' : kind === 'junction' ? 'junction split' : 'start anchor'
        });
      }
      if (landmarks.length > 0) {
        this.landmarksByTileId.set(descriptor.id, landmarks);
      }
    }
  }

  private describeRequiredTile(tileId: TileId): TileRuntimeDescriptor {
    const descriptor = this.descriptorsById.get(tileId);
    if (!descriptor) {
      throw new Error(`Menu intent runtime could not resolve tile descriptor for ${tileId}.`);
    }

    return descriptor;
  }

  private buildLocalCues(descriptor: TileRuntimeDescriptor): string[] {
    const localCues = [
      `tile:${descriptor.id}`,
      `label:${descriptor.label.toLowerCase()}`,
      `kind:${descriptor.kind}`,
      `neighbors:${descriptor.neighbors.length}`,
      `neighbor-ids:${descriptor.neighbors.join(',')}`
    ];

    if (descriptor.kind === 'dead-end') {
      localCues.push('dead-end branch');
    }
    if (descriptor.kind === 'junction') {
      localCues.push('junction split');
    }

    return localCues;
  }

  private collectVisibleLandmarks(visibleTileIds: ReadonlySet<TileId>): VisibleLandmark[] {
    const visibleLandmarks: VisibleLandmark[] = [];

    for (const tileId of visibleTileIds) {
      const landmarks = this.landmarksByTileId.get(tileId);
      if (!landmarks) {
        continue;
      }

      visibleLandmarks.push(...landmarks);
    }

    return visibleLandmarks;
  }
}

export class MenuIntentRuntimeSession {
  private readonly host: MazeIntentRuntimeHost;

  private readonly bridge: RuntimeAdapterBridge;

  private readonly maxSteps: number;

  private readonly feedDisplayController = createMenuIntentFeedDisplayController();

  private feed: IntentFeedBuildResult | null = null;

  private feedVersion = -1;

  constructor(episode: MazeEpisode) {
    this.host = new MazeIntentRuntimeHost(episode);
    this.bridge = new RuntimeAdapterBridge(this.host, new EpisodicPolicyScorer());
    this.maxSteps = Math.max(8, episode.raster.pathIndices.length * 4);
  }

  get latestStep(): number {
    return this.host.intentDeliveries.at(-1)?.step ?? -1;
  }

  get isComplete(): boolean {
    return this.bridge.isComplete;
  }

  get intentDeliveries(): readonly RuntimeIntentDelivery[] {
    return this.host.intentDeliveries;
  }

  advanceToStep(step: number): void {
    const targetStep = Math.max(0, Math.trunc(step));
    let attempts = 0;

    while (this.host.intentDeliveries.length <= targetStep && !this.bridge.isComplete) {
      this.bridge.runStep();
      attempts += 1;
      if (attempts > this.maxSteps) {
        throw new Error(`Menu intent runtime exceeded maxSteps=${this.maxSteps} while targeting step ${targetStep}.`);
      }
    }
  }

  getFeedState(step = this.latestStep): IntentFeedState | null {
    if (this.host.intentDeliveries.length === 0) {
      return null;
    }

    this.ensureFeed();
    if (!this.feed) {
      return null;
    }

    const safeStep = Math.max(0, Math.min(Math.trunc(step), this.latestStep));
    return this.feed.states.get(safeStep) ?? this.feed.states.get(this.latestStep) ?? null;
  }

  getDisplayFeedState(step = this.latestStep, nowMs = 0): IntentFeedState | null {
    return this.feedDisplayController.advance(this.getFeedState(step), nowMs);
  }

  private ensureFeed(): void {
    const version = this.host.intentDeliveries.length;
    if (version === this.feedVersion) {
      return;
    }

    const latestBus = this.host.intentDeliveries.at(-1)?.bus;
    if (!latestBus) {
      this.feed = null;
      this.feedVersion = version;
      return;
    }

    this.feed = buildIntentFeed(latestBus, this.host.intentDeliveries.map((delivery) => delivery.step));
    this.feedVersion = version;
  }
}

export const createMenuIntentRuntimeSession = (episode: MazeEpisode): MenuIntentRuntimeSession => (
  new MenuIntentRuntimeSession(episode)
);
