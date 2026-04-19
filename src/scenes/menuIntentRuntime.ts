import { RuntimeAdapterBridge, type RuntimeAdapterHost } from '../mazer-core/adapters';
import { EpisodicPolicyScorer } from '../mazer-core/agent/PolicyScorer';
import type { HeadingToken, LocalObservation, TileId, VisibleLandmark } from '../mazer-core/agent/types';
import { legacyTuning } from '../config/tuning';
import {
  createDemoSpectatorPlan,
  type DemoBoardTelegraph,
  type DemoHazardPlacement,
  type DemoSpectatorPlan,
  type DemoTimedGatePlacement
} from '../domain/ai';
import type {
  RuntimeEpisodeDelivery,
  RuntimeIntentDelivery,
  RuntimeMoveApplication,
  RuntimeObservationProjection,
  RuntimeTrailDelivery
} from '../mazer-core/adapters';
import { WardenGraphAgent, type WardenDecision } from '../mazer-core/enemies';
import {
  MAX_INTENT_VISIBLE_ENTRIES,
  buildIntentFeed,
  type IntentFeedBuildResult,
  type IntentFeedState
} from '../mazer-core/intent';
import {
  resolveIntentFeedRole,
  type IntentFeedRole
} from '../mazer-core/intent/IntentFeed';
import { ItemTopologyLedger, type TopologyItemDefinition } from '../mazer-core/items';
import { PuzzleTopologyState, type TopologyPuzzleDefinition } from '../mazer-core/puzzles';
import { buildTopologySignalBundle } from '../mazer-core/signals';
import { TrapTopologySystem, type TrapContract } from '../mazer-core/traps';
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

export interface MenuRuntimeBoardState {
  step: number;
  telegraphs: readonly DemoBoardTelegraph[];
  failReasonTitle: string;
  failReasonSubtitle: string;
  nextRiskLabel: string;
  nextRiskTone: 'low' | 'medium' | 'high' | 'critical';
}

const cloneFeedStateStatus = (state: IntentFeedState): IntentFeedState['status'] => (
  state.status
    ? {
        ...state.status,
        ...(state.status.anchor ? { anchor: { ...state.status.anchor } } : {})
      }
    : null
);

const cloneFeedEntries = (entries: readonly IntentFeedState['entries'][number][]) => (
  entries.map((entry, slot) => ({
    ...entry,
    ...(entry.anchor ? { anchor: { ...entry.anchor } } : {}),
    slot
  }))
);

const cloneFeedPings = (pings: IntentFeedState['pings']) => (
  pings.map((ping) => ({
    ...ping,
    ...(ping.anchor ? { anchor: { ...ping.anchor } } : {})
  }))
);

const cloneFeedState = (
  state: IntentFeedState,
  eventsSource: readonly IntentFeedState['entries'][number][] = state.events ?? state.entries
): IntentFeedState => {
  const events = cloneFeedEntries(eventsSource);
  return {
    ...state,
    status: cloneFeedStateStatus(state),
    events,
    entries: cloneFeedEntries(events),
    pings: cloneFeedPings(state.pings)
  };
};

const resolveFeedRole = (state: IntentFeedState | null): IntentFeedRole => (
  resolveIntentFeedRole(state?.status?.kind ?? state?.events?.[0]?.kind ?? state?.entries?.[0]?.kind ?? null)
);

const resolvePacingMultiplier = (role: IntentFeedRole): number => {
  switch (role) {
    case 'scan':
      return 0.96;
    case 'hypothesis':
      return 1.14;
    case 'commit':
      return 1.34;
    case 'recall':
      return 1.46;
  }
};

const resolveDebounceMultiplier = (role: IntentFeedRole): number => {
  switch (role) {
    case 'scan':
      return 0.9;
    case 'hypothesis':
      return 1.08;
    case 'commit':
      return 1.2;
    case 'recall':
      return 1.34;
  }
};

const normalizeFeedStateForDisplay = (
  state: IntentFeedState,
  maxVisibleEntries: number
): IntentFeedState => cloneFeedState(state, (state.events ?? state.entries).slice(0, maxVisibleEntries));

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

