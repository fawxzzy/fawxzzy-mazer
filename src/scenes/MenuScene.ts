import Phaser from 'phaser';
import type {
  AmbientPresentationVariant,
  AmbientFamilyThemePairingPolicy,
  PresentationChrome,
  PresentationDeploymentProfile,
  PresentationLaunchConfig,
  PresentationMood,
  PresentationThemeFamily
} from '../boot/presentation';
import {
  AMBIENT_FAMILY_THEME_PAIRING_POLICY,
  DEFAULT_PRESENTATION_CHROME,
  DEFAULT_PRESENTATION_LAUNCH_CONFIG,
  PRESENTATION_THEME_FAMILIES,
  DEFAULT_PRESENTATION_VARIANT,
  isDeterministicPresentationCapture,
  resolveAmbientFamilyTheme,
  resolveEffectivePresentationChrome,
  resolvePatternEngineMode,
  sanitizePresentationLaunchConfig,
  sanitizePresentationVariant,
  shouldShowPresentationTitle
} from '../boot/presentation';
import {
  getInstallSurfaceState,
  promptInstallSurface,
  subscribeInstallSurface,
  type InstallSurfaceState
} from '../boot/installSurface';
import { resolveDemoWalkerViewFrame, type DemoWalkerConfig, type DemoWalkerCue, type DemoWalkerViewFrame } from '../domain/ai';
import {
  disposeMazeEpisode,
  generateMazeForDifficulty,
  type MazeFamily,
  MAZE_SIZE_ORDER,
  type MazePresentationPreset,
  PatternEngine,
  type MazeDifficulty,
  type MazeEpisode,
  type MazeSize,
  type PatternFrame,
  resolveCuratedFamilyRotation
} from '../domain/maze';
import { legacyTuning, resolveBoardScaleFromCamScale } from '../config/tuning';
import {
  createBoardLayout,
  BoardRenderer,
  type BoardBounds,
  type BoardLayout,
  type BoardThemeStyle,
  type TrailRenderDiagnostics
} from '../render/boardRenderer';
import { createDemoStatusHud, type HudThemeStyle } from '../render/hudRenderer';
import {
  applyPresentationContrastFloors,
  getPaletteReadabilityReport,
  palette,
  type PaletteReadabilityReport
} from '../render/palette';
import {
  DEFAULT_VIEWPORT_HEIGHT,
  DEFAULT_VIEWPORT_WIDTH,
  resolveSceneViewport,
  resolveViewportSize,
  type ViewportSize
} from '../render/viewport';

const PASSIVE_TAGLINES: Record<AmbientPresentationVariant, string> = {
  title: 'pattern engine',
  ambient: 'ambient engine',
  loading: 'live system'
};
const ROTATING_DIFFICULTIES: readonly MazeDifficulty[] = ['chill', 'standard', 'spicy', 'brutal'];
const ROTATING_SIZES: readonly MazeSize[] = MAZE_SIZE_ORDER;
const LOADING_PHASE_LABELS: Record<MenuDemoSequence, readonly string[]> = {
  intro: ['generating', 'routing'],
  reveal: ['solving', 'pattern sync'],
  arrival: ['live system', 'pattern sync'],
  fade: ['routing', 'generating']
};

export type DemoMood = 'solve' | 'scan' | 'blueprint';
export type MenuDemoSequence = 'intro' | 'reveal' | 'arrival' | 'fade';

export type MenuSceneInitData = Partial<PresentationLaunchConfig>;

export interface MenuDemoCycle {
  difficulty: MazeDifficulty;
  size: MazeSize;
  mood: DemoMood;
  theme: PresentationThemeFamily;
  family: MazeFamily;
  presentationPreset: MazePresentationPreset;
  entropy: {
    checkPointModifier: number;
    shortcutCountModifier: number;
  };
  pacing: {
    exploreStepMs: number;
    goalHoldMs: number;
    resetHoldMs: number;
    spawnHoldMs: number;
  };
}

export interface MenuDemoPresentation {
  variant: AmbientPresentationVariant;
  mood: DemoMood;
  theme: PresentationThemeFamily;
  sequence: MenuDemoSequence;
  phaseLabel: string;
  solutionPathAlpha: number;
  trailWindow: number;
  ambientDriftPxX: number;
  ambientDriftPxY: number;
  ambientDriftMs: number;
  frameOffsetX: number;
  frameOffsetY: number;
  hudOffsetX: number;
  hudOffsetY: number;
  boardVeilAlpha: number;
  boardAuraAlpha: number;
  boardHaloAlpha: number;
  boardShadeAlpha: number;
  boardAuraScale: number;
  boardHaloScale: number;
  motifPrimaryAlpha: number;
  motifSecondaryAlpha: number;
  actorPulseBoost: number;
  persistentTrail: boolean;
  persistentFadeFloor: number;
  trailPulseBoost: number;
  metadataAlpha: number;
  flashAlpha: number;
}

interface VariantProfile {
  boardScaleWide: number;
  boardScaleNarrow: number;
  topReserveRatio: number;
  topReserveMinPx: number;
  bottomPaddingPx: number;
  sidePaddingPx: number;
  titleScale: number;
  titleAlpha: number;
  signatureAlpha: number;
  passiveAlpha: number;
  plateAlpha: number;
  panelAlpha: number;
  titleYOffsetRatio: number;
  titleAnchor: 'center' | 'left';
  titleDriftX: number;
  titleDriftY: number;
  titleDriftMs: number;
  titleLetterSpacingWide: number;
  titleLetterSpacingNarrow: number;
  solutionPathScale: number;
  metadataAlphaScale: number;
  flashAlphaScale: number;
  boardAuraBias: number;
  boardHaloBias: number;
  boardShadeBias: number;
  boardVeilBias: number;
  boardOffsetRangeX: number;
  boardOffsetRangeY: number;
  hudOffsetRangeX: number;
  hudOffsetRangeY: number;
  driftScale: number;
  actorPulseBias: number;
}

export interface SceneLayoutProfile {
  isNarrow: boolean;
  isPortrait: boolean;
  isShort: boolean;
  isTiny: boolean;
  boardScale: number;
  topReserve: number;
  bottomPadding: number;
  sidePadding: number;
}

export interface ViewportSafeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface PresentationOffsets {
  frameOffsetX: number;
  frameOffsetY: number;
  hudOffsetX: number;
  hudOffsetY: number;
  driftX: number;
  driftY: number;
}

interface EpisodePresentationShell {
  layout: ReturnType<typeof createBoardLayout>;
  boardCenterX: number;
  boardCenterY: number;
  boardRenderer: BoardRenderer;
  demoStatusHud: ReturnType<typeof createDemoStatusHud>;
  boardAura: Phaser.GameObjects.Ellipse;
  boardHalo: Phaser.GameObjects.Ellipse;
  boardShade: Phaser.GameObjects.Rectangle;
  boardVeil: Phaser.GameObjects.Rectangle;
  blueprintAccent: Phaser.GameObjects.Graphics;
  motifPrimary: Phaser.GameObjects.Graphics;
  motifSecondary: Phaser.GameObjects.Graphics;
}

interface MenuDemoCycleOverrides {
  difficulty?: MazeDifficulty;
  size?: MazeSize;
  mood?: DemoMood;
  theme?: PresentationThemeFamily;
  family?: MazeFamily;
}

interface ChromeProfile {
  boardScaleBias: number;
  topReserveBias: number;
  bottomPaddingBias: number;
  sidePaddingBias: number;
  titleScale: number;
  titleAlpha: number;
  signatureAlpha: number;
  passiveAlpha: number;
  plateAlpha: number;
  panelAlpha: number;
}

interface DeploymentPresentationProfile {
  boardScaleBias: number;
  portraitBoardScaleBias: number;
  topReserveBias: number;
  portraitTopReserveBias: number;
  bottomPaddingBias: number;
  sidePaddingBias: number;
  maxBoardScale: number;
  titlePlateWidthScale: number;
  titlePlateHeightScale: number;
  titleLineSpacingScale: number;
  titleYOffsetBias: number;
  titleAlphaScale: number;
  signatureAlphaScale: number;
  passiveAlphaScale: number;
  plateAlphaScale: number;
  panelAlphaScale: number;
  offsetScale: number;
  driftScale: number;
  driftDurationScale: number;
  metadataAlphaScale: number;
  flashAlphaScale: number;
  boardAuraBiasScale: number;
  boardHaloBiasScale: number;
  boardShadeBiasScale: number;
  boardVeilBiasScale: number;
  boardAuraMotionScale: number;
  boardHaloMotionScale: number;
}

type MoodPattern = readonly [DemoMood, DemoMood, DemoMood, DemoMood, DemoMood, DemoMood, DemoMood, DemoMood];
interface ThemePaletteOverrides {
  background?: Partial<typeof palette.background>;
  board?: Partial<typeof palette.board>;
  hud?: Partial<typeof palette.hud>;
}

interface ResizeRecoveryDecision {
  shouldRestart: boolean;
  restartKey?: string;
}

interface AmbientThemeProfile {
  id: PresentationThemeFamily;
  label: string;
  palette: typeof palette;
  boardTheme: BoardThemeStyle;
  hudTheme: HudThemeStyle;
  background: {
    topLeft: number;
    topRight: number;
    bottomLeft: number;
    bottomRight: number;
    cloudAlphaScale: number;
    farStarAlphaScale: number;
    nearStarAlphaScale: number;
    vignetteAlphaScale: number;
  };
  shell: {
    auraColor: number;
    haloColor: number;
    shadeColor: number;
    veilColor: number;
    auraAlphaBias: number;
    haloAlphaBias: number;
    shadeAlphaBias: number;
    veilAlphaBias: number;
    auraScaleBias: number;
    haloScaleBias: number;
    motifPrimaryAlpha: number;
    motifSecondaryAlpha: number;
    blueprintAccentAlphaScale: number;
  };
  presentation: {
    driftScale: number;
    offsetScale: number;
    solutionPathAlphaScale: number;
    metadataAlphaBias: number;
    flashAlphaBias: number;
    actorPulseBias: number;
  };
  title: {
    fontFamily: string;
    signatureFontFamily: string;
    supportFontFamily: string;
    titleColor: string;
    titleStroke: string;
    titleShadow: string;
    signatureColor: string;
    supportColor: string;
    installColor: string;
    pendingColor: string;
    plateShadowColor: number;
    plateOuterColor: number;
    plateInnerColor: number;
    plateLineColor: number;
    buttonFillColor: number;
    buttonStrokeColor: number;
  };
}

const createThemePalette = (overrides: ThemePaletteOverrides): typeof palette => applyPresentationContrastFloors({
  background: {
    ...palette.background,
    ...overrides.background
  },
  board: {
    ...palette.board,
    ...overrides.board
  },
  hud: {
    ...palette.hud,
    ...overrides.hud
  },
  ui: palette.ui
});

