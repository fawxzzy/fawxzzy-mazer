import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  cleanupPresentationArtifacts,
  createPresentationArtifactFixtures,
  listPresentationArtifacts
} from './presentationArtifactCleanup';

vi.mock('phaser', () => ({
  default: {
    AUTO: 'AUTO',
    Math: {
      Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
      Linear: (from: number, to: number, t: number) => from + ((to - from) * t)
    },
    Scale: {
      RESIZE: 'RESIZE',
      CENTER_BOTH: 'CENTER_BOTH'
    },
    Scene: class {}
  }
}));

let BootScene: typeof import('../../src/scenes/BootScene').BootScene;
let phaserConfig: typeof import('../../src/boot/phaserConfig').phaserConfig;
let DEFAULT_PRESENTATION_LAUNCH_CONFIG: typeof import('../../src/boot/presentation').DEFAULT_PRESENTATION_LAUNCH_CONFIG;
let DEFAULT_PRESENTATION_VARIANT: typeof import('../../src/boot/presentation').DEFAULT_PRESENTATION_VARIANT;
let AMBIENT_FAMILY_THEME_PAIRING_POLICY: typeof import('../../src/boot/presentation').AMBIENT_FAMILY_THEME_PAIRING_POLICY;
let isDeterministicPresentationCapture: typeof import('../../src/boot/presentation').isDeterministicPresentationCapture;
let presentationModule: typeof import('../../src/boot/presentation');
let resolveBootPresentationConfig: typeof import('../../src/boot/presentation').resolveBootPresentationConfig;
let resolveBootPresentationVariant: typeof import('../../src/boot/presentation').resolveBootPresentationVariant;
let resolveEffectivePresentationChrome: typeof import('../../src/boot/presentation').resolveEffectivePresentationChrome;
let resolveMenuDemoCycle: typeof import('../../src/scenes/MenuScene').resolveMenuDemoCycle;
let resolveMenuDemoPreset: typeof import('../../src/scenes/MenuScene').resolveMenuDemoPreset;
let resolveMenuDemoPresentation: typeof import('../../src/scenes/MenuScene').resolveMenuDemoPresentation;
let resolveMenuDemoSequence: typeof import('../../src/scenes/MenuScene').resolveMenuDemoSequence;
let resolveDemoConfig: typeof import('../../src/scenes/MenuScene').resolveDemoConfig;
let resolveMenuPresentationModel: typeof import('../../src/scenes/MenuScene').resolveMenuPresentationModel;
let resolveDemoTrailRenderBounds: typeof import('../../src/scenes/MenuScene').resolveDemoTrailRenderBounds;
let resolveBoardCompositionFrame: typeof import('../../src/scenes/MenuScene').resolveBoardCompositionFrame;
let resolveInstallChromeFrame: typeof import('../../src/scenes/MenuScene').resolveInstallChromeFrame;
let resolveMenuSceneInstallSurfaceState: typeof import('../../src/scenes/MenuScene').resolveMenuSceneInstallSurfaceState;
let resolveMenuSceneVisualCaptureConfig: typeof import('../../src/scenes/MenuScene').resolveMenuSceneVisualCaptureConfig;
let resolveTitleBandFrame: typeof import('../../src/scenes/MenuScene').resolveTitleBandFrame;
let resolveTitleLockupLayout: typeof import('../../src/scenes/MenuScene').resolveTitleLockupLayout;
let resolveAmbientThemeProfile: typeof import('../../src/scenes/MenuScene').resolveAmbientThemeProfile;
let resolveAmbientSkyProfileTuning: typeof import('../../src/scenes/MenuScene').resolveAmbientSkyProfileTuning;
let resolvePresentationBackdropFrame: typeof import('../../src/scenes/MenuScene').resolvePresentationBackdropFrame;
let resolveMenuResizeRecoveryDecision: typeof import('../../src/scenes/MenuScene').resolveMenuResizeRecoveryDecision;
let MENU_SCENE_VISUAL_CAPTURE_KEY: typeof import('../../src/scenes/MenuScene').MENU_SCENE_VISUAL_CAPTURE_KEY;
let MENU_SCENE_VISUAL_DIAGNOSTICS_KEY: typeof import('../../src/scenes/MenuScene').MENU_SCENE_VISUAL_DIAGNOSTICS_KEY;
let TITLE_SIGNATURE_TEXT: typeof import('../../src/scenes/MenuScene').TITLE_SIGNATURE_TEXT;
let resolveDemoWalkerViewFrame: typeof import('../../src/domain/ai').resolveDemoWalkerViewFrame;
let shouldShowPresentationTitle: typeof import('../../src/boot/presentation').shouldShowPresentationTitle;
let createBoardLayout: typeof import('../../src/render/boardRenderer').createBoardLayout;
let resolveBoardPresentationBounds: typeof import('../../src/render/boardRenderer').resolveBoardPresentationBounds;
let getPaletteReadabilityReport: typeof import('../../src/render/palette').getPaletteReadabilityReport;
let generateMazeForDifficulty: typeof import('../../src/domain/maze').generateMazeForDifficulty;
let disposeMazeEpisode: typeof import('../../src/domain/maze').disposeMazeEpisode;
let CURATED_FAMILY_ROTATION_BLOCK_LENGTH: typeof import('../../src/domain/maze').CURATED_FAMILY_ROTATION_BLOCK_LENGTH;
let MAZE_FAMILY_EXPOSURE_POLICY: typeof import('../../src/domain/maze').MAZE_FAMILY_EXPOSURE_POLICY;
let legacyTuning: typeof import('../../src/config/tuning').legacyTuning;
let resolveViewportSize: typeof import('../../src/render/viewport').resolveViewportSize;

const AMBIENT_PRESENTATION_STABILITY_TIMEOUT_MS = 90_000;

beforeAll(async () => {
  ({ BootScene } = await import('../../src/scenes/BootScene'));
  ({ phaserConfig } = await import('../../src/boot/phaserConfig'));
  presentationModule = await import('../../src/boot/presentation');
  ({
    AMBIENT_FAMILY_THEME_PAIRING_POLICY,
    DEFAULT_PRESENTATION_LAUNCH_CONFIG,
    DEFAULT_PRESENTATION_VARIANT,
    isDeterministicPresentationCapture,
    resolveBootPresentationConfig,
    resolveBootPresentationVariant,
    resolveEffectivePresentationChrome,
    shouldShowPresentationTitle
  } = await import('../../src/boot/presentation'));
  ({
    MENU_SCENE_VISUAL_CAPTURE_KEY,
    MENU_SCENE_VISUAL_DIAGNOSTICS_KEY,
    resolveMenuDemoCycle,
    resolveMenuDemoPreset,
    resolveMenuDemoPresentation,
    resolveMenuDemoSequence,
    resolveDemoConfig,
    resolveMenuPresentationModel,
    resolveDemoTrailRenderBounds,
    resolveBoardCompositionFrame,
    resolveInstallChromeFrame,
    resolveMenuSceneInstallSurfaceState,
    resolveMenuSceneVisualCaptureConfig,
    resolveTitleBandFrame,
    resolveTitleLockupLayout,
    resolveAmbientThemeProfile,
    resolveAmbientSkyProfileTuning,
    resolvePresentationBackdropFrame,
    resolveMenuResizeRecoveryDecision,
    TITLE_SIGNATURE_TEXT
  } = await import('../../src/scenes/MenuScene'));
  ({ resolveDemoWalkerViewFrame } = await import('../../src/domain/ai'));
  ({ createBoardLayout, resolveBoardPresentationBounds } = await import('../../src/render/boardRenderer'));
  ({ getPaletteReadabilityReport } = await import('../../src/render/palette'));
  ({ generateMazeForDifficulty, disposeMazeEpisode, CURATED_FAMILY_ROTATION_BLOCK_LENGTH, MAZE_FAMILY_EXPOSURE_POLICY } = await import('../../src/domain/maze'));
  ({ legacyTuning } = await import('../../src/config/tuning'));
  ({ resolveViewportSize } = await import('../../src/render/viewport'));
}, 20_000);

beforeEach(() => {
  cleanupPresentationArtifacts();
});

afterEach(() => {
  cleanupPresentationArtifacts();
});

const createViewportSceneStub = (width: number, height: number) => ({
  scale: { width, height },
  cameras: {
    main: { width, height }
  }
}) as never;

const createDemoConfig = (
  episode: Parameters<typeof resolveDemoConfig>[0],
  cycle: Parameters<typeof resolveMenuDemoPresentation>[1]
) => resolveDemoConfig(episode, cycle);

const resolveCycleDurationMs = (episode: { raster: { pathIndices: ArrayLike<number> } }, config: ReturnType<typeof createDemoConfig>): number => (
  Math.max(1, config.cadence.spawnHoldMs)
  + Math.max(1, Math.max(1, episode.raster.pathIndices.length - 1) * Math.max(1, config.cadence.exploreStepMs))
  + Math.max(1, config.cadence.goalHoldMs)
  + Math.max(1, config.cadence.resetHoldMs)
);

