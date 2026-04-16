import { describe, expect, test } from 'vitest';
import type { MazeEpisode } from '../../src/domain/maze';
import { createMenuIntentRuntimeSession } from '../../src/scenes/menuIntentRuntime';

const createCorridorEpisode = (): MazeEpisode => ({
  accepted: true,
  checkpointsCreated: 0,
  difficulty: 'standard',
  family: 'classic',
  pathLength: 3,
  placementStrategy: 'farthest-pair',
  presentationPreset: 'classic',
  raster: {
    width: 3,
    height: 1,
    tiles: new Uint8Array([1, 1, 1]),
    startIndex: 0,
    endIndex: 2,
    pathIndices: [0, 1, 2]
  },
  score: 0,
  seed: 12,
  shortcutsCreated: 0,
  size: 'small'
} as unknown as MazeEpisode);

describe('menu intent runtime', () => {
  test('builds bounded feed state against the shipping maze episode path', () => {
    const session = createMenuIntentRuntimeSession(createCorridorEpisode());

    session.advanceToStep(0);
    const firstState = session.getFeedState(0);
    expect(firstState).not.toBeNull();
    expect(firstState?.entries.length).toBeGreaterThan(0);
    expect(firstState?.entries.length).toBeLessThanOrEqual(4);

    session.advanceToStep(1);
    const secondState = session.getFeedState(1);
    expect(secondState).not.toBeNull();
    expect(secondState?.entries.length).toBeLessThanOrEqual(4);
    expect(secondState?.entries.some((entry) => entry.kind === 'goal-observed')).toBe(true);
  });
});