const mergeDisplayState = (
  current: IntentFeedState,
  next: IntentFeedState,
  preserveCurrentEvents: boolean
): IntentFeedState => cloneFeedState(
  {
    ...next,
    status: cloneFeedStateStatus(next),
    pings: cloneFeedPings(next.pings)
  },
  preserveCurrentEvents ? (current.events ?? current.entries) : (next.events ?? next.entries)
);

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
      const currentRole = resolveFeedRole(this.current?.state ?? null);
      const currentMinimumDwellMs = Math.round(this.minimumDwellMs * resolvePacingMultiplier(currentRole));
      if (this.current && (nowMs - this.current.shownAtMs) >= currentMinimumDwellMs) {
        this.current = null;
      }
      return this.current?.state ?? null;
    }

    const statusSignature = createStatusSignature(rawState);
    const eventsSignature = createEventsSignature(rawState, this.maxVisibleEntries);
    const state = normalizeFeedStateForDisplay(rawState, this.maxVisibleEntries);
    const nextRole = resolveFeedRole(state);
    const currentRole = resolveFeedRole(this.current?.state ?? null);
    const currentMinimumDwellMs = Math.round(this.minimumDwellMs * resolvePacingMultiplier(currentRole));
    const currentReplacementDebounceMs = Math.round(this.replacementDebounceMs * resolveDebounceMultiplier(currentRole));
    const pendingMinimumDebounceMs = Math.round(this.replacementDebounceMs * resolveDebounceMultiplier(nextRole));

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
          state: mergeDisplayState(this.current.state, state, true)
        };
      } else {
        this.current = {
          ...this.current,
          state: mergeDisplayState(this.current.state, state, true)
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
    if (currentDwellElapsed >= currentMinimumDwellMs && pendingDebounceElapsed >= Math.min(currentReplacementDebounceMs, pendingMinimumDebounceMs)) {
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
        state: mergeDisplayState(this.current.state, state, true)
      };
    } else {
      this.current = {
        ...this.current,
        state: mergeDisplayState(this.current.state, state, true)
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

const hasVisibleTileIndex = (visibleTileIds: ReadonlySet<TileId>, tileIndex: number): boolean => (
  visibleTileIds.has(toTileId(tileIndex))
);

const isTimingActive = (
  step: number,
  placement: Pick<DemoHazardPlacement | DemoTimedGatePlacement, 'period' | 'activeResidues'>
): boolean => placement.activeResidues.includes(step % placement.period);

const buildTrapContracts = (plan: DemoSpectatorPlan): TrapContract[] => {
  const contracts: TrapContract[] = [];

  if (plan.hazardTile) {
    contracts.push({
      id: plan.hazardTile.id,
      label: plan.hazardTile.label,
      severity: 'high',
      anchor: {
        kind: 'checkpoint',
        checkpointId: `checkpoint:${plan.hazardTile.id}`,
        tileId: toTileId(plan.hazardTile.tileIndex)
      },
      visibility: {
        timing: {
          period: plan.hazardTile.period,
          activeResidues: plan.hazardTile.activeResidues,
          label: 'hazard flash'
        },
        landmarkId: plan.hazardTile.landmarkId
      },
      cooldownSteps: 1
    });
  }

  if (plan.timedGate) {
    contracts.push({
      id: plan.timedGate.id,
      label: plan.timedGate.label,
      severity: 'medium',
      anchor: {
        kind: 'checkpoint',
        checkpointId: `checkpoint:${plan.timedGate.id}`,
        tileId: toTileId(plan.timedGate.fromTileIndex)
      },
      visibility: {
        timing: {
          period: plan.timedGate.period,
          activeResidues: plan.timedGate.activeResidues,
          label: 'gate cycle'
        },
        landmarkId: plan.timedGate.landmarkId,
        connectorId: plan.timedGate.connectorId
      },
      cooldownSteps: 1
    });
  }

  return contracts;
};

const buildItemDefinitions = (plan: DemoSpectatorPlan): readonly TopologyItemDefinition[] => {
  const definitions: TopologyItemDefinition[] = [];

  if (plan.keyItem) {
    definitions.push({
      id: plan.keyItem.id,
      label: plan.keyItem.label,
      kind: 'checkpoint-key',
      visibility: 'visible',
      anchor: {
        tileId: toTileId(plan.keyItem.tileIndex),
        checkpointId: 'plate-door'
      },
      proxyCues: [
        {
          kind: 'landmark',
          id: plan.keyItem.landmarkId,
          label: plan.keyItem.label,
          confidence: 0.88
        }
      ],
      tags: ['item', 'key']
    });
  }

  if (plan.pressurePlate) {
    definitions.push({
      id: plan.pressurePlate.id,
      label: plan.pressurePlate.label,
      kind: 'signal-node',
      visibility: 'visible',
      anchor: {
        tileId: toTileId(plan.pressurePlate.tileIndex),
        connectorId: plan.pressureDoor?.connectorId
      },
      proxyCues: [
        {
          kind: 'landmark',
          id: plan.pressurePlate.landmarkId,
          label: plan.pressurePlate.label,
          confidence: 0.84
        }
      ],
      tags: ['signal', 'plate']
    });
  }

  return definitions;
};

const buildPuzzleDefinitions = (plan: DemoSpectatorPlan): readonly TopologyPuzzleDefinition[] => {
  if (!plan.pressureDoor) {
    return [];
  }

  return [
    {
      id: plan.pressureDoor.id,
      label: plan.pressureDoor.label,
      visibility: 'proxied',
      anchor: {
        tileId: toTileId(plan.pressureDoor.fromTileIndex),
        connectorId: plan.pressureDoor.connectorId
      },
      proxyCues: [
        {
          kind: 'landmark',
          id: plan.pressureDoor.landmarkId,
          label: plan.pressureDoor.label,
          confidence: 0.84
        },
        {
          kind: 'connector',
          id: plan.pressureDoor.connectorId,
          label: plan.pressureDoor.label,
          confidence: 0.92
        }
      ],
      requiredCheckpointKeyIds: plan.keyItem ? [plan.keyItem.id] : [],
      requiredSignalNodeIds: plan.pressurePlate ? [plan.pressurePlate.id] : [],
      requiredShellUnlockIds: []
    }
  ];
};

const collectMechanicLandmarks = (
  plan: DemoSpectatorPlan,
  visibleTileIds: ReadonlySet<TileId>
): VisibleLandmark[] => {
  const landmarks: VisibleLandmark[] = [];

  if (plan.keyItem && hasVisibleTileIndex(visibleTileIds, plan.keyItem.tileIndex)) {
    landmarks.push({
      id: plan.keyItem.landmarkId,
      label: plan.keyItem.label,
      tileId: toTileId(plan.keyItem.tileIndex),
      cue: 'key item'
    });
  }

  if (plan.pressurePlate && hasVisibleTileIndex(visibleTileIds, plan.pressurePlate.tileIndex)) {
    landmarks.push({
      id: plan.pressurePlate.landmarkId,
      label: plan.pressurePlate.label,
      tileId: toTileId(plan.pressurePlate.tileIndex),
      cue: 'pressure plate'
    });
  }

  if (plan.pressureDoor && (
    hasVisibleTileIndex(visibleTileIds, plan.pressureDoor.fromTileIndex)
    || hasVisibleTileIndex(visibleTileIds, plan.pressureDoor.toTileIndex)
  )) {
    landmarks.push({
      id: plan.pressureDoor.landmarkId,
      label: plan.pressureDoor.label,
      tileId: toTileId(plan.pressureDoor.fromTileIndex),
      cue: 'sealed door'
    });
  }

  if (plan.hazardTile && hasVisibleTileIndex(visibleTileIds, plan.hazardTile.tileIndex)) {
    landmarks.push({
      id: plan.hazardTile.landmarkId,
      label: plan.hazardTile.label,
      tileId: toTileId(plan.hazardTile.tileIndex),
      cue: 'hazard flash'
    });
  }

  if (plan.timedGate && (
    hasVisibleTileIndex(visibleTileIds, plan.timedGate.fromTileIndex)
    || hasVisibleTileIndex(visibleTileIds, plan.timedGate.toTileIndex)
  )) {
    landmarks.push({
      id: plan.timedGate.landmarkId,
      label: plan.timedGate.label,
      tileId: toTileId(plan.timedGate.fromTileIndex),
      cue: 'timing gate'
    });
  }

  return landmarks;
};

const collectVisibleConnectorIds = (
  plan: DemoSpectatorPlan,
  visibleTileIds: ReadonlySet<TileId>
): string[] => {
  const connectorIds: string[] = [];

  if (plan.pressureDoor && (
    hasVisibleTileIndex(visibleTileIds, plan.pressureDoor.fromTileIndex)
    || hasVisibleTileIndex(visibleTileIds, plan.pressureDoor.toTileIndex)
  )) {
    connectorIds.push(plan.pressureDoor.connectorId);
  }

  if (plan.timedGate && (
    hasVisibleTileIndex(visibleTileIds, plan.timedGate.fromTileIndex)
    || hasVisibleTileIndex(visibleTileIds, plan.timedGate.toTileIndex)
  )) {
    connectorIds.push(plan.timedGate.connectorId);
  }

  return connectorIds;
};

const appendUniqueCue = (cues: string[], value: string | null | undefined): void => {
  const normalized = value?.trim();
  if (!normalized || cues.includes(normalized)) {
    return;
  }

  cues.push(normalized);
};

const resolveBoardRiskSignal = (
  telegraphs: readonly DemoBoardTelegraph[],
  currentPathCursor: number,
  keyAcquired: boolean,
  plateActive: boolean
): Pick<MenuRuntimeBoardState, 'nextRiskLabel' | 'nextRiskTone'> => {
  const ordered = [...telegraphs].sort((left, right) => (
    Math.abs(left.pathCursor - currentPathCursor) - Math.abs(right.pathCursor - currentPathCursor)
    || right.readiness - left.readiness
  ));
  const nextTelegraph = ordered.find((telegraph) => telegraph.pathCursor >= currentPathCursor - 1) ?? ordered[0] ?? null;

  if (!nextTelegraph) {
    return {
      nextRiskLabel: 'Next risk: route is readable',
      nextRiskTone: 'low'
    };
  }

  switch (nextTelegraph.kind) {
    case 'timed-gate':
      return {
        nextRiskLabel: nextTelegraph.active
          ? 'Next risk: gate is live'
          : 'Next risk: gate timing ahead',
        nextRiskTone: nextTelegraph.active ? 'critical' : 'high'
      };
    case 'hazard-tile':
      return {
        nextRiskLabel: nextTelegraph.active
          ? 'Next risk: live hazard tile'
          : 'Next risk: hazard arming',
        nextRiskTone: nextTelegraph.active ? 'critical' : 'high'
      };
    case 'patrol-lane':
      return {
        nextRiskLabel: currentPathCursor >= nextTelegraph.pathCursor
          ? 'Next risk: patrol crossing'
          : 'Next risk: patrol lane ahead',
        nextRiskTone: currentPathCursor >= nextTelegraph.pathCursor ? 'high' : 'medium'
      };
    case 'pressure-door':
      return {
        nextRiskLabel: !keyAcquired
          ? 'Next risk: key before door'
          : !plateActive
            ? 'Next risk: switch required'
            : 'Next risk: door opening',
        nextRiskTone: !keyAcquired || !plateActive ? 'medium' : 'high'
      };
    case 'pressure-plate':
      return {
        nextRiskLabel: nextTelegraph.active
          ? 'Next risk: door is ready'
          : 'Next risk: switch required',
        nextRiskTone: nextTelegraph.active ? 'medium' : 'high'
      };
    case 'key-item':
    default:
      return {
        nextRiskLabel: 'Next risk: key pickup before pressure',
        nextRiskTone: 'medium'
      };
  }
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

  private readonly pathCursorByTileId = new Map<TileId, number>();

  private readonly spectatorPlan: DemoSpectatorPlan;

  private readonly trapSystem: TrapTopologySystem;

  private readonly itemLedger: ItemTopologyLedger;

  private readonly puzzleState: PuzzleTopologyState;

  private readonly warden: WardenGraphAgent | null;

  private readonly boardStateByStep = new Map<number, MenuRuntimeBoardState>();

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
    this.spectatorPlan = createDemoSpectatorPlan(episode);
    this.trapSystem = new TrapTopologySystem(buildTrapContracts(this.spectatorPlan));
    this.itemLedger = new ItemTopologyLedger(buildItemDefinitions(this.spectatorPlan));
    this.puzzleState = new PuzzleTopologyState(buildPuzzleDefinitions(this.spectatorPlan));
    this.warden = this.spectatorPlan.patrolLane
      ? new WardenGraphAgent({
        seed: `menu-warden-${episode.seed}`,
        startTileId: toTileId(this.spectatorPlan.patrolLane.fromTileIndex)
      })
      : null;
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
    const visibleLandmarks = this.collectVisibleLandmarks(visibleTileIds);
    const visibleConnectorIds = collectVisibleConnectorIds(this.spectatorPlan, visibleTileIds);
    const localCues = this.buildLocalCues(descriptor, step, visibleTileIds, visibleConnectorIds);
    const goalVisible = collectVisibleTileIds(descriptor.index, this.descriptorsByIndex, GOAL_VISIBILITY_RADIUS).has(this.goalTileId);
    const currentPathCursor = this.pathCursorByTileId.get(descriptor.id) ?? 0;

    if (this.spectatorPlan.keyItem && descriptor.id === toTileId(this.spectatorPlan.keyItem.tileIndex)) {
      this.itemLedger.recordCheckpointKeyAcquired(step, this.spectatorPlan.keyItem.id);
      this.puzzleState.recordCheckpointKeyAcquired(this.spectatorPlan.keyItem.id);
    }

    if (this.spectatorPlan.pressurePlate && descriptor.id === toTileId(this.spectatorPlan.pressurePlate.tileIndex)) {
      this.itemLedger.recordSignalNodeActivated(step, this.spectatorPlan.pressurePlate.id);
      this.puzzleState.recordSignalNodeState(this.spectatorPlan.pressurePlate.id, true);
    }

    const itemObservation = this.itemLedger.observeAndRank({
      step,
      currentTileId: descriptor.id,
      neighborTileIds: descriptor.neighbors,
      visibleLandmarkIds: visibleLandmarks.map((landmark) => landmark.id),
      visibleConnectorIds,
      localCues,
      requestedCheckpointIds: this.spectatorPlan.pressureDoor ? ['plate-door'] : [],
      requestedSignalNodeIds: this.spectatorPlan.pressurePlate ? [this.spectatorPlan.pressurePlate.id] : [],
      requestedShellIds: []
    });
    const puzzleObservation = this.puzzleState.observeAndRank({
      step,
      currentTileId: descriptor.id,
      neighborTileIds: descriptor.neighbors,
      visibleLandmarkIds: visibleLandmarks.map((landmark) => landmark.id),
      visibleConnectorIds,
      localCues,
      targetShellId: null
    });
    const trapStep = this.trapSystem.evaluate({
      step,
      currentTileId: descriptor.id,
      rotationPhase: step % 2 === 0 ? 'stable' : 'turning',
      activeJunctionIds: descriptor.kind === 'junction' ? [descriptor.id] : [],
      activeLoopIds: [],
      activeCheckpointIds: [
        ...(this.spectatorPlan.hazardTile && descriptor.id === toTileId(this.spectatorPlan.hazardTile.tileIndex)
          ? [`checkpoint:${this.spectatorPlan.hazardTile.id}`]
          : []),
        ...(this.spectatorPlan.timedGate && descriptor.id === toTileId(this.spectatorPlan.timedGate.fromTileIndex)
          ? [`checkpoint:${this.spectatorPlan.timedGate.id}`]
          : [])
      ],
      visibleLandmarkIds: visibleLandmarks.map((landmark) => landmark.id),
      visibleProxyIds: [],
      nearbyConnectorIds: visibleConnectorIds,
      traversedConnectorId: null
    });
    const wardenDecision = this.buildWardenDecision(
      step,
      descriptor,
      visibleLandmarks,
      currentPathCursor
    );
    const bundle = buildTopologySignalBundle({
      trapSnapshot: this.trapSystem.getSnapshot(),
      trapStep,
      wardenDecision,
      itemDefinitions: this.itemLedger.getDefinitions(),
      itemObservation,
      puzzleDefinitions: buildPuzzleDefinitions(this.spectatorPlan),
      puzzleObservation
    });
    const mergedLocalCues = [...localCues];
    bundle.localCues.forEach((cue) => appendUniqueCue(mergedLocalCues, cue));
    this.boardStateByStep.set(
      step,
      this.buildBoardState(
        step,
        currentPathCursor,
        visibleTileIds,
        itemObservation.progress.checkpointKeyIds.includes(this.spectatorPlan.keyItem?.id ?? ''),
        itemObservation.progress.signalNodeIds.includes(this.spectatorPlan.pressurePlate?.id ?? '')
      )
    );

    return {
      currentTileLabel: descriptor.label,
      observation: {
        step,
        currentTileId: descriptor.id,
        heading: this.currentHeading,
        traversableTileIds: [...descriptor.neighbors],
        localCues: mergedLocalCues,
        candidateSignals: bundle.candidateSignals,
        visibleLandmarks,
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
    const traversedConnectorId = this.resolveTraversedConnectorId(descriptor.id, nextTileId);
    return {
      currentTileId: nextTileId,
      traversedConnectorId,
      traversedConnectorLabel: traversedConnectorId === this.spectatorPlan.pressureDoor?.connectorId
        ? this.spectatorPlan.pressureDoor.label
        : traversedConnectorId === this.spectatorPlan.timedGate?.connectorId
          ? this.spectatorPlan.timedGate.label
          : null
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

  getBoardState(step: number): MenuRuntimeBoardState | null {
    return this.boardStateByStep.get(step) ?? null;
  }

  private buildDescriptors(): void {
    const { width, height, tiles, startIndex, endIndex } = this.episode.raster;
    this.episode.raster.pathIndices.forEach((index, cursor) => {
      this.pathCursorByTileId.set(toTileId(index), cursor);
    });

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

  private collectVisibleLandmarks(visibleTileIds: ReadonlySet<TileId>): VisibleLandmark[] {
    const visibleLandmarks: VisibleLandmark[] = [];

    for (const tileId of visibleTileIds) {
      const landmarks = this.landmarksByTileId.get(tileId);
      if (!landmarks) {
        continue;
      }

      visibleLandmarks.push(...landmarks);
    }

    visibleLandmarks.push(...collectMechanicLandmarks(this.spectatorPlan, visibleTileIds));

    return visibleLandmarks;
  }

  private buildLocalCues(
    descriptor: TileRuntimeDescriptor,
    step: number,
    visibleTileIds: ReadonlySet<TileId>,
    visibleConnectorIds: readonly string[]
  ): string[] {
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

    if (this.spectatorPlan.keyItem && hasVisibleTileIndex(visibleTileIds, this.spectatorPlan.keyItem.tileIndex)) {
      appendUniqueCue(localCues, 'key item');
      appendUniqueCue(localCues, 'checkpoint key');
      appendUniqueCue(localCues, 'key ahead');
    }

    if (this.spectatorPlan.pressurePlate && hasVisibleTileIndex(visibleTileIds, this.spectatorPlan.pressurePlate.tileIndex)) {
      appendUniqueCue(localCues, 'pressure plate');
      appendUniqueCue(localCues, descriptor.id === toTileId(this.spectatorPlan.pressurePlate.tileIndex) ? 'switch engaged' : 'switch required');
    }

    if (this.spectatorPlan.pressureDoor && visibleConnectorIds.includes(this.spectatorPlan.pressureDoor.connectorId)) {
      appendUniqueCue(localCues, 'sealed door');
      appendUniqueCue(localCues, 'door ahead');
    }

    if (this.spectatorPlan.hazardTile && hasVisibleTileIndex(visibleTileIds, this.spectatorPlan.hazardTile.tileIndex)) {
      appendUniqueCue(localCues, 'hazard tile');
      appendUniqueCue(localCues, isTimingActive(step, this.spectatorPlan.hazardTile) ? 'hazard live' : 'hazard arming');
    }

    if (this.spectatorPlan.timedGate && visibleConnectorIds.includes(this.spectatorPlan.timedGate.connectorId)) {
      appendUniqueCue(localCues, 'timing gate');
      appendUniqueCue(localCues, isTimingActive(step, this.spectatorPlan.timedGate) ? 'gate cycle live' : 'gate cycle readable');
      appendUniqueCue(localCues, 'gate ahead');
    }

    if (this.spectatorPlan.patrolLane) {
      const patrolTileIds = this.spectatorPlan.patrolLane.tileIndices.map((index) => toTileId(index));
      if (patrolTileIds.includes(descriptor.id) || patrolTileIds.some((tileId) => visibleTileIds.has(tileId))) {
        appendUniqueCue(localCues, 'enemy patrol');
        appendUniqueCue(localCues, 'patrol lane');
        appendUniqueCue(localCues, 'blind corner');
      }
    }

    return localCues;
  }

  private buildWardenDecision(
    step: number,
    descriptor: TileRuntimeDescriptor,
    visibleLandmarks: readonly VisibleLandmark[],
    currentPathCursor: number
  ): WardenDecision | null {
    if (!this.warden || !this.spectatorPlan.patrolLane) {
      return null;
    }

    const patrolTileIds = this.spectatorPlan.patrolLane.tileIndices.map((index) => toTileId(index));
    const patrolIndex = step % Math.max(1, patrolTileIds.length);
    const currentPatrolTileId = patrolTileIds[patrolIndex] ?? patrolTileIds[0];
    const playerInsideLane = patrolTileIds.includes(descriptor.id);

    return this.warden.observeAndDecide({
      step,
      currentTileId: currentPatrolTileId,
      traversableTileIds: patrolTileIds.filter((tileId) => tileId !== currentPatrolTileId),
      localCues: [
        'enemy patrol',
        'blind corner',
        ...(currentPathCursor >= this.spectatorPlan.patrolLane.pathCursor ? ['intercept lane'] : ['junction'])
      ],
      visibleLandmarks,
      playerVisible: playerInsideLane,
      playerTileId: playerInsideLane ? descriptor.id : null,
      playerLastKnownTileId: descriptor.id,
      sightlineBroken: !playerInsideLane,
      rotationPhase: step % 3 === 0 ? 'stable' : step % 3 === 1 ? 'turning' : 'recovery'
    });
  }

  private buildBoardState(
    step: number,
    currentPathCursor: number,
    visibleTileIds: ReadonlySet<TileId>,
    keyAcquired: boolean,
    plateActive: boolean
  ): MenuRuntimeBoardState {
    const telegraphs: DemoBoardTelegraph[] = [];

    if (this.spectatorPlan.keyItem && (
      hasVisibleTileIndex(visibleTileIds, this.spectatorPlan.keyItem.tileIndex) || keyAcquired
    )) {
      telegraphs.push({
        id: this.spectatorPlan.keyItem.id,
        kind: 'key-item',
        label: this.spectatorPlan.keyItem.label,
        primaryTileIndex: this.spectatorPlan.keyItem.tileIndex,
        pathCursor: this.spectatorPlan.keyItem.pathCursor,
        active: keyAcquired,
        visible: true,
        readiness: keyAcquired ? 1 : 0.72,
        cycleProgress: keyAcquired ? 1 : 0
      });
    }

    if (this.spectatorPlan.pressurePlate && (
      hasVisibleTileIndex(visibleTileIds, this.spectatorPlan.pressurePlate.tileIndex) || plateActive
    )) {
      telegraphs.push({
        id: this.spectatorPlan.pressurePlate.id,
        kind: 'pressure-plate',
        label: this.spectatorPlan.pressurePlate.label,
        primaryTileIndex: this.spectatorPlan.pressurePlate.tileIndex,
        linkedTileIndex: this.spectatorPlan.pressureDoor?.fromTileIndex,
        pathCursor: this.spectatorPlan.pressurePlate.pathCursor,
        active: plateActive,
        visible: true,
        readiness: plateActive ? 1 : 0.68,
        cycleProgress: plateActive ? 1 : 0
      });
    }

    if (this.spectatorPlan.pressureDoor && (
      hasVisibleTileIndex(visibleTileIds, this.spectatorPlan.pressureDoor.fromTileIndex)
      || hasVisibleTileIndex(visibleTileIds, this.spectatorPlan.pressureDoor.toTileIndex)
      || plateActive
    )) {
      telegraphs.push({
        id: this.spectatorPlan.pressureDoor.id,
        kind: 'pressure-door',
        label: this.spectatorPlan.pressureDoor.label,
        primaryTileIndex: this.spectatorPlan.pressureDoor.fromTileIndex,
        secondaryTileIndex: this.spectatorPlan.pressureDoor.toTileIndex,
        linkedTileIndex: this.spectatorPlan.pressurePlate?.tileIndex,
        pathCursor: this.spectatorPlan.pressureDoor.pathCursor,
        active: plateActive && keyAcquired,
        visible: true,
        readiness: plateActive || keyAcquired ? 0.84 : 0.52,
        cycleProgress: plateActive && keyAcquired ? 1 : 0
      });
    }

    if (this.spectatorPlan.hazardTile && (
      hasVisibleTileIndex(visibleTileIds, this.spectatorPlan.hazardTile.tileIndex)
      || currentPathCursor >= this.spectatorPlan.hazardTile.pathCursor
    )) {
      telegraphs.push({
        id: this.spectatorPlan.hazardTile.id,
        kind: 'hazard-tile',
        label: this.spectatorPlan.hazardTile.label,
        primaryTileIndex: this.spectatorPlan.hazardTile.tileIndex,
        pathCursor: this.spectatorPlan.hazardTile.pathCursor,
        active: isTimingActive(step, this.spectatorPlan.hazardTile),
        visible: true,
        readiness: isTimingActive(step, this.spectatorPlan.hazardTile) ? 1 : 0.36,
        cycleProgress: (step % this.spectatorPlan.hazardTile.period) / this.spectatorPlan.hazardTile.period
      });
    }

    if (this.spectatorPlan.timedGate && (
      hasVisibleTileIndex(visibleTileIds, this.spectatorPlan.timedGate.fromTileIndex)
      || hasVisibleTileIndex(visibleTileIds, this.spectatorPlan.timedGate.toTileIndex)
      || currentPathCursor >= this.spectatorPlan.timedGate.pathCursor - 1
    )) {
      telegraphs.push({
        id: this.spectatorPlan.timedGate.id,
        kind: 'timed-gate',
        label: this.spectatorPlan.timedGate.label,
        primaryTileIndex: this.spectatorPlan.timedGate.fromTileIndex,
        secondaryTileIndex: this.spectatorPlan.timedGate.toTileIndex,
        pathCursor: this.spectatorPlan.timedGate.pathCursor,
        active: isTimingActive(step, this.spectatorPlan.timedGate),
        visible: true,
        readiness: isTimingActive(step, this.spectatorPlan.timedGate) ? 1 : 0.44,
        cycleProgress: (step % this.spectatorPlan.timedGate.period) / this.spectatorPlan.timedGate.period
      });
    }

    if (this.spectatorPlan.patrolLane && (
      this.spectatorPlan.patrolLane.tileIndices.some((index) => hasVisibleTileIndex(visibleTileIds, index))
      || currentPathCursor >= this.spectatorPlan.patrolLane.pathCursor - 1
    )) {
      const patrolTiles = this.spectatorPlan.patrolLane.tileIndices;
      const patrolIndex = step % Math.max(1, patrolTiles.length);
      telegraphs.push({
        id: this.spectatorPlan.patrolLane.id,
        kind: 'patrol-lane',
        label: this.spectatorPlan.patrolLane.label,
        primaryTileIndex: patrolTiles[patrolIndex] ?? this.spectatorPlan.patrolLane.fromTileIndex,
        secondaryTileIndex: this.spectatorPlan.patrolLane.toTileIndex,
        linkedTileIndex: this.spectatorPlan.patrolLane.fromTileIndex,
        pathCursor: this.spectatorPlan.patrolLane.pathCursor,
        active: true,
        visible: true,
        readiness: currentPathCursor >= this.spectatorPlan.patrolLane.pathCursor ? 0.92 : 0.58,
        cycleProgress: patrolIndex / Math.max(1, patrolTiles.length)
      });
    }

    const riskSignal = resolveBoardRiskSignal(telegraphs, currentPathCursor, keyAcquired, plateActive);

    return {
      step,
      telegraphs,
      ...riskSignal,
      ...(currentPathCursor >= (this.spectatorPlan.timedGate?.pathCursor ?? Number.MAX_SAFE_INTEGER)
        ? {
            failReasonTitle: 'Timing missed',
            failReasonSubtitle: 'The gate window was visible before the commit, but the cycle still closed the lane.'
          }
        : currentPathCursor >= (this.spectatorPlan.hazardTile?.pathCursor ?? Number.MAX_SAFE_INTEGER)
          ? {
              failReasonTitle: 'Hazard clipped',
              failReasonSubtitle: 'The flash cadence warned the route, then the live tile punished the late step.'
            }
          : currentPathCursor >= (this.spectatorPlan.patrolLane?.pathCursor ?? Number.MAX_SAFE_INTEGER)
            ? {
                failReasonTitle: 'Patrol crossed',
                failReasonSubtitle: 'The line patrol telegraphed its lane, but the route still committed into pressure.'
              }
            : {
                failReasonTitle: this.spectatorPlan.failureReasonTitle,
                failReasonSubtitle: this.spectatorPlan.failureReasonSubtitle
              })
    };
  }

  private resolveTraversedConnectorId(fromTileId: TileId, nextTileId: TileId): string | null {
    const forwardPair = [fromTileId, nextTileId].sort().join('::');

    if (this.spectatorPlan.pressureDoor) {
      const pair = [toTileId(this.spectatorPlan.pressureDoor.fromTileIndex), toTileId(this.spectatorPlan.pressureDoor.toTileIndex)].sort().join('::');
      if (pair === forwardPair) {
        return this.spectatorPlan.pressureDoor.connectorId;
      }
    }

    if (this.spectatorPlan.timedGate) {
      const pair = [toTileId(this.spectatorPlan.timedGate.fromTileIndex), toTileId(this.spectatorPlan.timedGate.toTileIndex)].sort().join('::');
      if (pair === forwardPair) {
        return this.spectatorPlan.timedGate.connectorId;
      }
    }

    return null;
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

  getBoardState(step = this.latestStep): MenuRuntimeBoardState | null {
    if (this.host.intentDeliveries.length === 0) {
      return null;
    }

    const safeStep = Math.max(0, Math.min(Math.trunc(step), this.latestStep));
    return this.host.getBoardState(safeStep) ?? this.host.getBoardState(this.latestStep) ?? null;
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
