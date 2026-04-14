import type { HeadingToken, TileId } from '../../mazer-core/agent/types';

export type FutureTileId =
  | 'launch'
  | 'gallery'
  | 'archive'
  | 'relay'
  | 'approach'
  | 'core';

export interface FutureLandmark {
  id: string;
  label: string;
}

export interface FutureTile {
  id: FutureTileId;
  label: string;
  x: number;
  y: number;
  neighbors: readonly FutureTileId[];
  headings: Partial<Record<FutureTileId, HeadingToken>>;
  localCues: readonly string[];
  landmarks: readonly FutureLandmark[];
  goalVisible: boolean;
  goalTileId: FutureTileId | null;
}

export const FUTURE_PHASER_TOPOLOGY: Readonly<Record<FutureTileId, FutureTile>> = {
  launch: {
    id: 'launch',
    label: 'Launch dock',
    x: 110,
    y: 220,
    neighbors: ['gallery'],
    headings: {
      gallery: 'east'
    },
    localCues: ['launch corridor', 'dock signage'],
    landmarks: [
      {
        id: 'dock-sign',
        label: 'Dock sign'
      }
    ],
    goalVisible: false,
    goalTileId: null
  },
  gallery: {
    id: 'gallery',
    label: 'Signal gallery',
    x: 270,
    y: 220,
    neighbors: ['launch', 'archive'],
    headings: {
      launch: 'west',
      archive: 'east'
    },
    localCues: ['warden pressure', 'display halo'],
    landmarks: [
      {
        id: 'gallery-frame',
        label: 'Gallery frame'
      }
    ],
    goalVisible: false,
    goalTileId: null
  },
  archive: {
    id: 'archive',
    label: 'Archive bay',
    x: 430,
    y: 220,
    neighbors: ['gallery', 'relay'],
    headings: {
      gallery: 'west',
      relay: 'east'
    },
    localCues: ['trap sigil', 'locked record'],
    landmarks: [
      {
        id: 'archive-plaque',
        label: 'Archive plaque'
      }
    ],
    goalVisible: false,
    goalTileId: null
  },
  relay: {
    id: 'relay',
    label: 'Relay spine',
    x: 590,
    y: 220,
    neighbors: ['archive', 'approach'],
    headings: {
      archive: 'west',
      approach: 'east'
    },
    localCues: ['item cache', 'rotation phase'],
    landmarks: [
      {
        id: 'relay-beacon',
        label: 'Relay beacon'
      }
    ],
    goalVisible: false,
    goalTileId: null
  },
  approach: {
    id: 'approach',
    label: 'Core approach',
    x: 750,
    y: 220,
    neighbors: ['relay', 'core'],
    headings: {
      relay: 'west',
      core: 'east'
    },
    localCues: ['puzzle plate', 'goal sightline'],
    landmarks: [
      {
        id: 'goal-signal',
        label: 'Goal signal'
      }
    ],
    goalVisible: true,
    goalTileId: 'core'
  },
  core: {
    id: 'core',
    label: 'Core node',
    x: 910,
    y: 220,
    neighbors: ['approach'],
    headings: {
      approach: 'west'
    },
    localCues: ['goal', 'warden pursuit', 'exit marker'],
    landmarks: [
      {
        id: 'exit-marker',
        label: 'Exit marker'
      }
    ],
    goalVisible: true,
    goalTileId: 'core'
  }
};

export const FUTURE_PHASER_ROUTE: readonly FutureTileId[] = [
  'launch',
  'gallery',
  'archive',
  'relay',
  'approach',
  'core'
];

export const FUTURE_PHASER_START_TILE_ID: FutureTileId = 'launch';
export const FUTURE_PHASER_START_HEADING: HeadingToken = 'east';

export const resolveFutureTile = (tileId: TileId): FutureTile | null => (
  Object.prototype.hasOwnProperty.call(FUTURE_PHASER_TOPOLOGY, tileId)
    ? FUTURE_PHASER_TOPOLOGY[tileId as FutureTileId]
    : null
);

export const resolveFutureHeading = (fromTileId: TileId, toTileId: TileId): HeadingToken => {
  const tile = resolveFutureTile(fromTileId);
  if (!tile) {
    return 'east';
  }

  return tile.headings[toTileId as FutureTileId] ?? 'east';
};
