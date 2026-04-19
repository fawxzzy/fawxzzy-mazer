import type { MazeEpisode } from '../maze';

export type DemoMechanicKind =
  | 'key-item'
  | 'pressure-plate'
  | 'pressure-door'
  | 'hazard-tile'
  | 'timed-gate'
  | 'patrol-lane';

export type DemoSegmentCue = 'explore' | 'anticipate' | 'reacquire';

export interface DemoRiskWindow {
  mechanicId: string;
  segmentIndex: number;
  weight: number;
  cue: DemoSegmentCue;
}

export interface DemoBoardTelegraph {
  id: string;
  kind: DemoMechanicKind;
  label: string;
  primaryTileIndex: number;
  secondaryTileIndex?: number;
  linkedTileIndex?: number;
  pathCursor: number;
  active: boolean;
  visible: boolean;
  readiness: number;
  cycleProgress: number;
}

export interface DemoKeyItemPlacement {
  id: string;
  label: string;
  tileIndex: number;
  pathCursor: number;
  landmarkId: string;
}

export interface DemoPressurePlatePlacement {
  id: string;
  label: string;
  tileIndex: number;
  pathCursor: number;
  landmarkId: string;
}

export interface DemoDoorPlacement {
  id: string;
  label: string;
  fromTileIndex: number;
  toTileIndex: number;
  pathCursor: number;
  connectorId: string;
  landmarkId: string;
}

export interface DemoHazardPlacement {
  id: string;
  label: string;
  tileIndex: number;
  pathCursor: number;
  landmarkId: string;
  period: number;
  activeResidues: readonly number[];
}

export interface DemoTimedGatePlacement {
  id: string;
  label: string;
  fromTileIndex: number;
  toTileIndex: number;
  pathCursor: number;
  connectorId: string;
  landmarkId: string;
  period: number;
  activeResidues: readonly number[];
}

export interface DemoPatrolPlacement {
  id: string;
  label: string;
  tileIndices: readonly number[];
  fromTileIndex: number;
  toTileIndex: number;
  pathCursor: number;
}

