import type Phaser from 'phaser';
import { describe, expect, test, vi } from 'vitest';
import type { MazeEpisode } from '../../src/domain/maze';
import type { DemoTrailStep } from '../../src/domain/ai';
import { palette } from '../../src/render/palette';
import {
  BoardRenderer,
  resolveTrailHeadRenderState,
  type BoardLayout
} from '../../src/render/boardRenderer';

vi.mock('phaser', () => ({
  default: {
    Math: {
      Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
      Linear: (left: number, right: number, t: number) => left + ((right - left) * t)
    }
  }
}));

type GraphicsCall = {
  method: string;
  args: unknown[];
};

const createGraphicsStub = () => {
  const calls: GraphicsCall[] = [];
  const stub = {
    calls,
    clear: vi.fn(() => {
      calls.push({ method: 'clear', args: [] });
      return stub;
    }),
    destroy: vi.fn(() => {
      calls.push({ method: 'destroy', args: [] });
      return stub;
    }),
    fillStyle: vi.fn((...args: unknown[]) => {
      calls.push({ method: 'fillStyle', args });
      return stub;
    }),
    fillRect: vi.fn((...args: unknown[]) => {
      calls.push({ method: 'fillRect', args });
      return stub;
    }),
    fillCircle: vi.fn((...args: unknown[]) => {
      calls.push({ method: 'fillCircle', args });
      return stub;
    }),
    fillTriangle: vi.fn((...args: unknown[]) => {
      calls.push({ method: 'fillTriangle', args });
      return stub;
    }),
    lineStyle: vi.fn((...args: unknown[]) => {
      calls.push({ method: 'lineStyle', args });
      return stub;
    }),
    lineBetween: vi.fn((...args: unknown[]) => {
      calls.push({ method: 'lineBetween', args });
      return stub;
    }),
    strokeCircle: vi.fn((...args: unknown[]) => {
      calls.push({ method: 'strokeCircle', args });
      return stub;
    }),
    strokeRect: vi.fn((...args: unknown[]) => {
      calls.push({ method: 'strokeRect', args });
      return stub;
    })
  };

  return stub;
};

const createContainerStub = () => ({
  add: vi.fn(),
  destroy: vi.fn(),
  setPosition: vi.fn()
});

const createSceneStub = (now = 0) => {
  const graphics: ReturnType<typeof createGraphicsStub>[] = [];
  const scene = {
    time: { now },
    add: {
      graphics: vi.fn(() => {
        const stub = createGraphicsStub();
        graphics.push(stub);
        return stub;
      }),
      container: vi.fn(() => createContainerStub())
    },
    tweens: {
      add: vi.fn(() => ({ remove: vi.fn() })),
      killTweensOf: vi.fn()
    }
  };

  return { scene: scene as unknown as Phaser.Scene, graphics };
};

const createEpisode = (): MazeEpisode => {
  return {
    accepted: true,
    checkpointsCreated: 0,
    difficulty: 'standard',
    family: 'classic',
    pathLength: 2,
    placementStrategy: 'farthest-pair',
    presentationPreset: 'classic',
    raster: {
      width: 2,
      height: 1,
      tiles: new Uint8Array([1, 1]),
      startIndex: 0,
      endIndex: 1,
      pathIndices: [0, 1]
    },
    score: 0,
    seed: 7,
    shortcutsCreated: 0,
    size: 'small'
  } as unknown as MazeEpisode;
};

const createLayout = (): BoardLayout => ({
  boardX: 0,
  boardY: 0,
  boardWidth: 20,
  boardHeight: 10,
  boardSize: 20,
  tileSize: 10,
  boardBounds: {
    left: 0,
    top: 0,
    right: 20,
    bottom: 10,
    width: 20,
    height: 10,
    centerX: 10,
    centerY: 5
  },
  safeBounds: {
    left: 0,
    top: 0,
    right: 20,
    bottom: 10,
    width: 20,
    height: 10,
    centerX: 10,
    centerY: 5
  }
});

const getAlphaForColor = (
  calls: GraphicsCall[],
  method: 'fillStyle' | 'lineStyle',
  color: number
): number | undefined => {
  const call = calls.find((entry) => entry.method === method && entry.args.includes(color));
  if (!call) {
    return undefined;
  }

  return method === 'fillStyle'
    ? Number(call.args[1])
    : Number(call.args[2]);
};