const THEME_PROFILES: Record<PresentationThemeFamily, AmbientThemeProfile> = {
  noir: {
    id: 'noir',
    label: 'NOIR',
    palette: createThemePalette({
      background: {
        deepSpace: 0x040507,
        nebula: 0x0b0e12,
        nebulaCore: 0x151920,
        vignette: 0x010101,
        star: 0xe4e8ee,
        cloud: 0x171b22
      },
      board: {
        glow: 0x0d1115,
        panel: 0x0b1015,
        panelStroke: 0x74879f,
        well: 0x040608,
        shadow: 0x000000,
        outer: 0x0f141b,
        outerStroke: 0xdce8f4,
        innerStroke: 0x8c9fb4,
        topHighlight: 0xf2f7ff,
        wall: 0x12171d,
        floor: 0xd2dbe4,
        path: 0x97a5b2,
        route: 0x20c875,
        routeCore: 0xf6fff9,
        routeGlow: 0x124c37,
        trail: 0x445ed8,
        trailCore: 0xf2f6ff,
        trailGlow: 0x95abff,
        start: 0xc99b45,
        startCore: 0xfff3d0,
        startGlow: 0x7d5921,
        goal: 0xb63d60,
        goalCore: 0xfff0f4,
        player: 0x16dcff,
        playerCore: 0xf8feff,
        playerHalo: 0x9eefff,
        playerShadow: 0x030303
      },
      hud: {
        panelStroke: 0xa2b7cd,
        accent: 0xf4f8ff,
        hintText: 0xb8cad9
      }
    }),
    boardTheme: {
      solutionPathGlowAlphaScale: 0.82,
      solutionPathCoreAlphaScale: 1.08,
      trailFillAlphaScale: 1.02,
      trailGlowAlphaScale: 0.8,
      trailCoreAlphaScale: 1.04,
      actorHaloAlphaScale: 0.94,
      goalGlowAlphaScale: 0.92
    },
    hudTheme: {
      railAlphaScale: 0.76,
      modeAlphaScale: 0.96,
      metaAlphaScale: 0.78,
      flashAlphaScale: 0.88
    },
    background: {
      topLeft: 0x050608,
      topRight: 0x06080b,
      bottomLeft: 0x10151a,
      bottomRight: 0x171c22,
      cloudAlphaScale: 0.72,
      farStarAlphaScale: 0.88,
      nearStarAlphaScale: 0.96,
      vignetteAlphaScale: 1.1
    },
    shell: {
      auraColor: 0x6da6ff,
      haloColor: 0xe5f3ff,
      shadeColor: 0x7d8a99,
      veilColor: 0x050607,
      auraAlphaBias: -0.018,
      haloAlphaBias: -0.008,
      shadeAlphaBias: -0.012,
      veilAlphaBias: -0.004,
      auraScaleBias: -0.01,
      haloScaleBias: -0.003,
      motifPrimaryAlpha: 0.07,
      motifSecondaryAlpha: 0.03,
      blueprintAccentAlphaScale: 0.82
    },
    presentation: {
      driftScale: 0.92,
      offsetScale: 0.84,
      solutionPathAlphaScale: 1.06,
      metadataAlphaBias: -0.02,
      flashAlphaBias: -0.02,
      actorPulseBias: 0.004
    },
    title: {
      fontFamily: '"Bahnschrift SemiCondensed", "Trebuchet MS", "Segoe UI", sans-serif',
      signatureFontFamily: '"Consolas", "Courier New", monospace',
      supportFontFamily: '"Consolas", "Courier New", monospace',
      titleColor: '#f2f4f8',
      titleStroke: '#0b1117',
      titleShadow: '#0a1016',
      signatureColor: '#b9cfe4',
      supportColor: '#dce8f4',
      installColor: '#f2f4f8',
      pendingColor: '#c7d0db',
      plateShadowColor: 0x000000,
      plateOuterColor: 0x060a10,
      plateInnerColor: 0x0d1620,
      plateLineColor: 0xd8e9ff,
      buttonFillColor: 0x0a131c,
      buttonStrokeColor: 0xb7d4f0
    }
  },
  ember: {
    id: 'ember',
    label: 'EMBER',
    palette: createThemePalette({
      background: {
        deepSpace: 0x120b09,
        nebula: 0x241412,
        nebulaCore: 0x3a201b,
        vignette: 0x060302,
        star: 0xffddc2,
        cloud: 0x4a271d
      },
      board: {
        glow: 0x29140f,
        panel: 0x190d09,
        panelStroke: 0xae7550,
        well: 0x120907,
        shadow: 0x050201,
        outer: 0x301610,
        outerStroke: 0xd7a073,
        innerStroke: 0xc98557,
        topHighlight: 0xffd19d,
        wall: 0x2d170e,
        floor: 0xe8c7a8,
        path: 0xb27653,
        route: 0x29af6d,
        routeCore: 0xf4ffef,
        routeGlow: 0x20472f,
        trail: 0x4e61cf,
        trailCore: 0xf6f1ff,
        trailGlow: 0x97a6ff,
        start: 0xc99234,
        startCore: 0xfff0ca,
        startGlow: 0x794d1c,
        goal: 0xbd3c54,
        goalCore: 0xffefef,
        player: 0x11c8ea,
        playerCore: 0xf0fdff,
        playerHalo: 0x92ebff,
        playerShadow: 0x1b0c07
      },
      hud: {
        panelStroke: 0xcd8f60,
        accent: 0xffd1a5,
        hintText: 0xeac59e
      }
    }),
    boardTheme: {
      solutionPathGlowAlphaScale: 1.08,
      solutionPathCoreAlphaScale: 1.04,
      trailFillAlphaScale: 1.02,
      trailGlowAlphaScale: 1.1,
      trailCoreAlphaScale: 1,
      actorHaloAlphaScale: 1.04,
      goalGlowAlphaScale: 1.08
    },
    hudTheme: {
      railAlphaScale: 0.94,
      modeAlphaScale: 1,
      metaAlphaScale: 0.92,
      flashAlphaScale: 1
    },
    background: {
      topLeft: 0x140b08,
      topRight: 0x22110d,
      bottomLeft: 0x3b1d15,
      bottomRight: 0x4d2618,
      cloudAlphaScale: 0.92,
      farStarAlphaScale: 0.72,
      nearStarAlphaScale: 0.82,
      vignetteAlphaScale: 1.04
    },
    shell: {
      auraColor: 0xb65b2f,
      haloColor: 0xffc07a,
      shadeColor: 0xff8e4a,
      veilColor: 0x130907,
      auraAlphaBias: 0.008,
      haloAlphaBias: 0.002,
      shadeAlphaBias: -0.004,
      veilAlphaBias: -0.004,
      auraScaleBias: 0.01,
      haloScaleBias: 0.006,
      motifPrimaryAlpha: 0.08,
      motifSecondaryAlpha: 0.04,
      blueprintAccentAlphaScale: 0.92
    },
    presentation: {
      driftScale: 1.02,
      offsetScale: 1,
      solutionPathAlphaScale: 0.98,
      metadataAlphaBias: 0.02,
      flashAlphaBias: 0.02,
      actorPulseBias: 0.01
    },
    title: {
      fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
      signatureFontFamily: '"Consolas", "Courier New", monospace',
      supportFontFamily: '"Consolas", "Courier New", monospace',
      titleColor: '#ffd3a3',
      titleStroke: '#3d1e10',
      titleShadow: '#31150b',
      signatureColor: '#efc097',
      supportColor: '#f7d3b1',
      installColor: '#ffd39e',
      pendingColor: '#e0b390',
      plateShadowColor: 0x0a0403,
      plateOuterColor: 0x160906,
      plateInnerColor: 0x2a140f,
      plateLineColor: 0xffcb98,
      buttonFillColor: 0x2a140e,
      buttonStrokeColor: 0xffbb74
    }
  },
  aurora: {
    id: 'aurora',
    label: 'AURORA',
    palette: createThemePalette({
      background: {
        deepSpace: 0x07111f,
        nebula: 0x12243f,
        nebulaCore: 0x1d3560,
        vignette: 0x02050a,
        star: 0xdffcff,
        cloud: 0x244c74
      },
      board: {
        glow: 0x0d1b33,
        panel: 0x0a1426,
        panelStroke: 0x5ea0ff,
        well: 0x09101f,
        shadow: 0x02050c,
        outer: 0x13233e,
        outerStroke: 0xb89cff,
        innerStroke: 0x90c2ef,
        topHighlight: 0xcffeff,
        wall: 0x112848,
        floor: 0xd8f1ff,
        path: 0x69a9cf,
        route: 0x24c979,
        routeCore: 0xf0fff8,
        routeGlow: 0x195f46,
        trail: 0x5b5fe0,
        trailCore: 0xf0fbff,
        trailGlow: 0xa8a4ff,
        start: 0xc99733,
        startCore: 0xfff1d1,
        startGlow: 0x7a5b22,
        goal: 0xc84a7f,
        goalCore: 0xfff4fa,
        player: 0x1adfff,
        playerCore: 0xf3ffff,
        playerHalo: 0x9aefff,
        playerShadow: 0x040916
      },
      hud: {
        panelStroke: 0x85c3f5,
        accent: 0xd8fcff,
        hintText: 0xbad7ef
      }
    }),
    boardTheme: {
      solutionPathGlowAlphaScale: 1.12,
      solutionPathCoreAlphaScale: 1.08,
      trailFillAlphaScale: 0.98,
      trailGlowAlphaScale: 1.16,
      trailCoreAlphaScale: 1.08,
      actorHaloAlphaScale: 1.08,
      goalGlowAlphaScale: 1.08
    },
    hudTheme: {
      railAlphaScale: 1,
      modeAlphaScale: 1,
      metaAlphaScale: 0.94,
      flashAlphaScale: 1
    },
    background: {
      topLeft: 0x08111f,
      topRight: 0x102043,
      bottomLeft: 0x182f57,
      bottomRight: 0x30215a,
      cloudAlphaScale: 0.88,
      farStarAlphaScale: 0.84,
      nearStarAlphaScale: 0.92,
      vignetteAlphaScale: 1
    },
    shell: {
      auraColor: 0x4cc9ff,
      haloColor: 0xd0c3ff,
      shadeColor: 0x7af5ff,
      veilColor: 0x08111f,
      auraAlphaBias: 0.008,
      haloAlphaBias: 0.004,
      shadeAlphaBias: -0.006,
      veilAlphaBias: -0.008,
      auraScaleBias: 0.014,
      haloScaleBias: 0.008,
      motifPrimaryAlpha: 0.08,
      motifSecondaryAlpha: 0.05,
      blueprintAccentAlphaScale: 1
    },
    presentation: {
      driftScale: 1.06,
      offsetScale: 1.04,
      solutionPathAlphaScale: 0.92,
      metadataAlphaBias: 0.03,
      flashAlphaBias: 0.04,
      actorPulseBias: 0.006
    },
    title: {
      fontFamily: '"Segoe UI", "Trebuchet MS", sans-serif',
      signatureFontFamily: '"Consolas", "Courier New", monospace',
      supportFontFamily: '"Consolas", "Courier New", monospace',
      titleColor: '#c5fbff',
      titleStroke: '#13203f',
      titleShadow: '#0d1831',
      signatureColor: '#b8d4f3',
      supportColor: '#dcfbff',
      installColor: '#c7f9ff',
      pendingColor: '#a8ccf0',
      plateShadowColor: 0x030914,
      plateOuterColor: 0x091422,
      plateInnerColor: 0x15253f,
      plateLineColor: 0xc9f8ff,
      buttonFillColor: 0x14233c,
      buttonStrokeColor: 0x92f5ff
    }
  },
  vellum: {
    id: 'vellum',
    label: 'VELLUM',
    palette: createThemePalette({
      background: {
        deepSpace: 0xe6dcc5,
        nebula: 0xd5cbb5,
        nebulaCore: 0xc4d6de,
        vignette: 0xb59f7b,
        star: 0x526887,
        cloud: 0xd8d1c1
      },
      board: {
        glow: 0xd3cab7,
        panel: 0xebe1cc,
        panelStroke: 0x5b7591,
        well: 0xf4eee1,
        shadow: 0xb49f82,
        outer: 0xdfd4c1,
        outerStroke: 0x58708a,
        innerStroke: 0x7f96ad,
        topHighlight: 0x466789,
        wall: 0x5a6c81,
        floor: 0xf1ecdf,
        path: 0x9eb0bf,
        route: 0x2f6a41,
        routeCore: 0xf7fbf2,
        routeGlow: 0x5f8461,
        trail: 0x4660c7,
        trailCore: 0xfbfdff,
        trailGlow: 0x7b8ed1,
        start: 0xb58631,
        startCore: 0xfff2d6,
        startGlow: 0x77551f,
        goal: 0xa44c68,
        goalCore: 0xfff6f9,
        player: 0x28577f,
        playerCore: 0xfafbff,
        playerHalo: 0x86b0d4,
        playerShadow: 0xb4a487
      },
      hud: {
        panelStroke: 0x7790ab,
        accent: 0xdeebf7,
        hintText: 0xeaf2fb
      }
    }),
    boardTheme: {
      solutionPathGlowAlphaScale: 0.94,
      solutionPathCoreAlphaScale: 1.08,
      trailFillAlphaScale: 1.02,
      trailGlowAlphaScale: 0.98,
      trailCoreAlphaScale: 1.08,
      actorHaloAlphaScale: 0.98,
      goalGlowAlphaScale: 0.96
    },
    hudTheme: {
      railAlphaScale: 0.9,
      modeAlphaScale: 0.98,
      metaAlphaScale: 0.98,
      flashAlphaScale: 0.86
    },
    background: {
      topLeft: 0xede5d2,
      topRight: 0xe3dbc8,
      bottomLeft: 0xc4d5dd,
      bottomRight: 0xd4cab7,
      cloudAlphaScale: 0.52,
      farStarAlphaScale: 0.26,
      nearStarAlphaScale: 0.32,
      vignetteAlphaScale: 0.56
    },
    shell: {
      auraColor: 0xb5c6d2,
      haloColor: 0x7292b0,
      shadeColor: 0xf2e8d3,
      veilColor: 0xf4efe1,
      auraAlphaBias: -0.018,
      haloAlphaBias: -0.012,
      shadeAlphaBias: -0.018,
      veilAlphaBias: -0.02,
      auraScaleBias: -0.012,
      haloScaleBias: -0.008,
      motifPrimaryAlpha: 0.06,
      motifSecondaryAlpha: 0.04,
      blueprintAccentAlphaScale: 1.18
    },
    presentation: {
      driftScale: 0.88,
      offsetScale: 0.9,
      solutionPathAlphaScale: 1.02,
      metadataAlphaBias: 0.01,
      flashAlphaBias: -0.04,
      actorPulseBias: -0.004
    },
    title: {
      fontFamily: '"Garamond", Georgia, serif',
      signatureFontFamily: '"Consolas", "Courier New", monospace',
      supportFontFamily: '"Consolas", "Courier New", monospace',
      titleColor: '#33485f',
      titleStroke: '#f3ead7',
      titleShadow: '#b7a488',
      signatureColor: '#58708a',
      supportColor: '#496079',
      installColor: '#38506a',
      pendingColor: '#64778d',
      plateShadowColor: 0xbca98a,
      plateOuterColor: 0xf0e7d7,
      plateInnerColor: 0xe4d9c5,
      plateLineColor: 0x64829f,
      buttonFillColor: 0xd8ccb5,
      buttonStrokeColor: 0x7490ac
    }
  },
  monolith: {
    id: 'monolith',
    label: 'MONOLITH',
    palette: createThemePalette({
      background: {
        deepSpace: 0x0c0d10,
        nebula: 0x16181d,
        nebulaCore: 0x21242a,
        vignette: 0x020202,
        star: 0xd7d9dd,
        cloud: 0x25282d
      },
      board: {
        glow: 0x111317,
        panel: 0x0d0f13,
        panelStroke: 0x8d949d,
        well: 0x07080b,
        shadow: 0x000000,
        outer: 0x181a1f,
        outerStroke: 0xd4d9df,
        innerStroke: 0x979ea8,
        topHighlight: 0xf1f4f8,
        wall: 0x17191e,
        floor: 0xd6dde4,
        path: 0x8a929b,
        route: 0x23c377,
        routeCore: 0xf7fff9,
        routeGlow: 0x184f38,
        trail: 0x5870ea,
        trailCore: 0xf7f9ff,
        trailGlow: 0x9bafff,
        start: 0xc18f39,
        startCore: 0xfff2d1,
        startGlow: 0x6e4f1f,
        goal: 0xbb486b,
        goalCore: 0xfff0f4,
        player: 0x14cfff,
        playerCore: 0xfcffff,
        playerHalo: 0xa2f1ff,
        playerShadow: 0x020202
      },
      hud: {
        panelStroke: 0xa3a8b0,
        accent: 0xf4f6f8,
        hintText: 0xc0c6ce
      }
    }),
    boardTheme: {
      solutionPathGlowAlphaScale: 0.76,
      solutionPathCoreAlphaScale: 1.02,
      trailFillAlphaScale: 1.08,
      trailGlowAlphaScale: 0.8,
      trailCoreAlphaScale: 1.04,
      actorHaloAlphaScale: 0.78,
      goalGlowAlphaScale: 0.82
    },
    hudTheme: {
      railAlphaScale: 0.68,
      modeAlphaScale: 0.8,
      metaAlphaScale: 0.74,
      flashAlphaScale: 0.62
    },
    background: {
      topLeft: 0x0c0d10,
      topRight: 0x121419,
      bottomLeft: 0x1d2025,
      bottomRight: 0x26292e,
      cloudAlphaScale: 0.62,
      farStarAlphaScale: 0.58,
      nearStarAlphaScale: 0.64,
      vignetteAlphaScale: 1.08
    },
    shell: {
      auraColor: 0x6a7078,
      haloColor: 0xe6e8ec,
      shadeColor: 0x484d56,
      veilColor: 0x090a0d,
      auraAlphaBias: -0.034,
      haloAlphaBias: -0.02,
      shadeAlphaBias: 0.002,
      veilAlphaBias: 0.01,
      auraScaleBias: -0.016,
      haloScaleBias: -0.01,
      motifPrimaryAlpha: 0.08,
      motifSecondaryAlpha: 0.02,
      blueprintAccentAlphaScale: 0.72
    },
    presentation: {
      driftScale: 0.82,
      offsetScale: 0.7,
      solutionPathAlphaScale: 0.94,
      metadataAlphaBias: -0.04,
      flashAlphaBias: -0.06,
      actorPulseBias: -0.002
    },
    title: {
      fontFamily: '"Bahnschrift", "Segoe UI", sans-serif',
      signatureFontFamily: '"Consolas", "Courier New", monospace',
      supportFontFamily: '"Consolas", "Courier New", monospace',
      titleColor: '#f4f6f8',
      titleStroke: '#121316',
      titleShadow: '#0d0f12',
      signatureColor: '#c2c8cf',
      supportColor: '#e1e5ea',
      installColor: '#f4f6f8',
      pendingColor: '#b7bcc4',
      plateShadowColor: 0x000000,
      plateOuterColor: 0x08090c,
      plateInnerColor: 0x15181d,
      plateLineColor: 0xe7eaee,
      buttonFillColor: 0x121419,
      buttonStrokeColor: 0xc9ced6
    }
  }
};

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const sanitizePositive = (value: unknown, fallback: number, minimum = 1): number => (
  isFiniteNumber(value) && value >= minimum ? value : fallback
);
const sanitizeOffset = (value: unknown): number => (isFiniteNumber(value) ? value : 0);
const sanitizeInset = (value: unknown): number => Math.max(0, sanitizeOffset(value));
const DEFAULT_VIEWPORT_SAFE_INSETS: ViewportSafeInsets = Object.freeze({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0
});
const resolveSafeInsetMetric = (source: Pick<CSSStyleDeclaration, 'getPropertyValue'>, name: string): number => {
  const parsed = Number.parseFloat(source.getPropertyValue(name).trim());
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};
const sanitizeViewportSafeInsets = (
  safeInsets?: Partial<ViewportSafeInsets> | null
): ViewportSafeInsets => ({
  top: sanitizeInset(safeInsets?.top),
  right: sanitizeInset(safeInsets?.right),
  bottom: sanitizeInset(safeInsets?.bottom),
  left: sanitizeInset(safeInsets?.left)
});

export const resolveViewportSafeInsets = (
  source?: Pick<CSSStyleDeclaration, 'getPropertyValue'> | null
): ViewportSafeInsets => {
  if (source) {
    return {
      top: resolveSafeInsetMetric(source, '--mazer-safe-area-top'),
      right: resolveSafeInsetMetric(source, '--mazer-safe-area-right'),
      bottom: resolveSafeInsetMetric(source, '--mazer-safe-area-bottom'),
      left: resolveSafeInsetMetric(source, '--mazer-safe-area-left')
    };
  }

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return DEFAULT_VIEWPORT_SAFE_INSETS;
  }

  return resolveViewportSafeInsets(window.getComputedStyle(document.documentElement));
};

export const resolvePresentationBackdropFrame = (
  viewportWidth: number,
  viewportHeight: number,
  centerX: number,
  centerY: number
): PresentationBackdropFrame => {
  const safeWidth = sanitizePositive(viewportWidth, DEFAULT_VIEWPORT_WIDTH, 1);
  const safeHeight = sanitizePositive(viewportHeight, DEFAULT_VIEWPORT_HEIGHT, 1);
  const safeCenterX = Phaser.Math.Clamp(isFiniteNumber(centerX) ? centerX : safeWidth / 2, 0, safeWidth);
  const safeCenterY = Phaser.Math.Clamp(isFiniteNumber(centerY) ? centerY : safeHeight / 2, 0, safeHeight);
  const bleedX = Math.max(64, Math.round(safeWidth * 0.12));
  const bleedY = Math.max(64, Math.round(safeHeight * 0.12));
  const halfWidth = Math.max(safeCenterX, safeWidth - safeCenterX) + bleedX;
  const halfHeight = Math.max(safeCenterY, safeHeight - safeCenterY) + bleedY;
  const width = Math.max(safeWidth + (bleedX * 2), Math.round(halfWidth * 2));
  const height = Math.max(safeHeight + (bleedY * 2), Math.round(halfHeight * 2));
  const left = safeCenterX - (width / 2);
  const top = safeCenterY - (height / 2);

  return {
    centerX: safeCenterX,
    centerY: safeCenterY,
    width,
    height,
    left,
    top,
    right: left + width,
    bottom: top + height
  };
};

const MENU_RESIZE_SETTLE_MS = 900;
const MENU_RESIZE_BUCKET_PX = 4;
const DEMO_TRAIL_COMMIT_PROGRESS = 0.62;

const buildViewportRestartKey = (viewport: ViewportSize): string => {
  const widthBucket = Math.round(sanitizePositive(viewport.width, DEFAULT_VIEWPORT_WIDTH, 0) / MENU_RESIZE_BUCKET_PX) * MENU_RESIZE_BUCKET_PX;
  const heightBucket = Math.round(sanitizePositive(viewport.height, DEFAULT_VIEWPORT_HEIGHT, 0) / MENU_RESIZE_BUCKET_PX) * MENU_RESIZE_BUCKET_PX;
  return `${widthBucket}x${heightBucket}`;
};

export const resolveMenuResizeRecoveryDecision = (
  currentViewport: ViewportSize,
  nextViewport: ViewportSize,
  sceneAgeMs: number,
  lastRestartKey?: string
): ResizeRecoveryDecision => {
  if (!nextViewport.measured) {
    return { shouldRestart: false };
  }

  if (sceneAgeMs < MENU_RESIZE_SETTLE_MS) {
    return { shouldRestart: false };
  }

  const widthDelta = Math.abs(sanitizePositive(nextViewport.width, 0, 0) - sanitizePositive(currentViewport.width, 0, 0));
  const heightDelta = Math.abs(sanitizePositive(nextViewport.height, 0, 0) - sanitizePositive(currentViewport.height, 0, 0));
  if (widthDelta < MENU_RESIZE_BUCKET_PX && heightDelta < MENU_RESIZE_BUCKET_PX) {
    return { shouldRestart: false };
  }

  const restartKey = buildViewportRestartKey(nextViewport);
  if (restartKey === lastRestartKey) {
    return { shouldRestart: false, restartKey };
  }

  return {
    shouldRestart: true,
    restartKey
  };
};