export interface DemoSpectatorPlan {
  pathLength: number;
  segmentCount: number;
  keyItem: DemoKeyItemPlacement | null;
  pressurePlate: DemoPressurePlatePlacement | null;
  pressureDoor: DemoDoorPlacement | null;
  hazardTile: DemoHazardPlacement | null;
  timedGate: DemoTimedGatePlacement | null;
  patrolLane: DemoPatrolPlacement | null;
  riskWindows: readonly DemoRiskWindow[];
  failureReasonTitle: string;
  failureReasonSubtitle: string;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const resolveCursor = (
  segmentCount: number,
  ratio: number,
  min: number,
  max: number
): number => clamp(Math.round(segmentCount * ratio), min, max);

const buildConnectorId = (prefix: string, fromTileIndex: number, toTileIndex: number): string => (
  `${prefix}:${Math.min(fromTileIndex, toTileIndex)}:${Math.max(fromTileIndex, toTileIndex)}`
);

const buildLandmarkId = (prefix: string, tileIndex: number): string => `${prefix}:${tileIndex}`;

const buildRiskWindows = (
  plateCursor: number,
  hazardCursor: number,
  gateCursor: number,
  patrolCursor: number
): DemoRiskWindow[] => [
  {
    mechanicId: 'pressure-door',
    segmentIndex: plateCursor,
    weight: 1.18,
    cue: 'reacquire'
  },
  {
    mechanicId: 'patrol-lane',
    segmentIndex: patrolCursor,
    weight: 1.22,
    cue: 'anticipate'
  },
  {
    mechanicId: 'hazard-tile',
    segmentIndex: hazardCursor,
    weight: 1.28,
    cue: 'anticipate'
  },
  {
    mechanicId: 'timed-gate',
    segmentIndex: gateCursor,
    weight: 1.36,
    cue: 'anticipate'
  }
];

export const createDemoSpectatorPlan = (episode: MazeEpisode): DemoSpectatorPlan => {
  const path = episode.raster.pathIndices;
  const segmentCount = Math.max(0, path.length - 1);
  if (segmentCount < 6) {
    return {
      pathLength: path.length,
      segmentCount,
      keyItem: null,
      pressurePlate: null,
      pressureDoor: null,
      hazardTile: null,
      timedGate: null,
      patrolLane: null,
      riskWindows: [],
      failureReasonTitle: 'Route clipped',
      failureReasonSubtitle: 'The route never showed enough danger to justify a trap ritual.'
    };
  }

  const keyCursor = resolveCursor(segmentCount, 0.18, 1, Math.max(1, segmentCount - 5));
  const plateCursor = resolveCursor(segmentCount, 0.36, Math.max(2, keyCursor + 1), Math.max(2, segmentCount - 4));
  const doorCursor = clamp(plateCursor + 1, Math.max(2, plateCursor), Math.max(2, segmentCount - 3));
  const patrolCursor = resolveCursor(segmentCount, 0.52, Math.max(3, doorCursor), Math.max(3, segmentCount - 3));
  const hazardCursor = resolveCursor(segmentCount, 0.68, Math.max(4, patrolCursor), Math.max(4, segmentCount - 2));
  const gateCursor = resolveCursor(segmentCount, 0.82, Math.max(5, hazardCursor), Math.max(5, segmentCount - 1));
  const patrolEndCursor = clamp(patrolCursor + 1, patrolCursor, Math.max(patrolCursor, segmentCount - 1));
  const patrolTileIndices = Array.from(path.slice(patrolCursor, patrolEndCursor + 2));
  const doorFromTileIndex = path[doorCursor];
  const doorToTileIndex = path[Math.min(path.length - 1, doorCursor + 1)];
  const gateFromTileIndex = path[gateCursor];
  const gateToTileIndex = path[Math.min(path.length - 1, gateCursor + 1)];

  return {
    pathLength: path.length,
    segmentCount,
    keyItem: {
      id: 'checkpoint-key',
      label: 'Key',
      tileIndex: path[keyCursor],
      pathCursor: keyCursor,
      landmarkId: buildLandmarkId('key-beacon', path[keyCursor])
    },
    pressurePlate: {
      id: 'plate-relay',
      label: 'Switch plate',
      tileIndex: path[plateCursor],
      pathCursor: plateCursor,
      landmarkId: buildLandmarkId('plate-relay', path[plateCursor])
    },
    pressureDoor: {
      id: 'plate-door',
      label: 'Door',
      fromTileIndex: doorFromTileIndex,
      toTileIndex: doorToTileIndex,
      pathCursor: doorCursor,
      connectorId: buildConnectorId('plate-door', doorFromTileIndex, doorToTileIndex),
      landmarkId: buildLandmarkId('door-post', doorFromTileIndex)
    },
    hazardTile: {
      id: 'hazard-flash',
      label: 'Hazard tile',
      tileIndex: path[hazardCursor],
      pathCursor: hazardCursor,
      landmarkId: buildLandmarkId('hazard-marker', path[hazardCursor]),
      period: 4,
      activeResidues: [1, 2]
    },
    timedGate: {
      id: 'timed-gate',
      label: 'Gate',
      fromTileIndex: gateFromTileIndex,
      toTileIndex: gateToTileIndex,
      pathCursor: gateCursor,
      connectorId: buildConnectorId('timed-gate', gateFromTileIndex, gateToTileIndex),
      landmarkId: buildLandmarkId('gate-post', gateFromTileIndex),
      period: 5,
      activeResidues: [2, 3]
    },
    patrolLane: {
      id: 'line-patrol',
      label: 'Patrol lane',
      tileIndices: patrolTileIndices,
      fromTileIndex: patrolTileIndices[0] ?? path[patrolCursor],
      toTileIndex: patrolTileIndices.at(-1) ?? path[patrolCursor],
      pathCursor: patrolCursor
    },
    riskWindows: buildRiskWindows(plateCursor, hazardCursor, gateCursor, patrolCursor),
    failureReasonTitle: 'Timing missed',
    failureReasonSubtitle: 'The gate cycle was readable, but the commit landed inside the live window.'
  };
};
