import type Phaser from 'phaser';
import { describe, expect, test, vi } from 'vitest';
import type { MazeEpisode } from '../../src/domain/maze';
import type { DemoTrailStep } from '../../src/domain/ai';
import { palette, resolveLocalBoardSupportColors } from '../../src/render/palette';
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

const mixColor = (from: number, to: number, amount: number): number => {
  const safeAmount = Math.max(0, Math.min(1, amount));
  const start = {
    r: (from >> 16) & 0xff,
    g: (from >> 8) & 0xff,
    b: from & 0xff
  };
  const end = {
    r: (to >> 16) & 0xff,
    g: (to >> 8) & 0xff,
    b: to & 0xff
  };

  return (
    ((Math.round(start.r + ((end.r - start.r) * safeAmount)) & 0xff) << 16)
    | ((Math.round(start.g + ((end.g - start.g) * safeAmount)) & 0xff) << 8)
    | (Math.round(start.b + ((end.b - start.b) * safeAmount)) & 0xff)
  );
};

const createThemePalette = (board: Partial<typeof palette.board>) => ({
  ...palette,
  board: {
    ...palette.board,
    ...board
  }
});

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
    const firstSupportFillIndex = actorGraphics!.calls.findIndex((call) => call.method === 'fillStyle');
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
    expect(firstSupportFillIndex).toBeGreaterThanOrEqual(0);
    expect(haloFillIndex).toBeGreaterThan(firstSupportFillIndex);
    expect(playerFillIndex).toBeGreaterThan(haloFillIndex);
    expect(coreFillIndex).toBeGreaterThan(playerFillIndex);
  });

  test('adapts player support against local board luminance', () => {
    const lightPalette = createThemePalette({
      floor: 0xf2f6fb,
      path: 0xe0e7f0,
      wall: 0x334051
    });
    const darkPalette = createThemePalette({
      floor: 0x243243,
      path: 0x0f1824,
      wall: 0x05080d
    });

    const lightScene = createSceneStub(1_000);
    const lightRenderer = new BoardRenderer(lightScene.scene, createEpisode(), createLayout(), {
      theme: { palette: lightPalette }
    });
    const lightSupport = resolveLocalBoardSupportColors(
      lightPalette.board,
      'player',
      (lightRenderer as any).resolveTileNeighborhoodLuminance(0)
    );
    lightRenderer.drawActor(0, 3, 'explore');

    const darkScene = createSceneStub(1_000);
    const darkRenderer = new BoardRenderer(darkScene.scene, createEpisode(), createLayout(), {
      theme: { palette: darkPalette }
    });
    const darkSupport = resolveLocalBoardSupportColors(
      darkPalette.board,
      'player',
      (darkRenderer as any).resolveTileNeighborhoodLuminance(0)
    );
    darkRenderer.drawActor(0, 3, 'explore');

    const lightActorGraphics = lightScene.graphics.at(8);
    const darkActorGraphics = darkScene.graphics.at(8);
    const lightUnderlayColor = lightActorGraphics?.calls.find((call) => call.method === 'fillStyle')?.args[0];
    const darkUnderlayColor = darkActorGraphics?.calls.find((call) => call.method === 'fillStyle')?.args[0];

    expect(lightSupport.mode).toBe('dark');
    expect(darkSupport.mode).toBe('light');
    expect(lightUnderlayColor).toBe(lightSupport.underlay);
    expect(darkUnderlayColor).toBe(darkSupport.underlay);
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

    const defaultTrailGlowAlpha = defaultTrailGraphics!.calls.find((call) => call.method === 'fillStyle')?.args[1];
    const defaultSignalAlpha = getAlphaForColor(defaultSignalGraphics!.calls, 'lineStyle', palette.board.topHighlight);
    const playerTrailGlowAlpha = playerTrailGraphics!.calls.find((call) => call.method === 'fillStyle')?.args[1];
    const playerSignalAlpha = getAlphaForColor(playerSignalGraphics!.calls, 'lineStyle', palette.board.topHighlight);

    expect(defaultTrailGlowAlpha).toBeDefined();
    expect(defaultSignalAlpha).toBeDefined();
    expect(playerTrailGlowAlpha).toBeDefined();
    expect(playerSignalAlpha).toBeDefined();
    expect(Number(playerTrailGlowAlpha)).toBeLessThan(Number(defaultTrailGlowAlpha));
    expect(playerSignalAlpha!).toBeLessThan(defaultSignalAlpha!);
  });

  test('adapts trail floor support against local board luminance', () => {
    const trail: Array<number | DemoTrailStep> = [0, 1];
    const lightPalette = createThemePalette({
      floor: 0xf2f6fb,
      path: 0xe0e7f0,
      wall: 0x334051
    });
    const darkPalette = createThemePalette({
      floor: 0x243243,
      path: 0x0f1824,
      wall: 0x05080d
    });

    const lightScene = createSceneStub(1_000);
    const lightRenderer = new BoardRenderer(lightScene.scene, createEpisode(), createLayout(), {
      theme: { palette: lightPalette }
    });
    const lightSupport = resolveLocalBoardSupportColors(
      lightPalette.board,
      'trail',
      (lightRenderer as any).resolveTileNeighborhoodLuminance(1)
    );
    lightRenderer.drawTrail(trail, { cue: 'anticipate' });

    const darkScene = createSceneStub(1_000);
    const darkRenderer = new BoardRenderer(darkScene.scene, createEpisode(), createLayout(), {
      theme: { palette: darkPalette }
    });
    const darkSupport = resolveLocalBoardSupportColors(
      darkPalette.board,
      'trail',
      (darkRenderer as any).resolveTileNeighborhoodLuminance(1)
    );
    darkRenderer.drawTrail(trail, { cue: 'anticipate' });

    const lightVisitedGraphics = lightScene.graphics.at(2);
    const darkVisitedGraphics = darkScene.graphics.at(2);
    const lightShellColor = lightVisitedGraphics?.calls.find((call) => call.method === 'fillStyle')?.args[0];
    const darkShellColor = darkVisitedGraphics?.calls.find((call) => call.method === 'fillStyle')?.args[0];

    expect(lightSupport.mode).toBe('dark');
    expect(darkSupport.mode).toBe('light');
    expect(lightShellColor).toBe(mixColor(lightSupport.underlay, lightPalette.board.panel, 0.18));
    expect(darkShellColor).toBe(mixColor(darkSupport.underlay, darkPalette.board.panel, 0.18));
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