const DEMO_PACING_PROFILES: readonly MenuDemoCycle['pacing'][] = [
  { exploreStepMs: -10, goalHoldMs: 60, resetHoldMs: 36, spawnHoldMs: 34 },
  { exploreStepMs: -2, goalHoldMs: 16, resetHoldMs: 12, spawnHoldMs: 12 },
  { exploreStepMs: 8, goalHoldMs: 96, resetHoldMs: 44, spawnHoldMs: 24 }
] as const;

const DEMO_MOOD_PROFILES: Record<DemoMood, {
  solutionPathAlpha: number;
  trailWindowOffset: number;
  trailWindowScale: number;
  ambientDriftPx: number;
  ambientDriftMs: number;
  actorPulseBoost: number;
  persistentFadeFloor: number;
  trailPulseBoost: number;
  metadataAlpha: number;
  auraAlpha: number;
  haloAlpha: number;
  shadeAlpha: number;
}> = {
  solve: {
    solutionPathAlpha: 1,
    trailWindowOffset: 10,
    trailWindowScale: 1.04,
    ambientDriftPx: 2,
    ambientDriftMs: 3600,
    actorPulseBoost: 0.04,
    persistentFadeFloor: 0.38,
    trailPulseBoost: 0.018,
    metadataAlpha: 0.54,
    auraAlpha: 0.094,
    haloAlpha: 0.036,
    shadeAlpha: 0.024
  },
  scan: {
    solutionPathAlpha: 0.16,
    trailWindowOffset: -12,
    trailWindowScale: 0.36,
    ambientDriftPx: 2.5,
    ambientDriftMs: 4200,
    actorPulseBoost: 0.018,
    persistentFadeFloor: 0.28,
    trailPulseBoost: 0.01,
    metadataAlpha: 0.44,
    auraAlpha: 0.106,
    haloAlpha: 0.038,
    shadeAlpha: 0.038
  },
  blueprint: {
    solutionPathAlpha: 0.42,
    trailWindowOffset: -2,
    trailWindowScale: 0.62,
    ambientDriftPx: 1.6,
    ambientDriftMs: 4400,
    actorPulseBoost: 0.026,
    persistentFadeFloor: 0.33,
    trailPulseBoost: 0.014,
    metadataAlpha: 0.62,
    auraAlpha: 0.088,
    haloAlpha: 0.03,
    shadeAlpha: 0.024
  }
};

const VARIANT_PROFILES: Record<AmbientPresentationVariant, VariantProfile> = {
  title: {
    boardScaleWide: 0.982,
    boardScaleNarrow: 0.962,
    topReserveRatio: 0.118,
    topReserveMinPx: 104,
    bottomPaddingPx: 34,
    sidePaddingPx: 14,
    titleScale: 0.94,
    titleAlpha: 0.9,
    signatureAlpha: 0.62,
    passiveAlpha: 0.5,
    plateAlpha: 0.1,
    panelAlpha: 0.16,
    titleYOffsetRatio: 0.18,
    titleAnchor: 'center',
    titleDriftX: 0,
    titleDriftY: 0,
    titleDriftMs: 4000,
    titleLetterSpacingWide: 1,
    titleLetterSpacingNarrow: 0,
    solutionPathScale: 1.04,
    metadataAlphaScale: 0.84,
    flashAlphaScale: 0.92,
    boardAuraBias: -0.004,
    boardHaloBias: 0.006,
    boardShadeBias: -0.004,
    boardVeilBias: 0.01,
    boardOffsetRangeX: 6,
    boardOffsetRangeY: 4,
    hudOffsetRangeX: 8,
    hudOffsetRangeY: 4,
    driftScale: 0.88,
    actorPulseBias: 0.012
  },
  ambient: {
    boardScaleWide: 0.994,
    boardScaleNarrow: 0.978,
    topReserveRatio: 0.09,
    topReserveMinPx: 78,
    bottomPaddingPx: 30,
    sidePaddingPx: 12,
    titleScale: 0.78,
    titleAlpha: 0.5,
    signatureAlpha: 0.42,
    passiveAlpha: 0.38,
    plateAlpha: 0.07,
    panelAlpha: 0.14,
    titleYOffsetRatio: 0.11,
    titleAnchor: 'center',
    titleDriftX: 0,
    titleDriftY: 0,
    titleDriftMs: 4600,
    titleLetterSpacingWide: 2,
    titleLetterSpacingNarrow: 1,
    solutionPathScale: 0.78,
    metadataAlphaScale: 0.62,
    flashAlphaScale: 0,
    boardAuraBias: 0.022,
    boardHaloBias: 0.014,
    boardShadeBias: -0.006,
    boardVeilBias: -0.012,
    boardOffsetRangeX: 9,
    boardOffsetRangeY: 5,
    hudOffsetRangeX: 10,
    hudOffsetRangeY: 6,
    driftScale: 1.06,
    actorPulseBias: 0.004
  },
  loading: {
    boardScaleWide: 0.986,
    boardScaleNarrow: 0.968,
    topReserveRatio: 0.102,
    topReserveMinPx: 82,
    bottomPaddingPx: 40,
    sidePaddingPx: 14,
    titleScale: 0.84,
    titleAlpha: 0.66,
    signatureAlpha: 0.54,
    passiveAlpha: 0.46,
    plateAlpha: 0.1,
    panelAlpha: 0.16,
    titleYOffsetRatio: 0.13,
    titleAnchor: 'left',
    titleDriftX: 0,
    titleDriftY: 0,
    titleDriftMs: 3200,
    titleLetterSpacingWide: 2,
    titleLetterSpacingNarrow: 1,
    solutionPathScale: 0.92,
    metadataAlphaScale: 1.16,
    flashAlphaScale: 1.08,
    boardAuraBias: 0.022,
    boardHaloBias: 0.018,
    boardShadeBias: 0.014,
    boardVeilBias: 0.02,
    boardOffsetRangeX: 8,
    boardOffsetRangeY: 5,
    hudOffsetRangeX: 10,
    hudOffsetRangeY: 4,
    driftScale: 0.86,
    actorPulseBias: 0.01
  }
};

const CHROME_PROFILES: Record<PresentationChrome, ChromeProfile> = {
  full: {
    boardScaleBias: 0,
    topReserveBias: 0,
    bottomPaddingBias: 0,
    sidePaddingBias: 0,
    titleScale: 1,
    titleAlpha: 1,
    signatureAlpha: 1,
    passiveAlpha: 1,
    plateAlpha: 1,
    panelAlpha: 1
  },
  minimal: {
    boardScaleBias: 0.004,
    topReserveBias: -12,
    bottomPaddingBias: 0,
    sidePaddingBias: 0,
    titleScale: 0.88,
    titleAlpha: 0.58,
    signatureAlpha: 0.56,
    passiveAlpha: 0.54,
    plateAlpha: 0.5,
    panelAlpha: 0.58
  },
  none: {
    boardScaleBias: 0.022,
    topReserveBias: -64,
    bottomPaddingBias: -10,
    sidePaddingBias: -2,
    titleScale: 0,
    titleAlpha: 0,
    signatureAlpha: 0,
    passiveAlpha: 0,
    plateAlpha: 0,
    panelAlpha: 0
  }
};

const DEFAULT_DEPLOYMENT_PRESENTATION_PROFILE: DeploymentPresentationProfile = {
  boardScaleBias: 0,
  portraitBoardScaleBias: 0,
  topReserveBias: 0,
  portraitTopReserveBias: 0,
  bottomPaddingBias: 0,
  sidePaddingBias: 0,
  maxBoardScale: 0.996,
  titlePlateWidthScale: 1,
  titlePlateHeightScale: 1,
  titleLineSpacingScale: 1,
  titleYOffsetBias: 0,
  titleAlphaScale: 1,
  signatureAlphaScale: 1,
  passiveAlphaScale: 1,
  plateAlphaScale: 1,
  panelAlphaScale: 1,
  offsetScale: 1,
  driftScale: 1,
  driftDurationScale: 1,
  metadataAlphaScale: 1,
  flashAlphaScale: 1,
  boardAuraBiasScale: 1,
  boardHaloBiasScale: 1,
  boardShadeBiasScale: 1,
  boardVeilBiasScale: 1,
  boardAuraMotionScale: 1,
  boardHaloMotionScale: 1
};

const DEPLOYMENT_PRESENTATION_PROFILES: Record<PresentationDeploymentProfile, DeploymentPresentationProfile> = {
  tv: {
    boardScaleBias: 0.014,
    portraitBoardScaleBias: -0.006,
    topReserveBias: -8,
    portraitTopReserveBias: 6,
    bottomPaddingBias: 0,
    sidePaddingBias: -4,
    maxBoardScale: 0.996,
    titlePlateWidthScale: 0.92,
    titlePlateHeightScale: 0.96,
    titleLineSpacingScale: 1,
    titleYOffsetBias: -4,
    titleAlphaScale: 1.8,
    signatureAlphaScale: 1.4,
    passiveAlphaScale: 1.2,
    plateAlphaScale: 1.6,
    panelAlphaScale: 1.6,
    offsetScale: 0.56,
    driftScale: 0.72,
    driftDurationScale: 1.34,
    metadataAlphaScale: 0.72,
    flashAlphaScale: 0.6,
    boardAuraBiasScale: 1,
    boardHaloBiasScale: 1,
    boardShadeBiasScale: 1,
    boardVeilBiasScale: 1,
    boardAuraMotionScale: 1,
    boardHaloMotionScale: 1
  },
  obs: {
    boardScaleBias: 0.01,
    portraitBoardScaleBias: -0.01,
    topReserveBias: -8,
    portraitTopReserveBias: 8,
    bottomPaddingBias: 6,
    sidePaddingBias: 10,
    maxBoardScale: 0.968,
    titlePlateWidthScale: 0.9,
    titlePlateHeightScale: 0.94,
    titleLineSpacingScale: 1,
    titleYOffsetBias: -2,
    titleAlphaScale: 1,
    signatureAlphaScale: 1,
    passiveAlphaScale: 1,
    plateAlphaScale: 1,
    panelAlphaScale: 1,
    offsetScale: 0,
    driftScale: 0,
    driftDurationScale: 1,
    metadataAlphaScale: 0.82,
    flashAlphaScale: 0.72,
    boardAuraBiasScale: 0,
    boardHaloBiasScale: 0,
    boardShadeBiasScale: 0.4,
    boardVeilBiasScale: 0.6,
    boardAuraMotionScale: 0.25,
    boardHaloMotionScale: 0.25
  },
  mobile: {
    boardScaleBias: -0.046,
    portraitBoardScaleBias: -0.03,
    topReserveBias: 18,
    portraitTopReserveBias: 18,
    bottomPaddingBias: 12,
    sidePaddingBias: 12,
    maxBoardScale: 0.996,
    titlePlateWidthScale: 1.02,
    titlePlateHeightScale: 1.2,
    titleLineSpacingScale: 1.12,
    titleYOffsetBias: 10,
    titleAlphaScale: 1,
    signatureAlphaScale: 1,
    passiveAlphaScale: 1,
    plateAlphaScale: 1,
    panelAlphaScale: 1,
    offsetScale: 0.76,
    driftScale: 0.9,
    driftDurationScale: 1.08,
    metadataAlphaScale: 1.08,
    flashAlphaScale: 1,
    boardAuraBiasScale: 1,
    boardHaloBiasScale: 1,
    boardShadeBiasScale: 1,
    boardVeilBiasScale: 1,
    boardAuraMotionScale: 1,
    boardHaloMotionScale: 1
  }
};

const CURATED_MOOD_PATTERNS: readonly MoodPattern[] = [
  ['solve', 'scan', 'solve', 'blueprint', 'solve', 'scan', 'solve', 'solve'],
  ['solve', 'solve', 'scan', 'solve', 'blueprint', 'solve', 'scan', 'solve'],
  ['solve', 'scan', 'solve', 'solve', 'blueprint', 'solve', 'solve', 'scan'],
  ['solve', 'solve', 'scan', 'solve', 'solve', 'blueprint', 'scan', 'solve']
] as const;

const ANIMATION_TIME_WRAP_MS = 600_000;

export interface MenuPresentationModel {
  viewport: ViewportSize;
  layout: SceneLayoutProfile;
}