describe('board renderer', () => {
  test('attaches the trail head when the live head matches the actor transform', () => {
    const attached = resolveTrailHeadRenderState(
      { x: 10, y: 10 },
      { x: 10.5, y: 10.25 },
      true
    );

    expect(attached.attachedToActor).toBe(true);
    expect(attached.bridgeRendered).toBe(true);
    expect(attached.visibleHeadCenter).toEqual({ x: 10.5, y: 10.25 });

    const detached = resolveTrailHeadRenderState(
      { x: 10, y: 10 },
      undefined,
      true
    );

    expect(detached.attachedToActor).toBe(false);
    expect(detached.bridgeRendered).toBe(false);
    expect(detached.visibleHeadCenter).toEqual({ x: 10, y: 10 });
  });

  test('renders the actor with a dark silhouette before halo and core layers', () => {
    const { scene, graphics } = createSceneStub(1_000);
    const renderer = new BoardRenderer(scene, createEpisode(), createLayout());

    renderer.drawActor(0, 3, 'explore');

    const actorGraphics = graphics.at(8);
    expect(actorGraphics).toBeTruthy();

    const fillStyleCalls = actorGraphics!.calls.filter((call) => call.method === 'fillStyle');
    const firstShadowFillIndex = actorGraphics!.calls.findIndex(
      (call) => call.method === 'fillStyle' && call.args[0] === palette.board.shadow
    );
    const haloFillIndex = actorGraphics!.calls.findIndex(
      (call) => call.method === 'fillStyle' && call.args[0] === palette.board.playerHalo
    );
    const playerFillIndex = actorGraphics!.calls.findIndex(
      (call) => call.method === 'fillStyle' && call.args[0] === palette.board.player
    );
    const coreFillIndex = actorGraphics!.calls.findIndex(
      (call) => call.method === 'fillStyle' && call.args[0] === palette.board.playerCore
    );

    expect(fillStyleCalls.length).toBeGreaterThan(0);
    expect(firstShadowFillIndex).toBeGreaterThanOrEqual(0);
    expect(haloFillIndex).toBeGreaterThan(firstShadowFillIndex);
    expect(playerFillIndex).toBeGreaterThan(haloFillIndex);
    expect(coreFillIndex).toBeGreaterThan(playerFillIndex);
  });

  test('adds an always-on emphasis floor and a large focus ring around the player signal', () => {
    const { scene, graphics } = createSceneStub(1_000);
    const renderer = new BoardRenderer(scene, createEpisode(), createLayout());

    renderer.drawActor(0, 3, 'explore');

    const actorGraphics = graphics.at(8);
    expect(actorGraphics).toBeTruthy();

    const fillCircleCalls = actorGraphics!.calls.filter((call) => call.method === 'fillCircle');
    const strokeCircleCalls = actorGraphics!.calls.filter((call) => call.method === 'strokeCircle');
    const neighborhoodRadius = Number(fillCircleCalls[0]?.args[2] ?? 0);
    const floorRadius = Number(fillCircleCalls[1]?.args[2] ?? 0);
    const firstFocusFillRadius = Number(fillCircleCalls[0]?.args[2] ?? 0);
    const playerCoreStrokeRadii = strokeCircleCalls
      .filter((call) => Number.isFinite(call.args[2]))
      .map((call) => Number(call.args[2]));

    expect(fillCircleCalls.length).toBeGreaterThanOrEqual(6);
    expect(neighborhoodRadius).toBeGreaterThan(floorRadius);
    expect(firstFocusFillRadius).toBeGreaterThan(8);
    expect(playerCoreStrokeRadii.some((radius) => radius > 5)).toBe(true);
  });

  test('reduces competing trail and target signal strength when the player is the focus', () => {
    const trail: Array<number | DemoTrailStep> = [
      0,
      { index: 1, mode: 'explore' }
    ];

    const defaultScene = createSceneStub(1_000);
    const defaultRenderer = new BoardRenderer(defaultScene.scene, createEpisode(), createLayout());
    defaultRenderer.drawTrail(trail, { cue: 'anticipate', targetIndex: 1 });

    const playerScene = createSceneStub(1_000);
    const playerRenderer = new BoardRenderer(playerScene.scene, createEpisode(), createLayout());
    playerRenderer.drawTrail(trail, { cue: 'anticipate', targetIndex: 1, emphasis: 'player' });

    const defaultTrailGraphics = defaultScene.graphics.at(7);
    const defaultSignalGraphics = defaultScene.graphics.at(6);
    const playerTrailGraphics = playerScene.graphics.at(7);
    const playerSignalGraphics = playerScene.graphics.at(6);

    const defaultTrailGlowAlpha = getAlphaForColor(defaultTrailGraphics!.calls, 'fillStyle', palette.board.trailGlow);
    const defaultSignalAlpha = getAlphaForColor(defaultSignalGraphics!.calls, 'lineStyle', palette.board.topHighlight);
    const playerTrailGlowAlpha = getAlphaForColor(playerTrailGraphics!.calls, 'fillStyle', palette.board.trailGlow);
    const playerSignalAlpha = getAlphaForColor(playerSignalGraphics!.calls, 'lineStyle', palette.board.topHighlight);

    expect(defaultTrailGlowAlpha).toBeDefined();
    expect(defaultSignalAlpha).toBeDefined();
    expect(playerTrailGlowAlpha).toBeDefined();
    expect(playerSignalAlpha).toBeDefined();
    expect(playerTrailGlowAlpha!).toBeLessThan(defaultTrailGlowAlpha!);
    expect(playerSignalAlpha!).toBeLessThan(defaultSignalAlpha!);
  });

  test('exposes a live trail head when committed trail and motion head match', () => {
    const { scene } = createSceneStub(1_000);
    const renderer = new BoardRenderer(scene, createEpisode(), createLayout());
    const trail: Array<number | DemoTrailStep> = [
      0,
      { index: 1, mode: 'explore' }
    ];

    renderer.drawTrail(trail, {
      activeMotion: {
        fromIndex: 0,
        toIndex: 1,
        progress: 0.5
      }
    });

    const diagnostics = renderer.getTrailRenderDiagnostics();
    expect(diagnostics.hasActiveMotion).toBe(true);
    expect(diagnostics.attachedToActor).toBe(true);
    expect(diagnostics.bridgeRendered).toBe(true);
    expect(diagnostics.headCenter).toEqual(diagnostics.motionHeadCenter);
  });
});