describe('demo-only build', () => {
  test('BootScene starts the passive menu scene immediately', () => {
    const start = vi.fn();
    BootScene.prototype.create.call({
      scene: {
        isActive: () => true,
        start
      }
    });

    expect(start).toHaveBeenCalledWith('MenuScene', DEFAULT_PRESENTATION_LAUNCH_CONFIG);
  });

  test('launch param selection defaults safely and sanitizes invalid values', () => {
    expect(resolveBootPresentationVariant('')).toBe('title');
    expect(resolveBootPresentationVariant('?presentation=ambient')).toBe('ambient');
    expect(resolveBootPresentationVariant('?presentation=loading')).toBe('loading');
    expect(resolveBootPresentationVariant('?profile=tv')).toBe('ambient');
    expect(resolveBootPresentationVariant('?profile=obs')).toBe('ambient');
    expect(resolveBootPresentationVariant('?profile=mobile')).toBe('ambient');
    expect(resolveBootPresentationVariant('?presentation=unknown')).toBe('title');
    expect(resolveBootPresentationVariant({} as unknown as string)).toBe('title');

    expect(resolveBootPresentationConfig('')).toEqual(DEFAULT_PRESENTATION_LAUNCH_CONFIG);
    expect(resolveBootPresentationConfig('?profile=tv')).toEqual({
      presentation: 'ambient',
      chrome: 'minimal',
      mood: 'auto',
      title: 'hide',
      theme: 'auto',
      profile: 'tv'
    });
    expect(resolveBootPresentationConfig('?profile=obs')).toEqual({
      presentation: 'ambient',
      chrome: 'minimal',
      mood: 'auto',
      title: 'hide',
      theme: 'auto',
      profile: 'obs'
    });
    expect(resolveBootPresentationConfig('?profile=mobile')).toEqual({
      presentation: 'ambient',
      chrome: 'full',
      mood: 'auto',
      title: 'show',
      theme: 'auto',
      profile: 'mobile'
    });
    expect(resolveBootPresentationConfig('?presentation=loading&chrome=minimal&mood=scan&theme=aurora&seed=42&size=large&difficulty=spicy&title=hide')).toEqual({
      presentation: 'loading',
      chrome: 'minimal',
      mood: 'scan',
      theme: 'aurora',
      seed: 42,
      size: 'large',
      difficulty: 'spicy',
      title: 'hide'
    });
    expect(resolveBootPresentationConfig('?family=split-flow').family).toBe('split-flow');
    expect(resolveBootPresentationConfig('?family=nope').family).toBe('auto');
    expect(resolveBootPresentationConfig('?profile=tv&title=show')).toEqual({
      presentation: 'ambient',
      chrome: 'minimal',
      mood: 'auto',
      title: 'show',
      theme: 'auto',
      profile: 'tv'
    });
    expect(resolveBootPresentationConfig('?profile=obs&presentation=loading&theme=noir')).toEqual({
      presentation: 'loading',
      chrome: 'minimal',
      mood: 'auto',
      title: 'hide',
      theme: 'noir',
      profile: 'obs'
    });
    expect(resolveBootPresentationConfig('?profile=mobile&chrome=none')).toEqual({
      presentation: 'ambient',
      chrome: 'none',
      mood: 'auto',
      title: 'show',
      theme: 'auto',
      profile: 'mobile'
    });
    expect(resolveBootPresentationConfig('?presentation=nope&chrome=loud&mood=chaos&seed=-4&size=massive&difficulty=nightmare&title=gone')).toEqual(
      DEFAULT_PRESENTATION_LAUNCH_CONFIG
    );
    expect(resolveBootPresentationConfig('?profile=nope&presentation=nope&chrome=loud&mood=chaos&theme=radioactive&seed=-4&size=massive&difficulty=nightmare&title=gone'))
      .toEqual(DEFAULT_PRESENTATION_LAUNCH_CONFIG);
    expect(resolveBootPresentationConfig('?theme=monolith').theme).toBe('monolith');
    expect(resolveBootPresentationConfig('?theme=bad-value').theme).toBe('auto');
    expect(resolveEffectivePresentationChrome({
      ...DEFAULT_PRESENTATION_LAUNCH_CONFIG,
      chrome: 'full',
      title: 'hide'
    })).toBe('minimal');
    expect(shouldShowPresentationTitle({
      ...DEFAULT_PRESENTATION_LAUNCH_CONFIG,
      title: 'hide'
    })).toBe(false);
    expect(shouldShowPresentationTitle(resolveBootPresentationConfig('?profile=tv'))).toBe(false);
    expect(shouldShowPresentationTitle(resolveBootPresentationConfig('?profile=mobile'))).toBe(true);
    expect(shouldShowPresentationTitle(resolveBootPresentationConfig('?profile=mobile&chrome=none'))).toBe(false);
  });

  test('invalid viewport input sanitizes to a safe presentation model', () => {
    expect(resolveViewportSize(0, Number.NaN)).toEqual({
      width: 1280,
      height: 720,
      measured: false
    });
    expect(resolveViewportSize(389.6, 843.5)).toEqual({
      width: 390,
      height: 844,
      measured: true
    });

    const model = resolveMenuPresentationModel(0, 0, 'ambient');
    expect(model.viewport.width).toBe(1280);
    expect(model.viewport.height).toBe(720);
    expect(model.layout.boardScale).toBeGreaterThan(0);
    expect(model.layout.topReserve).toBeGreaterThan(0);
  });

  test('safe insets stay on board framing instead of shrinking the full viewport shell', () => {
    const baseModel = resolveMenuPresentationModel(390, 844, 'ambient', 'full', true, 'mobile');
    const insetAwareModel = resolveMenuPresentationModel(390, 844, 'ambient', 'full', true, 'mobile', {
      top: 48,
      right: 0,
      bottom: 34,
      left: 0
    });
    const backdrop = resolvePresentationBackdropFrame(
      insetAwareModel.viewport.width,
      insetAwareModel.viewport.height,
      insetAwareModel.viewport.width / 2,
      insetAwareModel.viewport.height / 2
    );
    const resolved = generateMazeForDifficulty({
      scale: 50,
      seed: 404,
      size: 'medium',
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.13
    }, 'standard', 0, 1);
    const episode = resolved.episode;
    const layout = createBoardLayout(createViewportSceneStub(insetAwareModel.viewport.width, insetAwareModel.viewport.height), episode, {
      boardScale: insetAwareModel.layout.boardScale,
      topReserve: insetAwareModel.layout.topReserve,
      sidePadding: insetAwareModel.layout.sidePadding,
      bottomPadding: insetAwareModel.layout.bottomPadding
    });

    expect(insetAwareModel.viewport).toEqual(baseModel.viewport);
    expect(insetAwareModel.layout.topReserve).toBeGreaterThan(baseModel.layout.topReserve);
    expect(insetAwareModel.layout.bottomPadding).toBeGreaterThan(baseModel.layout.bottomPadding);
    expect(layout.safeBounds.top).toBeGreaterThanOrEqual(48);
    expect(layout.safeBounds.bottom).toBeLessThanOrEqual(insetAwareModel.viewport.height - 34);
    expect(backdrop.left).toBeLessThanOrEqual(0);
    expect(backdrop.top).toBeLessThanOrEqual(0);
    expect(backdrop.right).toBeGreaterThanOrEqual(insetAwareModel.viewport.width);
    expect(backdrop.bottom).toBeGreaterThanOrEqual(insetAwareModel.viewport.height);

    disposeMazeEpisode(episode);
  });

  test('title band stays above the board-safe frame and leaves a right-side chrome lane', () => {
    const resolved = generateMazeForDifficulty({
      scale: 50,
      seed: 4404,
      size: 'medium',
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.13
    }, 'standard', 0, 1);
    const episode = resolved.episode;
    const presentationModel = resolveMenuPresentationModel(1280, 720, 'title', 'full', true);
    const layout = createBoardLayout(createViewportSceneStub(presentationModel.viewport.width, presentationModel.viewport.height), episode, {
      boardScale: presentationModel.layout.boardScale,
      topReserve: presentationModel.layout.topReserve,
      sidePadding: presentationModel.layout.sidePadding,
      bottomPadding: presentationModel.layout.bottomPadding
    });
    const titleBand = resolveTitleBandFrame(presentationModel.viewport.width, presentationModel.layout, layout);

    expect(titleBand.height).toBeGreaterThan(0);
    expect(titleBand.top).toBeGreaterThanOrEqual(0);
    expect(titleBand.bottom).toBeLessThanOrEqual(layout.safeBounds.top);
    expect(titleBand.bottom).toBeLessThan(layout.boardY);
    expect(layout.boardY - titleBand.bottom).toBeGreaterThanOrEqual(Math.max(12, Math.round(layout.tileSize * 1.05)));
    expect(titleBand.right + titleBand.reservedRight).toBeLessThanOrEqual(presentationModel.viewport.width);
    expect(titleBand.centerX).toBeGreaterThan(titleBand.left);
    expect(titleBand.centerX).toBeLessThan(titleBand.right);

    disposeMazeEpisode(episode);
  });

  test('title lockup keeps the subtitle clear of the plate across default, tv, and mobile layouts', () => {
    expect(TITLE_SIGNATURE_TEXT).toBe('\u00b0 by fawxzzy');

    const resolved = generateMazeForDifficulty({
      scale: 50,
      seed: 6644,
      size: 'medium',
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.13
    }, 'standard', 0, 1);
    const episode = resolved.episode;
    const cases = [
      { width: 1280, height: 720, variant: 'title' as const, chrome: 'full' as const, titleVisible: true },
      { width: 1920, height: 1080, variant: 'ambient' as const, chrome: 'minimal' as const, titleVisible: true, profile: 'tv' as const },
      { width: 390, height: 844, variant: 'ambient' as const, chrome: 'full' as const, titleVisible: true, profile: 'mobile' as const }
    ];

    for (const profileCase of cases) {
      const presentationModel = resolveMenuPresentationModel(
        profileCase.width,
        profileCase.height,
        profileCase.variant,
        profileCase.chrome,
        profileCase.titleVisible,
        profileCase.profile
      );
      const layout = createBoardLayout(createViewportSceneStub(presentationModel.viewport.width, presentationModel.viewport.height), episode, {
        boardScale: presentationModel.layout.boardScale,
        topReserve: presentationModel.layout.topReserve,
        sidePadding: presentationModel.layout.sidePadding,
        bottomPadding: presentationModel.layout.bottomPadding
      });
      const titleBand = resolveTitleBandFrame(
        presentationModel.viewport.width,
        presentationModel.layout,
        layout,
        undefined,
        profileCase.profile
      );
      const lockup = resolveTitleLockupLayout(
        layout,
        presentationModel.layout,
        titleBand,
        profileCase.variant,
        profileCase.chrome,
        profileCase.profile
      );
      const plateTop = lockup.titleY - (lockup.plateHeight / 2);
      const plateBottom = lockup.titleY + (lockup.plateHeight / 2);
      const subtitleTop = lockup.titleY + lockup.subtitleTopOffsetY;
      const subtitleBottom = subtitleTop + lockup.estimatedSubtitleHeight;

      expect(plateTop).toBeGreaterThanOrEqual(titleBand.top);
      expect(lockup.subtitleGap).toBeGreaterThanOrEqual(5);
      expect(subtitleTop - plateBottom).toBeGreaterThanOrEqual(lockup.subtitleGap);
      expect(subtitleBottom).toBeLessThanOrEqual(titleBand.bottom + 1);
      expect(lockup.titleX - (lockup.plateWidth / 2)).toBeGreaterThanOrEqual(titleBand.left);
      expect(lockup.titleX + (lockup.plateWidth / 2)).toBeLessThanOrEqual(titleBand.right);
    }

    disposeMazeEpisode(episode);
  });

  test('install chrome anchors bottom-center inside the safe bottom lane', () => {
    const resolved = generateMazeForDifficulty({
      scale: 50,
      seed: 7788,
      size: 'medium',
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.13
    }, 'standard', 0, 1);
    const episode = resolved.episode;
    const presentationModel = resolveMenuPresentationModel(390, 844, 'title', 'full', true, 'mobile', {
      top: 48,
      right: 0,
      bottom: 34,
      left: 0
    });
    const installFrame = resolveInstallChromeFrame(
      presentationModel.viewport.width,
      presentationModel.viewport.height,
      presentationModel.layout,
      undefined,
      168,
      30,
      {
        top: 48,
        right: 0,
        bottom: 34,
        left: 0
      }
    );

    expect(installFrame.centerX).toBeCloseTo(presentationModel.viewport.width / 2, 1);
    expect(installFrame.top).toBeGreaterThan(presentationModel.viewport.height * 0.85);
    expect(installFrame.bottom).toBeLessThanOrEqual(presentationModel.viewport.height - 34);

    disposeMazeEpisode(episode);
  });

  test('board composition frame keeps the title and CTA at a tight 5px shell buffer', () => {
    const resolved = generateMazeForDifficulty({
      scale: 50,
      seed: 9124,
      size: 'medium',
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.13
    }, 'standard', 0, 1);
    const episode = resolved.episode;
    const presentationModel = resolveMenuPresentationModel(1280, 720, 'title', 'full', true);
    const titleBand = resolveTitleBandFrame(
      presentationModel.viewport.width,
      presentationModel.layout,
      undefined
    );
    const installFrame = resolveInstallChromeFrame(
      presentationModel.viewport.width,
      presentationModel.viewport.height,
      presentationModel.layout,
      undefined,
      126,
      25
    );
    const boardFrame = resolveBoardCompositionFrame(
      presentationModel.viewport.width,
      presentationModel.viewport.height,
      presentationModel.layout,
      titleBand,
      installFrame
    );
    const layout = createBoardLayout(createViewportSceneStub(presentationModel.viewport.width, presentationModel.viewport.height), episode, {
      boardScale: 1,
      safeBounds: boardFrame
    });

    expect(boardFrame.top - titleBand.bottom).toBe(5);
    expect(installFrame.top - boardFrame.bottom).toBe(5);
    expect(layout.boardY - titleBand.bottom).toBeGreaterThanOrEqual(5);
    expect(layout.boardY - titleBand.bottom).toBeLessThanOrEqual(12);
    expect(installFrame.top - layout.boardBounds.bottom).toBeGreaterThanOrEqual(5);
    expect(installFrame.top - layout.boardBounds.bottom).toBeLessThanOrEqual(12);
    expect(layout.boardHeight).toBeGreaterThan(550);

    disposeMazeEpisode(episode);
  });

  test('obs board composition frame tightens fit while keeping the board centered', () => {
    const cycle = resolveMenuDemoCycle(4242, 3);
    const resolved = generateMazeForDifficulty({
      scale: 50,
      seed: 4242,
      size: cycle.size,
      family: cycle.family,
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.13
    }, cycle.difficulty, 0, 1);
    const episode = resolved.episode;
    const presentationModel = resolveMenuPresentationModel(1920, 1080, 'ambient', 'minimal', false, 'obs');
    const installFrame = resolveInstallChromeFrame(
      presentationModel.viewport.width,
      presentationModel.viewport.height,
      presentationModel.layout,
      undefined,
      126,
      25
    );
    const boardFrame = resolveBoardCompositionFrame(
      presentationModel.viewport.width,
      presentationModel.viewport.height,
      presentationModel.layout,
      undefined,
      installFrame,
      undefined,
      'obs'
    );
    const layout = createBoardLayout(createViewportSceneStub(presentationModel.viewport.width, presentationModel.viewport.height), episode, {
      boardScale: 1,
      safeBounds: boardFrame
    });

    expect(Math.abs(layout.boardBounds.centerX - (presentationModel.viewport.width / 2))).toBeLessThanOrEqual(0.5);
    expect(Math.abs(layout.boardBounds.centerY - (presentationModel.viewport.height / 2))).toBeLessThanOrEqual(0.5);
    expect(installFrame.top - layout.boardBounds.bottom).toBeGreaterThanOrEqual(5);
    expect(layout.boardHeight).toBeGreaterThan(900);

    disposeMazeEpisode(episode);
  });

  test('mobile board composition frame can advance to the next integer tile step without breaking chrome spacing', () => {
    const resolved = generateMazeForDifficulty({
      scale: 50,
      seed: 9124,
      size: 'medium',
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.13
    }, 'standard', 0, 1);
    const episode = resolved.episode;
    const presentationModel = resolveMenuPresentationModel(390, 844, 'ambient', 'full', true, 'mobile');
    const titleBand = resolveTitleBandFrame(
      presentationModel.viewport.width,
      presentationModel.layout,
      undefined,
      undefined,
      'mobile'
    );
    const installFrame = resolveInstallChromeFrame(
      presentationModel.viewport.width,
      presentationModel.viewport.height,
      presentationModel.layout,
      undefined,
      96,
      23
    );
    const boardFrame = resolveBoardCompositionFrame(
      presentationModel.viewport.width,
      presentationModel.viewport.height,
      presentationModel.layout,
      titleBand,
      installFrame,
      undefined,
      'mobile'
    );
    const layout = createBoardLayout(createViewportSceneStub(presentationModel.viewport.width, presentationModel.viewport.height), episode, {
      boardScale: 1,
      safeBounds: boardFrame
    });

    expect(boardFrame.top - titleBand.bottom).toBe(6);
    expect(installFrame.top - boardFrame.bottom).toBe(6);
    expect(layout.tileSize).toBe(7);
    expect(layout.boardWidth).toBe(350);
    expect(layout.boardHeight).toBe(350);
    expect(layout.boardBounds.left).toBeGreaterThanOrEqual(boardFrame.left);
    expect(layout.boardBounds.right).toBeLessThanOrEqual(boardFrame.right);
    expect(layout.boardBounds.top).toBeGreaterThanOrEqual(boardFrame.top);
    expect(layout.boardBounds.bottom).toBeLessThanOrEqual(boardFrame.bottom);

    disposeMazeEpisode(episode);
  });

  test('visual capture config only activates when explicitly enabled', () => {
    expect(MENU_SCENE_VISUAL_CAPTURE_KEY).toBe('__MAZER_VISUAL_CAPTURE__');
    expect(MENU_SCENE_VISUAL_DIAGNOSTICS_KEY).toBe('__MAZER_VISUAL_DIAGNOSTICS__');
    expect(resolveMenuSceneVisualCaptureConfig(undefined)).toEqual({ enabled: false });
    expect(resolveMenuSceneVisualCaptureConfig({
      [MENU_SCENE_VISUAL_CAPTURE_KEY]: {}
    } as unknown as Window)).toEqual({ enabled: false });
    expect(resolveMenuSceneVisualCaptureConfig({
      [MENU_SCENE_VISUAL_CAPTURE_KEY]: {
        enabled: true,
        forceInstallMode: 'available'
      }
    } as unknown as Window)).toEqual({
      enabled: true,
      forceInstallMode: 'available'
    });
    expect(resolveMenuSceneVisualCaptureConfig({
      [MENU_SCENE_VISUAL_CAPTURE_KEY]: {
        enabled: true,
        forceInstallMode: 'manual',
        manualInstallInstruction: '  Add from Home Screen  '
      }
    } as unknown as Window)).toEqual({
      enabled: true,
      forceInstallMode: 'manual',
      manualInstallInstruction: 'Add from Home Screen'
    });
  });

  test('visual capture install override keeps runtime chrome inert unless forced', () => {
    const runtimeState = {
      mode: 'hidden',
      canPrompt: false,
      installed: false,
      standalone: false
    } as const;

    expect(resolveMenuSceneInstallSurfaceState(runtimeState, { enabled: false })).toEqual(runtimeState);
    expect(resolveMenuSceneInstallSurfaceState(runtimeState, { enabled: true })).toEqual(runtimeState);
    expect(resolveMenuSceneInstallSurfaceState(runtimeState, {
      enabled: true,
      forceInstallMode: 'available'
    })).toEqual({
      mode: 'available',
      canPrompt: true,
      installed: false,
      standalone: false
    });
    expect(resolveMenuSceneInstallSurfaceState(runtimeState, {
      enabled: true,
      forceInstallMode: 'manual',
      manualInstallInstruction: 'Install from browser menu'
    })).toEqual({
      mode: 'manual',
      canPrompt: false,
      installed: false,
      standalone: false,
      instruction: 'Install from browser menu'
    });
    expect(resolveMenuSceneInstallSurfaceState(runtimeState, {
      enabled: true,
      forceInstallMode: 'manual'
    })).toEqual({
      mode: 'manual',
      canPrompt: false,
      installed: false,
      standalone: false,
      instruction: 'Add to Home Screen'
    });
  });

  test('theme palettes keep semantic roles and metadata readable', () => {
    for (const theme of ['noir', 'ember', 'aurora', 'vellum', 'monolith'] as const) {
      const report = getPaletteReadabilityReport(resolveAmbientThemeProfile(theme).palette);
      expect(report.failures, `${theme}: ${report.failures.map((failure) => failure.key).join(', ')}`).toEqual([]);
      expect(report.checkpoints.map((checkpoint) => checkpoint.key)).toEqual([
        'wall-vs-floor',
        'wall-vs-route',
        'wall-vs-trail',
        'wall-vs-player',
        'floor-vs-route',
        'floor-vs-trail',
        'floor-vs-player',
        'floor-vs-start',
        'floor-vs-goal',
        'route-vs-trail',
        'trail-vs-player',
        'start-vs-goal',
        'start-vs-player',
        'goal-vs-player',
        'goal-vs-background',
        'trail-vs-wall-luminance',
        'trail-vs-player-luminance',
        'metadata-vs-panel',
        'accent-vs-panel',
        'flash-vs-panel'
      ]);
    }
  });

  test('ambient sky theme language stays theme-aware and restrained', () => {
    const noir = resolveAmbientThemeProfile('noir').ambientSky;
    const ember = resolveAmbientThemeProfile('ember').ambientSky;
    const aurora = resolveAmbientThemeProfile('aurora').ambientSky;
    const vellum = resolveAmbientThemeProfile('vellum').ambientSky;
    const monolith = resolveAmbientThemeProfile('monolith').ambientSky;

    expect(noir.configuredFamilies).toContain('satellite-blink');
    expect(noir.configuredFamilies).toContain('distant-galaxy-band');
    expect(noir.backdropMotif).toBe('noir-band');
    expect(noir.allowSatellite).toBe(true);
    expect(noir.allowUfo).toBe(true);
    expect(ember.configuredFamilies).toContain('ember-dust');
    expect(ember.configuredFamilies).toContain('deep-cinder-glow');
    expect(ember.backdropMotif).toBe('ember-glow');
    expect(ember.allowSatellite).toBe(false);
    expect(aurora.configuredFamilies).toContain('aurora-curtain');
    expect(aurora.backdropMotif).toBe('aurora-curtain');
    expect(aurora.allowUfo).toBe(true);
    expect(aurora.veilHeightScale).toBeGreaterThan(noir.veilHeightScale);
    expect(vellum.configuredFamilies).toContain('paper-sky-dust');
    expect(vellum.configuredFamilies).toContain('vellum-sky-wash');
    expect(vellum.backdropMotif).toBe('vellum-wash');
    expect(vellum.allowUfo).toBe(false);
    expect(vellum.motifAlphaScale).toBeLessThan(aurora.motifAlphaScale);
    expect(monolith.configuredFamilies).toContain('signal-band');
    expect(monolith.backdropMotif).toBe('monolith-signal');
    expect(monolith.allowSatellite).toBe(true);
    expect(monolith.allowUfo).toBe(false);
    expect(monolith.signatureCooldownScale).toBeGreaterThan(aurora.signatureCooldownScale);
  });

  test('ambient sky profile tuning favors tv while keeping obs/mobile restrained and reduced motion calmer', () => {
    const ambient = resolveAmbientSkyProfileTuning(undefined, 'ambient', false);
    const tv = resolveAmbientSkyProfileTuning('tv', 'ambient', false);
    const obs = resolveAmbientSkyProfileTuning('obs', 'ambient', false);
    const mobile = resolveAmbientSkyProfileTuning('mobile', 'ambient', false);
    const reduced = resolveAmbientSkyProfileTuning('tv', 'title', true);

    expect(tv.densityScale).toBeGreaterThan(ambient.densityScale);
    expect(tv.eventIntervalScale).toBeLessThan(ambient.eventIntervalScale);
    expect(obs.densityScale).toBeLessThan(ambient.densityScale);
    expect(obs.clearZoneScale).toBeGreaterThan(ambient.clearZoneScale);
    expect(mobile.movingEventCap).toBeLessThanOrEqual(ambient.movingEventCap);
    expect(reduced.motionScale).toBeLessThan(tv.motionScale);
    expect(reduced.eventIntervalScale).toBeGreaterThan(tv.eventIntervalScale);
    expect(reduced.signatureEventCap).toBe(0);
    expect(reduced.twinkleCount).toBeGreaterThanOrEqual(6);
    expect(reduced.driftMoteCount).toBeGreaterThanOrEqual(1);
  });

  test('BootScene falls back to title when presentation resolution throws', () => {
    const start = vi.fn();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const resolverSpy = vi.spyOn(presentationModule, 'resolveBootPresentationConfig').mockImplementation(() => {
      throw new Error('boom');
    });

    BootScene.prototype.create.call({
      scene: {
        start
      }
    });

    expect(start).toHaveBeenCalledWith('MenuScene', DEFAULT_PRESENTATION_LAUNCH_CONFIG);
    resolverSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('scene wiring only includes boot and menu scenes', () => {
    expect(phaserConfig.scene).toEqual([BootScene, expect.any(Function)]);
    expect((phaserConfig.scene as Array<{ name?: string }>).map((scene) => scene.name)).toEqual(['BootScene', 'MenuScene']);
    expect(phaserConfig.pixelArt).toBe(true);
    expect(phaserConfig.antialias).toBe(false);
    expect(phaserConfig.antialiasGL).toBe(false);
    expect(phaserConfig.roundPixels).toBe(true);
    expect(phaserConfig.scale?.autoRound).toBe(true);
  });

  test('resize recovery ignores startup settle churn but allows a later material resize', () => {
    const current = { width: 1280, height: 720, measured: true };
    const startupBurst = [
      { width: 1278, height: 718, measured: true },
      { width: 1282, height: 720, measured: true },
      { width: 1280, height: 722, measured: true }
    ];

    for (const next of startupBurst) {
      expect(resolveMenuResizeRecoveryDecision(current, next, 240).shouldRestart).toBe(false);
    }

    const laterResize = resolveMenuResizeRecoveryDecision(current, { width: 1366, height: 768, measured: true }, 1400);
    expect(laterResize.shouldRestart).toBe(true);
    expect(laterResize.restartKey).toBeTruthy();
    expect(resolveMenuResizeRecoveryDecision(current, { width: 1366, height: 768, measured: true }, 1800, laterResize.restartKey).shouldRestart).toBe(false);
  });

  test('demo cycle stays bounded while varying size, difficulty, mood, and pacing', () => {
    const seenDifficulties = new Set<string>();
    const seenMoods = new Set<string>();
    const seenSizes = new Set<string>();
    const seenPresets = new Set<string>();
    const seenFamilies = new Set<string>();
    const seenThemes = new Set<string>();
    const seenPacing = new Set<string>();
    const moods: string[] = [];
    const themes: string[] = [];
    const families: string[] = [];
    const familyThemeCounts = Object.fromEntries(
      Object.keys(MAZE_FAMILY_EXPOSURE_POLICY).map((family) => [family, {} as Record<string, number>])
    ) as Record<string, Record<string, number>>;
    const moodCounts = {
      solve: 0,
      scan: 0,
      blueprint: 0
    };

    for (let cycle = 0; cycle < 42; cycle += 1) {
      const step = resolveMenuDemoCycle(9001, cycle);
      seenDifficulties.add(step.difficulty);
      seenMoods.add(step.mood);
      seenSizes.add(step.size);
      seenPresets.add(step.presentationPreset);
      seenFamilies.add(step.family);
      families.push(step.family);
      seenThemes.add(step.theme);
      seenPacing.add(JSON.stringify(step.pacing));
      moods.push(step.mood);
      themes.push(step.theme);
      familyThemeCounts[step.family][step.theme] = (familyThemeCounts[step.family][step.theme] ?? 0) + 1;
      moodCounts[step.mood] += 1;
      expect(step.entropy.checkPointModifier).toBeGreaterThanOrEqual(0.16);
      expect(step.entropy.checkPointModifier).toBeLessThanOrEqual(0.56);
      expect(step.entropy.shortcutCountModifier).toBeGreaterThanOrEqual(0.04);
      expect(step.entropy.shortcutCountModifier).toBeLessThanOrEqual(0.3);
      expect(['chill', 'standard', 'spicy', 'brutal']).toContain(step.difficulty);
      expect(['solve', 'scan', 'blueprint']).toContain(step.mood);
      expect(['small', 'medium', 'large', 'huge']).toContain(step.size);
      expect(['classic', 'braided', 'sparse', 'dense', 'framed', 'split-flow']).toContain(step.family);
      expect(['noir', 'ember', 'aurora', 'vellum', 'monolith']).toContain(step.theme);
      expect(['classic', 'braided', 'framed', 'blueprint-rare']).toContain(step.presentationPreset);
      expect(step.pacing.exploreStepMs).toBeGreaterThanOrEqual(-10);
      expect(step.pacing.exploreStepMs).toBeLessThanOrEqual(8);
      expect(step.pacing.goalHoldMs).toBeGreaterThanOrEqual(16);
      expect(step.pacing.goalHoldMs).toBeLessThanOrEqual(96);
      expect(step.pacing.resetHoldMs).toBeGreaterThanOrEqual(12);
      expect(step.pacing.resetHoldMs).toBeLessThanOrEqual(44);
      expect(step.pacing.spawnHoldMs).toBeGreaterThanOrEqual(12);
      expect(step.pacing.spawnHoldMs).toBeLessThanOrEqual(34);
    }

    expect(seenDifficulties.size).toBeGreaterThan(1);
    expect(seenMoods.size).toBe(3);
    expect(seenSizes.size).toBeGreaterThan(1);
    expect(seenFamilies.size).toBe(6);
    expect(seenThemes.size).toBe(5);
    expect(seenPresets.has('classic')).toBe(true);
    expect(seenPresets.has('braided')).toBe(true);
    expect(seenPresets.has('framed')).toBe(true);
    expect(seenPresets.has('blueprint-rare')).toBe(true);
    expect(seenPacing.size).toBeGreaterThan(1);
    expect(moods.filter((mood) => mood === 'blueprint').length).toBeLessThanOrEqual(6);
    expect(moods.filter((mood) => mood === 'blueprint').length).toBeGreaterThanOrEqual(4);
    expect(moodCounts.solve).toBeGreaterThan(moodCounts.scan);
    expect(moodCounts.scan).toBeGreaterThan(moodCounts.blueprint);
    for (let blockStart = 0; blockStart < CURATED_FAMILY_ROTATION_BLOCK_LENGTH * 2; blockStart += CURATED_FAMILY_ROTATION_BLOCK_LENGTH) {
      const blockFamilies = families.slice(blockStart, blockStart + CURATED_FAMILY_ROTATION_BLOCK_LENGTH);
      const counts = Object.fromEntries(
        Object.keys(MAZE_FAMILY_EXPOSURE_POLICY).map((family) => [
          family,
          blockFamilies.filter((entry) => entry === family).length
        ])
      );
      expect(counts.braided).toBe(MAZE_FAMILY_EXPOSURE_POLICY.braided.blockCount);
      expect(counts.dense).toBe(MAZE_FAMILY_EXPOSURE_POLICY.dense.blockCount);
      expect(counts['split-flow']).toBe(MAZE_FAMILY_EXPOSURE_POLICY['split-flow'].blockCount);
      expect(counts.classic).toBe(MAZE_FAMILY_EXPOSURE_POLICY.classic.blockCount);
      expect(counts.framed).toBe(MAZE_FAMILY_EXPOSURE_POLICY.framed.blockCount);
      expect(counts.sparse).toBe(MAZE_FAMILY_EXPOSURE_POLICY.sparse.blockCount);
    }
    for (let index = 1; index < families.length; index += 1) {
      expect(families[index]).not.toBe(families[index - 1]);
    }
    expect(families.filter((family) => family === 'braided').length).toBeGreaterThan(families.filter((family) => family === 'classic').length);
    expect(families.filter((family) => family === 'dense').length).toBeGreaterThan(families.filter((family) => family === 'framed').length);
    expect(families.filter((family) => family === 'split-flow').length).toBeGreaterThan(families.filter((family) => family === 'sparse').length);
    for (const family of Object.keys(familyThemeCounts)) {
      const pairingPolicy = AMBIENT_FAMILY_THEME_PAIRING_POLICY[family as keyof typeof AMBIENT_FAMILY_THEME_PAIRING_POLICY];
      const allowedThemes = new Set([...pairingPolicy.defaults, ...pairingPolicy.accents]);
      const seenFamilyThemes = Object.keys(familyThemeCounts[family]);
      const defaultCount = pairingPolicy.defaults.reduce((total, theme) => total + (familyThemeCounts[family][theme] ?? 0), 0);
      const accentCount = pairingPolicy.accents.reduce((total, theme) => total + (familyThemeCounts[family][theme] ?? 0), 0);

      expect(seenFamilyThemes.every((theme) => allowedThemes.has(theme as typeof pairingPolicy.defaults[number]))).toBe(true);
      expect(defaultCount).toBeGreaterThan(accentCount);
    }

    for (let index = 1; index < moods.length; index += 1) {
      expect(moods[index] === 'blueprint' && moods[index - 1] === 'blueprint').toBe(false);
      expect(themes[index]).not.toBe(themes[index - 1]);
    }
  });

  test('deterministic capture mode locks seed, size, difficulty, mood, theme, and family for valid launch controls', { timeout: 15000 }, () => {
    const launchConfig = resolveBootPresentationConfig('?presentation=ambient&chrome=none&mood=blueprint&theme=monolith&family=framed&seed=4242&size=huge&difficulty=brutal&title=hide');
    expect(isDeterministicPresentationCapture(launchConfig)).toBe(true);

    const cycleA = resolveMenuDemoCycle(launchConfig.seed!, 0, {
      mood: launchConfig.mood === 'auto' ? undefined : launchConfig.mood,
      size: launchConfig.size,
      difficulty: launchConfig.difficulty,
      theme: launchConfig.theme === 'auto' ? undefined : launchConfig.theme,
      family: launchConfig.family === 'auto' || !launchConfig.family ? undefined : launchConfig.family
    });
    const cycleB = resolveMenuDemoCycle(launchConfig.seed!, 8, {
      mood: launchConfig.mood === 'auto' ? undefined : launchConfig.mood,
      size: launchConfig.size,
      difficulty: launchConfig.difficulty,
      theme: launchConfig.theme === 'auto' ? undefined : launchConfig.theme,
      family: launchConfig.family === 'auto' || !launchConfig.family ? undefined : launchConfig.family
    });

    expect(cycleA.mood).toBe('blueprint');
    expect(cycleA.theme).toBe('monolith');
    expect(cycleA.family).toBe('framed');
    expect(cycleA.size).toBe('huge');
    expect(cycleA.difficulty).toBe('brutal');
    expect(cycleA.presentationPreset).toBe(resolveMenuDemoPreset(launchConfig.seed!, 0, 'blueprint', 'monolith', 'framed'));
    expect(cycleB.mood).toBe('blueprint');
    expect(cycleB.theme).toBe('monolith');
    expect(cycleB.family).toBe('framed');
    expect(cycleB.size).toBe('huge');
    expect(cycleB.difficulty).toBe('brutal');
    expect(cycleB.presentationPreset).toBe(resolveMenuDemoPreset(launchConfig.seed!, 0, 'blueprint', 'monolith', 'framed'));

    const first = generateMazeForDifficulty({
      scale: legacyTuning.board.scale,
      seed: launchConfig.seed!,
      size: launchConfig.size!,
      family: cycleA.family,
      presentationPreset: cycleA.presentationPreset,
      checkPointModifier: legacyTuning.board.checkPointModifier,
      shortcutCountModifier: legacyTuning.board.shortcutCountModifier.menu
    }, launchConfig.difficulty!);
    const second = generateMazeForDifficulty({
      scale: legacyTuning.board.scale,
      seed: launchConfig.seed!,
      size: launchConfig.size!,
      family: cycleA.family,
      presentationPreset: cycleA.presentationPreset,
      checkPointModifier: legacyTuning.board.checkPointModifier,
      shortcutCountModifier: legacyTuning.board.shortcutCountModifier.menu
    }, launchConfig.difficulty!);

    expect(first.episode.seed).toBe(launchConfig.seed);
    expect(second.episode.seed).toBe(launchConfig.seed);
    expect(first.episode.difficulty).toBe('brutal');
    expect(second.episode.difficulty).toBe('brutal');
    expect(first.episode.family).toBe('framed');
    expect(second.episode.family).toBe('framed');
    expect(first.episode.presentationPreset).toBe(cycleA.presentationPreset);
    expect(second.episode.presentationPreset).toBe(cycleA.presentationPreset);
    expect(first.episode.raster.width).toBe(second.episode.raster.width);
    expect(first.episode.raster.height).toBe(second.episode.raster.height);
    expect(Array.from(first.episode.raster.pathIndices)).toEqual(Array.from(second.episode.raster.pathIndices));

    disposeMazeEpisode(first.episode);
    disposeMazeEpisode(second.episode);
  });

  test('demo presentation sequence stays bounded across intro, reveal, arrival, and fade', () => {
    const cycle = resolveMenuDemoCycle(9001, 4);
    const resolved = generateMazeForDifficulty({
      scale: 50,
      seed: 9001,
      size: cycle.size,
      family: cycle.family,
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.13
    }, cycle.difficulty, 0, 1);
    const episode = resolved.episode;
    const config = resolveDemoConfig(episode, cycle);
    const traverseMs = (episode.raster.pathIndices.length - 1) * config.cadence.exploreStepMs;
    const checkpoints = [
      { elapsedMs: Math.max(1, Math.floor(config.cadence.spawnHoldMs * 0.5)), sequence: 'intro' },
      { elapsedMs: config.cadence.spawnHoldMs + Math.max(1, Math.floor(traverseMs * 0.35)), sequence: 'reveal' },
      { elapsedMs: config.cadence.spawnHoldMs + traverseMs + Math.max(1, Math.floor(config.cadence.goalHoldMs * 0.5)), sequence: 'arrival' },
      { elapsedMs: config.cadence.spawnHoldMs + traverseMs + config.cadence.goalHoldMs + Math.max(1, Math.floor(config.cadence.resetHoldMs * 0.5)), sequence: 'fade' }
    ] as const;

    for (const checkpoint of checkpoints) {
      const sequenceState = resolveMenuDemoSequence(episode, checkpoint.elapsedMs, config);
      const presentation = resolveMenuDemoPresentation(episode, cycle, checkpoint.elapsedMs, config, 'loading');

      expect(sequenceState.sequence).toBe(checkpoint.sequence);
      expect(presentation.sequence).toBe(checkpoint.sequence);
      expect(presentation.variant).toBe('loading');
      expect(['noir', 'ember', 'aurora', 'vellum', 'monolith']).toContain(presentation.theme);
      expect(['solve', 'scan', 'blueprint']).toContain(presentation.mood);
      expect(['generating', 'solving', 'pattern sync', 'routing', 'live system']).toContain(presentation.phaseLabel);
      expect(presentation.solutionPathAlpha).toBeGreaterThanOrEqual(0.14);
      expect(presentation.solutionPathAlpha).toBeLessThanOrEqual(1);
      expect(presentation.trailWindow).toBeGreaterThanOrEqual(4);
      expect(presentation.trailWindow).toBeLessThanOrEqual(38);
      expect(Math.abs(presentation.frameOffsetX)).toBeLessThanOrEqual(8);
      expect(Math.abs(presentation.frameOffsetY)).toBeLessThanOrEqual(5);
      expect(Math.abs(presentation.hudOffsetX)).toBeLessThanOrEqual(10);
      expect(Math.abs(presentation.hudOffsetY)).toBeLessThanOrEqual(4);
      expect(presentation.boardVeilAlpha).toBeGreaterThanOrEqual(0);
      expect(presentation.boardVeilAlpha).toBeLessThanOrEqual(0.24);
      expect(presentation.boardAuraAlpha).toBeGreaterThanOrEqual(0.06);
      expect(presentation.boardAuraAlpha).toBeLessThanOrEqual(0.22);
      expect(presentation.boardHaloAlpha).toBeGreaterThanOrEqual(0.018);
      expect(presentation.boardHaloAlpha).toBeLessThanOrEqual(0.16);
      expect(presentation.boardShadeAlpha).toBeGreaterThanOrEqual(0.012);
      expect(presentation.boardShadeAlpha).toBeLessThanOrEqual(0.18);
      expect(presentation.boardAuraScale).toBeGreaterThanOrEqual(1);
      expect(presentation.boardAuraScale).toBeLessThanOrEqual(1.05);
      expect(presentation.boardHaloScale).toBeGreaterThanOrEqual(1);
      expect(presentation.boardHaloScale).toBeLessThanOrEqual(1.03);
      expect(presentation.motifPrimaryAlpha).toBeGreaterThanOrEqual(0);
      expect(presentation.motifPrimaryAlpha).toBeLessThanOrEqual(0.2);
      expect(presentation.motifSecondaryAlpha).toBeGreaterThanOrEqual(0);
      expect(presentation.motifSecondaryAlpha).toBeLessThanOrEqual(0.16);
      expect(presentation.persistentTrail).toBe(true);
      expect(presentation.persistentFadeFloor).toBeGreaterThanOrEqual(0.22);
      expect(presentation.persistentFadeFloor).toBeLessThanOrEqual(0.72);
      expect(presentation.trailPulseBoost).toBeGreaterThanOrEqual(0);
      expect(presentation.trailPulseBoost).toBeLessThanOrEqual(0.08);
      expect(presentation.metadataAlpha).toBeGreaterThanOrEqual(0.18);
      expect(presentation.metadataAlpha).toBeLessThanOrEqual(0.82);
      expect(presentation.flashAlpha).toBeGreaterThanOrEqual(0);
      expect(presentation.flashAlpha).toBeLessThanOrEqual(0.84);
    }

    const titlePresentation = resolveMenuDemoPresentation(episode, cycle, checkpoints[1].elapsedMs, config, 'title');
    const ambientPresentation = resolveMenuDemoPresentation(episode, cycle, checkpoints[1].elapsedMs, config, 'ambient');
    const loadingPresentation = resolveMenuDemoPresentation(episode, cycle, checkpoints[1].elapsedMs, config, 'loading');
    const tvPresentation = resolveMenuDemoPresentation(episode, cycle, checkpoints[1].elapsedMs, config, 'ambient', 'tv');
    const obsPresentation = resolveMenuDemoPresentation(episode, cycle, checkpoints[1].elapsedMs, config, 'ambient', 'obs');
    const mobilePresentation = resolveMenuDemoPresentation(episode, cycle, checkpoints[1].elapsedMs, config, 'ambient', 'mobile');

    expect(titlePresentation.solutionPathAlpha).toBe(0);
    expect(ambientPresentation.solutionPathAlpha).toBe(0);
    expect(tvPresentation.solutionPathAlpha).toBe(0);
    expect(obsPresentation.solutionPathAlpha).toBe(0);
    expect(mobilePresentation.solutionPathAlpha).toBe(0);
    expect(loadingPresentation.solutionPathAlpha).toBeGreaterThan(0);
    expect(titlePresentation.boardVeilAlpha).toBeGreaterThan(ambientPresentation.boardVeilAlpha);
    expect(loadingPresentation.metadataAlpha).toBeGreaterThan(ambientPresentation.metadataAlpha);
    expect(loadingPresentation.flashAlpha).toBeGreaterThan(0);
    expect(ambientPresentation.flashAlpha).toBe(0);
    expect(tvPresentation.metadataAlpha).toBeLessThan(ambientPresentation.metadataAlpha);
    expect(tvPresentation.ambientDriftMs).toBeGreaterThan(ambientPresentation.ambientDriftMs);
    expect(obsPresentation.frameOffsetX).toBe(0);
    expect(obsPresentation.frameOffsetY).toBe(0);
    expect(obsPresentation.hudOffsetX).toBe(0);
    expect(obsPresentation.hudOffsetY).toBe(0);
    expect(obsPresentation.ambientDriftPxX).toBe(0);
    expect(obsPresentation.ambientDriftPxY).toBe(0);
    expect(mobilePresentation.metadataAlpha).toBeGreaterThanOrEqual(ambientPresentation.metadataAlpha);
    expect(mobilePresentation.ambientDriftMs).toBeGreaterThan(ambientPresentation.ambientDriftMs);

    disposeMazeEpisode(episode);
  });

  test('demo walker reaches the end cleanly and keeps the completed route visible', () => {
    const cycle = resolveMenuDemoCycle(90210, 5);
    const resolved = generateMazeForDifficulty({
      scale: 50,
      seed: 90210,
      size: cycle.size,
      family: cycle.family,
      presentationPreset: cycle.presentationPreset,
      checkPointModifier: cycle.entropy.checkPointModifier,
      shortcutCountModifier: cycle.entropy.shortcutCountModifier
    }, cycle.difficulty, 0, 1);
    const episode = resolved.episode;
    const config = createDemoConfig(episode, cycle);
    const arrivalMs = config.cadence.spawnHoldMs + ((episode.raster.pathIndices.length - 1) * config.cadence.exploreStepMs);
    const arrivalFrame = resolveDemoWalkerViewFrame(episode, arrivalMs, config, 6);
    const holdFrame = resolveDemoWalkerViewFrame(episode, arrivalMs + 1, config, 6);
    const lateHoldFrame = resolveDemoWalkerViewFrame(
      episode,
      arrivalMs + Math.max(1, config.cadence.goalHoldMs - 2),
      config,
      6
    );

    expect(arrivalFrame.nextIndex).toBe(episode.raster.endIndex);
    expect(arrivalFrame.progress).toBe(1);
    expect(arrivalFrame.trailStart).toBe(0);
    expect(arrivalFrame.trailLimit).toBe(episode.raster.pathIndices.length);
    expect(holdFrame.currentIndex).toBe(episode.raster.endIndex);
    expect(holdFrame.trailStart).toBe(0);
    expect(holdFrame.trailLimit).toBe(episode.raster.pathIndices.length);
    expect(lateHoldFrame.currentIndex).toBe(episode.raster.endIndex);
    expect(lateHoldFrame.cue).toBe('goal');
    expect(lateHoldFrame.trailStart).toBe(0);
    expect(lateHoldFrame.trailLimit).toBe(episode.raster.pathIndices.length);

    disposeMazeEpisode(episode);
  });

  test('demo trail render bounds stop at the live actor instead of previewing ahead', () => {
    const cycle = resolveMenuDemoCycle(90210, 5);
    const resolved = generateMazeForDifficulty({
      scale: 50,
      seed: 90210,
      size: cycle.size,
      family: cycle.family,
      presentationPreset: cycle.presentationPreset,
      checkPointModifier: cycle.entropy.checkPointModifier,
      shortcutCountModifier: cycle.entropy.shortcutCountModifier
    }, cycle.difficulty, 0, 1);
    const episode = resolved.episode;
    const config = createDemoConfig(episode, cycle);
    const midTraverseMs = config.cadence.spawnHoldMs + Math.max(1, Math.floor(config.cadence.exploreStepMs * 2.5));
    const view = resolveDemoWalkerViewFrame(episode, midTraverseMs, config, 6);
    const renderedTrail = resolveDemoTrailRenderBounds(episode.raster.pathIndices, view, 6);

    expect(view.currentIndex).not.toBe(view.nextIndex);
    expect(view.progress).toBeGreaterThan(0);
    expect(renderedTrail.start).toBe(0);
    expect(renderedTrail.limit).toBe(4);
    expect(episode.raster.pathIndices[renderedTrail.limit - 1]).toBe(view.nextIndex);

    const spawnFrame = resolveDemoWalkerViewFrame(
      episode,
      Math.max(1, Math.floor(config.cadence.spawnHoldMs * 0.5)),
      config,
      6
    );
    const spawnTrail = resolveDemoTrailRenderBounds(episode.raster.pathIndices, spawnFrame, 6);

    expect(spawnFrame.progress).toBe(0);
    expect(spawnTrail.limit).toBe(1);
    expect(episode.raster.pathIndices[spawnTrail.limit - 1]).toBe(spawnFrame.currentIndex);

    disposeMazeEpisode(episode);
  });

  test('demo trail render bounds stay inside the visible window during goal hold', () => {
    const cycle = resolveMenuDemoCycle(777, 4);
    const resolved = generateMazeForDifficulty({
      scale: 50,
      seed: 777,
      size: cycle.size,
      family: cycle.family,
      presentationPreset: cycle.presentationPreset,
      checkPointModifier: cycle.entropy.checkPointModifier,
      shortcutCountModifier: cycle.entropy.shortcutCountModifier
    }, cycle.difficulty, 0, 1);
    const episode = resolved.episode;
    const config = createDemoConfig(episode, cycle);
    const visibleWindow = 6;
    const arrivalMs = config.cadence.spawnHoldMs + ((episode.raster.pathIndices.length - 1) * config.cadence.exploreStepMs);
    const holdFrame = resolveDemoWalkerViewFrame(episode, arrivalMs + 1, config, visibleWindow);
    const renderedTrail = resolveDemoTrailRenderBounds(episode.raster.pathIndices, holdFrame, visibleWindow);

    expect(holdFrame.trailLimit).toBe(episode.raster.pathIndices.length);
    expect(renderedTrail.limit - renderedTrail.start).toBeLessThanOrEqual(visibleWindow);
    expect(episode.raster.pathIndices[renderedTrail.limit - 1]).toBe(episode.raster.endIndex);
    expect(renderedTrail.start).toBeGreaterThanOrEqual(0);

    disposeMazeEpisode(episode);
  });

  test('theme-aware preset pairing keeps ambient chrome coherent', () => {
    expect(['classic', 'framed']).toContain(resolveMenuDemoPreset(42, 0, 'scan', 'vellum', 'framed'));
    expect(['classic', 'braided']).toContain(resolveMenuDemoPreset(42, 0, 'solve', 'aurora', 'braided'));
    expect(['classic', 'braided', 'blueprint-rare']).toContain(resolveMenuDemoPreset(42, 0, 'blueprint', 'aurora', 'split-flow'));
    expect(['classic', 'braided', 'blueprint-rare']).toContain(resolveMenuDemoPreset(42, 0, 'blueprint', 'monolith', 'dense'));
  });

  test('presentation artifact cleanup removes stale screenshot and capture outputs', () => {
    const created = createPresentationArtifactFixtures();
    expect(listPresentationArtifacts()).toEqual(created.sort());

    const removed = cleanupPresentationArtifacts();
    expect(removed).toEqual(created.sort());
    expect(listPresentationArtifacts()).toEqual([]);
  });

  test('MenuScene keeps listener cleanup and per-cycle episode resets explicit', () => {
    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');

    expect(menuSceneSource).toContain('destroyEpisodePresentationShell();');
    expect(menuSceneSource).toContain('this.ambientSky?.destroy();');
    expect(menuSceneSource).toContain('this.ambientSky?.update(delta);');
    expect(menuSceneSource).toContain('this.drawStarfield(width, height, sceneThemeProfile, scheduleSeed, variant, deploymentProfileId, reducedMotion);');
    expect(menuSceneSource).toContain('this.add.rectangle(0, 0, width, height, sceneThemeProfile.palette.background.deepSpace, 1)');
    expect(menuSceneSource).toContain('const scheduleDeferredVisualSetup = (): void => {');
    expect(menuSceneSource).toContain('scheduleDeferredVisualSetup();');
    expect(menuSceneSource).toContain("markBootTiming('menu-scene:create-core-ready');");
    expect(menuSceneSource).toContain("markBootTiming('menu-scene:first-interactive-frame');");
    expect(menuSceneSource).toContain("markBootTiming('menu-scene:deferred-visual-setup');");
    expect(menuSceneSource).toContain("this.nextHeroWindowAt = this.resolveTierCooldown('hero')");
    expect(menuSceneSource).toContain("this.nextSignatureWindowAt = this.resolveTierCooldown('signature')");
    expect(menuSceneSource).toContain('episodePresentationShell = createEpisodePresentationShell(patternFrame.episode, demoCyclePlan.theme);');
    expect(menuSceneSource).toContain('const scheduleIntentRuntimeSession = (episode: MazeEpisode): void => {');
    expect(menuSceneSource).toContain('intentRuntimeSession = createMenuIntentRuntimeSession(episode);');
    expect(menuSceneSource).toContain('createIntentFeedHud(this, {');
    expect(menuSceneSource).toContain("this.scale.off(Phaser.Scale.Events.RESIZE, handleResize);");
    expect(menuSceneSource).toContain("this.events.off(Phaser.Scenes.Events.UPDATE, updateDemo);");
    expect(menuSceneSource).toContain("document.removeEventListener('visibilitychange', handleVisibilityChange);");
  });

  test('shell css keeps the viewport full-bleed while board framing stays in-scene', () => {
    const baseCss = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');

    expect(baseCss).toContain('--mazer-safe-area-top: env(safe-area-inset-top, 0px);');
    expect(baseCss).toContain('--mazer-viewport-width: 100vw;');
    expect(baseCss).toContain('--mazer-viewport-height: 100dvh;');
    expect(baseCss).toContain('#app {');
    expect(baseCss).toContain('position: fixed;');
    expect(baseCss).toContain('width: var(--mazer-viewport-width);');
    expect(baseCss).toContain('height: var(--mazer-viewport-height);');
    expect(baseCss).toContain('width: 100% !important;');
    expect(baseCss).toContain('height: 100% !important;');
    expect(baseCss).toContain('max-width: none;');
    expect(baseCss).toContain('max-height: none;');
    expect(baseCss).toContain('border: 0;');
    expect(baseCss).toContain('box-shadow: none;');
  });

  test('ambient presentation stays stable across long-run episode turnover and large elapsed times', { timeout: AMBIENT_PRESENTATION_STABILITY_TIMEOUT_MS }, () => {
    createPresentationArtifactFixtures();
    cleanupPresentationArtifacts();

    const profileCases = [
      { width: 1920, height: 1080, variant: 'ambient' as const, profile: 'tv' as const, chrome: 'minimal' as const, titleVisible: false },
      { width: 1920, height: 1080, variant: 'ambient' as const, profile: 'obs' as const, chrome: 'minimal' as const, titleVisible: false },
      { width: 390, height: 844, variant: 'ambient' as const, profile: 'mobile' as const, chrome: 'full' as const, titleVisible: true }
    ];
    const observedBoardWidths = new Set<number>();
    const totalCycles = 48;

    for (let cycleIndex = 0; cycleIndex < totalCycles; cycleIndex += 1) {
      const cycle = resolveMenuDemoCycle(20260410, cycleIndex);
      const resolved = generateMazeForDifficulty({
        scale: 50,
        seed: 20260410 + cycleIndex,
        size: cycle.size,
        family: cycle.family,
        presentationPreset: cycle.presentationPreset,
        checkPointModifier: 0.35,
        shortcutCountModifier: 0.13
      }, cycle.difficulty, 0, 1);
      const episode = resolved.episode;
      const config = createDemoConfig(episode, cycle);
      const cycleDurationMs = resolveCycleDurationMs(episode, config);
      const elapsedSamples = [
        Math.max(1, Math.floor(config.cadence.spawnHoldMs * 0.5)),
        Math.max(1, Math.floor(cycleDurationMs * 0.35)),
        Math.max(1, Math.floor(cycleDurationMs * 0.85)),
        2_147_483_647 + (cycleIndex * 17)
      ];

      for (const profileCase of profileCases) {
        const presentationModel = resolveMenuPresentationModel(
          profileCase.width,
          profileCase.height,
          profileCase.variant,
          profileCase.chrome,
          profileCase.titleVisible,
          profileCase.profile
        );
        const layout = createBoardLayout(createViewportSceneStub(presentationModel.viewport.width, presentationModel.viewport.height), episode, {
          boardScale: presentationModel.layout.boardScale,
          topReserve: presentationModel.layout.topReserve,
          sidePadding: presentationModel.layout.sidePadding,
          bottomPadding: presentationModel.layout.bottomPadding
        });

        observedBoardWidths.add(Math.round(layout.boardWidth));

        expect(layout.boardWidth).toBeGreaterThan(0);
        expect(layout.boardHeight).toBeGreaterThan(0);
        expect(layout.tileSize).toBeGreaterThan(0);

        for (const elapsedMs of elapsedSamples) {
          const presentation = resolveMenuDemoPresentation(
            episode,
            cycle,
            elapsedMs,
            config,
            profileCase.variant,
            profileCase.profile
          );
          const finalBounds = resolveBoardPresentationBounds(layout, presentation.frameOffsetX, presentation.frameOffsetY);

          expect(presentation.trailWindow).toBeGreaterThanOrEqual(4);
          expect(presentation.trailWindow).toBeLessThanOrEqual(46);
          expect(presentation.boardVeilAlpha).toBeGreaterThanOrEqual(0);
          expect(presentation.boardVeilAlpha).toBeLessThanOrEqual(0.24);
          expect(presentation.boardAuraAlpha).toBeGreaterThanOrEqual(0.06);
          expect(presentation.boardAuraAlpha).toBeLessThanOrEqual(0.22);
          expect(presentation.boardHaloAlpha).toBeGreaterThanOrEqual(0.018);
          expect(presentation.boardHaloAlpha).toBeLessThanOrEqual(0.16);
          expect(presentation.boardShadeAlpha).toBeGreaterThanOrEqual(0.012);
          expect(presentation.boardShadeAlpha).toBeLessThanOrEqual(0.18);
          expect(presentation.boardAuraScale).toBeGreaterThanOrEqual(1);
          expect(presentation.boardAuraScale).toBeLessThanOrEqual(1.05);
          expect(presentation.boardHaloScale).toBeGreaterThanOrEqual(1);
          expect(presentation.boardHaloScale).toBeLessThanOrEqual(1.03);
          expect(presentation.metadataAlpha).toBeGreaterThanOrEqual(0.18);
          expect(presentation.metadataAlpha).toBeLessThanOrEqual(0.82);
          expect(presentation.flashAlpha).toBeGreaterThanOrEqual(0);
          expect(presentation.flashAlpha).toBeLessThanOrEqual(0.84);
          expect(presentation.actorPulseBoost).toBeGreaterThanOrEqual(0);
          expect(presentation.actorPulseBoost).toBeLessThanOrEqual(0.12);
          expect(presentation.ambientDriftMs).toBeGreaterThanOrEqual(1200);
          expect(presentation.ambientDriftMs).toBeLessThanOrEqual(12000);
          expect(finalBounds.left).toBeGreaterThanOrEqual(0);
          expect(finalBounds.top).toBeGreaterThanOrEqual(0);
          expect(finalBounds.right).toBeLessThanOrEqual(presentationModel.viewport.width);
          expect(finalBounds.bottom).toBeLessThanOrEqual(presentationModel.viewport.height);

          if (profileCase.profile === 'obs') {
            expect(presentation.frameOffsetX).toBe(0);
            expect(presentation.frameOffsetY).toBe(0);
            expect(presentation.hudOffsetX).toBe(0);
            expect(presentation.hudOffsetY).toBe(0);
            expect(presentation.ambientDriftPxX).toBe(0);
            expect(presentation.ambientDriftPxY).toBe(0);
            expect(finalBounds.left).toBeGreaterThanOrEqual(layout.safeBounds.left);
            expect(finalBounds.top).toBeGreaterThanOrEqual(layout.safeBounds.top);
            expect(finalBounds.right).toBeLessThanOrEqual(layout.safeBounds.right);
            expect(finalBounds.bottom).toBeLessThanOrEqual(layout.safeBounds.bottom);
            expect(Math.abs(finalBounds.centerX - layout.safeBounds.centerX)).toBeLessThanOrEqual(0.5);
            expect(Math.abs(finalBounds.centerY - layout.safeBounds.centerY)).toBeLessThanOrEqual(0.5);
          }
        }
      }

      disposeMazeEpisode(episode);
    }

    expect(observedBoardWidths.size).toBeGreaterThan(2);
    expect(listPresentationArtifacts()).toEqual([]);
  });

  test('board relayout stays visible across tiny, wide, and tall viewports', () => {
    const resolved = generateMazeForDifficulty({
      scale: 50,
      seed: 1337,
      size: 'medium',
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.13
    }, 'standard', 0, 1);
    const episode = resolved.episode;
    const viewports = [
      { width: 160, height: 120, variant: 'title' as const },
      { width: 320, height: 180, variant: 'title' as const },
      { width: 1920, height: 280, variant: 'ambient' as const, profile: 'tv' as const },
      { width: 1920, height: 1080, variant: 'ambient' as const, profile: 'obs' as const, chrome: 'minimal' as const, titleVisible: false },
      { width: 280, height: 1200, variant: 'loading' as const, profile: 'mobile' as const }
    ];

    for (const viewport of viewports) {
      const model = resolveMenuPresentationModel(
        viewport.width,
        viewport.height,
        viewport.variant,
        viewport.chrome ?? 'full',
        viewport.titleVisible ?? true,
        viewport.profile
      );
      const layout = createBoardLayout({
        scale: {
          width: model.viewport.width,
          height: model.viewport.height
        },
        cameras: {
          main: {
            width: model.viewport.width,
            height: model.viewport.height
          }
        }
      } as never, episode, {
        boardScale: model.layout.boardScale,
        topReserve: model.layout.topReserve,
        sidePadding: model.layout.sidePadding,
        bottomPadding: model.layout.bottomPadding
      });

      expect(layout.boardWidth).toBeGreaterThan(0);
      expect(layout.boardHeight).toBeGreaterThan(0);
      expect(layout.tileSize).toBeGreaterThan(0);
      expect(Number.isInteger(layout.tileSize)).toBe(true);
      expect(layout.boardX).toBeGreaterThanOrEqual(0);
      expect(layout.boardY).toBeGreaterThanOrEqual(0);
      expect(layout.boardX + layout.boardWidth).toBeLessThanOrEqual(model.viewport.width);
      expect(layout.boardY + layout.boardHeight).toBeLessThanOrEqual(model.viewport.height);
    }

    disposeMazeEpisode(episode);
  });

  test('obs layout keeps the final board centered inside a padded safe frame', () => {
    const cycle = resolveMenuDemoCycle(4242, 3);
    const resolved = generateMazeForDifficulty({
      scale: 50,
      seed: 4242,
      size: cycle.size,
      family: cycle.family,
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.13
    }, cycle.difficulty, 0, 1);
    const episode = resolved.episode;
    const presentationModel = resolveMenuPresentationModel(1920, 1080, 'ambient', 'minimal', false, 'obs');
    const layout = createBoardLayout({
      scale: {
        width: presentationModel.viewport.width,
        height: presentationModel.viewport.height
      },
      cameras: {
        main: {
          width: presentationModel.viewport.width,
          height: presentationModel.viewport.height
        }
      }
    } as never, episode, {
      boardScale: presentationModel.layout.boardScale,
      topReserve: presentationModel.layout.topReserve,
      sidePadding: presentationModel.layout.sidePadding,
      bottomPadding: presentationModel.layout.bottomPadding
    });
    const config = resolveDemoConfig(episode, cycle);
    const presentation = resolveMenuDemoPresentation(episode, cycle, config.cadence.spawnHoldMs, config, 'ambient', 'obs');
    const finalBounds = resolveBoardPresentationBounds(layout, presentation.frameOffsetX, presentation.frameOffsetY);

    expect(presentationModel.layout.topReserve).toBe(presentationModel.layout.bottomPadding);
    expect(finalBounds.left).toBeGreaterThanOrEqual(layout.safeBounds.left);
    expect(finalBounds.top).toBeGreaterThanOrEqual(layout.safeBounds.top);
    expect(finalBounds.right).toBeLessThanOrEqual(layout.safeBounds.right);
    expect(finalBounds.bottom).toBeLessThanOrEqual(layout.safeBounds.bottom);
    expect(Math.abs(finalBounds.centerX - layout.safeBounds.centerX)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(finalBounds.centerY - layout.safeBounds.centerY)).toBeLessThanOrEqual(0.5);

    disposeMazeEpisode(episode);
  });

  test('default presentation layout stays unchanged unless board-first chrome is requested', () => {
    const defaultModel = resolveMenuPresentationModel(1280, 720, DEFAULT_PRESENTATION_VARIANT);
    const explicitDefaultModel = resolveMenuPresentationModel(1280, 720, 'title', 'full', true);
    const boardFirstModel = resolveMenuPresentationModel(1280, 720, 'ambient', 'none', false);
    const tvModel = resolveMenuPresentationModel(1920, 1080, 'ambient', 'minimal', false, 'tv');
    const defaultAmbientModel = resolveMenuPresentationModel(1920, 1080, 'ambient', 'minimal', false);
    const obsModel = resolveMenuPresentationModel(1920, 1080, 'ambient', 'minimal', false, 'obs');
    const portraitBaseModel = resolveMenuPresentationModel(390, 844, 'ambient', 'full', true);
    const mobileModel = resolveMenuPresentationModel(390, 844, 'ambient', 'full', true, 'mobile');

    expect(defaultModel).toEqual(explicitDefaultModel);
    expect(defaultModel.layout.topReserve).toBeGreaterThan(boardFirstModel.layout.topReserve);
    expect(defaultModel.layout.boardScale).toBeLessThan(boardFirstModel.layout.boardScale);
    expect(tvModel.layout.topReserve).toBeLessThan(defaultAmbientModel.layout.topReserve);
    expect(obsModel.layout.sidePadding).toBeGreaterThan(defaultAmbientModel.layout.sidePadding);
    expect(mobileModel.layout.topReserve).toBeGreaterThan(portraitBaseModel.layout.topReserve);
    expect(mobileModel.layout.boardScale).toBeLessThan(portraitBaseModel.layout.boardScale);
  });

  test('play, options, and win scene files are removed and the menu stays ambient-first', () => {
    const removedPaths = [
      'src/scenes/GameScene.ts',
      'src/scenes/OptionsScene.ts',
      'src/scenes/PauseScene.ts',
      'src/scenes/WinScene.ts',
      'src/scenes/gameInput.ts',
      'src/scenes/gameSceneSummary.ts',
      'src/ui/menuButton.ts',
      'src/storage/mazerStorage.ts'
    ];

    for (const relativePath of removedPaths) {
      expect(existsSync(resolve(process.cwd(), relativePath))).toBe(false);
    }

    const menuSceneSource = readFileSync(resolve(process.cwd(), 'src/scenes/MenuScene.ts'), 'utf8');
    expect(menuSceneSource).not.toContain('GameScene');
    expect(menuSceneSource).not.toContain('OptionsScene');
    expect(menuSceneSource).not.toContain('Start Run');
    expect(menuSceneSource).toContain('Install Mazer');
    expect(menuSceneSource).not.toContain('Play Again');
    expect(menuSceneSource).not.toContain('Same Seed');
    expect(menuSceneSource).not.toContain('Next Maze');
    expect(menuSceneSource).not.toContain('PauseScene');
    expect(menuSceneSource).not.toContain('SettingsScene');
  });
});