export interface PresentationBackdropFrame {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const resolveDeploymentPresentationProfile = (
  profile: PresentationDeploymentProfile | null | undefined
): DeploymentPresentationProfile => (
  profile ? DEPLOYMENT_PRESENTATION_PROFILES[profile] : DEFAULT_DEPLOYMENT_PRESENTATION_PROFILE
);

export const resolveAmbientThemeProfile = (theme: PresentationThemeFamily): AmbientThemeProfile => (
  THEME_PROFILES[theme]
);

export interface TitleBandFrame {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  reservedRight: number;
}

export interface InstallChromeFrame {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export const MENU_SCENE_VISUAL_CAPTURE_KEY = '__MAZER_VISUAL_CAPTURE__' as const;
export const MENU_SCENE_VISUAL_DIAGNOSTICS_KEY = '__MAZER_VISUAL_DIAGNOSTICS__' as const;

type VisualCaptureInstallMode = InstallSurfaceState['mode'];

export interface VisualSceneBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface MenuSceneVisualCaptureConfig {
  enabled: boolean;
  forceInstallMode?: VisualCaptureInstallMode;
  manualInstallInstruction?: string;
}

export interface MenuSceneVisualDiagnostics {
  revision: number;
  updatedAt: number;
  variant: AmbientPresentationVariant;
  chrome: PresentationChrome;
  profile?: PresentationDeploymentProfile;
  theme: PresentationThemeFamily;
  viewport: {
    width: number;
    height: number;
    safeInsets: ViewportSafeInsets;
  };
  board: {
    bounds: BoardBounds;
    safeBounds: BoardBounds;
    tileSize: number;
  };
  title: {
    expected: boolean;
    visible: boolean;
    frame?: TitleBandFrame;
    bounds?: VisualSceneBounds;
    textBounds?: VisualSceneBounds;
  };
  install: {
    expected: boolean;
    visible: boolean;
    forced: boolean;
    state: InstallSurfaceState['mode'];
    frame?: InstallChromeFrame;
    bounds?: VisualSceneBounds;
  };
  trail: {
    start: number;
    limit: number;
    currentIndex: number;
    nextIndex: number;
    progress: number;
    cue: DemoWalkerCue;
    suppressesFuturePreview: boolean;
    attachedToActor: boolean;
    bridgeRendered: boolean;
    render: TrailRenderDiagnostics;
  };
  paletteReadability: PaletteReadabilityReport;
}

declare global {
  interface Window {
    __MAZER_VISUAL_CAPTURE__?: Partial<MenuSceneVisualCaptureConfig>;
    __MAZER_VISUAL_DIAGNOSTICS__?: MenuSceneVisualDiagnostics;
  }
}

const resolveRuntimeWindow = (): Window | undefined => (
  typeof window === 'undefined' ? undefined : window
);

const isVisualCaptureInstallMode = (value: unknown): value is VisualCaptureInstallMode => (
  value === 'hidden' || value === 'available' || value === 'manual'
);

export const resolveMenuSceneVisualCaptureConfig = (
  source: Pick<Window, typeof MENU_SCENE_VISUAL_CAPTURE_KEY> | undefined = resolveRuntimeWindow()
): MenuSceneVisualCaptureConfig => {
  const raw = source?.[MENU_SCENE_VISUAL_CAPTURE_KEY];
  if (!raw || raw.enabled !== true) {
    return { enabled: false };
  }

  return {
    enabled: true,
    ...(isVisualCaptureInstallMode(raw.forceInstallMode)
      ? { forceInstallMode: raw.forceInstallMode }
      : {}),
    ...(typeof raw.manualInstallInstruction === 'string' && raw.manualInstallInstruction.trim().length > 0
      ? { manualInstallInstruction: raw.manualInstallInstruction.trim() }
      : {})
  };
};

export const resolveMenuSceneInstallSurfaceState = (
  state: InstallSurfaceState,
  captureConfig: MenuSceneVisualCaptureConfig
): InstallSurfaceState => {
  if (!captureConfig.enabled || !captureConfig.forceInstallMode) {
    return state;
  }

  if (captureConfig.forceInstallMode === 'available') {
    return {
      mode: 'available',
      canPrompt: true,
      installed: false,
      standalone: false
    };
  }

  if (captureConfig.forceInstallMode === 'manual') {
    return {
      mode: 'manual',
      canPrompt: false,
      installed: false,
      standalone: false,
      instruction: captureConfig.manualInstallInstruction ?? 'Add to Home Screen'
    };
  }

  return {
    mode: 'hidden',
    canPrompt: false,
    installed: false,
    standalone: false
  };
};

const toVisualSceneBounds = (
  bounds?: { x: number; y: number; width: number; height: number } | null
): VisualSceneBounds | undefined => {
  if (!bounds || !isFiniteNumber(bounds.x) || !isFiniteNumber(bounds.y) || !isFiniteNumber(bounds.width) || !isFiniteNumber(bounds.height)) {
    return undefined;
  }

  return {
    left: bounds.x,
    top: bounds.y,
    right: bounds.x + bounds.width,
    bottom: bounds.y + bounds.height,
    width: bounds.width,
    height: bounds.height,
    centerX: bounds.x + (bounds.width / 2),
    centerY: bounds.y + (bounds.height / 2)
  };
};

const publishMenuSceneVisualDiagnostics = (diagnostics: MenuSceneVisualDiagnostics): void => {
  const runtime = resolveRuntimeWindow();
  if (!runtime) {
    return;
  }

  runtime[MENU_SCENE_VISUAL_DIAGNOSTICS_KEY] = diagnostics;
};

const clearMenuSceneVisualDiagnostics = (): void => {
  const runtime = resolveRuntimeWindow();
  if (!runtime || !(MENU_SCENE_VISUAL_DIAGNOSTICS_KEY in runtime)) {
    return;
  }

  delete runtime[MENU_SCENE_VISUAL_DIAGNOSTICS_KEY];
};

export function resolveMenuPresentationModel(
  width: number,
  height: number,
  variant: AmbientPresentationVariant,
  chrome: PresentationChrome = DEFAULT_PRESENTATION_CHROME,
  titleVisible = true,
  profile?: PresentationDeploymentProfile,
  safeInsets?: Partial<ViewportSafeInsets> | null
): MenuPresentationModel {
  const viewport = resolveViewportSize(width, height, DEFAULT_VIEWPORT_WIDTH, DEFAULT_VIEWPORT_HEIGHT);

  return {
    viewport,
    layout: resolveSceneLayoutProfile(viewport.width, viewport.height, variant, chrome, titleVisible, profile, safeInsets)
  };
}

export function resolveTitleBandFrame(
  viewportWidth: number,
  sceneLayout: SceneLayoutProfile,
  boardLayout: BoardLayout,
  safeInsets?: Partial<ViewportSafeInsets> | null
): TitleBandFrame {
  const viewportSafeInsets = sanitizeViewportSafeInsets(safeInsets);
  const compact = sceneLayout.isTiny || sceneLayout.isNarrow;
  const bandInset = compact ? 14 : 18;
  const reservedRight = 0;
  const left = Math.max(viewportSafeInsets.left + bandInset, sceneLayout.sidePadding + bandInset);
  const right = Math.max(
    left + (compact ? 104 : 132),
    viewportWidth - Math.max(viewportSafeInsets.right + bandInset, sceneLayout.sidePadding + bandInset)
  );
  const top = Math.max(viewportSafeInsets.top + bandInset, bandInset);
  const minBandHeight = compact ? 40 : 48;
  const bandGap = Math.max(compact ? 12 : 18, Math.round(boardLayout.tileSize * (compact ? 1.08 : 1.35)));
  const bottom = Math.max(
    top + minBandHeight,
    Math.min(
      boardLayout.safeBounds.top - bandInset,
      boardLayout.boardY - bandGap
    )
  );

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    centerX: left + ((right - left) / 2),
    centerY: top + ((bottom - top) / 2),
    reservedRight
  };
}

export function resolveInstallChromeFrame(
  viewportWidth: number,
  viewportHeight: number,
  sceneLayout: SceneLayoutProfile,
  boardLayout: BoardLayout,
  chipWidth: number,
  chipHeight: number,
  safeInsets?: Partial<ViewportSafeInsets> | null
): InstallChromeFrame {
  const viewportSafeInsets = sanitizeViewportSafeInsets(safeInsets);
  const compact = sceneLayout.isTiny || sceneLayout.isNarrow;
  const safeWidth = sanitizePositive(viewportWidth, DEFAULT_VIEWPORT_WIDTH, 1);
  const safeHeight = sanitizePositive(viewportHeight, DEFAULT_VIEWPORT_HEIGHT, 1);
  const horizontalInset = Math.max(viewportSafeInsets.left, viewportSafeInsets.right) + (compact ? 10 : 12);
  const laneTop = boardLayout.safeBounds.bottom + (compact ? 6 : 8);
  const laneBottom = safeHeight - Math.max(viewportSafeInsets.bottom + (compact ? 12 : 14), 12);
  const minCenterY = laneTop + (chipHeight / 2);
  const maxCenterY = laneBottom - (chipHeight / 2);
  const centerX = Phaser.Math.Clamp(
    safeWidth / 2,
    horizontalInset + (chipWidth / 2),
    safeWidth - horizontalInset - (chipWidth / 2)
  );
  const centeredLaneY = laneTop + ((laneBottom - laneTop) / 2);
  const centerY = maxCenterY < minCenterY
    ? maxCenterY
    : Phaser.Math.Clamp(centeredLaneY, minCenterY, maxCenterY);
  const left = Math.round(centerX - (chipWidth / 2));
  const top = Math.round(centerY - (chipHeight / 2));

  return {
    left,
    top,
    right: left + chipWidth,
    bottom: top + chipHeight,
    width: chipWidth,
    height: chipHeight,
    centerX,
    centerY
  };
}

export class MenuScene extends Phaser.Scene {
  private titlePulseTween?: Phaser.Tweens.Tween;
  private titleDriftTween?: Phaser.Tweens.Tween;
  private starDriftTween?: Phaser.Tweens.Tween;
  private presentationVariant: AmbientPresentationVariant = DEFAULT_PRESENTATION_VARIANT;
  private launchConfig: PresentationLaunchConfig = { ...DEFAULT_PRESENTATION_LAUNCH_CONFIG };
  private activeTheme: PresentationThemeFamily = PRESENTATION_THEME_FAMILIES[0];

  public constructor() {
    super('MenuScene');
  }

  public init(data: MenuSceneInitData = {}): void {
    this.launchConfig = sanitizePresentationLaunchConfig(data);
    this.presentationVariant = sanitizePresentationVariant(this.launchConfig.presentation);
  }

  public create(): void {
    const launchConfig = sanitizePresentationLaunchConfig(this.launchConfig);
    const variant = sanitizePresentationVariant(launchConfig.presentation);
    const chrome = resolveEffectivePresentationChrome(launchConfig);
    const titleVisible = shouldShowPresentationTitle(launchConfig);
    const deploymentProfileId = launchConfig.profile;
    const deploymentProfile = resolveDeploymentPresentationProfile(deploymentProfileId);
    const deterministicCapture = isDeterministicPresentationCapture(launchConfig);
    const moodOverride = resolveForcedDemoMood(launchConfig.mood);
    const viewportSafeInsets = resolveViewportSafeInsets();
    const presentationModel = resolveMenuPresentationModel(
      this.scale.width,
      this.scale.height,
      variant,
      chrome,
      titleVisible,
      deploymentProfileId,
      viewportSafeInsets
    );
    const { width, height } = presentationModel.viewport;
    const visualCaptureConfig = resolveMenuSceneVisualCaptureConfig();
    const reducedMotion = prefersReducedMotion();
    const variantProfile = VARIANT_PROFILES[variant];
    const chromeProfile = CHROME_PROFILES[chrome];
    const sceneLayout = presentationModel.layout;
    const sceneStartedAt = this.time.now;
    let visualDiagnosticsRevision = 0;
    let recoveryActivated = false;
    let recoveryEpisode: MazeEpisode | undefined;
    let patternEngine: PatternEngine | undefined;
    let patternFrame: PatternFrame | undefined;
    let episodePresentationShell: EpisodePresentationShell | undefined;
    let resizeRestart: Phaser.Time.TimerEvent | undefined;
    let lastResizeRestartKey: string | undefined;
    let handleVisibilityChange: (() => void) | undefined;
    let handleResize: ((gameSize?: { width?: number; height?: number }) => void) | undefined;
    let removeInstallSurfaceListener: (() => void) | undefined;
    let updateDemo: ((time: number, delta: number) => void) | undefined;
    let activeTitleBandFrame: TitleBandFrame | undefined;
    let activeTitleContainer: Phaser.GameObjects.Container | undefined;
    let activeTitleText: Phaser.GameObjects.Text | undefined;
    let activeInstallFrame: InstallChromeFrame | undefined;
    let activeInstallBounds: VisualSceneBounds | undefined;
    let activeInstallState: InstallSurfaceState = resolveMenuSceneInstallSurfaceState(getInstallSurfaceState(), visualCaptureConfig);

    const runOptional = (label: string, render: () => void): void => {
      try {
        render();
      } catch (error) {
        console.error(`MenuScene optional ${label} skipped.`, error);
      }
    };
    const removeRuntimeListeners = (options: { keepResize?: boolean } = {}): void => {
      if (typeof document !== 'undefined' && handleVisibilityChange) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (!options.keepResize && handleResize) {
        this.scale.off(Phaser.Scale.Events.RESIZE, handleResize);
      }
      if (updateDemo) {
        this.events.off(Phaser.Scenes.Events.UPDATE, updateDemo);
      }
      removeInstallSurfaceListener?.();
      handleVisibilityChange = undefined;
      if (!options.keepResize) {
        handleResize = undefined;
      }
      removeInstallSurfaceListener = undefined;
      updateDemo = undefined;
    };
    const destroyEpisodePresentationShell = (): void => {
      if (!episodePresentationShell) {
        return;
      }

      this.tweens.killTweensOf([
        episodePresentationShell.boardAura,
        episodePresentationShell.boardHalo,
        episodePresentationShell.boardShade,
        episodePresentationShell.boardVeil
      ]);
      episodePresentationShell.demoStatusHud.destroy();
      episodePresentationShell.boardRenderer.destroy();
      episodePresentationShell.motifSecondary.destroy();
      episodePresentationShell.motifPrimary.destroy();
      episodePresentationShell.blueprintAccent.destroy();
      episodePresentationShell.boardVeil.destroy();
      episodePresentationShell.boardShade.destroy();
      episodePresentationShell.boardHalo.destroy();
      episodePresentationShell.boardAura.destroy();
      episodePresentationShell = undefined;
    };
    const destroyPresentation = (destroyEngine: boolean): void => {
      resizeRestart?.remove(false);
      resizeRestart = undefined;
      this.titlePulseTween?.remove();
      this.titlePulseTween = undefined;
      this.titleDriftTween?.remove();
      this.titleDriftTween = undefined;
      this.starDriftTween?.remove();
      this.starDriftTween = undefined;
      destroyEpisodePresentationShell();
      if (destroyEngine) {
        patternEngine?.destroy();
        patternEngine = undefined;
      }
      this.time.removeAllEvents();
      this.tweens.killAll();
      this.children.removeAll(true);
      activeTitleBandFrame = undefined;
      activeTitleContainer = undefined;
      activeTitleText = undefined;
      activeInstallFrame = undefined;
      activeInstallBounds = undefined;
      clearMenuSceneVisualDiagnostics();
    };
    const renderVisibleRecovery = (): void => {
      const viewport = resolveSceneViewport(this);
      destroyPresentation(false);
      this.renderRecoveryShell(viewport.width, viewport.height, recoveryEpisode);
    };
    const failOpen = (error: unknown): void => {
      if (recoveryActivated) {
        return;
      }

      recoveryActivated = true;
      recoveryEpisode = patternFrame?.episode;
      console.error('MenuScene failed open to recovery shell.', error);
      removeRuntimeListeners({ keepResize: true });
      renderVisibleRecovery();
    };

    try {
      this.cameras.main.roundPixels = true;
      this.cameras.main.fadeIn(reducedMotion ? 0 : variant === 'loading' ? 220 : 280, 0, 0, 0);
      const themeLock = launchConfig.theme === 'auto' ? undefined : launchConfig.theme;
      const familyLock = launchConfig.family && launchConfig.family !== 'auto' ? launchConfig.family : undefined;
      const scheduleSeed = launchConfig.seed ?? legacyTuning.demo.seed;
      let demoSeed = launchConfig.seed ?? legacyTuning.demo.seed;
      let demoCycle = 0;
      let pendingCyclePlan: MenuDemoCycle | undefined;
      patternEngine = new PatternEngine(() => {
        const cycleSeed = deterministicCapture ? (launchConfig.seed ?? demoSeed) : demoSeed;
        const cycle = resolveMenuDemoCycle(scheduleSeed, deterministicCapture ? 0 : demoCycle, {
          difficulty: launchConfig.difficulty,
          size: launchConfig.size,
          mood: moodOverride,
          theme: themeLock,
          family: familyLock
        });
        pendingCyclePlan = cycle;
        const resolved = generateMazeForDifficulty({
          scale: legacyTuning.board.scale,
          seed: cycleSeed,
          size: cycle.size,
          family: cycle.family,
          presentationPreset: cycle.presentationPreset,
          checkPointModifier: cycle.entropy.checkPointModifier,
          shortcutCountModifier: cycle.entropy.shortcutCountModifier
        }, cycle.difficulty);

        if (!deterministicCapture) {
          demoSeed += legacyTuning.demo.behavior.regenerateSeedStep;
          demoCycle += 1;
        }

        return resolved.episode;
      }, resolvePatternEngineMode(variant));
      patternFrame = patternEngine.next(0);
      recoveryEpisode = patternFrame.episode;
      let demoCyclePlan = pendingCyclePlan ?? resolveMenuDemoCycle(scheduleSeed, 0, {
        difficulty: launchConfig.difficulty,
        size: launchConfig.size,
        mood: moodOverride,
        theme: themeLock,
        family: familyLock
      });
      pendingCyclePlan = undefined;
      this.activeTheme = demoCyclePlan.theme;
      const sceneThemeProfile = resolveAmbientThemeProfile(demoCyclePlan.theme);
      this.drawStarfield(width, height, sceneThemeProfile);
      let sceneHidden = typeof document !== 'undefined' && document.hidden;
      const publishVisualDiagnostics = (
        view?: DemoWalkerViewFrame,
        renderedTrail?: { start: number; limit: number }
      ): void => {
        if (!visualCaptureConfig.enabled || !episodePresentationShell) {
          return;
        }

        const themeProfile = resolveAmbientThemeProfile(this.activeTheme);
        const trailRender = episodePresentationShell.boardRenderer.getTrailRenderDiagnostics();
        const activePath = patternFrame?.episode.raster.pathIndices;
        const renderedHeadIndex = renderedTrail && activePath && renderedTrail.limit > 0
          ? activePath[renderedTrail.limit - 1] ?? null
          : null;
        const expectedTrailHeadIndex = view
          ? (
            view.currentIndex === view.nextIndex || view.progress >= DEMO_TRAIL_COMMIT_PROGRESS
              ? view.nextIndex
              : view.currentIndex
          )
          : null;
        const titleBounds = activeTitleContainer ? toVisualSceneBounds(activeTitleContainer.getBounds()) : undefined;
        const titleTextBounds = activeTitleText ? toVisualSceneBounds(activeTitleText.getBounds()) : undefined;

        publishMenuSceneVisualDiagnostics({
          revision: ++visualDiagnosticsRevision,
          updatedAt: this.time.now,
          variant,
          chrome,
          ...(deploymentProfileId ? { profile: deploymentProfileId } : {}),
          theme: this.activeTheme,
          viewport: {
            width,
            height,
            safeInsets: viewportSafeInsets
          },
          board: {
            bounds: episodePresentationShell.layout.boardBounds,
            safeBounds: episodePresentationShell.layout.safeBounds,
            tileSize: episodePresentationShell.layout.tileSize
          },
          title: {
            expected: titleVisible,
            visible: titleVisible && titleBounds !== undefined,
            ...(activeTitleBandFrame ? { frame: activeTitleBandFrame } : {}),
            ...(titleBounds ? { bounds: titleBounds } : {}),
            ...(titleTextBounds ? { textBounds: titleTextBounds } : {})
          },
          install: {
            expected: activeInstallState.mode !== 'hidden',
            visible: activeInstallState.mode !== 'hidden' && activeInstallBounds !== undefined,
            forced: visualCaptureConfig.forceInstallMode !== undefined,
            state: activeInstallState.mode,
            ...(activeInstallFrame ? { frame: activeInstallFrame } : {}),
            ...(activeInstallBounds ? { bounds: activeInstallBounds } : {})
          },
          trail: {
            start: renderedTrail?.start ?? trailRender.trailStart,
            limit: renderedTrail?.limit ?? trailRender.trailLimit,
            currentIndex: view?.currentIndex ?? patternFrame?.episode.raster.startIndex ?? 0,
            nextIndex: view?.nextIndex ?? patternFrame?.episode.raster.startIndex ?? 0,
            progress: view?.progress ?? 0,
            cue: view?.cue ?? 'spawn',
            suppressesFuturePreview: expectedTrailHeadIndex === null || renderedHeadIndex === expectedTrailHeadIndex,
            attachedToActor: trailRender.attachedToActor,
            bridgeRendered: trailRender.bridgeRendered,
            render: trailRender
          },
          paletteReadability: getPaletteReadabilityReport(themeProfile.palette)
        });
      };
      const createEpisodePresentationShell = (
        episode: MazeEpisode,
        themeId: PresentationThemeFamily
      ): EpisodePresentationShell => {
        const themeProfile = resolveAmbientThemeProfile(themeId);
        const layout = createBoardLayout(this, episode, {
          boardScale: sceneLayout.boardScale
            + (resolveBoardScaleFromCamScale(legacyTuning.camera.camScaleDefault) - legacyTuning.camera.normalizedBaseline),
          topReserve: sceneLayout.topReserve,
          sidePadding: sceneLayout.sidePadding,
          bottomPadding: sceneLayout.bottomPadding
        });
        const boardCenterX = layout.boardX + (layout.boardWidth / 2);
        const boardCenterY = layout.boardY + (layout.boardHeight / 2);
        // Keep the backdrop field viewport-filling while the board itself stays inside the safe frame.
        const backdropFrame = resolvePresentationBackdropFrame(width, height, boardCenterX, boardCenterY);
        const boardShellWidth = Math.max(24, Math.round(layout.boardWidth + (layout.tileSize * 10)));
        const boardShellHeight = Math.max(24, Math.round(layout.boardHeight + (layout.tileSize * 10)));
        const boardAuraWidth = Math.max(24, Math.round(layout.boardWidth * 1.22));
        const boardAuraHeight = Math.max(24, Math.round(layout.boardHeight * 1.18));
        const boardHaloWidth = Math.max(20, Math.round(layout.boardWidth * 1.08));
        const boardHaloHeight = Math.max(20, Math.round(layout.boardHeight * 1.08));
        const boardRenderer = new BoardRenderer(this, episode, layout, {
          theme: {
            ...themeProfile.boardTheme,
            palette: themeProfile.palette
          }
        });
        boardRenderer.drawBoardChrome();

        const boardAura = this.add.ellipse(
          backdropFrame.centerX,
          backdropFrame.centerY,
          boardAuraWidth,
          boardAuraHeight,
          themeProfile.shell.auraColor,
          0.032
        ).setOrigin(0.5).setDepth(-2.5).setBlendMode(Phaser.BlendModes.SCREEN);
        const boardHalo = this.add.ellipse(
          backdropFrame.centerX,
          backdropFrame.centerY,
          boardHaloWidth,
          boardHaloHeight,
          themeProfile.shell.haloColor,
          0.012
        ).setOrigin(0.5).setDepth(-1.8).setBlendMode(Phaser.BlendModes.SCREEN);
        const boardShade = this.add.rectangle(
          backdropFrame.centerX,
          backdropFrame.centerY,
          boardShellWidth,
          boardShellHeight,
          themeProfile.shell.shadeColor,
          0.012
        ).setOrigin(0.5).setDepth(-1.2);
        const boardVeil = this.add.rectangle(
          backdropFrame.centerX,
          backdropFrame.centerY,
          Math.max(18, layout.boardWidth + 2),
          Math.max(18, layout.boardHeight + 2),
          themeProfile.shell.veilColor,
          0
        ).setOrigin(0.5).setDepth(7.2);
        const blueprintAccent = this.add.graphics().setDepth(7.1).setBlendMode(Phaser.BlendModes.SCREEN);
        const motifPrimary = this.add.graphics().setDepth(5.8);
        const motifSecondary = this.add.graphics().setDepth(6.15);
        runOptional('blueprint accent setup', () => {
          drawBlueprintAccent(blueprintAccent, layout, themeProfile.palette.board.topHighlight);
        });
        runOptional('theme motif setup', () => {
          drawThemeMotifs(themeProfile, motifPrimary, motifSecondary, layout);
        });

        return {
          layout,
          boardCenterX,
          boardCenterY,
          boardRenderer,
          demoStatusHud: createDemoStatusHud(this, layout, {
            reducedMotion,
            chrome,
            profile: deploymentProfileId,
            theme: {
              ...themeProfile.hudTheme,
              palette: themeProfile.palette
            }
          }),
          boardAura,
          boardHalo,
          boardShade,
          boardVeil,
          blueprintAccent,
          motifPrimary,
          motifSecondary
        };
      };
      episodePresentationShell = createEpisodePresentationShell(patternFrame.episode, demoCyclePlan.theme);
      const layout = episodePresentationShell.layout;
      let installPromptPending = false;
      const installChrome = this.add.container(0, 0).setDepth(11);
      const renderInstallChrome = (state: InstallSurfaceState = getInstallSurfaceState()): void => {
        const resolvedState = resolveMenuSceneInstallSurfaceState(state, visualCaptureConfig);
        installChrome.removeAll(true);
        activeInstallState = resolvedState;
        activeInstallBounds = undefined;
        activeInstallFrame = undefined;

        if (resolvedState.mode === 'hidden') {
          installChrome.setVisible(false);
          return;
        }

        const compactInstall = sceneLayout.isTiny || sceneLayout.isNarrow;
        const labelText = resolvedState.mode === 'manual'
          ? (resolvedState.instruction ?? 'Add to Home Screen')
          : installPromptPending
            ? (compactInstall ? 'Install...' : 'Install Mazer...')
            : (compactInstall ? 'Install' : 'Install Mazer');
        const label = this.add.text(0, 0, labelText, {
          color: resolvedState.mode === 'available'
            ? (installPromptPending ? sceneThemeProfile.title.pendingColor : sceneThemeProfile.title.installColor)
            : sceneThemeProfile.title.supportColor,
          fontFamily: sceneThemeProfile.title.supportFontFamily,
          fontSize: `${compactInstall ? 9 : 10}px`,
          fontStyle: resolvedState.mode === 'available' ? 'bold' : 'normal',
          wordWrap: resolvedState.mode === 'manual'
            ? {
              width: Math.max(152, Math.min(264, width * (compactInstall ? 0.56 : 0.4))),
              useAdvancedWrap: true
            }
            : undefined
        }).setOrigin(0.5).setLetterSpacing(compactInstall ? 1 : 2);
        const chipWidth = Phaser.Math.Clamp(
          Math.ceil(label.width + (compactInstall ? 22 : 28)),
          resolvedState.mode === 'manual' ? 164 : (compactInstall ? 96 : 126),
          Math.max(
            resolvedState.mode === 'manual' ? 164 : (compactInstall ? 96 : 126),
            Math.round(width * (resolvedState.mode === 'manual' ? (compactInstall ? 0.66 : 0.46) : compactInstall ? 0.36 : 0.24))
          )
        );
        const chipHeight = Math.max(compactInstall ? 23 : 25, Math.ceil(label.height + (compactInstall ? 12 : 14)));
        const installFrame = resolveInstallChromeFrame(
          width,
          height,
          sceneLayout,
          layout,
          chipWidth,
          chipHeight,
          viewportSafeInsets
        );
        activeInstallFrame = installFrame;

        installChrome.setVisible(true);
        installChrome.setPosition(installFrame.centerX, installFrame.centerY);

        const shadow = this.add.rectangle(0, 3, chipWidth + 6, chipHeight + 6, sceneThemeProfile.title.plateShadowColor, 0.18);
        const chip = this.add.rectangle(
          0,
          0,
          chipWidth,
          chipHeight,
          sceneThemeProfile.title.buttonFillColor,
          resolvedState.mode === 'manual'
            ? 0.22
            : installPromptPending
              ? 0.24
              : 0.32
        ).setStrokeStyle(
          1,
          sceneThemeProfile.title.buttonStrokeColor,
          resolvedState.mode === 'manual'
            ? 0.18
            : installPromptPending
              ? 0.16
              : 0.32
        );
        const accent = this.add.rectangle(
          0,
          -(chipHeight / 2) + 3,
          Math.max(18, chipWidth - 14),
          2,
          sceneThemeProfile.title.buttonStrokeColor,
          resolvedState.mode === 'manual' ? 0.1 : 0.16
        );

        if (resolvedState.mode === 'available' && !installPromptPending) {
          const setChipState = (hovered: boolean): void => {
            chip.setFillStyle(
              sceneThemeProfile.title.buttonFillColor,
              hovered ? 0.42 : 0.32
            );
            chip.setStrokeStyle(1, sceneThemeProfile.title.buttonStrokeColor, hovered ? 0.42 : 0.32);
            label.setAlpha(hovered ? 1 : 0.96);
          };

          chip.setInteractive({ useHandCursor: true });
          chip.on('pointerover', () => {
            setChipState(true);
          });
          chip.on('pointerout', () => {
            setChipState(false);
          });
          chip.on('pointerup', () => {
            if (installPromptPending) {
              return;
            }

            installPromptPending = true;
            renderInstallChrome();
            void promptInstallSurface()
              .catch((error) => {
                console.error('MenuScene install prompt failed open.', error);
              })
              .finally(() => {
                installPromptPending = false;
                renderInstallChrome();
              });
          });
          setChipState(false);
        } else {
          label.setAlpha(resolvedState.mode === 'manual' ? 0.9 : 0.8);
        }

        installChrome.add([shadow, chip, accent, label]);
        activeInstallBounds = toVisualSceneBounds(chip.getBounds());
      };
      renderInstallChrome();
      removeInstallSurfaceListener = subscribeInstallSurface((state) => {
        try {
          renderInstallChrome(state);
        } catch (error) {
          console.error('MenuScene optional install surface skipped.', error);
        }
      });

      activeTitleBandFrame = undefined;
      activeTitleContainer = undefined;
      activeTitleText = undefined;
      if (titleVisible) {
        const titleBandFrame = resolveTitleBandFrame(width, sceneLayout, layout, viewportSafeInsets);
        activeTitleBandFrame = titleBandFrame;
        const titlePlateMaxWidth = Math.max(112, titleBandFrame.width - 18);
        const titlePlateWidth = Phaser.Math.Clamp(
          Math.round(
            layout.boardSize
              * (sceneLayout.isNarrow ? 0.5 : legacyTuning.menu.title.plateWidthRatio + 0.01)
              * variantProfile.titleScale
              * chromeProfile.titleScale
              * deploymentProfile.titlePlateWidthScale
          ),
          Math.min(variantProfile.titleAnchor === 'left' ? 212 : 224, titlePlateMaxWidth),
          Math.max(Math.min(sceneLayout.isPortrait ? 332 : 388, titlePlateMaxWidth), 112)
        );
        const titlePlateHeight = Phaser.Math.Clamp(
          Math.round(
            layout.boardSize
              * legacyTuning.menu.title.plateHeightRatio
              * Phaser.Math.Linear(0.86, 0.98, variantProfile.titleScale * Math.max(0.72, chromeProfile.titleScale))
              * deploymentProfile.titlePlateHeightScale
          ),
          sceneLayout.isTiny ? 32 : 38,
          Math.max(legacyTuning.menu.title.plateHeightMaxPx - 2, 52)
        );
        const titleY = Phaser.Math.Clamp(
          titleBandFrame.centerY + Math.round(deploymentProfile.titleYOffsetBias * 0.2),
          titleBandFrame.top + (titlePlateHeight / 2),
          titleBandFrame.bottom - (titlePlateHeight / 2)
        );
        const titleX = variantProfile.titleAnchor === 'left'
          ? titleBandFrame.left + (titlePlateWidth / 2)
          : titleBandFrame.centerX;
        const titleShadowY = titleY + 2;
        const titleShadowContainer = this.add.container(titleX, titleShadowY).setDepth(6.9);
        const titleContainer = this.add.container(titleX, titleY).setDepth(9);
        const titleAlpha = variantProfile.titleAlpha * chromeProfile.titleAlpha * deploymentProfile.titleAlphaScale;
        const passiveAlpha = variantProfile.passiveAlpha * chromeProfile.passiveAlpha * deploymentProfile.passiveAlphaScale;
        const plateAlpha = variantProfile.plateAlpha * chromeProfile.plateAlpha * deploymentProfile.plateAlphaScale;
        const panelAlpha = variantProfile.panelAlpha * chromeProfile.panelAlpha * deploymentProfile.panelAlphaScale;
        const titleShadowAlpha = Math.min(0.12, 0.08 * titleAlpha);
        const titleFontSize = Phaser.Math.Clamp(
          Math.round(layout.boardSize * legacyTuning.menu.title.fontScaleToBoard * variantProfile.titleScale * chromeProfile.titleScale * 0.94),
          sceneLayout.isNarrow ? 22 : 28,
          72
        );
        const titleLetterSpacing = sceneLayout.isNarrow ? variantProfile.titleLetterSpacingNarrow : variantProfile.titleLetterSpacingWide;
        const titleFontStyle = sceneThemeProfile.id === 'vellum' ? 'normal' : 'bold';
        const titleStrokeWidth = 1;
        const supportY = Math.round(titlePlateHeight * 0.22 * deploymentProfile.titleLineSpacingScale);
        titleContainer.add([
          this.add.rectangle(0, 0, titlePlateWidth, titlePlateHeight, sceneThemeProfile.title.plateOuterColor, plateAlpha)
            .setStrokeStyle(1, sceneThemeProfile.palette.board.innerStroke, 0.28 * titleAlpha),
          this.add.rectangle(0, 0, titlePlateWidth - 12, titlePlateHeight - 10, sceneThemeProfile.title.plateInnerColor, panelAlpha)
            .setStrokeStyle(1, sceneThemeProfile.title.plateLineColor, 0.28 * titleAlpha),
          this.add.rectangle(
            0,
            -(titlePlateHeight / 2) + 8,
            titlePlateWidth - 24,
            1,
            sceneThemeProfile.title.plateLineColor,
            0.3 * titleAlpha
          )
        ]);
        titleShadowContainer.add([
          this.add.text(1, 1, legacyTuning.menu.title.text, {
            color: sceneThemeProfile.title.titleShadow,
            fontFamily: sceneThemeProfile.title.fontFamily,
            fontSize: `${titleFontSize}px`,
            fontStyle: titleFontStyle
          }).setOrigin(0.5).setLetterSpacing(titleLetterSpacing).setAlpha(titleShadowAlpha)
        ]);
        const title = this.add.text(0, -Math.round(titlePlateHeight * 0.08), legacyTuning.menu.title.text, {
          color: sceneThemeProfile.title.titleColor,
          fontFamily: sceneThemeProfile.title.fontFamily,
          fontSize: `${titleFontSize}px`,
          fontStyle: titleFontStyle
        }).setOrigin(0.5).setLetterSpacing(titleLetterSpacing)
          .setAlpha(titleAlpha)
          .setStroke(sceneThemeProfile.title.titleStroke, titleStrokeWidth);
        const supportSlot = this.add.container(0, supportY);
        const renderSupportSlot = (): void => {
          supportSlot.removeAll(true);
          const supportText = this.add.text(
            0,
            0,
            PASSIVE_TAGLINES[variant],
            {
              color: sceneThemeProfile.title.supportColor,
              fontFamily: sceneThemeProfile.title.supportFontFamily,
              fontSize: `${Math.round((sceneLayout.isTiny ? 7 : sceneLayout.isNarrow ? 8 : 9) * deploymentProfile.titleLineSpacingScale)}px`,
              wordWrap: {
                width: Math.max(132, titlePlateWidth - 28),
                useAdvancedWrap: true
              }
            }
          ).setOrigin(0.5).setAlpha(passiveAlpha).setLetterSpacing(sceneLayout.isNarrow ? 1 : 2);
          supportSlot.add(supportText);
        };

        titleContainer.add([title, supportSlot]);
        activeTitleContainer = titleContainer;
        activeTitleText = title;
        renderSupportSlot();
        if (reducedMotion || chrome === 'minimal') {
          titleContainer.setAlpha(1).setScale(1);
          titleShadowContainer.setAlpha(1).setScale(1);
        } else {
          titleContainer.setAlpha(0);
          titleContainer.y -= 8;
          titleContainer.setScale(0.992);
          titleShadowContainer.setAlpha(0);
          titleShadowContainer.y -= 4;
          titleShadowContainer.setScale(1);
          runOptional('title motion', () => {
            this.tweens.add({
              targets: titleContainer,
              alpha: 1,
              y: titleY,
              scaleX: 1,
              scaleY: 1,
              duration: 760,
              ease: 'Cubic.easeOut'
            });
            this.tweens.add({
              targets: titleShadowContainer,
              alpha: 1,
              y: titleShadowY,
              duration: 640,
              ease: 'Cubic.easeOut'
            });
          });
        }
      }

      let lastCue: DemoWalkerCue = 'spawn';
      let demoConfig = resolveDemoConfig(patternFrame.episode, demoCyclePlan);
      let demoPresentation = resolveMenuDemoPresentation(
        patternFrame.episode,
        demoCyclePlan,
        0,
        demoConfig,
        variant
      );
      const applyPresentationLayer = (presentation: MenuDemoPresentation): void => {
        const shell = episodePresentationShell;
        if (!shell) {
          return;
        }

        const themeProfile = resolveAmbientThemeProfile(presentation.theme);
        const offsetX = sanitizeOffset(presentation.frameOffsetX);
        const offsetY = sanitizeOffset(presentation.frameOffsetY);
        shell.boardRenderer.setPresentationOffset(offsetX, offsetY);
        runOptional('board chrome', () => {
          shell.boardAura.setPosition(shell.boardCenterX + offsetX, shell.boardCenterY + offsetY)
            .setAlpha(presentation.boardAuraAlpha)
            .setScale(presentation.boardAuraScale);
          shell.boardHalo.setPosition(shell.boardCenterX + offsetX, shell.boardCenterY + offsetY)
            .setAlpha(presentation.boardHaloAlpha)
            .setScale(presentation.boardHaloScale);
          shell.boardShade.setPosition(shell.boardCenterX + offsetX, shell.boardCenterY + offsetY)
            .setAlpha(presentation.boardShadeAlpha);
          shell.boardVeil.setPosition(shell.boardCenterX + offsetX, shell.boardCenterY + offsetY)
            .setAlpha(presentation.boardVeilAlpha);
          shell.motifPrimary.setPosition(shell.layout.boardX + offsetX, shell.layout.boardY + offsetY)
            .setAlpha(presentation.motifPrimaryAlpha);
          shell.motifSecondary.setPosition(shell.layout.boardX + offsetX, shell.layout.boardY + offsetY)
            .setAlpha(presentation.motifSecondaryAlpha);
          shell.blueprintAccent.setPosition(shell.layout.boardX + offsetX, shell.layout.boardY + offsetY)
            .setAlpha(resolveBlueprintAccentAlpha(presentation, themeProfile));
        });
      };
      const applyEpisodePresentation = (): void => {
        if (!patternFrame) {
          return;
        }

        destroyEpisodePresentationShell();
        this.activeTheme = demoCyclePlan.theme;
        episodePresentationShell = createEpisodePresentationShell(patternFrame.episode, demoCyclePlan.theme);
        demoConfig = resolveDemoConfig(patternFrame.episode, demoCyclePlan);
        demoPresentation = resolveMenuDemoPresentation(
          patternFrame.episode,
          demoCyclePlan,
          0,
          demoConfig,
          variant,
          deploymentProfileId
        );
        lastCue = 'spawn';
        recoveryEpisode = patternFrame.episode;
        applyPresentationLayer(demoPresentation);
        episodePresentationShell.boardRenderer.drawBase({ solutionPathAlpha: demoPresentation.solutionPathAlpha });
        episodePresentationShell.boardRenderer.drawStart('spawn');
        episodePresentationShell.boardRenderer.drawGoal();
        if (!reducedMotion) {
          episodePresentationShell.boardRenderer.startAmbientMotion(
            demoPresentation.ambientDriftPxX,
            demoPresentation.ambientDriftPxY,
            demoPresentation.ambientDriftMs
          );
        }
      };
      applyEpisodePresentation();

      const accentCueBeat = (cue: DemoWalkerCue): void => {
        const shell = episodePresentationShell;
        if (reducedMotion || recoveryActivated || !shell) {
          return;
        }

        const pulseBoard = (shadeFrom: number, haloFrom: number, auraFrom: number, duration: number, scaleFrom = 1.015): void => {
          this.tweens.killTweensOf([shell.boardShade, shell.boardHalo, shell.boardAura]);
          this.tweens.add({
            targets: shell.boardShade,
            alpha: { from: shadeFrom, to: shell.boardShade.alpha },
            duration,
            ease: 'Quad.easeOut'
          });
          this.tweens.add({
            targets: shell.boardHalo,
            alpha: { from: haloFrom, to: shell.boardHalo.alpha },
            scaleX: { from: scaleFrom, to: shell.boardHalo.scaleX },
            scaleY: { from: scaleFrom, to: shell.boardHalo.scaleY },
            duration,
            ease: 'Quad.easeOut'
          });
          this.tweens.add({
            targets: shell.boardAura,
            alpha: { from: auraFrom, to: shell.boardAura.alpha },
            scaleX: { from: scaleFrom + 0.01, to: shell.boardAura.scaleX },
            scaleY: { from: scaleFrom + 0.01, to: shell.boardAura.scaleY },
            duration: duration + 60,
            ease: 'Quad.easeOut'
          });
        };

        if (cue === 'goal') {
          pulseBoard(0.18, 0.16, 0.2, 360, 1.024);
        } else if (cue === 'reset') {
          pulseBoard(0.1, 0.08, 0.12, 220, 1.014);
        } else if (cue === 'spawn') {
          pulseBoard(0.11, 0.12, 0.16, 240, 1.014);
        }
      };
      const renderDemo = (): void => {
        const shell = episodePresentationShell;
        if (!patternFrame || !shell) {
          return;
        }

        const episode = patternFrame.episode;
        demoPresentation = resolveMenuDemoPresentation(
          episode,
          demoCyclePlan,
          patternFrame.t * 1000,
          demoConfig,
          variant,
          deploymentProfileId
        );
        const view = resolveDemoWalkerViewFrame(
          episode,
          patternFrame.t * 1000,
          demoConfig,
          demoPresentation.trailWindow
        );
        const path = episode.raster.pathIndices;
        const renderedTrail = resolveDemoTrailRenderBounds(path, view);

        applyPresentationLayer(demoPresentation);

        shell.boardRenderer.drawStart(view.cue);
        shell.boardRenderer.drawGoal(view.cue);
        shell.boardRenderer.drawTrail(path, {
          cue: view.cue,
          limit: renderedTrail.limit,
          start: renderedTrail.start,
          emphasis: 'demo',
          persistentTrail: demoPresentation.persistentTrail,
          persistentFadeFloor: demoPresentation.persistentFadeFloor,
          pulseBoost: demoPresentation.trailPulseBoost,
          activeMotion: view.currentIndex === view.nextIndex
            ? undefined
            : {
              fromIndex: view.currentIndex,
              toIndex: view.nextIndex,
              progress: view.progress
            }
        });

        if (view.currentIndex === view.nextIndex || view.progress <= 0) {
          shell.boardRenderer.drawActor(view.currentIndex, view.direction, view.cue, demoPresentation.actorPulseBoost);
        } else {
          shell.boardRenderer.drawActorMotion(
            view.currentIndex,
            view.nextIndex,
            view.progress,
            view.direction,
            view.cue,
            demoPresentation.actorPulseBoost
          );
        }

        runOptional('hud metadata', () => {
          shell.demoStatusHud.setState(
            episode,
            demoPresentation.mood,
            demoPresentation.sequence,
            demoPresentation.variant,
            demoPresentation.metadataAlpha,
            demoPresentation.flashAlpha,
            demoPresentation.phaseLabel,
            demoPresentation.hudOffsetX,
            demoPresentation.hudOffsetY
          );
        });
        publishVisualDiagnostics(view, renderedTrail);
        if (view.cue !== lastCue) {
          runOptional('cue accent', () => {
            accentCueBeat(view.cue);
          });
          lastCue = view.cue;
        }
      };
      const applyPatternFrame = (nextFrame: PatternFrame): void => {
        if (!patternFrame) {
          patternFrame = nextFrame;
          recoveryEpisode = nextFrame.episode;
          return;
        }

        const previousEpisode = patternFrame.episode;
        try {
          patternFrame = nextFrame;
          recoveryEpisode = nextFrame.episode;
          demoCyclePlan = pendingCyclePlan ?? demoCyclePlan;
          pendingCyclePlan = undefined;
          applyEpisodePresentation();
          renderDemo();
        } catch (error) {
          failOpen(error);
        } finally {
          disposeMazeEpisode(previousEpisode);
        }
      };
      handleVisibilityChange = (): void => {
        if (typeof document === 'undefined' || recoveryActivated) {
          return;
        }

        if (document.hidden) {
          sceneHidden = true;
          patternEngine?.suspend();
          return;
        }

        if (!sceneHidden) {
          return;
        }

        sceneHidden = false;
        try {
          patternEngine?.resumeFresh();
          if (patternEngine) {
            applyPatternFrame(patternEngine.next(0));
          }
        } catch (error) {
          failOpen(error);
        }
      };

      const refreshAfterResize = (nextViewport: ViewportSize): void => {
        const decision = resolveMenuResizeRecoveryDecision(
          resolveViewportSize(this.scale.width, this.scale.height, width, height),
          nextViewport,
          Math.max(0, this.time.now - sceneStartedAt),
          lastResizeRestartKey
        );
        if (!decision.shouldRestart) {
          return;
        }

        lastResizeRestartKey = decision.restartKey ?? lastResizeRestartKey;
        resizeRestart?.remove(false);
        resizeRestart = this.time.delayedCall(160, () => {
          if (recoveryActivated) {
            renderVisibleRecovery();
            return;
          }

          this.scene.restart(launchConfig);
        });
      };
      handleResize = (gameSize): void => {
        const fallbackViewport = resolveSceneViewport(this);
        refreshAfterResize(resolveViewportSize(
          gameSize?.width,
          gameSize?.height,
          fallbackViewport.width,
          fallbackViewport.height
        ));
      };

      renderDemo();
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', handleVisibilityChange);
      }
      this.scale.on(Phaser.Scale.Events.RESIZE, handleResize);
      updateDemo = (_time: number, delta: number): void => {
        if (sceneHidden || recoveryActivated || !patternEngine) {
          return;
        }

        try {
          const nextFrame = patternEngine.next(delta / 1000);
          if (!patternFrame) {
            patternFrame = nextFrame;
            recoveryEpisode = nextFrame.episode;
            renderDemo();
            return;
          }

          if (nextFrame.episode !== patternFrame.episode) {
            applyPatternFrame(nextFrame);
            return;
          }

          patternFrame = nextFrame;
          renderDemo();
        } catch (error) {
          failOpen(error);
        }
      };
      this.events.on(Phaser.Scenes.Events.UPDATE, updateDemo);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        removeRuntimeListeners();
        destroyPresentation(true);
      });
    } catch (error) {
      failOpen(error);
    }
  }

  private drawStarfield(width: number, height: number, themeProfile: AmbientThemeProfile): void {
    const safeWidth = sanitizePositive(width, DEFAULT_VIEWPORT_WIDTH);
    const safeHeight = sanitizePositive(height, DEFAULT_VIEWPORT_HEIGHT);
    const bg = this.add.graphics();
    bg.fillGradientStyle(
      themeProfile.background.topLeft,
      themeProfile.background.topRight,
      themeProfile.background.bottomLeft,
      themeProfile.background.bottomRight,
      1
    );
    bg.fillRect(0, 0, safeWidth, safeHeight);
    bg.fillStyle(themeProfile.palette.background.nebulaCore, 0.18);
    bg.fillCircle(safeWidth * 0.5, safeHeight * 0.46, Math.max(safeWidth, safeHeight) * 0.24);
    bg.fillStyle(themeProfile.palette.background.nebula, 0.12);
    bg.fillCircle(safeWidth * 0.5, safeHeight * 0.56, Math.max(safeWidth, safeHeight) * 0.34);
    bg.fillStyle(themeProfile.palette.background.deepSpace, 0.14);
    bg.fillRect(0, safeHeight * 0.78, safeWidth, safeHeight * 0.22);

    const clouds = this.add.graphics();
    clouds.setBlendMode(Phaser.BlendModes.SCREEN);
    for (let i = 0; i < legacyTuning.menu.starfield.cloudCount; i += 1) {
      const x = Phaser.Math.Between(safeWidth * 0.12, safeWidth * 0.88);
      const y = Phaser.Math.Between(safeHeight * 0.16, safeHeight * 0.84);
      const radius = Phaser.Math.Between(legacyTuning.menu.starfield.cloudRadiusMin, legacyTuning.menu.starfield.cloudRadiusMax);
      clouds.fillStyle(
        themeProfile.palette.background.cloud,
        Phaser.Math.FloatBetween(legacyTuning.menu.starfield.cloudAlphaMin, legacyTuning.menu.starfield.cloudAlphaMax)
          * themeProfile.background.cloudAlphaScale
      );
      clouds.fillCircle(x, y, radius);
    }

    const farStars = this.add.graphics();
    for (let i = 0; i < Math.floor(legacyTuning.menu.starfield.starCount * 0.58); i += 1) {
      const x = Phaser.Math.Between(0, safeWidth);
      const y = Phaser.Math.Between(0, safeHeight);
      const r = Phaser.Math.FloatBetween(
        legacyTuning.menu.starfield.starRadiusMin * 0.8,
        legacyTuning.menu.starfield.starRadiusMax * 0.72
      );
      farStars.fillStyle(
        themeProfile.palette.background.star,
        Phaser.Math.FloatBetween(
          legacyTuning.menu.starfield.starAlphaMin * 0.7,
          legacyTuning.menu.starfield.starAlphaMax * 0.52
        ) * themeProfile.background.farStarAlphaScale
      );
      farStars.fillCircle(x, y, r);
    }

    const nearStars = this.add.graphics();
    for (let i = 0; i < Math.ceil(legacyTuning.menu.starfield.starCount * 0.42); i += 1) {
      const x = Phaser.Math.Between(0, safeWidth);
      const y = Phaser.Math.Between(0, safeHeight);
      const r = Phaser.Math.FloatBetween(legacyTuning.menu.starfield.starRadiusMin, legacyTuning.menu.starfield.starRadiusMax);
      nearStars.fillStyle(
        themeProfile.palette.background.star,
        Phaser.Math.FloatBetween(legacyTuning.menu.starfield.starAlphaMin, legacyTuning.menu.starfield.starAlphaMax)
          * themeProfile.background.nearStarAlphaScale
      );
      nearStars.fillCircle(x, y, r);
    }

    try {
      this.starDriftTween = this.tweens.add({
        targets: nearStars,
        y: legacyTuning.menu.starfield.starsDriftRangePx,
        duration: legacyTuning.menu.starfield.starsDriftDurationMs,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    } catch (error) {
      console.error('MenuScene optional star drift skipped.', error);
    }

    const vignette = this.add.graphics();
    vignette.fillStyle(
      themeProfile.palette.background.vignette,
      legacyTuning.menu.starfield.vignetteAlpha * themeProfile.background.vignetteAlphaScale
    );
    vignette.fillRect(0, 0, safeWidth, safeHeight * legacyTuning.menu.starfield.vignetteBandRatio);
    vignette.fillRect(0, safeHeight * (1 - legacyTuning.menu.starfield.vignetteBandRatio), safeWidth, safeHeight * legacyTuning.menu.starfield.vignetteBandRatio);
    vignette.fillStyle(themeProfile.palette.background.vignette, 0.12);
    vignette.fillCircle(safeWidth * 0.5, safeHeight * 0.5, Math.max(safeWidth, safeHeight) * 0.58);
  }

  private renderRecoveryShell(width: number, height: number, episode?: MazeEpisode): void {
    const safeWidth = sanitizePositive(width, DEFAULT_VIEWPORT_WIDTH);
    const safeHeight = sanitizePositive(height, DEFAULT_VIEWPORT_HEIGHT);
    const themeProfile = resolveAmbientThemeProfile(this.activeTheme);
    const viewportSafeInsets = resolveViewportSafeInsets();
    const layoutModel = resolveMenuPresentationModel(
      safeWidth,
      safeHeight,
      this.presentationVariant,
      'full',
      true,
      this.launchConfig.profile,
      viewportSafeInsets
    );

    this.drawStarfield(safeWidth, safeHeight, themeProfile);
    this.add.text(safeWidth / 2, Math.max(56, safeHeight * 0.18), legacyTuning.menu.title.text, {
      color: themeProfile.title.titleColor,
      fontFamily: themeProfile.title.fontFamily,
      fontSize: `${Math.max(32, Math.round(Math.min(safeWidth, safeHeight) * 0.08))}px`,
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(20);
    this.add.text(safeWidth / 2, Math.max(100, safeHeight * 0.26), '\u00b0 by fawxzzy', {
      color: themeProfile.title.signatureColor,
      fontFamily: themeProfile.title.signatureFontFamily,
      fontSize: '14px'
    }).setOrigin(0.5).setDepth(20);
    this.add.text(safeWidth / 2, Math.max(132, safeHeight * 0.32), 'recovery demo', {
      color: themeProfile.title.supportColor,
      fontFamily: themeProfile.title.supportFontFamily,
      fontSize: '12px'
    }).setOrigin(0.5).setDepth(20);

    if (!episode) {
      return;
    }

    try {
      const layout = createBoardLayout(this, episode, {
        boardScale: Math.min(0.72, layoutModel.layout.boardScale),
        topReserve: Math.max(140, Math.round(safeHeight * 0.34)),
        sidePadding: Math.max(12, layoutModel.layout.sidePadding + 8),
        bottomPadding: Math.max(20, layoutModel.layout.bottomPadding)
      });
      const recoveryBoard = new BoardRenderer(this, episode, layout, {
        theme: {
          ...themeProfile.boardTheme,
          palette: themeProfile.palette
        }
      });
      recoveryBoard.drawBoardChrome();
      recoveryBoard.drawBase();
      recoveryBoard.drawStart('spawn');
      recoveryBoard.drawGoal();
    } catch (error) {
      console.error('MenuScene recovery board render failed.', error);
    }
  }
}

export function resolveSceneLayoutProfile(
  width: number,
  height: number,
  variant: AmbientPresentationVariant,
  chrome: PresentationChrome = DEFAULT_PRESENTATION_CHROME,
  titleVisible = true,
  deploymentProfileId?: PresentationDeploymentProfile,
  safeInsets?: Partial<ViewportSafeInsets> | null
): SceneLayoutProfile {
  const safeVariant = sanitizePresentationVariant(variant);
  const safeChrome = CHROME_PROFILES[chrome] ? chrome : DEFAULT_PRESENTATION_CHROME;
  const chromeProfile = CHROME_PROFILES[safeChrome];
  const profile = VARIANT_PROFILES[safeVariant];
  const deploymentProfile = resolveDeploymentPresentationProfile(deploymentProfileId);
  const viewportSafeInsets = sanitizeViewportSafeInsets(safeInsets);
  const safeWidth = sanitizePositive(width, DEFAULT_VIEWPORT_WIDTH);
  const safeHeight = sanitizePositive(height, DEFAULT_VIEWPORT_HEIGHT);
  const safeSideInset = Math.max(viewportSafeInsets.left, viewportSafeInsets.right);
  const isNarrow = safeWidth <= legacyTuning.menu.layout.narrowBreakpoint;
  const isPortrait = safeHeight > (safeWidth * 1.12);
  const isShort = safeHeight < 720;
  const isTiny = safeWidth < 420 || safeHeight < 260;
  const boardScale = Phaser.Math.Clamp(
    (isNarrow ? profile.boardScaleNarrow : profile.boardScaleWide)
      + chromeProfile.boardScaleBias
      + deploymentProfile.boardScaleBias
      + (!titleVisible ? 0.004 : 0)
      + (isPortrait ? 0.008 + deploymentProfile.portraitBoardScaleBias : 0)
      - (isTiny ? 0.026 : 0)
      - (isShort ? 0.012 : 0),
    isTiny ? 0.82 : 0.92,
    Math.min(safeChrome === 'none' ? 0.998 : 0.996, deploymentProfile.maxBoardScale)
  );
  let topReserve = Math.max(
    Math.max(
      12,
      profile.topReserveMinPx
        + chromeProfile.topReserveBias
        + deploymentProfile.topReserveBias
        + (isPortrait ? 12 + deploymentProfile.portraitTopReserveBias : 0)
        - (safeVariant === 'ambient' ? 6 : 0)
        - (isTiny ? 28 : 0)
        - (!titleVisible ? 12 : 0)
    ),
    Math.round(
      safeHeight
        * (profile.topReserveRatio + (isPortrait ? 0.024 : 0) - (isShort ? 0.016 : 0) - (isTiny ? 0.04 : 0))
    ) + chromeProfile.topReserveBias + deploymentProfile.topReserveBias
  ) + viewportSafeInsets.top;
  let bottomPadding = Math.max(
    6,
    profile.bottomPaddingPx
      + chromeProfile.bottomPaddingBias
      + deploymentProfile.bottomPaddingBias
      + (isPortrait ? 4 : 0)
      + (titleVisible && (deploymentProfileId === 'mobile' || isPortrait) ? 6 : 0)
      + (safeVariant === 'loading' ? 4 : 0)
      - (isTiny ? 12 : 0)
  ) + viewportSafeInsets.bottom;
  const minimumBoardSpan = Math.max(24, Math.round(Math.min(safeWidth, safeHeight) * 0.2));
  const verticalOverflow = (topReserve + bottomPadding + minimumBoardSpan) - safeHeight;
  if (verticalOverflow > 0) {
    const minTopReserve = viewportSafeInsets.top + 12;
    const minBottomPadding = viewportSafeInsets.bottom + 6;
    const topReduction = Math.min(verticalOverflow, Math.max(0, topReserve - minTopReserve));
    topReserve -= topReduction;
    bottomPadding -= Math.min(verticalOverflow - topReduction, Math.max(0, bottomPadding - minBottomPadding));
  }
  const sidePadding = Math.max(
    2,
    profile.sidePaddingPx
      + chromeProfile.sidePaddingBias
      + deploymentProfile.sidePaddingBias
      + (isPortrait ? 2 : 0)
      + (isNarrow ? -2 : 0)
      - (isTiny ? 4 : 0)
  ) + safeSideInset;
  const obsSafeVerticalPadding = Math.max(
    topReserve,
    bottomPadding,
    Math.round(safeHeight * 0.05)
  );
  const obsSafeSidePadding = Math.max(
    sidePadding,
    Math.round(safeWidth * 0.015),
    12
  );

  return {
    isNarrow,
    isPortrait,
    isShort,
    isTiny,
    boardScale,
    topReserve: deploymentProfileId === 'obs' ? obsSafeVerticalPadding : topReserve,
    bottomPadding: deploymentProfileId === 'obs' ? obsSafeVerticalPadding : bottomPadding,
    sidePadding: deploymentProfileId === 'obs' ? obsSafeSidePadding : sidePadding
  };
}

const resolveDemoConfig = (episode: MazeEpisode, cycle: MenuDemoCycle): DemoWalkerConfig => ({
  ...legacyTuning.demo,
  cadence: {
    ...legacyTuning.demo.cadence,
    spawnHoldMs: legacyTuning.demo.cadence.spawnHoldMs + cycle.pacing.spawnHoldMs + (cycle.mood === 'blueprint' ? 60 : 0),
    exploreStepMs: legacyTuning.demo.cadence.exploreStepMs + cycle.pacing.exploreStepMs + (cycle.mood === 'scan' ? 8 : 0),
    goalHoldMs: legacyTuning.demo.cadence.goalHoldMs + cycle.pacing.goalHoldMs + (episode.difficulty === 'brutal' ? 100 : 0),
    resetHoldMs: legacyTuning.demo.cadence.resetHoldMs + cycle.pacing.resetHoldMs + (cycle.mood === 'solve' ? 18 : 0)
  }
});

export const resolveDemoTrailRenderBounds = (
  path: ArrayLike<number>,
  view: DemoWalkerViewFrame
): { start: number; limit: number } => {
  if (path.length <= 0) {
    return { start: 0, limit: 0 };
  }

  const headIndex = view.currentIndex === view.nextIndex || view.progress >= DEMO_TRAIL_COMMIT_PROGRESS
    ? view.nextIndex
    : view.currentIndex;
  let headCursor = -1;
  for (let index = 0; index < path.length; index += 1) {
    if (path[index] === headIndex) {
      headCursor = index;
      break;
    }
  }

  if (headCursor < 0) {
    const fallbackLimit = Math.max(1, Math.min(path.length, view.trailLimit));
    return {
      start: Math.max(0, Math.min(view.trailStart, Math.max(0, fallbackLimit - 1))),
      limit: fallbackLimit
    };
  }

  return {
    start: 0,
    limit: Math.min(path.length, headCursor + 1)
  };
};

const resolveDemoTrailWindow = (episode: MazeEpisode, mood: DemoMood): number => {
  const sizeOffset = episode.size === 'small' ? -2 : episode.size === 'medium' ? 0 : episode.size === 'large' ? 2 : 4;
  const difficultyBase = episode.difficulty === 'chill'
    ? 18
    : episode.difficulty === 'standard'
      ? 22
      : episode.difficulty === 'spicy'
        ? 26
        : 30;
  const moodProfile = DEMO_MOOD_PROFILES[mood];
  return clamp(
    Math.round((difficultyBase + sizeOffset + moodProfile.trailWindowOffset) * moodProfile.trailWindowScale),
    4,
    46
  );
};

export const resolveMenuDemoSequence = (
  episode: MazeEpisode,
  elapsedMs: number,
  config: DemoWalkerConfig
): { sequence: MenuDemoSequence; progress: number } => {
  const spawnHoldMs = Math.max(1, config.cadence.spawnHoldMs);
  const traverseMs = Math.max(1, (Math.max(1, episode.raster.pathIndices.length) - 1) * Math.max(1, config.cadence.exploreStepMs));
  const goalHoldMs = Math.max(1, config.cadence.goalHoldMs);
  const resetHoldMs = Math.max(1, config.cadence.resetHoldMs);

  if (elapsedMs < spawnHoldMs) {
    return { sequence: 'intro', progress: elapsedMs / spawnHoldMs };
  }
  if (elapsedMs < spawnHoldMs + traverseMs) {
    return { sequence: 'reveal', progress: (elapsedMs - spawnHoldMs) / traverseMs };
  }
  if (elapsedMs < spawnHoldMs + traverseMs + goalHoldMs) {
    return { sequence: 'arrival', progress: (elapsedMs - spawnHoldMs - traverseMs) / goalHoldMs };
  }
  return {
    sequence: 'fade',
    progress: Math.min(1, (elapsedMs - spawnHoldMs - traverseMs - goalHoldMs) / resetHoldMs)
  };
};

export const resolveMenuDemoPresentation = (
  episode: MazeEpisode,
  cycle: MenuDemoCycle,
  elapsedMs: number,
  config: DemoWalkerConfig,
  variant: AmbientPresentationVariant = DEFAULT_PRESENTATION_VARIANT,
  deploymentProfileId?: PresentationDeploymentProfile
): MenuDemoPresentation => {
  const moodProfile = DEMO_MOOD_PROFILES[cycle.mood];
  const safeVariant = sanitizePresentationVariant(variant);
  const showSolutionPathPreview = safeVariant === 'loading';
  const variantProfile = VARIANT_PROFILES[safeVariant];
  const deploymentProfile = resolveDeploymentPresentationProfile(deploymentProfileId);
  const themeProfile = resolveAmbientThemeProfile(cycle.theme);
  const sequenceState = resolveMenuDemoSequence(episode, elapsedMs, config);
  const progress = ease(sequenceState.progress);
  const oscillationTimeMs = normalizeAnimationTime(elapsedMs);
  const wave = 0.5 + (Math.sin((oscillationTimeMs + (episode.seed * 17)) * 0.0022) * 0.5);
  const offsets = resolvePresentationOffsets(episode.seed, safeVariant);
  const atmosphereSeed = mix(episode.seed ^ 0x2f8f1d3b, cycle.theme.charCodeAt(0), cycle.mood.charCodeAt(0));
  const atmosphereBias = (((atmosphereSeed & 0xff) / 255) - 0.5) * 2;
  const trailBias = ((((atmosphereSeed >>> 8) & 0xff) / 255) - 0.5) * 2;
  let boardVeilAlpha = 0.03;
  let boardAuraAlpha = moodProfile.auraAlpha;
  let boardHaloAlpha = moodProfile.haloAlpha;
  let boardShadeAlpha = moodProfile.shadeAlpha;
  let boardAuraScale = 1;
  let boardHaloScale = 1;
  let metadataAlpha = moodProfile.metadataAlpha * variantProfile.metadataAlphaScale;
  let flashAlpha = safeVariant === 'loading' ? 0.24 : 0;

  switch (sequenceState.sequence) {
    case 'intro':
      boardVeilAlpha = lerp(cycle.mood === 'scan' ? 0.18 : 0.22, 0.04, progress);
      boardAuraAlpha = moodProfile.auraAlpha + ((1 - progress) * 0.05);
      boardHaloAlpha = moodProfile.haloAlpha + ((1 - progress) * 0.045);
      boardShadeAlpha = moodProfile.shadeAlpha + ((1 - progress) * 0.03);
      boardAuraScale = lerp(1.035, 1, progress);
      boardHaloScale = lerp(1.022, 1, progress);
      metadataAlpha = clamp((moodProfile.metadataAlpha * 0.82 * variantProfile.metadataAlphaScale) + (progress * 0.08), 0.18, 0.82);
      flashAlpha = cycle.mood === 'blueprint' ? lerp(0.82, 0.24, progress) : flashAlpha;
      break;
    case 'reveal':
      boardVeilAlpha = clamp((cycle.mood === 'scan' ? 0.04 : 0.024) + (wave * (cycle.mood === 'scan' ? 0.016 : 0.008)), 0, 0.24);
      boardAuraAlpha = moodProfile.auraAlpha + (wave * (cycle.mood === 'scan' ? 0.05 : 0.028));
      boardHaloAlpha = moodProfile.haloAlpha + (wave * (cycle.mood === 'scan' ? 0.032 : 0.018));
      boardShadeAlpha = moodProfile.shadeAlpha + (wave * (cycle.mood === 'scan' ? 0.032 : 0.015));
      boardAuraScale = 1 + (wave * 0.012);
      boardHaloScale = 1 + (wave * 0.008);
      metadataAlpha = clamp((moodProfile.metadataAlpha + (cycle.mood === 'blueprint' ? 0.08 : 0.04)) * variantProfile.metadataAlphaScale, 0.18, 0.82);
      flashAlpha = cycle.mood === 'blueprint' ? Math.max(0, 0.46 - (progress * 0.46)) : flashAlpha;
      break;
    case 'arrival': {
      const arrivalGlow = 1 - Math.abs((progress * 2) - 1);
      boardVeilAlpha = 0.022;
      boardAuraAlpha = moodProfile.auraAlpha + 0.03 + (arrivalGlow * 0.07);
      boardHaloAlpha = moodProfile.haloAlpha + 0.02 + (arrivalGlow * 0.06);
      boardShadeAlpha = moodProfile.shadeAlpha + (arrivalGlow * 0.025);
      boardAuraScale = 1.01 + (arrivalGlow * 0.016);
      boardHaloScale = 1.008 + (arrivalGlow * 0.012);
      metadataAlpha = clamp((moodProfile.metadataAlpha + 0.12) * variantProfile.metadataAlphaScale, 0.18, 0.82);
      flashAlpha = cycle.mood === 'blueprint' ? 0.14 * (1 - progress) : Math.max(flashAlpha, 0.28 + (arrivalGlow * 0.24));
      break;
    }
    case 'fade':
      boardVeilAlpha = lerp(0.06, 0.22, progress);
      boardAuraAlpha = lerp(moodProfile.auraAlpha + 0.02, 0.08, progress);
      boardHaloAlpha = lerp(moodProfile.haloAlpha + 0.024, 0.018, progress);
      boardShadeAlpha = lerp(moodProfile.shadeAlpha + 0.018, 0.012, progress);
      boardAuraScale = lerp(1.014, 1.024, progress);
      boardHaloScale = lerp(1.01, 1.018, progress);
      metadataAlpha = clamp(lerp(moodProfile.metadataAlpha * 0.9, 0.28, progress) * variantProfile.metadataAlphaScale, 0.18, 0.82);
      flashAlpha = safeVariant === 'loading' ? lerp(0.22, 0.12, progress) : 0;
      break;
  }

  if (safeVariant === 'title') {
    boardVeilAlpha += sequenceState.sequence === 'intro' ? 0.02 : 0.01;
    boardAuraAlpha -= 0.006;
    boardHaloAlpha += 0.004;
    metadataAlpha -= 0.04;
  } else if (safeVariant === 'ambient') {
    boardVeilAlpha -= 0.012;
    boardAuraAlpha += 0.012;
    boardHaloAlpha += 0.01;
    boardAuraScale += 0.008;
    boardHaloScale += 0.006;
    metadataAlpha -= 0.02;
  } else {
    boardVeilAlpha += 0.02;
    boardAuraAlpha += 0.008;
    boardHaloAlpha += 0.01;
    boardShadeAlpha += 0.014;
    metadataAlpha += 0.04;
    flashAlpha = Math.max(
      flashAlpha,
      sequenceState.sequence === 'intro'
        ? 0.28
        : sequenceState.sequence === 'reveal'
          ? 0.24
      : 0.18
    );
  }
  const persistentFadeFloor = clamp(
    moodProfile.persistentFadeFloor
      + (wave * 0.06)
      + (atmosphereBias * 0.025)
      + (sequenceState.sequence === 'arrival' ? 0.08 : sequenceState.sequence === 'fade' ? 0.04 : 0),
    0.22,
    0.72
  );
  const trailPulseBoost = clamp(
    moodProfile.trailPulseBoost
      + (themeProfile.presentation.actorPulseBias * 0.6)
      + ((wave - 0.5) * 0.04)
      + (trailBias * 0.012),
    0,
    0.08
  );
  const boardAuraScaleDelta = (boardAuraScale - 1) * deploymentProfile.boardAuraMotionScale;
  const boardHaloScaleDelta = (boardHaloScale - 1) * deploymentProfile.boardHaloMotionScale;
  const motifPrimarySequenceScale = sequenceState.sequence === 'arrival'
    ? 1
    : sequenceState.sequence === 'reveal'
      ? 0.86
      : sequenceState.sequence === 'intro'
        ? 0.72
        : 0.54;
  const motifSecondarySequenceScale = sequenceState.sequence === 'reveal'
    ? 1
    : sequenceState.sequence === 'arrival'
      ? 0.82
      : sequenceState.sequence === 'intro'
        ? 0.64
        : 0.42;

  return {
    variant: safeVariant,
    mood: cycle.mood,
    theme: cycle.theme,
    sequence: sequenceState.sequence,
    phaseLabel: resolvePhaseLabel(sequenceState.sequence, episode.seed, cycle.mood, safeVariant),
    solutionPathAlpha: showSolutionPathPreview
      ? clamp(
        moodProfile.solutionPathAlpha * variantProfile.solutionPathScale * themeProfile.presentation.solutionPathAlphaScale,
        0.14,
        1
      )
      : 0,
    trailWindow: resolveDemoTrailWindow(episode, cycle.mood),
    ambientDriftPxX: offsets.driftX
      * moodProfile.ambientDriftPx
      * variantProfile.driftScale
      * deploymentProfile.driftScale
      * themeProfile.presentation.driftScale
      || 0,
    ambientDriftPxY: offsets.driftY
      * moodProfile.ambientDriftPx
      * variantProfile.driftScale
      * deploymentProfile.driftScale
      * themeProfile.presentation.driftScale
      || 0,
    ambientDriftMs: clamp(Math.round(moodProfile.ambientDriftMs * deploymentProfile.driftDurationScale), 1200, 12000),
    frameOffsetX: Math.round(offsets.frameOffsetX * deploymentProfile.offsetScale * themeProfile.presentation.offsetScale) || 0,
    frameOffsetY: Math.round(offsets.frameOffsetY * deploymentProfile.offsetScale * themeProfile.presentation.offsetScale) || 0,
    hudOffsetX: Math.round(offsets.hudOffsetX * deploymentProfile.offsetScale * themeProfile.presentation.offsetScale) || 0,
    hudOffsetY: Math.round(offsets.hudOffsetY * deploymentProfile.offsetScale * themeProfile.presentation.offsetScale) || 0,
    boardVeilAlpha: clamp(
      boardVeilAlpha
        + (variantProfile.boardVeilBias * deploymentProfile.boardVeilBiasScale)
        + (atmosphereBias * 0.012)
        + themeProfile.shell.veilAlphaBias,
      0,
      0.24
    ),
    boardAuraAlpha: clamp(
      boardAuraAlpha
        + (variantProfile.boardAuraBias * deploymentProfile.boardAuraBiasScale)
        + (atmosphereBias * 0.012)
        + themeProfile.shell.auraAlphaBias,
      0.06,
      0.18
    ),
    boardHaloAlpha: clamp(
      boardHaloAlpha
        + (variantProfile.boardHaloBias * deploymentProfile.boardHaloBiasScale)
        + (trailBias * 0.01)
        + themeProfile.shell.haloAlphaBias,
      0.018,
      0.11
    ),
    boardShadeAlpha: clamp(
      boardShadeAlpha
        + (variantProfile.boardShadeBias * deploymentProfile.boardShadeBiasScale)
        + (trailBias * 0.01)
        + themeProfile.shell.shadeAlphaBias,
      0.012,
      0.1
    ),
    boardAuraScale: clamp(
      1
        + boardAuraScaleDelta
        + (wave * variantProfile.boardAuraBias * 0.1 * deploymentProfile.boardAuraBiasScale)
        + (atmosphereBias * 0.006)
        + themeProfile.shell.auraScaleBias,
      1,
      1.035
    ),
    boardHaloScale: clamp(
      1
        + boardHaloScaleDelta
        + (wave * variantProfile.boardHaloBias * 0.1 * deploymentProfile.boardHaloBiasScale)
        + (trailBias * 0.004)
        + themeProfile.shell.haloScaleBias,
      1,
      1.02
    ),
    motifPrimaryAlpha: clamp(themeProfile.shell.motifPrimaryAlpha * motifPrimarySequenceScale, 0, 0.2),
    motifSecondaryAlpha: clamp(themeProfile.shell.motifSecondaryAlpha * motifSecondarySequenceScale, 0, 0.16),
    actorPulseBoost: clamp(moodProfile.actorPulseBoost + variantProfile.actorPulseBias + themeProfile.presentation.actorPulseBias, 0, 0.12),
    persistentTrail: true,
    persistentFadeFloor,
    trailPulseBoost,
    metadataAlpha: clamp(
      (metadataAlpha + themeProfile.presentation.metadataAlphaBias + (atmosphereBias * 0.025))
        * deploymentProfile.metadataAlphaScale,
      0.18,
      0.82
    ),
    flashAlpha: clamp(
      (flashAlpha + themeProfile.presentation.flashAlphaBias)
        * variantProfile.flashAlphaScale
        * deploymentProfile.flashAlphaScale,
      0,
      0.84
    )
  };
};

export const resolveMenuDemoCycle = (seed: number, cycle: number, overrides: MenuDemoCycleOverrides = {}): MenuDemoCycle => {
  const mood = overrides.mood ?? resolveCuratedMood(seed, cycle);
  const familyCycle = overrides.family || overrides.mood || overrides.size || overrides.difficulty ? 0 : cycle;
  const familySeed = seed >>> 0;
  const family = overrides.family ?? resolveCuratedFamily(familySeed, familyCycle);
  const theme = overrides.theme ?? resolveAmbientFamilyTheme(seed, cycle, family);
  const presetCycle = familyCycle;
  const entropy = resolveAmbientCycleEntropy(seed, cycle, mood, theme, family);
  return {
    difficulty: overrides.difficulty ?? pickCuratedCycleValue(ROTATING_DIFFICULTIES, seed ^ 0x517cc1b7, cycle + 1, 0x517cc1b7),
    size: overrides.size ?? pickCuratedCycleValue(ROTATING_SIZES, seed, cycle, 0x2d2816fe),
    mood,
    theme,
    family,
    presentationPreset: resolveMenuDemoPreset(seed, presetCycle, mood, theme, family),
    entropy,
    pacing: DEMO_PACING_PROFILES[mix(seed, cycle, 0x6d2b79f5) % DEMO_PACING_PROFILES.length]
  };
};

export const resolveMenuDemoPreset = (
  seed: number,
  cycle: number,
  mood: DemoMood,
  theme?: PresentationThemeFamily,
  family?: MazeFamily
): MazePresentationPreset => {
  const safeTheme = theme ?? PRESENTATION_THEME_FAMILIES[mix(seed, cycle, 0x34c2ab51) % PRESENTATION_THEME_FAMILIES.length];
  const mixed = mix(seed, cycle, 0x31b7c3d1 ^ mood.charCodeAt(0) ^ safeTheme.charCodeAt(0));
  const resolvePairingPolicy = (targetFamily: MazeFamily): AmbientFamilyThemePairingPolicy => (
    AMBIENT_FAMILY_THEME_PAIRING_POLICY[targetFamily]
  );
  const isDefaultTheme = (targetFamily: MazeFamily): boolean => (
    resolvePairingPolicy(targetFamily).defaults.includes(safeTheme)
  );
  const isAccentTheme = (targetFamily: MazeFamily): boolean => (
    resolvePairingPolicy(targetFamily).accents.includes(safeTheme)
  );
  const isBlueprintAccentTheme = (targetFamily: MazeFamily): boolean => (
    resolvePairingPolicy(targetFamily).blueprintAccent.includes(safeTheme)
  );
  if (family === 'framed') {
    return isDefaultTheme(family)
      ? mixed % 6 === 0 ? 'classic' : 'framed'
      : mixed % 4 === 0 ? 'classic' : 'framed';
  }
  if (family === 'braided') {
    return isDefaultTheme(family) && mixed % 8 !== 0
      ? 'braided'
      : mixed % 5 === 0 ? 'classic' : 'braided';
  }
  if (family === 'sparse') {
    return isDefaultTheme(family) || isAccentTheme(family)
      ? 'classic'
      : mixed % 5 === 0 ? 'braided' : 'classic';
  }
  if (family === 'dense') {
    const blueprintAllowed = isBlueprintAccentTheme(family);
    return blueprintAllowed && mixed % 7 === 0
      ? 'blueprint-rare'
      : mixed % 4 === 0 ? 'classic' : 'braided';
  }
  if (family === 'split-flow') {
    const blueprintAllowed = mood === 'blueprint' && isBlueprintAccentTheme(family);
    return blueprintAllowed && mixed % 9 === 0
      ? 'blueprint-rare'
      : isDefaultTheme(family) && mixed % 5 !== 0
        ? 'classic'
        : mixed % 3 === 0 ? 'braided' : 'classic';
  }
  switch (mood) {
    case 'scan':
      if (safeTheme === 'noir' || safeTheme === 'vellum') {
        return mixed % 3 === 0 ? 'classic' : 'framed';
      }
      return mixed % 7 === 0 ? 'classic' : mixed % 3 === 0 ? 'framed' : 'braided';
    case 'blueprint':
      if (safeTheme === 'aurora') {
        return mixed % 2 === 0 ? 'blueprint-rare' : 'braided';
      }
      return mixed % 5 <= 1 ? 'blueprint-rare' : mixed % 3 === 0 ? 'classic' : 'framed';
    case 'solve':
    default:
      if (safeTheme === 'ember') {
        return mixed % 3 === 0 ? 'framed' : 'braided';
      }
      return mixed % 8 === 0 ? 'blueprint-rare' : mixed % 5 === 0 ? 'framed' : mixed % 3 === 0 ? 'braided' : 'classic';
  }
};

const resolveAmbientCycleEntropy = (
  seed: number,
  cycle: number,
  mood: DemoMood,
  theme: PresentationThemeFamily,
  family: MazeFamily
): MenuDemoCycle['entropy'] => {
  const moodSalt = mood.charCodeAt(0);
  const themeSalt = theme.charCodeAt(0) ^ theme.charCodeAt(theme.length - 1) ^ family.charCodeAt(0);
  const mixed = mix(seed ^ 0x6f23ad5b, cycle + moodSalt, 0x5a9dc15f ^ themeSalt);
  const blend = (mixed & 0xff) / 255;
  const drift = ((mixed >>> 8) & 0xff) / 255;
  const familyCheckBias = family === 'sparse'
    ? 0.04
    : family === 'split-flow'
      ? 0.06
      : family === 'dense'
        ? 0.05
        : family === 'framed'
          ? 0.02
          : family === 'braided'
            ? -0.01
            : 0;
  const familyShortcutBias = family === 'braided'
    ? 0.08
    : family === 'dense'
      ? 0.06
      : family === 'sparse'
        ? -0.06
        : family === 'framed'
          ? -0.03
          : family === 'split-flow'
            ? -0.01
            : 0;
  return {
    checkPointModifier: clamp(
      legacyTuning.board.checkPointModifier + ((blend - 0.5) * 0.16) + (mood === 'blueprint' ? 0.05 : mood === 'scan' ? -0.03 : 0.02) + familyCheckBias,
      0.16,
      0.56
    ),
    shortcutCountModifier: clamp(
      legacyTuning.board.shortcutCountModifier.menu + ((drift - 0.5) * 0.12) + (theme === 'monolith' ? 0.03 : theme === 'vellum' ? -0.01 : 0) + familyShortcutBias,
      0.04,
      0.3
    )
  };
};

const resolveCuratedMood = (seed: number, cycle: number): DemoMood => {
  const block = Math.floor(cycle / CURATED_MOOD_PATTERNS[0].length);
  const slot = cycle % CURATED_MOOD_PATTERNS[0].length;
  const pattern = CURATED_MOOD_PATTERNS[mix(seed, block, 0x7f4a7c15) % CURATED_MOOD_PATTERNS.length];
  return pattern[slot];
};

const resolveCuratedFamily = (seed: number, cycle: number): MazeFamily => {
  return resolveCuratedFamilyRotation(seed, cycle);
};

const resolveForcedDemoMood = (mood: PresentationMood): DemoMood | undefined => (
  mood === 'auto' ? undefined : mood
);

const pickCuratedCycleValue = <T>(items: readonly T[], seed: number, cycle: number, salt: number): T => {
  const block = Math.floor(cycle / items.length);
  const slot = cycle % items.length;
  const order = [...items.keys()];
  let state = mix(seed, block, salt) || 1;

  for (let index = order.length - 1; index > 0; index -= 1) {
    state = lcg(state);
    const swapIndex = state % (index + 1);
    [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
  }

  return items[order[slot]];
};

const resolvePresentationOffsets = (seed: number, variant: AmbientPresentationVariant): PresentationOffsets => {
  const safeVariant = sanitizePresentationVariant(variant);
  const profile = VARIANT_PROFILES[safeVariant];
  const mixed = mix(seed, 0, safeVariant.charCodeAt(0));
  const alt = mix(seed ^ 0x9e3779b9, 1, safeVariant.charCodeAt(safeVariant.length - 1));

  return {
    frameOffsetX: resolveSignedRange(mixed, profile.boardOffsetRangeX),
    frameOffsetY: resolveSignedRange(alt, profile.boardOffsetRangeY),
    hudOffsetX: resolveSignedRange(mixed >>> 3, profile.hudOffsetRangeX),
    hudOffsetY: resolveSignedRange(alt >>> 3, profile.hudOffsetRangeY),
    driftX: resolveFloatRange(mixed >>> 5, 0.35, 1),
    driftY: resolveFloatRange(alt >>> 5, 0.35, 1)
  };
};

const resolvePhaseLabel = (
  sequence: MenuDemoSequence,
  seed: number,
  mood: DemoMood,
  variant: AmbientPresentationVariant
): string => {
  const safeVariant = sanitizePresentationVariant(variant);
  if (safeVariant !== 'loading') {
    return PASSIVE_TAGLINES[safeVariant];
  }

  const labels = LOADING_PHASE_LABELS[sequence];
  return labels[mix(seed, mood.charCodeAt(0), sequence.charCodeAt(0)) % labels.length];
};

const resolveBlueprintAccentAlpha = (
  presentation: MenuDemoPresentation,
  themeProfile: AmbientThemeProfile = resolveAmbientThemeProfile(presentation.theme)
): number => {
  if (presentation.mood !== 'blueprint') {
    return 0;
  }

  const variantBase = presentation.variant === 'loading'
    ? 0.42
    : presentation.variant === 'ambient'
      ? 0.36
      : 0.3;
  const sequenceScale = presentation.sequence === 'reveal'
    ? 1
    : presentation.sequence === 'arrival'
      ? 0.82
      : presentation.sequence === 'intro'
      ? 0.54
      : 0.36;
  return clamp(variantBase * sequenceScale * themeProfile.shell.blueprintAccentAlphaScale, 0, 0.42);
};

const drawBlueprintAccent = (
  graphics: Phaser.GameObjects.Graphics,
  layout: ReturnType<typeof createBoardLayout>,
  accentColor = palette.board.topHighlight
): void => {
  const safeTileSize = Math.max(2, Math.round(layout.tileSize));
  const width = Math.max(16, Math.round(layout.boardWidth));
  const height = Math.max(16, Math.round(layout.boardHeight));
  const step = Math.max(safeTileSize * 4, Math.round(Math.min(width, height) * 0.18));
  const inset = Math.max(2, Math.round(safeTileSize * 0.45));

  graphics.clear();
  graphics.lineStyle(1, accentColor, 0.12);
  for (let x = step; x < width; x += step) {
    graphics.lineBetween(x + 0.5, inset, x + 0.5, height - inset);
  }
  for (let y = step; y < height; y += step) {
    graphics.lineBetween(inset, y + 0.5, width - inset, y + 0.5);
  }
  graphics.lineStyle(1, accentColor, 0.22);
  graphics.strokeRect(inset + 0.5, inset + 0.5, width - (inset * 2) - 1, height - (inset * 2) - 1);
};

const drawThemeMotifs = (
  themeProfile: AmbientThemeProfile,
  primary: Phaser.GameObjects.Graphics,
  secondary: Phaser.GameObjects.Graphics,
  layout: ReturnType<typeof createBoardLayout>
): void => {
  const width = Math.max(24, Math.round(layout.boardWidth));
  const height = Math.max(24, Math.round(layout.boardHeight));
  const inset = Math.max(4, Math.round(layout.tileSize * 1.1));
  const edge = Math.max(2, Math.round(layout.tileSize * 0.75));

  primary.clear();
  secondary.clear();

  switch (themeProfile.id) {
    case 'noir':
      primary.fillStyle(themeProfile.palette.board.shadow, 0.06);
      primary.fillRect(-edge, height - Math.max(6, edge * 2), width + (edge * 2), Math.max(6, edge * 2));
      primary.lineStyle(1, themeProfile.palette.board.trailGlow, 0.1);
      primary.strokeRect(inset + 0.5, inset + 0.5, width - (inset * 2) - 1, height - (inset * 2) - 1);
      secondary.lineStyle(1, themeProfile.palette.board.innerStroke, 0.08);
      secondary.strokeRect(inset * 1.6 + 0.5, inset * 1.2 + 0.5, width - Math.round(inset * 3.2) - 1, height - Math.round(inset * 2.4) - 1);
      break;
    case 'ember':
      primary.lineStyle(Math.max(2, Math.round(layout.tileSize * 0.08)), themeProfile.palette.board.goal, 0.08);
      primary.strokeRect(edge + 0.5, edge + 0.5, width - (edge * 2) - 1, height - (edge * 2) - 1);
      secondary.fillStyle(themeProfile.palette.board.trailGlow, 0.04);
      secondary.fillRect(edge, edge, width - (edge * 2), Math.max(4, edge));
      secondary.fillRect(edge, height - Math.max(4, edge * 2), width - (edge * 2), Math.max(4, edge));
      break;
    case 'aurora':
      primary.lineStyle(1, themeProfile.palette.board.trailGlow, 0.09);
      primary.lineBetween(inset, height * 0.2, width - inset, height * 0.32);
      primary.lineBetween(inset, height * 0.58, width - inset, height * 0.42);
      primary.lineBetween(inset, height * 0.82, width - inset, height * 0.7);
      secondary.fillStyle(themeProfile.palette.board.playerHalo, 0.04);
      secondary.fillRect(edge, Math.round(height * 0.24), width - (edge * 2), Math.max(4, Math.round(height * 0.08)));
      break;
    case 'vellum':
      primary.lineStyle(1, themeProfile.palette.board.topHighlight, 0.05);
      primary.lineBetween(inset, height * 0.22, width - inset, height * 0.28);
      primary.lineBetween(inset, height * 0.52, width - inset, height * 0.48);
      primary.lineBetween(inset, height * 0.76, width - inset, height * 0.7);
      secondary.fillStyle(themeProfile.palette.board.playerHalo, 0.03);
      secondary.fillRect(edge, Math.round(height * 0.18), width - (edge * 2), Math.max(4, Math.round(height * 0.06)));
      secondary.fillRect(edge, Math.round(height * 0.72), width - (edge * 2), Math.max(4, Math.round(height * 0.05)));
      break;
    case 'monolith':
    default:
      primary.fillStyle(themeProfile.palette.board.shadow, 0.08);
      primary.fillRect(-edge, edge, width + (edge * 2), height + edge);
      secondary.lineStyle(1, themeProfile.palette.board.outerStroke, 0.1);
      secondary.strokeRect(inset + 0.5, inset + 0.5, width - (inset * 2) - 1, height - (inset * 2) - 1);
      break;
  }
};

const resolveSignedRange = (value: number, range: number): number => (
  range <= 0 ? 0 : Math.round((((value & 0xff) / 255) * 2 - 1) * range)
);

const resolveFloatRange = (value: number, min: number, max: number): number => (
  min + (((value & 0xff) / 255) * (max - min))
);

const mix = (seed: number, cycle: number, salt: number): number => (
  Math.imul((seed >>> 0) ^ Math.imul((cycle + 1) >>> 0, 0x9e3779b1), (salt | 1) >>> 0) >>> 0
);

const lcg = (state: number): number => ((Math.imul(state, 1664525) + 1013904223) >>> 0);

const ease = (value: number): number => {
  const clamped = clamp(value, 0, 1);
  return clamped * clamped * (3 - (2 * clamped));
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const lerp = (from: number, to: number, t: number): number => from + ((to - from) * t);

const normalizeAnimationTime = (value: number, periodMs = ANIMATION_TIME_WRAP_MS): number => {
  if (!Number.isFinite(value) || periodMs <= 0) {
    return 0;
  }

  const wrapped = value % periodMs;
  return wrapped < 0 ? wrapped + periodMs : wrapped;
};

const prefersReducedMotion = (): boolean => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);
