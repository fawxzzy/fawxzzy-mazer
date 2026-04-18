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
import { buildBootTimingReport, logBootTimingReport, markBootTiming } from '../boot/bootTiming';
import { resolveDemoWalkerViewFrame, type DemoWalkerConfig, type DemoWalkerCue, type DemoWalkerViewFrame } from '../domain/ai';
import {
  disposeMazeEpisode,
  generateMazeForDifficulty,
  xFromIndex,
  yFromIndex,
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
import { legacyTuning } from '../config/tuning';
import type { IntentFeedState } from '../mazer-core/intent';
import {
  createBoardLayout,
  BoardRenderer,
  resolveBoardPresentationBounds,
  type BoardBounds,
  type BoardLayout,
  type BoardThemeStyle,
  type TrailRenderDiagnostics
} from '../render/boardRenderer';
import { createDemoStatusHud, type HudThemeStyle } from '../render/hudRenderer';
import { createIntentFeedHud, type IntentFeedHudLayoutSnapshot } from '../render/intentFeedRenderer';
import {
  applyPresentationContrastFloors,
  getPaletteReadabilityReport,
  palette,
  type PaletteReadabilityReport
} from '../render/palette';
import { createMenuIntentRuntimeSession, type MenuIntentRuntimeSession } from './menuIntentRuntime';
import {
  clearMenuSceneRuntimeDiagnostics,
  nextMenuSceneInstanceId,
  publishMenuSceneRuntimeDiagnostics,
  resolveMenuScenePerformanceMode,
  resolveMenuSceneRuntimeConfig,
  summarizeMenuSceneRuntimeFeed,
  summarizeMenuSceneFrameWindow,
  type MenuScenePerformanceMode,
  type MenuSceneRuntimeDiagnostics
} from './menuRuntimeDiagnostics';
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
export const TITLE_SIGNATURE_TEXT = '\u00b0 by fawxzzy';
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

export type IntentFeedPresentationMode = 'bottom-panel' | 'commentary-rail';

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
  intentFeedHud: ReturnType<typeof createIntentFeedHud>;
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

type AmbientSkyMovingFamily = 'shooting-star' | 'comet' | 'satellite' | 'ufo';
type AmbientSkyBackdropMotif = 'noir-band' | 'ember-glow' | 'aurora-curtain' | 'vellum-wash' | 'monolith-signal';
type AmbientSkyEventTier = 'occasional' | 'hero' | 'signature';

interface AmbientSkyThemeStyle {
  configuredFamilies: readonly string[];
  backdropMotif: AmbientSkyBackdropMotif;
  hazeColor: number;
  hazeAccentColor: number;
  streakColor: number;
  cometColor: number;
  satelliteColor: number;
  ufoColor: number;
  driftMoteColor: number;
  staticStarDensityScale: number;
  twinkleDensityScale: number;
  hazeAlphaScale: number;
  driftMoteDensityScale: number;
  shootingIntervalScale: number;
  cometIntervalScale: number;
  satelliteIntervalScale: number;
  ufoIntervalScale: number;
  heroCooldownScale: number;
  signatureCooldownScale: number;
  motifAlphaScale: number;
  veilWidthScale: number;
  veilHeightScale: number;
  veilRotationRange: number;
  allowSatellite: boolean;
  allowUfo: boolean;
}

interface AmbientSkyProfileTuning {
  densityScale: number;
  motionScale: number;
  eventIntervalScale: number;
  twinkleCount: number;
  driftMoteCount: number;
  movingEventCap: number;
  signatureEventCap: number;
  clearZoneScale: number;
}

interface AmbientSkyDepths {
  base: number;
  haze: number;
  stars: number;
  twinkles: number;
  motes: number;
  events: number;
}

interface AmbientSkyDiagnostics {
  reducedMotion: boolean;
  configuredFamilies: readonly string[];
  activeCounts: {
    clouds: number;
    farStars: number;
    nearStars: number;
    twinkles: number;
    veils: number;
    driftMotes: number;
    moving: number;
    shootingStars: number;
    comets: number;
    satellites: number;
    ufos: number;
  };
  caps: {
    twinkles: number;
    driftMotes: number;
    moving: number;
    signatureEvents: number;
  };
  reservedZoneBreaches: number;
  uncluttered: boolean;
  behindBoard: boolean;
  depths: {
    backgroundMax: number;
    boardMin: number;
    title?: number;
    install?: number;
  };
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
  ambientSky: AmbientSkyThemeStyle;
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
    palette: (() => {
      const resolved = createThemePalette({
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
        floor: 0xc7d0d8,
        path: 0x97a5b2,
        route: 0x2d784c,
        routeCore: 0xf6fff9,
        routeGlow: 0x173f2c,
        trail: 0x233f90,
        trailCore: 0xf2f6ff,
        trailGlow: 0x6f87ee,
        start: 0xca9021,
        startCore: 0xfff3d0,
        startGlow: 0x825618,
        goal: 0x901d45,
        goalCore: 0xfff0f4,
        player: 0x066491,
        playerCore: 0xf8feff,
        playerHalo: 0xa5f3ff,
        playerShadow: 0x030303
      },
      hud: {
        panelStroke: 0xa2b7cd,
        accent: 0xf4f8ff,
        hintText: 0xb8cad9
      }
      });

      return {
        ...resolved,
        board: {
          ...resolved.board,
          route: 0x2a8758,
          trail: 0x2e4191,
          player: 0x1e7da3,
          start: 0xc28a1f,
          goal: 0x7f1f43
        }
      };
    })(),
    boardTheme: {
      solutionPathGlowAlphaScale: 0.56,
      solutionPathCoreAlphaScale: 0.8,
      trailFillAlphaScale: 1.02,
      trailGlowAlphaScale: 0.86,
      trailCoreAlphaScale: 1.12,
      actorHaloAlphaScale: 1.08,
      goalGlowAlphaScale: 0.96
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
    ambientSky: {
      configuredFamilies: ['micro-twinkle', 'cold-streak', 'satellite-blink', 'ufo-blink', 'distant-galaxy-band'],
      backdropMotif: 'noir-band',
      hazeColor: 0x10213c,
      hazeAccentColor: 0x365f8a,
      streakColor: 0xf1f6ff,
      cometColor: 0x9bc8ff,
      satelliteColor: 0xcde8ff,
      ufoColor: 0x8fdcff,
      driftMoteColor: 0x66758a,
      staticStarDensityScale: 0.76,
      twinkleDensityScale: 0.78,
      hazeAlphaScale: 0.72,
      driftMoteDensityScale: 0.18,
      shootingIntervalScale: 1.18,
      cometIntervalScale: 1.22,
      satelliteIntervalScale: 0.96,
      ufoIntervalScale: 1.24,
      heroCooldownScale: 1.08,
      signatureCooldownScale: 1.18,
      motifAlphaScale: 0.72,
      veilWidthScale: 1.14,
      veilHeightScale: 0.74,
      veilRotationRange: 10,
      allowSatellite: true,
      allowUfo: true
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
    palette: (() => {
      const resolved = createThemePalette({
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
          route: 0x238652,
          routeCore: 0xf4ffef,
          routeGlow: 0x1f3f2a,
          trail: 0x576bde,
          trailCore: 0xf6f1ff,
          trailGlow: 0x97a6ff,
          start: 0xd39a2c,
          startCore: 0xfff0ca,
          startGlow: 0x794d1c,
          goal: 0xa33050,
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
      });

      return {
        ...resolved,
        board: {
          ...resolved.board,
          trail: 0x466299,
          goal: 0xa24f68,
          player: 0x063848
        }
      };
    })(),
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
    ambientSky: {
      configuredFamilies: ['micro-twinkle', 'warm-meteor', 'comet', 'ember-dust', 'deep-cinder-glow'],
      backdropMotif: 'ember-glow',
      hazeColor: 0x5b2b18,
      hazeAccentColor: 0xc06e37,
      streakColor: 0xffd4a1,
      cometColor: 0xff9d57,
      satelliteColor: 0xffc483,
      ufoColor: 0xffa062,
      driftMoteColor: 0xf18f4d,
      staticStarDensityScale: 0.7,
      twinkleDensityScale: 0.74,
      hazeAlphaScale: 0.94,
      driftMoteDensityScale: 0.96,
      shootingIntervalScale: 0.96,
      cometIntervalScale: 0.88,
      satelliteIntervalScale: 1.28,
      ufoIntervalScale: 1.42,
      heroCooldownScale: 0.92,
      signatureCooldownScale: 1.08,
      motifAlphaScale: 0.9,
      veilWidthScale: 0.96,
      veilHeightScale: 0.84,
      veilRotationRange: 13,
      allowSatellite: false,
      allowUfo: false
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
    palette: (() => {
      const resolved = createThemePalette({
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
      });

      return {
        ...resolved,
        board: {
          ...resolved.board,
          trail: 0x5969ba,
          goal: 0xaa568c,
          player: 0x06465a
        }
      };
    })(),
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
    ambientSky: {
      configuredFamilies: ['micro-twinkle', 'cool-streak', 'comet', 'aurora-curtain', 'ion-veil', 'ufo-flyby'],
      backdropMotif: 'aurora-curtain',
      hazeColor: 0x214a82,
      hazeAccentColor: 0x7f59df,
      streakColor: 0xd9fbff,
      cometColor: 0x8be7ff,
      satelliteColor: 0xbbe0ff,
      ufoColor: 0xb391ff,
      driftMoteColor: 0x6fe6ff,
      staticStarDensityScale: 0.86,
      twinkleDensityScale: 0.96,
      hazeAlphaScale: 1,
      driftMoteDensityScale: 0.42,
      shootingIntervalScale: 0.86,
      cometIntervalScale: 0.82,
      satelliteIntervalScale: 1,
      ufoIntervalScale: 0.92,
      heroCooldownScale: 0.88,
      signatureCooldownScale: 0.96,
      motifAlphaScale: 1.04,
      veilWidthScale: 0.74,
      veilHeightScale: 1.46,
      veilRotationRange: 8,
      allowSatellite: true,
      allowUfo: true
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
    palette: (() => {
      const resolved = createThemePalette({
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
          wall: 0x171c22,
          floor: 0xe7dfcf,
          path: 0x9eb0bf,
          route: 0x214f35,
          routeCore: 0xf7fbf2,
          routeGlow: 0x3b4b3d,
          trail: 0x3550ae,
          trailCore: 0xfbfdff,
          trailGlow: 0x6880dd,
          start: 0xb87d1d,
          startCore: 0xfff2d6,
          startGlow: 0x7a5418,
          goal: 0x74203b,
          goalCore: 0xfff6f9,
          player: 0x0e7cb6,
          playerCore: 0xfafbff,
          playerHalo: 0x7bd1ef,
          playerShadow: 0xb4a487
        },
        hud: {
          panelStroke: 0x7790ab,
          accent: 0xdeebf7,
          hintText: 0xeaf2fb
        }
      });

      const adjusted = applyPresentationContrastFloors({
        ...resolved,
        board: {
          ...resolved.board,
          wall: 0x171c22,
          floor: 0xe7dfcf
        }
      });

      return {
        ...adjusted,
        board: {
          ...adjusted.board,
          trail: 0x5974aa,
          goal: 0x944d67,
          player: 0x053545
        }
      };
    })(),
    boardTheme: {
      solutionPathGlowAlphaScale: 0.48,
      solutionPathCoreAlphaScale: 0.72,
      trailFillAlphaScale: 1.02,
      trailGlowAlphaScale: 0.9,
      trailCoreAlphaScale: 1.12,
      actorHaloAlphaScale: 1.08,
      goalGlowAlphaScale: 1.02
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
    ambientSky: {
      configuredFamilies: ['paper-sky-dust', 'pinprick-stars', 'quiet-streak', 'vellum-sky-wash', 'soft-galaxy'],
      backdropMotif: 'vellum-wash',
      hazeColor: 0xd8d0be,
      hazeAccentColor: 0xb1c5d7,
      streakColor: 0x7a91b0,
      cometColor: 0x8aa4bf,
      satelliteColor: 0xa2b5c8,
      ufoColor: 0xa2b5c8,
      driftMoteColor: 0xa89066,
      staticStarDensityScale: 0.54,
      twinkleDensityScale: 0.62,
      hazeAlphaScale: 0.58,
      driftMoteDensityScale: 0.92,
      shootingIntervalScale: 1.36,
      cometIntervalScale: 1.42,
      satelliteIntervalScale: 1.64,
      ufoIntervalScale: 1.8,
      heroCooldownScale: 1.18,
      signatureCooldownScale: 1.3,
      motifAlphaScale: 0.58,
      veilWidthScale: 1.22,
      veilHeightScale: 0.72,
      veilRotationRange: 6,
      allowSatellite: false,
      allowUfo: false
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
    palette: (() => {
      const resolved = createThemePalette({
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
          floor: 0xc9d1d7,
          path: 0x8a929b,
          route: 0x2d7550,
          routeCore: 0xf7fff9,
          routeGlow: 0x18422f,
          trail: 0x324ead,
          trailCore: 0xf7f9ff,
          trailGlow: 0x738af0,
          start: 0xc1841a,
          startCore: 0xfff2d1,
          startGlow: 0x7c5314,
          goal: 0xb0365e,
          goalCore: 0xfff0f4,
          player: 0x0f78b2,
          playerCore: 0xfcffff,
          playerHalo: 0x9df1ff,
          playerShadow: 0x020202
        },
        hud: {
          panelStroke: 0xa3a8b0,
          accent: 0xf4f6f8,
          hintText: 0xc0c6ce
        }
      });

      return {
        ...resolved,
        board: {
          ...resolved.board,
          trail: 0x42599d,
          goal: 0x8f4564,
          player: 0x052f41
        }
      };
    })(),
    boardTheme: {
      solutionPathGlowAlphaScale: 0.54,
      solutionPathCoreAlphaScale: 0.78,
      trailFillAlphaScale: 1.04,
      trailGlowAlphaScale: 0.88,
      trailCoreAlphaScale: 1.1,
      actorHaloAlphaScale: 0.98,
      goalGlowAlphaScale: 0.9
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
    ambientSky: {
      configuredFamilies: ['technical-streak', 'grayscale-stars', 'signal-blink', 'signal-band', 'satellite-drift'],
      backdropMotif: 'monolith-signal',
      hazeColor: 0x1f232a,
      hazeAccentColor: 0x58626f,
      streakColor: 0xf1f3f6,
      cometColor: 0xb2bcc8,
      satelliteColor: 0xd8dde4,
      ufoColor: 0xadb7c4,
      driftMoteColor: 0x7c8794,
      staticStarDensityScale: 0.52,
      twinkleDensityScale: 0.58,
      hazeAlphaScale: 0.66,
      driftMoteDensityScale: 0.22,
      shootingIntervalScale: 1.12,
      cometIntervalScale: 1.18,
      satelliteIntervalScale: 0.9,
      ufoIntervalScale: 1.8,
      heroCooldownScale: 1.04,
      signatureCooldownScale: 1.18,
      motifAlphaScale: 0.66,
      veilWidthScale: 1.34,
      veilHeightScale: 0.42,
      veilRotationRange: 4,
      allowSatellite: true,
      allowUfo: false
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

const AMBIENT_SKY_DEPTHS: AmbientSkyDepths = Object.freeze({
  base: -14,
  haze: -13,
  stars: -12,
  twinkles: -11,
  motes: -10.5,
  events: -10
});
const AMBIENT_SKY_MAX_DELTA_MS = 80;
const AMBIENT_SKY_TEXTURES = Object.freeze({
  twinkle: 'mazer-ambient-twinkle',
  streak: 'mazer-ambient-streak',
  comet: 'mazer-ambient-comet',
  satellite: 'mazer-ambient-satellite',
  ufo: 'mazer-ambient-ufo'
});

interface AmbientSkyRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface AmbientSkyTwinkleState {
  sprite: Phaser.GameObjects.Image;
  anchorX: number;
  anchorY: number;
  baseAlpha: number;
  amplitude: number;
  pulseMs: number;
  driftX: number;
  driftY: number;
  phase: number;
}

interface AmbientSkyDriftMoteState {
  sprite: Phaser.GameObjects.Image;
  anchorX: number;
  anchorY: number;
  rangeX: number;
  rangeY: number;
  speedX: number;
  speedY: number;
  phase: number;
  baseAlpha: number;
  amplitude: number;
}

interface AmbientSkyVeilState {
  graphics: Phaser.GameObjects.Graphics;
  anchorX: number;
  anchorY: number;
  rangeX: number;
  rangeY: number;
  pulseMs: number;
  phase: number;
  baseAlpha: number;
  amplitude: number;
  scaleAmplitudeX: number;
  scaleAmplitudeY: number;
  rotationRange: number;
  rotationPhase: number;
}

interface AmbientSkyMovingEvent {
  family: AmbientSkyMovingFamily;
  body: Phaser.GameObjects.Image;
  glow?: Phaser.GameObjects.Image;
  startedAt: number;
  durationMs: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  maxAlpha: number;
  blinkMs?: number;
  wobblePx?: number;
  wobbleSpeed?: number;
  phase: number;
  width: number;
  height: number;
}

interface AmbientSkyLaneSegment {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

const expandAmbientRect = (rect: AmbientSkyRect, amount: number): AmbientSkyRect => ({
  left: rect.left - amount,
  top: rect.top - amount,
  right: rect.right + amount,
  bottom: rect.bottom + amount
});

const rectsIntersect = (left: AmbientSkyRect, right: AmbientSkyRect): boolean => (
  left.left < right.right
  && left.right > right.left
  && left.top < right.bottom
  && left.bottom > right.top
);

export const resolveAmbientSkyProfileTuning = (
  profile?: PresentationDeploymentProfile,
  variant: AmbientPresentationVariant = DEFAULT_PRESENTATION_VARIANT,
  reducedMotion = false
): AmbientSkyProfileTuning => {
  const safeVariant = sanitizePresentationVariant(variant);
  let tuning: AmbientSkyProfileTuning = {
    densityScale: 1.08,
    motionScale: 1.06,
    eventIntervalScale: 0.94,
    twinkleCount: legacyTuning.menu.ambientSky.twinkleCount,
    driftMoteCount: legacyTuning.menu.ambientSky.driftMoteCount,
    movingEventCap: 2,
    signatureEventCap: 1,
    clearZoneScale: 1
  };

  switch (profile) {
    case 'tv':
      tuning = {
        ...tuning,
        densityScale: 1.32,
        motionScale: 1.14,
        eventIntervalScale: 0.74,
        twinkleCount: 28,
        driftMoteCount: 11,
        movingEventCap: 2,
        signatureEventCap: 1,
        clearZoneScale: 0.94
      };
      break;
    case 'obs':
      tuning = {
        ...tuning,
        densityScale: 0.72,
        motionScale: 0.82,
        eventIntervalScale: 1.14,
        twinkleCount: 12,
        driftMoteCount: 4,
        movingEventCap: 1,
        signatureEventCap: 1,
        clearZoneScale: 1.28
      };
      break;
    case 'mobile':
      tuning = {
        ...tuning,
        densityScale: 0.84,
        motionScale: 0.86,
        eventIntervalScale: 1.04,
        twinkleCount: 15,
        driftMoteCount: 5,
        movingEventCap: 1,
        signatureEventCap: 1,
        clearZoneScale: 1.18
      };
      break;
    default:
      break;
  }

  switch (safeVariant) {
    case 'title':
      tuning = {
        ...tuning,
        densityScale: tuning.densityScale * 1.14,
        eventIntervalScale: tuning.eventIntervalScale * 0.82
      };
      break;
    case 'loading':
      tuning = {
        ...tuning,
        densityScale: tuning.densityScale * 0.9,
        motionScale: tuning.motionScale * 0.92,
        eventIntervalScale: tuning.eventIntervalScale * 1.06
      };
      break;
    case 'ambient':
    default:
      break;
  }

  if (reducedMotion) {
    tuning = {
      ...tuning,
      densityScale: tuning.densityScale * 0.94,
      motionScale: tuning.motionScale * 0.56,
      eventIntervalScale: tuning.eventIntervalScale * 1.22,
      twinkleCount: Math.max(6, Math.round(tuning.twinkleCount)),
      driftMoteCount: Math.max(1, Math.round(tuning.driftMoteCount * 0.82)),
      movingEventCap: Math.min(tuning.movingEventCap, 1),
      signatureEventCap: 0,
      clearZoneScale: tuning.clearZoneScale * 1.06
    };
  }

  return tuning;
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

const resolveBoardEdgeBufferPx = (
  sceneLayout: SceneLayoutProfile,
  profile?: PresentationDeploymentProfile
): number => (
  profile === 'mobile' && (sceneLayout.isTiny || sceneLayout.isNarrow)
    ? MOBILE_BOARD_EDGE_BUFFER_PX
    : TARGET_BOARD_EDGE_BUFFER_PX
);

const resolveTitleBandMetrics = (
  sceneLayout: SceneLayoutProfile,
  profile?: PresentationDeploymentProfile
): TitleBandMetrics => {
  const compact = sceneLayout.isTiny || sceneLayout.isNarrow;
  return {
    bandInset: compact ? COMPACT_TITLE_BAND_INSET_PX : DEFAULT_TITLE_BAND_INSET_PX,
    bandHeight: (compact ? COMPACT_TITLE_BAND_HEIGHT_PX : DEFAULT_TITLE_BAND_HEIGHT_PX) + (sceneLayout.isPortrait ? 2 : 0),
    minHeight: compact ? 48 : 52,
    boardGap: resolveBoardEdgeBufferPx(sceneLayout, profile)
  };
};

const resolveInstallEdgeInsetPx = (sceneLayout: SceneLayoutProfile): number => (
  sceneLayout.isTiny || sceneLayout.isNarrow
    ? COMPACT_INSTALL_EDGE_INSET_PX
    : DEFAULT_INSTALL_EDGE_INSET_PX
);

const createSceneBounds = (
  left: number,
  top: number,
  right: number,
  bottom: number
): BoardBounds => ({
  left,
  top,
  right,
  bottom,
  width: right - left,
  height: bottom - top,
  centerX: left + ((right - left) / 2),
  centerY: top + ((bottom - top) / 2)
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
const TRAIL_HEAD_ATTACHMENT_TOLERANCE_PX = 0.75;

const resolveLiveTrailHeadIndex = (view: DemoWalkerViewFrame): number => (
  view.currentIndex !== view.nextIndex && view.progress > 0 ? view.nextIndex : view.currentIndex
);

const isTrailHeadAttachedToActor = (render: TrailRenderDiagnostics): boolean => {
  if (!render.hasActiveMotion || render.motionHeadCenter === undefined || render.headCenter === undefined) {
    return true;
  }

  return Math.abs(render.headCenter.x - render.motionHeadCenter.x) <= TRAIL_HEAD_ATTACHMENT_TOLERANCE_PX
    && Math.abs(render.headCenter.y - render.motionHeadCenter.y) <= TRAIL_HEAD_ATTACHMENT_TOLERANCE_PX;
};

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

export interface TitleLockupLayout {
  plateWidth: number;
  plateHeight: number;
  titleX: number;
  titleY: number;
  titleShadowY: number;
  titleFontSize: number;
  titleLetterSpacing: number;
  subtitleTopOffsetY: number;
  subtitleGap: number;
  subtitleFontSize: number;
  subtitleLetterSpacing: number;
  estimatedSubtitleHeight: number;
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

const TARGET_BOARD_EDGE_BUFFER_PX = 5;
const MOBILE_BOARD_EDGE_BUFFER_PX = 6;
const DEFAULT_TITLE_BAND_INSET_PX = 0;
const COMPACT_TITLE_BAND_INSET_PX = 0;
const DEFAULT_TITLE_BAND_HEIGHT_PX = 64;
const COMPACT_TITLE_BAND_HEIGHT_PX = 60;
const DEFAULT_INSTALL_EDGE_INSET_PX = 14;
const COMPACT_INSTALL_EDGE_INSET_PX = 12;

interface TitleBandMetrics {
  bandInset: number;
  bandHeight: number;
  minHeight: number;
  boardGap: number;
}

export const MENU_SCENE_VISUAL_CAPTURE_KEY = '__MAZER_VISUAL_CAPTURE__' as const;
export const MENU_SCENE_VISUAL_DIAGNOSTICS_KEY = '__MAZER_VISUAL_DIAGNOSTICS__' as const;
export { MENU_SCENE_RUNTIME_DIAGNOSTICS_KEY } from './menuRuntimeDiagnostics';

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

export interface VisualSubtitleDiagnostics {
  visible: boolean;
  lineCount: number;
  minimumGapBelowTitle?: number;
  bounds?: VisualSceneBounds;
  gapBelowTitle?: number;
  gapBelowPlate?: number;
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
    plateBounds?: VisualSceneBounds;
    textBounds?: VisualSceneBounds;
    subtitle?: VisualSubtitleDiagnostics;
  };
  install: {
    expected: boolean;
    visible: boolean;
    forced: boolean;
    state: InstallSurfaceState['mode'];
    frame?: InstallChromeFrame;
    bounds?: VisualSceneBounds;
  };
  intentFeed: {
    visible: boolean;
    dock?: IntentFeedHudLayoutSnapshot['dock'];
    compact: boolean;
    statusVisible: boolean;
    quickThoughtCount: number;
    maxVisibleEvents: number;
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
  bootTiming?: ReturnType<typeof buildBootTimingReport>;
  ambient?: AmbientSkyDiagnostics;
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

const resolveRenderedTextLineCount = (text: Phaser.GameObjects.Text): number => {
  const wrappedLines = text.getWrappedText(text.text);
  if (Array.isArray(wrappedLines) && wrappedLines.length > 0) {
    return wrappedLines.length;
  }

  return String(text.text ?? '')
    .split(/\r?\n/)
    .filter((line) => line.length > 0).length || 1;
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

interface AmbientSkyLayerOptions {
  width: number;
  height: number;
  seed: number;
  themeProfile: AmbientThemeProfile;
  variant: AmbientPresentationVariant;
  profile?: PresentationDeploymentProfile;
  reducedMotion: boolean;
}

class AmbientSkyLayer {
  private readonly width: number;
  private readonly height: number;
  private readonly themeProfile: AmbientThemeProfile;
  private readonly tuning: AmbientSkyProfileTuning;
  private readonly reducedMotion: boolean;
  private readonly base: Phaser.GameObjects.Graphics;
  private readonly clouds: Phaser.GameObjects.Graphics;
  private readonly farStars: Phaser.GameObjects.Graphics;
  private readonly nearStars: Phaser.GameObjects.Graphics;
  private readonly twinkles: AmbientSkyTwinkleState[] = [];
  private readonly driftMotes: AmbientSkyDriftMoteState[] = [];
  private readonly veils: AmbientSkyVeilState[] = [];
  private readonly movingEvents: AmbientSkyMovingEvent[] = [];
  private backdropCounts = {
    clouds: 0,
    farStars: 0,
    nearStars: 0
  };
  private timelineMs = 0;
  private rngState: number;
  private nextShootingAt = 0;
  private nextCometAt = 0;
  private nextSatelliteAt = 0;
  private nextUfoAt = 0;
  private nextHeroWindowAt = 0;
  private nextSignatureWindowAt = 0;
  private boardRect?: AmbientSkyRect;
  private titleRect?: AmbientSkyRect;
  private installRect?: AmbientSkyRect;
  private reservedRects: AmbientSkyRect[] = [];

  public constructor(
    private readonly scene: Phaser.Scene,
    options: AmbientSkyLayerOptions
  ) {
    this.width = sanitizePositive(options.width, DEFAULT_VIEWPORT_WIDTH);
    this.height = sanitizePositive(options.height, DEFAULT_VIEWPORT_HEIGHT);
    this.themeProfile = options.themeProfile;
    this.reducedMotion = options.reducedMotion;
    this.tuning = resolveAmbientSkyProfileTuning(options.profile, options.variant, options.reducedMotion);
    this.rngState = ((options.seed >>> 0)
      ^ (this.width << 4)
      ^ (this.height << 1)
      ^ options.themeProfile.id.charCodeAt(0)
      ^ options.variant.charCodeAt(0)
      ^ (options.profile?.charCodeAt(0) ?? 0)
    ) >>> 0 || 1;
    this.ensureTextures();
    this.base = this.scene.add.graphics().setDepth(AMBIENT_SKY_DEPTHS.base);
    this.clouds = this.scene.add.graphics().setDepth(AMBIENT_SKY_DEPTHS.haze).setBlendMode(Phaser.BlendModes.SCREEN);
    this.farStars = this.scene.add.graphics().setDepth(AMBIENT_SKY_DEPTHS.stars);
    this.nearStars = this.scene.add.graphics().setDepth(AMBIENT_SKY_DEPTHS.stars);
    this.drawBackdrop();
    this.createVeils();
    this.createTwinkles();
    this.createDriftMotes();
    this.resetSchedules();
  }

  public setReservedFrames(
    boardBounds?: BoardBounds,
    boardTileSize?: number,
    titleFrame?: TitleBandFrame,
    installFrame?: InstallChromeFrame
  ): void {
    const clearZoneTuning = legacyTuning.menu.ambientSky.clearZone;
    const profilePad = (boardTileSize ?? 0) * clearZoneTuning.boardPadTiles * this.tuning.clearZoneScale;
    const extraPad = this.tuning.clearZoneScale > 1.2
      ? (clearZoneTuning.obsPadPx * 0.5)
      : this.tuning.clearZoneScale > 1.08
        ? clearZoneTuning.mobilePadPx
        : 0;
    this.boardRect = boardBounds
      ? expandAmbientRect(
        {
          left: boardBounds.left,
          top: boardBounds.top,
          right: boardBounds.right,
          bottom: boardBounds.bottom
        },
        profilePad + extraPad
      )
      : undefined;
    this.titleRect = titleFrame
      ? expandAmbientRect(
        {
          left: titleFrame.left,
          top: titleFrame.top,
          right: titleFrame.right,
          bottom: titleFrame.bottom
        },
        clearZoneTuning.titlePadPx * this.tuning.clearZoneScale
      )
      : undefined;
    this.installRect = installFrame
      ? expandAmbientRect(
        {
          left: installFrame.left,
          top: installFrame.top,
          right: installFrame.right,
          bottom: installFrame.bottom
        },
        clearZoneTuning.installPadPx * this.tuning.clearZoneScale
      )
      : undefined;
    this.reservedRects = [this.boardRect, this.titleRect, this.installRect].filter((value): value is AmbientSkyRect => Boolean(value));
  }

  public update(deltaMs: number): void {
    const frameMs = Math.max(0, Math.min(AMBIENT_SKY_MAX_DELTA_MS, deltaMs || 0));
    this.timelineMs += frameMs;
    this.updateVeils();
    this.updateTwinkles();
    this.updateDriftMotes();
    this.updateMovingEvents();
    this.maybeSpawnEvents();
  }

  public getDiagnostics(boardMinDepth: number, titleDepth?: number, installDepth?: number): AmbientSkyDiagnostics {
    const movingCounts = {
      shootingStars: this.countMovingEvents('shooting-star'),
      comets: this.countMovingEvents('comet'),
      satellites: this.countMovingEvents('satellite'),
      ufos: this.countMovingEvents('ufo')
    };
    const reservedZoneBreaches = this.movingEvents.reduce((total, event) => (
      total + (this.eventViolatesReservedZones(event) ? 1 : 0)
    ), 0);
    const signatureEvents = movingCounts.satellites + movingCounts.ufos;
    const backgroundMax = Math.max(
      AMBIENT_SKY_DEPTHS.base,
      AMBIENT_SKY_DEPTHS.haze,
      AMBIENT_SKY_DEPTHS.stars,
      AMBIENT_SKY_DEPTHS.twinkles,
      AMBIENT_SKY_DEPTHS.motes,
      AMBIENT_SKY_DEPTHS.events
    );

    return {
      reducedMotion: this.reducedMotion,
      configuredFamilies: this.themeProfile.ambientSky.configuredFamilies,
      activeCounts: {
        clouds: this.backdropCounts.clouds,
        farStars: this.backdropCounts.farStars,
        nearStars: this.backdropCounts.nearStars,
        twinkles: this.twinkles.length,
        veils: this.veils.length,
        driftMotes: this.driftMotes.length,
        moving: this.movingEvents.length,
        ...movingCounts
      },
      caps: {
        twinkles: this.tuning.twinkleCount,
        driftMotes: this.tuning.driftMoteCount,
        moving: this.tuning.movingEventCap,
        signatureEvents: this.tuning.signatureEventCap
      },
      reservedZoneBreaches,
      uncluttered: this.twinkles.length <= this.tuning.twinkleCount
        && this.driftMotes.length <= this.tuning.driftMoteCount
        && this.movingEvents.length <= this.tuning.movingEventCap
        && signatureEvents <= this.tuning.signatureEventCap,
      behindBoard: backgroundMax < boardMinDepth,
      depths: {
        backgroundMax,
        boardMin: boardMinDepth,
        ...(titleDepth !== undefined ? { title: titleDepth } : {}),
        ...(installDepth !== undefined ? { install: installDepth } : {})
      }
    };
  }

  public destroy(): void {
    this.destroyMovingEvents();
    for (const twinkle of this.twinkles) {
      twinkle.sprite.destroy();
    }
    this.twinkles.length = 0;
    for (const mote of this.driftMotes) {
      mote.sprite.destroy();
    }
    this.driftMotes.length = 0;
    for (const veil of this.veils) {
      veil.graphics.destroy();
    }
    this.veils.length = 0;
    this.nearStars.destroy();
    this.farStars.destroy();
    this.clouds.destroy();
    this.base.destroy();
  }

  private ensureTextures(): void {
    const { textures } = this.scene;
    if (!textures.exists(AMBIENT_SKY_TEXTURES.twinkle)) {
      const graphics = this.scene.add.graphics().setVisible(false);
      graphics.fillStyle(0xffffff, 1);
      graphics.fillRect(2, 0, 1, 5);
      graphics.fillRect(0, 2, 5, 1);
      graphics.fillRect(2, 2, 1, 1);
      graphics.generateTexture(AMBIENT_SKY_TEXTURES.twinkle, 5, 5);
      graphics.destroy();
    }
    if (!textures.exists(AMBIENT_SKY_TEXTURES.streak)) {
      const graphics = this.scene.add.graphics().setVisible(false);
      for (let index = 0; index < 14; index += 1) {
        const alpha = (index + 1) / 14;
        graphics.fillStyle(0xffffff, alpha);
        graphics.fillRect(index * 4, index < 8 ? 2 : 1, 4, index < 8 ? 1 : 2);
      }
      graphics.generateTexture(AMBIENT_SKY_TEXTURES.streak, 56, 4);
      graphics.destroy();
    }
    if (!textures.exists(AMBIENT_SKY_TEXTURES.comet)) {
      const graphics = this.scene.add.graphics().setVisible(false);
      for (let index = 0; index < 12; index += 1) {
        graphics.fillStyle(0xffffff, Math.max(0.08, (index + 1) / 12));
        graphics.fillRect(index * 4, 2, 4, 2);
      }
      graphics.fillStyle(0xffffff, 1);
      graphics.fillRect(48, 1, 8, 4);
      graphics.generateTexture(AMBIENT_SKY_TEXTURES.comet, 56, 6);
      graphics.destroy();
    }
    if (!textures.exists(AMBIENT_SKY_TEXTURES.satellite)) {
      const graphics = this.scene.add.graphics().setVisible(false);
      graphics.fillStyle(0xffffff, 1);
      graphics.fillRect(0, 1, 3, 2);
      graphics.fillRect(4, 0, 4, 4);
      graphics.fillRect(9, 1, 3, 2);
      graphics.generateTexture(AMBIENT_SKY_TEXTURES.satellite, 12, 4);
      graphics.destroy();
    }
    if (!textures.exists(AMBIENT_SKY_TEXTURES.ufo)) {
      const graphics = this.scene.add.graphics().setVisible(false);
      graphics.fillStyle(0xffffff, 1);
      graphics.fillRect(2, 1, 10, 2);
      graphics.fillRect(4, 0, 6, 1);
      graphics.fillRect(1, 3, 12, 2);
      graphics.fillRect(5, 5, 4, 1);
      graphics.generateTexture(AMBIENT_SKY_TEXTURES.ufo, 14, 6);
      graphics.destroy();
    }
  }

  private drawBackdrop(): void {
    const staticStarScale = this.themeProfile.ambientSky.staticStarDensityScale * this.tuning.densityScale;
    const cloudCount = Math.max(3, Math.round(legacyTuning.menu.starfield.cloudCount * staticStarScale * 0.74));
    const farStarCount = Math.max(96, Math.floor(legacyTuning.menu.starfield.starCount * 0.5 * staticStarScale));
    const nearStarCount = Math.max(72, Math.ceil(legacyTuning.menu.starfield.starCount * 0.24 * staticStarScale));
    this.backdropCounts = {
      clouds: cloudCount,
      farStars: farStarCount,
      nearStars: nearStarCount
    };

    this.base.clear();
    this.base.fillGradientStyle(
      this.themeProfile.background.topLeft,
      this.themeProfile.background.topRight,
      this.themeProfile.background.bottomLeft,
      this.themeProfile.background.bottomRight,
      1
    );
    this.base.fillRect(0, 0, this.width, this.height);
    this.base.fillStyle(this.themeProfile.palette.background.nebulaCore, 0.11);
    this.base.fillCircle(this.width * 0.46, this.height * 0.42, Math.max(this.width, this.height) * 0.21);
    this.base.fillStyle(this.themeProfile.palette.background.nebula, 0.08);
    this.base.fillCircle(this.width * 0.58, this.height * 0.62, Math.max(this.width, this.height) * 0.29);
    this.base.fillStyle(this.themeProfile.palette.background.deepSpace, 0.14);
    this.base.fillRect(0, this.height * 0.78, this.width, this.height * 0.22);

    this.clouds.clear();
    for (let index = 0; index < cloudCount; index += 1) {
      this.clouds.fillStyle(
        this.themeProfile.palette.background.cloud,
        this.range(legacyTuning.menu.starfield.cloudAlphaMin, legacyTuning.menu.starfield.cloudAlphaMax)
          * this.themeProfile.background.cloudAlphaScale
          * 0.72
      );
      this.clouds.fillCircle(
        this.range(this.width * 0.12, this.width * 0.88),
        this.range(this.height * 0.14, this.height * 0.86),
        this.range(legacyTuning.menu.starfield.cloudRadiusMin * 0.8, legacyTuning.menu.starfield.cloudRadiusMax * 0.88)
      );
    }

    this.farStars.clear();
    for (let index = 0; index < farStarCount; index += 1) {
      this.farStars.fillStyle(
        this.themeProfile.palette.background.star,
        this.range(
          legacyTuning.menu.starfield.starAlphaMin * 0.5,
          legacyTuning.menu.starfield.starAlphaMax * 0.42
        ) * this.themeProfile.background.farStarAlphaScale
      );
      this.farStars.fillCircle(
        this.range(0, this.width),
        this.range(0, this.height),
        this.range(legacyTuning.menu.starfield.starRadiusMin * 0.8, legacyTuning.menu.starfield.starRadiusMax * 0.68)
      );
    }

    this.nearStars.clear();
    for (let index = 0; index < nearStarCount; index += 1) {
      this.nearStars.fillStyle(
        this.themeProfile.palette.background.star,
        this.range(
          legacyTuning.menu.starfield.starAlphaMin * 0.56,
          legacyTuning.menu.starfield.starAlphaMax * 0.54
        ) * this.themeProfile.background.nearStarAlphaScale
      );
      this.nearStars.fillCircle(
        this.range(0, this.width),
        this.range(0, this.height),
        this.range(legacyTuning.menu.starfield.starRadiusMin * 0.9, legacyTuning.menu.starfield.starRadiusMax * 0.86)
      );
    }

    this.drawBackdropMotif(staticStarScale);

    this.base.fillStyle(
      this.themeProfile.palette.background.vignette,
      legacyTuning.menu.starfield.vignetteAlpha * this.themeProfile.background.vignetteAlphaScale
    );
    this.base.fillRect(0, 0, this.width, this.height * legacyTuning.menu.starfield.vignetteBandRatio);
    this.base.fillRect(
      0,
      this.height * (1 - legacyTuning.menu.starfield.vignetteBandRatio),
      this.width,
      this.height * legacyTuning.menu.starfield.vignetteBandRatio
    );
    this.base.fillStyle(this.themeProfile.palette.background.vignette, 0.08);
    this.base.fillCircle(this.width * 0.5, this.height * 0.5, Math.max(this.width, this.height) * 0.58);
  }

  private drawBackdropMotif(staticStarScale: number): void {
    const motifAlpha = this.themeProfile.ambientSky.motifAlphaScale * Math.max(0.72, this.tuning.densityScale);
    const clusterCount = Math.max(8, Math.round(16 * staticStarScale));
    const lineHeight = Math.max(1, Math.round(this.height * 0.0024));

    switch (this.themeProfile.ambientSky.backdropMotif) {
      case 'noir-band':
        this.drawBackdropBand(this.clouds, this.width * 0.16, this.height * 0.42, this.width * 0.34, this.height * 0.18, this.themeProfile.ambientSky.hazeColor, 0.052 * motifAlpha);
        this.drawBackdropBand(this.clouds, this.width * 0.84, this.height * 0.68, this.width * 0.28, this.height * 0.16, this.themeProfile.ambientSky.hazeAccentColor, 0.034 * motifAlpha);
        this.base.fillStyle(this.themeProfile.ambientSky.streakColor, 0.016 * motifAlpha);
        this.base.fillRect(0, Math.round(this.height * 0.2), this.width, lineHeight);
        this.drawStarCluster(this.farStars, this.width * 0.14, this.height * 0.18, this.width * 0.12, this.height * 0.08, clusterCount, this.themeProfile.palette.background.star, 0.08, 0.22, 0.45, 1.1);
        this.drawStarCluster(this.nearStars, this.width * 0.88, this.height * 0.24, this.width * 0.1, this.height * 0.08, Math.max(5, Math.round(clusterCount * 0.78)), this.themeProfile.palette.background.star, 0.1, 0.26, 0.5, 1.2);
        break;
      case 'ember-glow':
        this.drawBackdropBand(this.clouds, this.width * 0.18, this.height * 0.74, this.width * 0.3, this.height * 0.28, this.themeProfile.ambientSky.hazeColor, 0.062 * motifAlpha);
        this.drawBackdropBand(this.clouds, this.width * 0.82, this.height * 0.6, this.width * 0.26, this.height * 0.22, this.themeProfile.ambientSky.hazeAccentColor, 0.048 * motifAlpha);
        this.base.fillStyle(this.themeProfile.ambientSky.hazeAccentColor, 0.02 * motifAlpha);
        this.base.fillRect(0, Math.round(this.height * 0.74), this.width, Math.max(8, Math.round(this.height * 0.08)));
        this.drawStarCluster(this.nearStars, this.width * 0.24, this.height * 0.16, this.width * 0.1, this.height * 0.07, Math.max(5, Math.round(clusterCount * 0.72)), this.themeProfile.ambientSky.cometColor, 0.08, 0.22, 0.45, 1);
        break;
      case 'aurora-curtain':
        this.drawBackdropBand(this.clouds, this.width * 0.14, this.height * 0.56, this.width * 0.3, this.height * 0.84, this.themeProfile.ambientSky.hazeColor, 0.066 * motifAlpha);
        this.drawBackdropBand(this.clouds, this.width * 0.84, this.height * 0.54, this.width * 0.32, this.height * 0.78, this.themeProfile.ambientSky.hazeAccentColor, 0.056 * motifAlpha);
        this.drawBackdropBand(this.clouds, this.width * 0.5, this.height * 0.34, this.width * 0.42, this.height * 0.18, this.themeProfile.ambientSky.cometColor, 0.032 * motifAlpha);
        this.base.fillStyle(this.themeProfile.ambientSky.hazeAccentColor, 0.022 * motifAlpha);
        this.base.fillRect(0, Math.round(this.height * 0.38), this.width, Math.max(10, Math.round(this.height * 0.16)));
        this.drawStarCluster(this.nearStars, this.width * 0.18, this.height * 0.18, this.width * 0.12, this.height * 0.09, clusterCount, this.themeProfile.palette.background.star, 0.1, 0.28, 0.48, 1.2);
        this.drawStarCluster(this.nearStars, this.width * 0.84, this.height * 0.2, this.width * 0.1, this.height * 0.08, Math.max(5, Math.round(clusterCount * 0.84)), this.themeProfile.palette.background.star, 0.1, 0.3, 0.48, 1.26);
        break;
      case 'vellum-wash':
        this.drawBackdropBand(this.clouds, this.width * 0.22, this.height * 0.4, this.width * 0.42, this.height * 0.18, this.themeProfile.ambientSky.hazeColor, 0.026 * motifAlpha);
        this.drawBackdropBand(this.clouds, this.width * 0.8, this.height * 0.62, this.width * 0.36, this.height * 0.14, this.themeProfile.ambientSky.hazeAccentColor, 0.022 * motifAlpha);
        this.base.fillStyle(this.themeProfile.ambientSky.hazeAccentColor, 0.014 * motifAlpha);
        this.base.fillRect(0, Math.round(this.height * 0.42), this.width, Math.max(8, Math.round(this.height * 0.12)));
        this.drawStarCluster(this.farStars, this.width * 0.16, this.height * 0.16, this.width * 0.1, this.height * 0.08, Math.max(5, Math.round(clusterCount * 0.6)), this.themeProfile.palette.background.star, 0.06, 0.16, 0.4, 0.9);
        break;
      case 'monolith-signal':
        this.base.fillStyle(this.themeProfile.ambientSky.hazeColor, 0.04 * motifAlpha);
        this.base.fillRect(0, Math.round(this.height * 0.18), this.width, Math.max(8, Math.round(this.height * 0.07)));
        this.base.fillRect(0, Math.round(this.height * 0.76), this.width, Math.max(8, Math.round(this.height * 0.08)));
        this.drawBackdropBand(this.clouds, this.width * 0.18, this.height * 0.66, this.width * 0.22, this.height * 0.2, this.themeProfile.ambientSky.hazeAccentColor, 0.026 * motifAlpha);
        this.drawBackdropBand(this.clouds, this.width * 0.82, this.height * 0.38, this.width * 0.2, this.height * 0.16, this.themeProfile.ambientSky.hazeColor, 0.022 * motifAlpha);
        this.base.fillStyle(this.themeProfile.ambientSky.streakColor, 0.018 * motifAlpha);
        this.base.fillRect(Math.round(this.width * 0.12), Math.round(this.height * 0.5), Math.round(this.width * 0.76), lineHeight);
        this.drawStarCluster(this.farStars, this.width * 0.12, this.height * 0.2, this.width * 0.08, this.height * 0.07, Math.max(4, Math.round(clusterCount * 0.56)), this.themeProfile.palette.background.star, 0.08, 0.18, 0.42, 0.96);
        break;
      default:
        break;
    }
  }

  private drawBackdropBand(
    graphics: Phaser.GameObjects.Graphics,
    centerX: number,
    centerY: number,
    width: number,
    height: number,
    color: number,
    alpha: number
  ): void {
    graphics.fillStyle(color, alpha);
    graphics.fillEllipse(centerX, centerY, width, height);
  }

  private drawStarCluster(
    graphics: Phaser.GameObjects.Graphics,
    centerX: number,
    centerY: number,
    radiusX: number,
    radiusY: number,
    count: number,
    color: number,
    alphaMin: number,
    alphaMax: number,
    sizeMin: number,
    sizeMax: number
  ): void {
    for (let index = 0; index < count; index += 1) {
      const angle = this.range(0, Math.PI * 2);
      const distance = Math.sqrt(this.rand());
      graphics.fillStyle(color, this.range(alphaMin, alphaMax));
      graphics.fillCircle(
        centerX + (Math.cos(angle) * radiusX * distance),
        centerY + (Math.sin(angle) * radiusY * distance),
        this.range(sizeMin, sizeMax)
      );
    }
  }

  private createVeils(): void {
    const veilCount = Math.max(
      1,
      Math.round(legacyTuning.menu.ambientSky.hazeLayerCount * this.tuning.densityScale)
    );
    for (let index = 0; index < veilCount; index += 1) {
      const graphics = this.scene.add.graphics().setDepth(AMBIENT_SKY_DEPTHS.haze).setBlendMode(Phaser.BlendModes.SCREEN);
      const width = this.range(this.width * 0.18, this.width * 0.34) * this.themeProfile.ambientSky.veilWidthScale;
      const height = this.range(this.height * 0.08, this.height * 0.16) * this.themeProfile.ambientSky.veilHeightScale;
      const alpha = this.range(
        legacyTuning.menu.ambientSky.hazeAlphaMin,
        legacyTuning.menu.ambientSky.hazeAlphaMax
      ) * this.themeProfile.ambientSky.hazeAlphaScale * this.themeProfile.ambientSky.motifAlphaScale;
      this.drawVeilShape(graphics, width, height, alpha, index);
      const anchor = this.resolveVeilAnchor(index);
      graphics.setPosition(anchor.x, anchor.y);
      graphics.setAlpha(0.78);
      this.veils.push({
        graphics,
        anchorX: anchor.x,
        anchorY: anchor.y,
        rangeX: this.range(legacyTuning.menu.ambientSky.hazeDriftRangePx * 0.45, legacyTuning.menu.ambientSky.hazeDriftRangePx),
        rangeY: this.range(legacyTuning.menu.ambientSky.hazeDriftRangePx * 0.18, legacyTuning.menu.ambientSky.hazeDriftRangePx * 0.58),
        pulseMs: this.range(
          legacyTuning.menu.ambientSky.hazeDriftDurationMinMs,
          legacyTuning.menu.ambientSky.hazeDriftDurationMaxMs
        ) / Math.max(0.25, this.tuning.motionScale),
        phase: this.range(0, Math.PI * 2),
        baseAlpha: graphics.alpha,
        amplitude: 0.08,
        scaleAmplitudeX: this.range(0.02, 0.07),
        scaleAmplitudeY: this.range(0.02, 0.09),
        rotationRange: (this.themeProfile.ambientSky.veilRotationRange * (Math.PI / 180)) * this.range(0.72, 1.08),
        rotationPhase: this.range(0, Math.PI * 2)
      });
    }
  }

  private drawVeilShape(
    graphics: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
    alpha: number,
    index: number
  ): void {
    const accentAlpha = alpha * 0.68;

    switch (this.themeProfile.ambientSky.backdropMotif) {
      case 'aurora-curtain':
        graphics.fillStyle(this.themeProfile.ambientSky.hazeColor, alpha);
        graphics.fillEllipse(0, 0, width * 0.62, height);
        graphics.fillStyle(this.themeProfile.ambientSky.hazeAccentColor, accentAlpha);
        graphics.fillEllipse(width * 0.08, -height * 0.12, width * 0.28, height * 0.84);
        graphics.fillStyle(this.themeProfile.ambientSky.cometColor, alpha * 0.32);
        graphics.fillEllipse(-width * 0.12, height * 0.06, width * 0.22, height * 0.72);
        break;
      case 'ember-glow':
        graphics.fillStyle(this.themeProfile.ambientSky.hazeColor, alpha);
        graphics.fillEllipse(0, 0, width, height * 0.9);
        graphics.fillStyle(this.themeProfile.ambientSky.hazeAccentColor, accentAlpha);
        graphics.fillEllipse(width * 0.14, -height * 0.08, width * 0.56, height * 0.46);
        graphics.fillStyle(this.themeProfile.ambientSky.driftMoteColor, alpha * 0.26);
        graphics.fillEllipse(-width * 0.18, height * 0.04, width * 0.28, height * 0.22);
        break;
      case 'vellum-wash':
        graphics.fillStyle(this.themeProfile.ambientSky.hazeColor, alpha * 0.92);
        graphics.fillEllipse(0, 0, width, height * 0.78);
        graphics.fillStyle(this.themeProfile.ambientSky.hazeAccentColor, alpha * 0.34);
        graphics.fillEllipse(width * 0.1, -height * 0.04, width * 0.7, height * 0.42);
        break;
      case 'monolith-signal':
        graphics.fillStyle(this.themeProfile.ambientSky.hazeColor, alpha * 0.9);
        graphics.fillRect(-width * 0.5, -height * 0.12, width, height * 0.24);
        graphics.fillStyle(this.themeProfile.ambientSky.hazeAccentColor, accentAlpha);
        graphics.fillRect(-width * 0.34, height * (index % 2 === 0 ? -0.02 : 0.08), width * 0.68, height * 0.1);
        break;
      case 'noir-band':
      default:
        graphics.fillStyle(this.themeProfile.ambientSky.hazeColor, alpha);
        graphics.fillEllipse(0, 0, width, height * 0.8);
        graphics.fillStyle(this.themeProfile.ambientSky.hazeAccentColor, accentAlpha);
        graphics.fillEllipse(width * 0.08, -Math.max(6, height * 0.08), width * 0.64, height * 0.5);
        break;
    }
  }

  private resolveVeilAnchor(index: number): { x: number; y: number } {
    switch (this.themeProfile.ambientSky.backdropMotif) {
      case 'aurora-curtain':
        if (index % 3 === 0) {
          return {
            x: this.range(this.width * 0.12, this.width * 0.24),
            y: this.range(this.height * 0.24, this.height * 0.78)
          };
        }
        if (index % 3 === 1) {
          return {
            x: this.range(this.width * 0.76, this.width * 0.88),
            y: this.range(this.height * 0.2, this.height * 0.76)
          };
        }
        return {
          x: this.range(this.width * 0.42, this.width * 0.58),
          y: this.range(this.height * 0.16, this.height * 0.34)
        };
      case 'ember-glow':
        return index % 2 === 0
          ? {
            x: this.range(this.width * 0.14, this.width * 0.34),
            y: this.range(this.height * 0.6, this.height * 0.82)
          }
          : {
            x: this.range(this.width * 0.68, this.width * 0.86),
            y: this.range(this.height * 0.44, this.height * 0.76)
          };
      case 'vellum-wash':
        return {
          x: this.range(this.width * 0.18, this.width * 0.82),
          y: this.range(this.height * 0.18, this.height * 0.82)
        };
      case 'monolith-signal':
        return {
          x: this.range(this.width * 0.22, this.width * 0.78),
          y: index % 2 === 0
            ? this.range(this.height * 0.2, this.height * 0.32)
            : this.range(this.height * 0.68, this.height * 0.8)
        };
      case 'noir-band':
      default:
        return index % 2 === 0
          ? {
            x: this.range(this.width * 0.12, this.width * 0.32),
            y: this.range(this.height * 0.24, this.height * 0.46)
          }
          : {
            x: this.range(this.width * 0.68, this.width * 0.88),
            y: this.range(this.height * 0.54, this.height * 0.78)
          };
    }
  }

  private createTwinkles(): void {
    const count = Math.max(6, Math.round(this.tuning.twinkleCount * this.themeProfile.ambientSky.twinkleDensityScale));
    for (let index = 0; index < count; index += 1) {
      const anchor = this.sampleOpenSkyPoint(true);
      const sprite = this.scene.add.image(anchor.x, anchor.y, AMBIENT_SKY_TEXTURES.twinkle)
        .setDepth(AMBIENT_SKY_DEPTHS.twinkles)
        .setTint(this.themeProfile.palette.background.star)
        .setScale(this.range(0.8, 1.4))
        .setAlpha(this.range(legacyTuning.menu.ambientSky.twinkleAlphaMin, legacyTuning.menu.ambientSky.twinkleAlphaMax));
      this.twinkles.push({
        sprite,
        anchorX: anchor.x,
        anchorY: anchor.y,
        baseAlpha: sprite.alpha,
        amplitude: this.range(0.06, 0.16),
        pulseMs: this.range(
          legacyTuning.menu.ambientSky.twinklePulseDurationMinMs,
          legacyTuning.menu.ambientSky.twinklePulseDurationMaxMs
        ) / Math.max(0.25, this.tuning.motionScale),
        driftX: this.range(-legacyTuning.menu.ambientSky.twinkleDriftRangePx, legacyTuning.menu.ambientSky.twinkleDriftRangePx),
        driftY: this.range(-legacyTuning.menu.ambientSky.twinkleDriftRangePx * 0.45, legacyTuning.menu.ambientSky.twinkleDriftRangePx * 0.45),
        phase: this.range(0, Math.PI * 2)
      });
    }
  }

  private createDriftMotes(): void {
    const count = Math.max(
      0,
      Math.round(this.tuning.driftMoteCount * this.themeProfile.ambientSky.driftMoteDensityScale)
    );
    for (let index = 0; index < count; index += 1) {
      const anchor = this.sampleOpenSkyPoint(false);
      const sprite = this.scene.add.image(anchor.x, anchor.y, AMBIENT_SKY_TEXTURES.twinkle)
        .setDepth(AMBIENT_SKY_DEPTHS.motes)
        .setTint(this.themeProfile.ambientSky.driftMoteColor)
        .setScale(this.range(0.6, 1.12))
        .setAlpha(this.range(legacyTuning.menu.ambientSky.driftMoteAlphaMin, legacyTuning.menu.ambientSky.driftMoteAlphaMax));
      this.driftMotes.push({
        sprite,
        anchorX: anchor.x,
        anchorY: anchor.y,
        rangeX: this.range(8, 26) * this.tuning.motionScale,
        rangeY: this.range(10, 34) * this.tuning.motionScale,
        speedX: this.range(
          legacyTuning.menu.ambientSky.driftMoteSpeedPxPerSecMin,
          legacyTuning.menu.ambientSky.driftMoteSpeedPxPerSecMax
        ) / 1000,
        speedY: this.range(
          legacyTuning.menu.ambientSky.driftMoteSpeedPxPerSecMin * 0.68,
          legacyTuning.menu.ambientSky.driftMoteSpeedPxPerSecMax * 0.82
        ) / 1000,
        phase: this.range(0, Math.PI * 2),
        baseAlpha: sprite.alpha,
        amplitude: this.range(0.02, 0.06)
      });
    }
  }

  private updateVeils(): void {
    for (const veil of this.veils) {
      const wave = ((this.timelineMs + veil.phase) % veil.pulseMs) / veil.pulseMs;
      const phase = wave * Math.PI * 2;
      veil.graphics.setPosition(
        veil.anchorX + (Math.sin(phase) * veil.rangeX),
        veil.anchorY + (Math.cos(phase * 0.7) * veil.rangeY)
      );
      veil.graphics.setScale(
        1 + (Math.sin((phase * 0.7) + veil.rotationPhase) * veil.scaleAmplitudeX),
        1 + (Math.cos((phase * 0.54) + veil.rotationPhase) * veil.scaleAmplitudeY)
      );
      veil.graphics.setRotation(Math.sin((phase * 0.42) + veil.rotationPhase) * veil.rotationRange);
      veil.graphics.setAlpha(veil.baseAlpha + (Math.sin(phase * 0.8) * veil.amplitude));
    }
  }

  private updateTwinkles(): void {
    for (const twinkle of this.twinkles) {
      const wave = ((this.timelineMs + twinkle.phase) % twinkle.pulseMs) / twinkle.pulseMs;
      const phase = wave * Math.PI * 2;
      twinkle.sprite.setPosition(
        twinkle.anchorX + (Math.sin(phase) * twinkle.driftX),
        twinkle.anchorY + (Math.cos(phase * 0.8) * twinkle.driftY)
      );
      twinkle.sprite.setAlpha(
        Phaser.Math.Clamp(
          twinkle.baseAlpha + (Math.sin(phase) * twinkle.amplitude),
          legacyTuning.menu.ambientSky.twinkleAlphaMin * 0.66,
          legacyTuning.menu.ambientSky.twinkleAlphaMax * 1.1
        )
      );
    }
  }

  private updateDriftMotes(): void {
    for (const mote of this.driftMotes) {
      const driftX = Math.sin((this.timelineMs * mote.speedX) + mote.phase) * mote.rangeX;
      const driftY = Math.cos((this.timelineMs * mote.speedY) + mote.phase) * mote.rangeY;
      mote.sprite.setPosition(mote.anchorX + driftX, mote.anchorY + driftY);
      mote.sprite.setAlpha(Math.max(0.01, mote.baseAlpha + (Math.sin((this.timelineMs * mote.speedX * 0.8) + mote.phase) * mote.amplitude)));
    }
  }

  private updateMovingEvents(): void {
    for (let index = this.movingEvents.length - 1; index >= 0; index -= 1) {
      const event = this.movingEvents[index];
      const progress = Phaser.Math.Clamp((this.timelineMs - event.startedAt) / event.durationMs, 0, 1);
      if (progress >= 1) {
        event.glow?.destroy();
        event.body.destroy();
        this.movingEvents.splice(index, 1);
        continue;
      }

      const eased = event.family === 'satellite' || event.family === 'ufo'
        ? progress
        : ease(progress);
      const x = Phaser.Math.Linear(event.fromX, event.toX, eased);
      const wobble = event.wobblePx
        ? Math.sin((this.timelineMs * (event.wobbleSpeed ?? 0.003)) + event.phase) * event.wobblePx
        : 0;
      const y = Phaser.Math.Linear(event.fromY, event.toY, eased) + wobble;
      const fadeIn = Math.min(1, progress / 0.12);
      const fadeOut = Math.min(1, (1 - progress) / 0.18);
      const envelope = Math.min(fadeIn, fadeOut);
      const blink = event.blinkMs
        ? 0.7 + (Math.max(0, Math.sin((this.timelineMs - event.startedAt) / event.blinkMs * Math.PI * 2)) * 0.3)
        : 1;
      const alpha = event.maxAlpha * envelope * blink;

      event.body.setPosition(x, y).setAlpha(alpha);
      event.glow?.setPosition(x, y).setAlpha(alpha * (event.family === 'comet' ? 0.7 : 0.46));
    }
  }

  private maybeSpawnEvents(): void {
    if (this.movingEvents.length >= this.tuning.movingEventCap) {
      return;
    }

    if (this.timelineMs >= this.nextShootingAt) {
      const spawned = this.spawnMovingEvent('shooting-star');
      this.nextShootingAt = this.timelineMs + (this.resolveEventInterval('shooting-star') * (spawned ? 1 : 0.42));
    }
    if (
      this.timelineMs >= this.nextCometAt
      && this.timelineMs >= this.nextHeroWindowAt
      && this.movingEvents.length < this.tuning.movingEventCap
    ) {
      const spawned = this.spawnMovingEvent('comet');
      this.nextCometAt = this.timelineMs + (this.resolveEventInterval('comet') * (spawned ? 1 : 0.48));
      if (spawned) {
        this.nextHeroWindowAt = this.timelineMs + this.resolveTierCooldown('hero');
      }
    }
    if (
      this.themeProfile.ambientSky.allowSatellite
      && this.tuning.signatureEventCap > 0
      && this.timelineMs >= this.nextSatelliteAt
      && this.timelineMs >= this.nextSignatureWindowAt
      && this.countSignatureEvents() < this.tuning.signatureEventCap
      && this.movingEvents.length < this.tuning.movingEventCap
    ) {
      const spawned = this.spawnMovingEvent('satellite');
      this.nextSatelliteAt = this.timelineMs + (this.resolveEventInterval('satellite') * (spawned ? 1 : 0.56));
      if (spawned) {
        this.nextUfoAt = Math.max(this.nextUfoAt, this.timelineMs + (this.resolveTierCooldown('signature') * 0.82));
        this.nextSignatureWindowAt = this.timelineMs + this.resolveTierCooldown('signature');
      }
    }
    if (
      this.themeProfile.ambientSky.allowUfo
      && this.tuning.signatureEventCap > 0
      && this.timelineMs >= this.nextUfoAt
      && this.timelineMs >= this.nextSignatureWindowAt
      && this.countSignatureEvents() < this.tuning.signatureEventCap
      && this.movingEvents.length < this.tuning.movingEventCap
    ) {
      const spawned = this.spawnMovingEvent('ufo');
      this.nextUfoAt = this.timelineMs + (this.resolveEventInterval('ufo') * (spawned ? 1 : 0.56));
      if (spawned) {
        this.nextSatelliteAt = Math.max(this.nextSatelliteAt, this.timelineMs + (this.resolveTierCooldown('signature') * 0.82));
        this.nextSignatureWindowAt = this.timelineMs + this.resolveTierCooldown('signature');
      }
    }
  }

  private spawnMovingEvent(family: AmbientSkyMovingFamily): boolean {
    const created = family === 'shooting-star'
      ? this.createStreakEvent(false)
      : family === 'comet'
        ? this.createStreakEvent(true)
        : family === 'satellite'
          ? this.createSatelliteEvent(false)
          : this.createSatelliteEvent(true);

    if (created) {
      this.movingEvents.push(created);
      return true;
    }

    return false;
  }

  private createStreakEvent(comet: boolean): AmbientSkyMovingEvent | undefined {
    const tuning = comet ? legacyTuning.menu.ambientSky.comet : legacyTuning.menu.ambientSky.shootingStar;
    const width = this.range(tuning.lengthMinPx, tuning.lengthMaxPx);
    const height = comet ? 6 : 4;
    const durationMs = this.range(tuning.durationMinMs, tuning.durationMaxMs) / Math.max(0.25, this.tuning.motionScale);
    const segment = this.pickLaneSegment(comet ? 'comet' : 'shooting-star', width, height);
    if (!segment) {
      return undefined;
    }

    const textureKey = comet ? AMBIENT_SKY_TEXTURES.comet : AMBIENT_SKY_TEXTURES.streak;
    const tint = comet ? this.themeProfile.ambientSky.cometColor : this.themeProfile.ambientSky.streakColor;
    const body = this.scene.add.image(segment.startX, segment.startY, textureKey)
      .setDepth(AMBIENT_SKY_DEPTHS.events)
      .setTint(tint)
      .setBlendMode(Phaser.BlendModes.SCREEN)
      .setDisplaySize(width, height);
    const glow = this.scene.add.image(segment.startX, segment.startY, AMBIENT_SKY_TEXTURES.streak)
      .setDepth(AMBIENT_SKY_DEPTHS.events - 0.1)
      .setTint(comet ? this.themeProfile.ambientSky.streakColor : tint)
      .setBlendMode(Phaser.BlendModes.SCREEN)
      .setDisplaySize(width * (comet ? 0.92 : 0.82), height * (comet ? 2.2 : 1.6))
      .setAlpha(0);
    const rotation = Phaser.Math.Angle.Between(segment.startX, segment.startY, segment.endX, segment.endY);
    body.setRotation(rotation);
    glow.setRotation(rotation);

    return {
      family: comet ? 'comet' : 'shooting-star',
      body,
      glow,
      startedAt: this.timelineMs,
      durationMs,
      fromX: segment.startX,
      fromY: segment.startY,
      toX: segment.endX,
      toY: segment.endY,
      maxAlpha: this.range(tuning.alphaMin, tuning.alphaMax),
      wobblePx: comet ? 1.5 * this.tuning.motionScale : 0.8 * this.tuning.motionScale,
      wobbleSpeed: comet ? 0.0042 : 0.0052,
      phase: this.range(0, Math.PI * 2),
      width,
      height
    };
  }

  private createSatelliteEvent(ufo: boolean): AmbientSkyMovingEvent | undefined {
    const tuning = ufo ? legacyTuning.menu.ambientSky.ufo : legacyTuning.menu.ambientSky.satellite;
    const width = ufo ? 18 : 14;
    const height = ufo ? 7 : 5;
    const durationMs = this.range(tuning.durationMinMs, tuning.durationMaxMs) / Math.max(0.25, this.tuning.motionScale);
    const segment = this.pickLaneSegment(ufo ? 'ufo' : 'satellite', width, height);
    if (!segment) {
      return undefined;
    }

    const body = this.scene.add.image(
      segment.startX,
      segment.startY,
      ufo ? AMBIENT_SKY_TEXTURES.ufo : AMBIENT_SKY_TEXTURES.satellite
    )
      .setDepth(AMBIENT_SKY_DEPTHS.events)
      .setTint(ufo ? this.themeProfile.ambientSky.ufoColor : this.themeProfile.ambientSky.satelliteColor)
      .setDisplaySize(width, height);
    const glow = this.scene.add.image(segment.startX, segment.startY, AMBIENT_SKY_TEXTURES.twinkle)
      .setDepth(AMBIENT_SKY_DEPTHS.events - 0.1)
      .setTint(ufo ? this.themeProfile.ambientSky.ufoColor : this.themeProfile.ambientSky.satelliteColor)
      .setBlendMode(Phaser.BlendModes.SCREEN)
      .setScale(ufo ? 1.8 : 1.4)
      .setAlpha(0);
    const rotation = Phaser.Math.Angle.Between(segment.startX, segment.startY, segment.endX, segment.endY);
    body.setRotation(rotation);
    glow.setRotation(rotation);

    return {
      family: ufo ? 'ufo' : 'satellite',
      body,
      glow,
      startedAt: this.timelineMs,
      durationMs,
      fromX: segment.startX,
      fromY: segment.startY,
      toX: segment.endX,
      toY: segment.endY,
      maxAlpha: this.range(tuning.alphaMin, tuning.alphaMax),
      blinkMs: this.range(tuning.blinkDurationMinMs, tuning.blinkDurationMaxMs),
      wobblePx: ufo ? 1.4 : 0.8,
      wobbleSpeed: ufo ? 0.0046 : 0.0034,
      phase: this.range(0, Math.PI * 2),
      width,
      height
    };
  }

  private pickLaneSegment(family: AmbientSkyMovingFamily, width: number, height: number): AmbientSkyLaneSegment | undefined {
    const board = this.boardRect ?? {
      left: this.width * 0.28,
      top: this.height * 0.22,
      right: this.width * 0.72,
      bottom: this.height * 0.82
    };
    const topLimit = Math.max(44, Math.min(board.top - 18, this.height * 0.38));
    const sideLeft = Math.max(96, board.left - 28);
    const sideRight = Math.min(this.width - 96, board.right + 28);
    const candidates: AmbientSkyLaneSegment[] = [];
    const leftY = this.range(18, Math.max(26, topLimit));
    const rightY = this.range(18, Math.max(26, topLimit));

    if (family === 'shooting-star' || family === 'comet') {
      candidates.push({
        startX: -width,
        startY: leftY,
        endX: Math.max(sideLeft * 0.72, 96),
        endY: Math.min(board.top - 12, leftY + this.range(18, 48))
      });
      candidates.push({
        startX: this.width + width,
        startY: rightY,
        endX: Math.min(this.width - 96, sideRight + ((this.width - sideRight) * 0.28)),
        endY: Math.min(board.top - 12, rightY + this.range(18, 48))
      });
      if (!this.titleRect && topLimit > 56) {
        const crossY = this.range(18, Math.max(22, topLimit * 0.72));
        candidates.push({
          startX: -width,
          startY: crossY,
          endX: this.width + width,
          endY: crossY + this.range(16, 40)
        });
      }
    } else {
      const leftLaneY = this.range(18, Math.max(26, topLimit));
      const rightLaneY = this.range(18, Math.max(26, topLimit));
      candidates.push({
        startX: -width,
        startY: leftLaneY,
        endX: Math.max(sideLeft, this.width * 0.34),
        endY: leftLaneY + this.range(-6, 6)
      });
      candidates.push({
        startX: this.width + width,
        startY: rightLaneY,
        endX: Math.min(sideRight, this.width * 0.66),
        endY: rightLaneY + this.range(-6, 6)
      });
      if (!this.titleRect && topLimit > 48) {
        const crossY = this.range(18, Math.max(22, topLimit * 0.68));
        candidates.push({
          startX: -width,
          startY: crossY,
          endX: this.width + width,
          endY: crossY + this.range(-4, 4)
        });
      }
    }

    const shuffled = [...candidates];
    while (shuffled.length > 0) {
      const segment = shuffled.splice(Math.floor(this.rand() * shuffled.length), 1)[0];
      if (this.segmentClearsReservedZones(segment, width, height)) {
        return segment;
      }
    }

    return undefined;
  }

  private segmentClearsReservedZones(segment: AmbientSkyLaneSegment, width: number, height: number): boolean {
    if (this.reservedRects.length === 0) {
      return true;
    }

    const paddedWidth = Math.max(width, height) * 0.72;
    const paddedHeight = Math.max(height, 8) * 2.2;
    for (const progress of [0.15, 0.35, 0.55, 0.75, 0.92]) {
      const x = Phaser.Math.Linear(segment.startX, segment.endX, progress);
      const y = Phaser.Math.Linear(segment.startY, segment.endY, progress);
      const bounds = {
        left: x - (paddedWidth / 2),
        top: y - (paddedHeight / 2),
        right: x + (paddedWidth / 2),
        bottom: y + (paddedHeight / 2)
      };
      if (this.reservedRects.some((reserved) => rectsIntersect(bounds, reserved))) {
        return false;
      }
    }

    return true;
  }

  private eventViolatesReservedZones(event: AmbientSkyMovingEvent): boolean {
    if (this.reservedRects.length === 0) {
      return false;
    }

    const bounds = toVisualSceneBounds(event.body.getBounds());
    return bounds
      ? this.reservedRects.some((reserved) => rectsIntersect(bounds, reserved))
      : false;
  }

  private resetSchedules(): void {
    this.nextShootingAt = this.resolveEventInterval('shooting-star') * 0.46;
    this.nextCometAt = this.resolveEventInterval('comet') * 0.58;
    this.nextSatelliteAt = this.resolveEventInterval('satellite') * 0.72;
    this.nextUfoAt = this.resolveEventInterval('ufo') * 0.76;
    this.nextHeroWindowAt = this.resolveTierCooldown('hero') * 0.52;
    this.nextSignatureWindowAt = this.resolveTierCooldown('signature') * 0.62;
  }

  private resolveEventInterval(family: AmbientSkyMovingFamily): number {
    const base = family === 'shooting-star'
      ? legacyTuning.menu.ambientSky.shootingStar
      : family === 'comet'
        ? legacyTuning.menu.ambientSky.comet
        : family === 'satellite'
          ? legacyTuning.menu.ambientSky.satellite
          : legacyTuning.menu.ambientSky.ufo;
    const themeScale = family === 'shooting-star'
      ? this.themeProfile.ambientSky.shootingIntervalScale
      : family === 'comet'
        ? this.themeProfile.ambientSky.cometIntervalScale
        : family === 'satellite'
          ? this.themeProfile.ambientSky.satelliteIntervalScale
          : this.themeProfile.ambientSky.ufoIntervalScale;
    return this.range(base.minIntervalMs, base.maxIntervalMs) * this.tuning.eventIntervalScale * themeScale;
  }

  private resolveTierCooldown(tier: AmbientSkyEventTier): number {
    if (tier === 'occasional') {
      return 0;
    }

    if (tier === 'hero') {
      const base = (legacyTuning.menu.ambientSky.comet.minIntervalMs + legacyTuning.menu.ambientSky.comet.maxIntervalMs) / 2;
      return base * this.tuning.eventIntervalScale * this.themeProfile.ambientSky.heroCooldownScale;
    }

    const satelliteBase = (legacyTuning.menu.ambientSky.satellite.minIntervalMs + legacyTuning.menu.ambientSky.satellite.maxIntervalMs) / 2;
    const ufoBase = (legacyTuning.menu.ambientSky.ufo.minIntervalMs + legacyTuning.menu.ambientSky.ufo.maxIntervalMs) / 2;
    return Math.max(satelliteBase, ufoBase) * this.tuning.eventIntervalScale * this.themeProfile.ambientSky.signatureCooldownScale;
  }

  private countMovingEvents(family: AmbientSkyMovingFamily): number {
    return this.movingEvents.filter((event) => event.family === family).length;
  }

  private countSignatureEvents(): number {
    return this.countMovingEvents('satellite') + this.countMovingEvents('ufo');
  }

  private destroyMovingEvents(): void {
    for (const event of this.movingEvents) {
      event.glow?.destroy();
      event.body.destroy();
    }
    this.movingEvents.length = 0;
  }

  private sampleOpenSkyPoint(preferUpperBand: boolean): { x: number; y: number } {
    const blocked = this.boardRect ?? {
      left: this.width * 0.28,
      top: this.height * 0.22,
      right: this.width * 0.72,
      bottom: this.height * 0.82
    };

    for (let attempt = 0; attempt < 16; attempt += 1) {
      const x = this.range(this.width * 0.04, this.width * 0.96);
      const y = this.range(
        preferUpperBand ? this.height * 0.06 : this.height * 0.12,
        preferUpperBand ? this.height * 0.72 : this.height * 0.86
      );
      if (x < blocked.left || x > blocked.right || y < blocked.top || y > blocked.bottom) {
        return { x, y };
      }
    }

    return {
      x: this.range(this.width * 0.08, this.width * 0.92),
      y: this.range(this.height * 0.08, this.height * 0.84)
    };
  }

  private rand(): number {
    this.rngState = ((Math.imul(this.rngState, 1664525) + 1013904223) >>> 0) || 1;
    return this.rngState / 0xffffffff;
  }

  private range(min: number, max: number): number {
    if (min === max) {
      return min;
    }

    return min + ((max - min) * this.rand());
  }
}

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
  boardLayout?: BoardLayout | null,
  safeInsets?: Partial<ViewportSafeInsets> | null,
  profile?: PresentationDeploymentProfile
): TitleBandFrame {
  const viewportSafeInsets = sanitizeViewportSafeInsets(safeInsets);
  const compact = sceneLayout.isTiny || sceneLayout.isNarrow;
  const metrics = resolveTitleBandMetrics(sceneLayout, profile);
  const bandInset = metrics.bandInset;
  const reservedRight = 0;
  const left = Math.max(viewportSafeInsets.left + bandInset, sceneLayout.sidePadding + bandInset);
  const right = Math.max(
    left + (compact ? 104 : 132),
    viewportWidth - Math.max(viewportSafeInsets.right + bandInset, sceneLayout.sidePadding + bandInset)
  );
  const top = Math.max(viewportSafeInsets.top + bandInset, bandInset);
  const preferredBottom = top + metrics.bandHeight;
  const boardGap = boardLayout
    ? Math.max(
      metrics.boardGap,
      Math.round(boardLayout.tileSize * (compact ? 0.5 : 0.65))
    )
    : metrics.boardGap;
  const maxBottom = boardLayout
    ? Math.min(
      preferredBottom,
      boardLayout.safeBounds.top - boardGap,
      boardLayout.boardY - boardGap
    )
    : preferredBottom;
  const bottom = Math.max(top + metrics.minHeight, maxBottom);

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

export function resolveTitleLockupLayout(
  boardLayout: BoardLayout,
  sceneLayout: SceneLayoutProfile,
  titleBandFrame: TitleBandFrame,
  variant: AmbientPresentationVariant,
  chrome: PresentationChrome = DEFAULT_PRESENTATION_CHROME,
  profile?: PresentationDeploymentProfile
): TitleLockupLayout {
  const safeVariant = sanitizePresentationVariant(variant);
  const safeChrome = CHROME_PROFILES[chrome] ? chrome : DEFAULT_PRESENTATION_CHROME;
  const variantProfile = VARIANT_PROFILES[safeVariant];
  const chromeProfile = CHROME_PROFILES[safeChrome];
  const deploymentProfile = profile ? DEPLOYMENT_PRESENTATION_PROFILES[profile] : DEFAULT_DEPLOYMENT_PRESENTATION_PROFILE;
  const titlePlateMaxWidth = Math.max(112, titleBandFrame.width - 18);
  const plateWidth = Phaser.Math.Clamp(
    Math.round(
      boardLayout.boardSize
        * (sceneLayout.isNarrow ? 0.5 : legacyTuning.menu.title.plateWidthRatio + 0.01)
        * variantProfile.titleScale
        * chromeProfile.titleScale
        * deploymentProfile.titlePlateWidthScale
    ),
    Math.min(variantProfile.titleAnchor === 'left' ? 212 : 224, titlePlateMaxWidth),
    Math.max(Math.min(sceneLayout.isPortrait ? 332 : 388, titlePlateMaxWidth), 112)
  );
  const basePlateHeight = Phaser.Math.Clamp(
    Math.round(
      boardLayout.boardSize
        * legacyTuning.menu.title.plateHeightRatio
        * Phaser.Math.Linear(0.86, 0.98, variantProfile.titleScale * Math.max(0.72, chromeProfile.titleScale))
        * deploymentProfile.titlePlateHeightScale
    ),
    sceneLayout.isTiny ? 32 : 38,
    Math.max(legacyTuning.menu.title.plateHeightMaxPx - 2, 52)
  );
  const plateHeight = Math.min(
    basePlateHeight,
    Math.max(sceneLayout.isTiny ? 30 : 34, titleBandFrame.height - (sceneLayout.isTiny ? 12 : 14))
  );
  const titleFontSize = Phaser.Math.Clamp(
    Math.round(
      boardLayout.boardSize
        * legacyTuning.menu.title.fontScaleToBoard
        * variantProfile.titleScale
        * chromeProfile.titleScale
        * 0.94
    ),
    sceneLayout.isNarrow ? 22 : 28,
    Math.max(sceneLayout.isNarrow ? 24 : 28, Math.round(plateHeight * 0.78))
  );
  const titleLetterSpacing = sceneLayout.isNarrow
    ? variantProfile.titleLetterSpacingNarrow
    : variantProfile.titleLetterSpacingWide;
  const subtitleLineHeightScale = sceneLayout.isTiny ? 1.08 : 1.18;
  const subtitleBaseFontSize = Math.max(
    8,
    Math.round((sceneLayout.isTiny ? 8 : sceneLayout.isNarrow ? 9 : 10) * deploymentProfile.titleLineSpacingScale)
  );
  const subtitleLetterSpacing = sceneLayout.isNarrow ? 0.8 : 1.2;
  const minSubtitleGap = Math.max(
    sceneLayout.isTiny ? 4 : 5,
    Math.round(titleBandFrame.height * (sceneLayout.isPortrait ? 0.08 : 0.1))
  );
  const desiredTitleTopInset = Math.round(
    Math.max(
      sceneLayout.isTiny ? 2 : 4,
      titleBandFrame.height * Math.max(0.06, variantProfile.titleYOffsetRatio * 0.38)
        + Math.max(0, deploymentProfile.titleYOffsetBias * 0.08)
    )
  );
  const availableSubtitleLane = Math.max(minSubtitleGap + 8, titleBandFrame.height - desiredTitleTopInset - plateHeight);
  const maxSubtitleHeight = Math.max(8, availableSubtitleLane - minSubtitleGap);
  const subtitleFontSize = Math.max(
    8,
    Math.min(subtitleBaseFontSize, Math.floor(maxSubtitleHeight / subtitleLineHeightScale))
  );
  const estimatedSubtitleHeight = Math.max(8, Math.round(subtitleFontSize * subtitleLineHeightScale));
  const subtitleGap = Math.max(
    minSubtitleGap,
    Math.min(availableSubtitleLane - estimatedSubtitleHeight, minSubtitleGap + Math.round(titleBandFrame.height * 0.02))
  );
  const titleTopInset = Math.max(0, Math.min(
    desiredTitleTopInset,
    titleBandFrame.height - plateHeight - subtitleGap - estimatedSubtitleHeight
  ));
  const titleY = titleBandFrame.top + titleTopInset + (plateHeight / 2);
  const titleX = variantProfile.titleAnchor === 'left'
    ? titleBandFrame.left + (plateWidth / 2)
    : titleBandFrame.centerX;

  return {
    plateWidth,
    plateHeight,
    titleX,
    titleY,
    titleShadowY: titleY + 2,
    titleFontSize,
    titleLetterSpacing,
    subtitleTopOffsetY: (plateHeight / 2) + subtitleGap,
    subtitleGap,
    subtitleFontSize,
    subtitleLetterSpacing,
    estimatedSubtitleHeight
  };
}

export function resolveInstallChromeFrame(
  viewportWidth: number,
  viewportHeight: number,
  sceneLayout: SceneLayoutProfile,
  boardLayout: BoardLayout | null | undefined,
  chipWidth: number,
  chipHeight: number,
  safeInsets?: Partial<ViewportSafeInsets> | null
): InstallChromeFrame {
  void boardLayout;
  const viewportSafeInsets = sanitizeViewportSafeInsets(safeInsets);
  const compact = sceneLayout.isTiny || sceneLayout.isNarrow;
  const safeWidth = sanitizePositive(viewportWidth, DEFAULT_VIEWPORT_WIDTH, 1);
  const safeHeight = sanitizePositive(viewportHeight, DEFAULT_VIEWPORT_HEIGHT, 1);
  const horizontalInset = Math.max(viewportSafeInsets.left, viewportSafeInsets.right) + (compact ? 10 : 12);
  const bottomInset = Math.max(viewportSafeInsets.bottom + resolveInstallEdgeInsetPx(sceneLayout), 12);
  const centerX = Phaser.Math.Clamp(
    safeWidth / 2,
    horizontalInset + (chipWidth / 2),
    safeWidth - horizontalInset - (chipWidth / 2)
  );
  const centerY = Math.max(chipHeight / 2, safeHeight - bottomInset - (chipHeight / 2));
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

export function resolveBoardCompositionFrame(
  viewportWidth: number,
  viewportHeight: number,
  sceneLayout: SceneLayoutProfile,
  titleFrame?: TitleBandFrame,
  installFrame?: InstallChromeFrame,
  safeInsets?: Partial<ViewportSafeInsets> | null,
  profile?: PresentationDeploymentProfile
): BoardBounds {
  const viewportSafeInsets = sanitizeViewportSafeInsets(safeInsets);
  const safeWidth = sanitizePositive(viewportWidth, DEFAULT_VIEWPORT_WIDTH, 1);
  const safeHeight = sanitizePositive(viewportHeight, DEFAULT_VIEWPORT_HEIGHT, 1);
  const boardBuffer = resolveBoardEdgeBufferPx(sceneLayout, profile);
  const left = Math.max(viewportSafeInsets.left + boardBuffer, boardBuffer);
  let right = Math.max(
    left + 24,
    safeWidth - Math.max(viewportSafeInsets.right + boardBuffer, boardBuffer)
  );
  let top = titleFrame
    ? titleFrame.bottom + boardBuffer
    : Math.max(viewportSafeInsets.top + boardBuffer, boardBuffer);
  let bottom = installFrame
    ? installFrame.top - boardBuffer
    : safeHeight - Math.max(viewportSafeInsets.bottom + boardBuffer, boardBuffer);

  if (profile === 'obs' && !titleFrame) {
    const symmetricMargin = Math.max(top, safeHeight - bottom);
    top = symmetricMargin;
    bottom = safeHeight - symmetricMargin;
  }

  if (bottom <= top + 24) {
    const fallbackTop = Math.max(viewportSafeInsets.top + boardBuffer, boardBuffer);
    const fallbackBottom = safeHeight - Math.max(viewportSafeInsets.bottom + boardBuffer, boardBuffer);
    top = Math.min(top, fallbackBottom - 24);
    bottom = Math.max(bottom, fallbackTop + 24);
  }

  const presentationMode = resolveIntentFeedPresentationMode(
    safeWidth,
    safeHeight,
    sceneLayout,
    profile
  );
  if (presentationMode === 'commentary-rail') {
    const commentaryRailWidth = resolveIntentFeedCommentaryRailWidth(safeWidth, sceneLayout);
    const commentaryRailReserve = commentaryRailWidth + legacyTuning.menu.intentFeed.commentaryRailGapPx;
    const reservedRight = right - commentaryRailReserve;
    if (reservedRight >= left + 24) {
      right = reservedRight;
    }
  }

  return createSceneBounds(left, top, right, bottom);
}

export function resolveIntentFeedPresentationMode(
  viewportWidth: number,
  viewportHeight: number,
  sceneLayout: SceneLayoutProfile,
  profile?: PresentationDeploymentProfile
): IntentFeedPresentationMode {
  const tuning = legacyTuning.menu.intentFeed;
  const safeWidth = sanitizePositive(viewportWidth, DEFAULT_VIEWPORT_WIDTH, 1);
  const safeHeight = sanitizePositive(viewportHeight, DEFAULT_VIEWPORT_HEIGHT, 1);
  const aspectRatio = safeWidth / Math.max(1, safeHeight);
  const wideEnough = safeWidth >= tuning.commentaryRailMinViewportWidthPx;
  const tallEnough = safeHeight >= tuning.commentaryRailMinViewportHeightPx;
  const landscapeEnough = aspectRatio >= tuning.commentaryRailMinAspectRatio;

  if (profile === 'obs') {
    return 'bottom-panel';
  }

  if (
    sceneLayout.isPortrait
    || sceneLayout.isTiny
    || sceneLayout.isNarrow
    || sceneLayout.isShort
  ) {
    return 'bottom-panel';
  }

  return wideEnough && tallEnough && landscapeEnough
    ? 'commentary-rail'
    : 'bottom-panel';
}

function resolveIntentFeedCommentaryRailWidth(
  viewportWidth: number,
  sceneLayout: SceneLayoutProfile
): number {
  const tuning = legacyTuning.menu.intentFeed;
  const compact = sceneLayout.isTiny || sceneLayout.isNarrow;
  const insetX = tuning.insetXPx;
  const maxWidth = compact ? tuning.compactWidthPx : tuning.widthPx;
  const minWidth = compact ? tuning.compactMinWidthPx : tuning.minWidthPx;
  const widthRatio = compact ? tuning.compactMaxWidthRatio : tuning.maxWidthRatio;
  const availableWidth = Math.max(96, viewportWidth - (insetX * 2));
  const desiredWidth = Math.round(viewportWidth * widthRatio);
  const cappedWidth = Math.min(maxWidth, availableWidth);
  const floorWidth = Math.min(minWidth, cappedWidth);

  return Math.max(floorWidth, Math.min(cappedWidth, desiredWidth));
}

export class MenuScene extends Phaser.Scene {
  private titlePulseTween?: Phaser.Tweens.Tween;
  private titleDriftTween?: Phaser.Tweens.Tween;
  private ambientSky?: AmbientSkyLayer;
  private presentationVariant: AmbientPresentationVariant = DEFAULT_PRESENTATION_VARIANT;
  private launchConfig: PresentationLaunchConfig = { ...DEFAULT_PRESENTATION_LAUNCH_CONFIG };
  private activeTheme: PresentationThemeFamily = PRESENTATION_THEME_FAMILIES[0];

  public constructor() {
    super('MenuScene');
  }

  public init(data: MenuSceneInitData = {}): void {
    markBootTiming('menu-scene:init-start');
    this.launchConfig = sanitizePresentationLaunchConfig(data);
    this.presentationVariant = sanitizePresentationVariant(this.launchConfig.presentation);
    markBootTiming('menu-scene:init-end');
  }

  public create(): void {
    markBootTiming('menu-scene:create-start');
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
    const runtimeConfig = resolveMenuSceneRuntimeConfig(
      typeof window === 'undefined' ? undefined : window.location?.search,
      {
        hardwareConcurrency: typeof navigator !== 'undefined' && Number.isFinite(navigator.hardwareConcurrency)
          ? navigator.hardwareConcurrency
          : null,
        saveData: Boolean(
          (
            typeof navigator !== 'undefined'
              ? (navigator as Navigator & { connection?: { saveData?: boolean } })
              : undefined
          )?.connection?.saveData
        ),
        lowPowerHardwareConcurrencyMax: legacyTuning.menu.runtime.lowPowerHardwareConcurrencyMax
      }
    );
    const reducedMotion = prefersReducedMotion();
    const variantProfile = VARIANT_PROFILES[variant];
    const chromeProfile = CHROME_PROFILES[chrome];
    const sceneLayout = presentationModel.layout;
    const sceneStartedAt = this.time.now;
    const sceneInstanceId = nextMenuSceneInstanceId();
    let visualDiagnosticsRevision = 0;
    let runtimeDiagnosticsRevision = 0;
    let recoveryActivated = false;
    let recoveryEpisode: MazeEpisode | undefined;
    let patternEngine: PatternEngine | undefined;
    let patternFrame: PatternFrame | undefined;
    let episodePresentationShell: EpisodePresentationShell | undefined;
    let intentRuntimeSession: MenuIntentRuntimeSession | undefined;
    let intentRuntimeBootstrap: Phaser.Time.TimerEvent | undefined;
    let resizeRestart: Phaser.Time.TimerEvent | undefined;
    let lastResizeRestartKey: string | undefined;
    let handleVisibilityChange: (() => void) | undefined;
    let handleResize: ((gameSize?: { width?: number; height?: number }) => void) | undefined;
    let removeInstallSurfaceListener: (() => void) | undefined;
    let updateDemo: ((time: number, delta: number) => void) | undefined;
    let activeTitleBandFrame: TitleBandFrame | undefined;
    let activeTitleLockupLayout: TitleLockupLayout | undefined;
    let activeTitleContainer: Phaser.GameObjects.Container | undefined;
    let activeTitlePlateContainer: Phaser.GameObjects.Container | undefined;
    let activeTitleText: Phaser.GameObjects.Text | undefined;
    let activeTitleSubtitle: Phaser.GameObjects.Text | undefined;
    let installChrome: Phaser.GameObjects.Container | undefined;
    let activeInstallFrame: InstallChromeFrame | undefined;
    let activeInstallBounds: VisualSceneBounds | undefined;
    let activeInstallState: InstallSurfaceState = resolveMenuSceneInstallSurfaceState(getInstallSurfaceState(), visualCaptureConfig);
    let firstInteractiveFrameSeen = false;
    let deferredVisualSetupComplete = false;
    let deferredVisualSetupQueued = false;
    let deferredVisualSetupActive = false;
    let deferredVisualTaskQueue: Array<{ label: string; run: () => void }> = [];
    let deferredSceneChromeReady = false;
    let bootTimingReportLogged = false;
    const isDocumentSceneHidden = (): boolean => (
      typeof document !== 'undefined'
      && (document.visibilityState === 'hidden' || document.hidden)
    );
    let sceneHidden = isDocumentSceneHidden();
    let performanceMode: MenuScenePerformanceMode = sceneHidden
      ? 'hidden'
      : runtimeConfig.lowPowerActive
        ? 'throttled'
        : 'full';
    let visibilityChangeCount = sceneHidden ? 1 : 0;
    let visibilitySuspendCount = sceneHidden ? 1 : 0;
    let activeTweenCount = 0;
    let activeTimerCount = 0;
    let activeListenerCount = 0;
    let lastTrailSegmentCount = 0;
    let lastIntentEntryCount = 0;
    let lastIntentFeedDiagnostics: MenuSceneRuntimeDiagnostics['feed'] = {
      step: null,
      signature: '',
      visibleEntryCount: 0,
      visibleEntries: [],
      changeCount: 0,
      lastChangedAt: null
    };
    let ambientSkyDeltaBudgetMs = 0;
    let lastRuntimeDiagnosticsPublishedAt = sceneStartedAt;
    let totalFrameCount = 0;
    let totalFrameTimeMs = 0;
    let worstFrameTimeMs = 0;
    let totalSpikeCount = 0;
    const recentFrameTimesMs: number[] = [];
    const recentHeapSamples: Array<{ atMs: number; usedBytes: number }> = [];
    let hiddenRecoveryThrottleUntilMs = 0;
    let lastHeapPressureActive = false;
    let renderDemo: () => void = () => undefined;

    const toRuntimeFeedEntries = (
      feedState: IntentFeedState | null
    ): MenuSceneRuntimeDiagnostics['feed']['visibleEntries'] => (
      feedState?.entries.map((entry) => ({
        id: entry.id,
        speaker: entry.speaker,
        kind: entry.kind,
        importance: entry.importance,
        summary: entry.summary,
        slot: entry.slot
      })) ?? []
    );
    const runOptional = (label: string, render: () => void): void => {
      try {
        render();
      } catch (error) {
        console.error(`MenuScene optional ${label} skipped.`, error);
      }
    };
    const countEmitterListeners = (emitter: unknown, eventName: string): number => {
      const listenerCount = (emitter as { listenerCount?: (event: string) => number })?.listenerCount;
      if (typeof listenerCount !== 'function') {
        return 0;
      }

      try {
        return Math.max(0, listenerCount.call(emitter, eventName));
      } catch {
        return 0;
      }
    };
    const resolveActiveTweenCount = (): number => {
      const tweens = (this.tweens as Phaser.Tweens.TweenManager & { getTweens?: () => unknown[] }).getTweens?.();
      return Array.isArray(tweens) ? tweens.length : 0;
    };
    const resolveActiveTimerCount = (): number => {
      const timers = (this.time as Phaser.Time.Clock & { getAllEvents?: () => unknown[] }).getAllEvents?.();
      return Array.isArray(timers) ? timers.length : 0;
    };
    const resolveHeapSample = (): MenuSceneRuntimeDiagnostics['resources']['jsHeap'] | undefined => {
      const memory = (typeof performance !== 'undefined'
        ? (performance as Performance & {
          memory?: {
            usedJSHeapSize?: number;
            totalJSHeapSize?: number;
            jsHeapSizeLimit?: number;
          };
        }).memory
        : undefined);
      if (!memory || !Number.isFinite(memory.usedJSHeapSize)) {
        return undefined;
      }

      return {
        usedBytes: Math.max(0, Math.round(memory.usedJSHeapSize ?? 0)),
        ...(Number.isFinite(memory.totalJSHeapSize) ? { totalBytes: Math.max(0, Math.round(memory.totalJSHeapSize ?? 0)) } : {}),
        ...(Number.isFinite(memory.jsHeapSizeLimit) ? { limitBytes: Math.max(0, Math.round(memory.jsHeapSizeLimit ?? 0)) } : {})
      };
    };
    const resolveHeapPressureActive = (
      nowMs: number,
      heapSample?: MenuSceneRuntimeDiagnostics['resources']['jsHeap']
    ): boolean => {
      if (heapSample) {
        recentHeapSamples.push({
          atMs: nowMs,
          usedBytes: heapSample.usedBytes
        });
        if (recentHeapSamples.length > legacyTuning.menu.runtime.heapSampleWindow) {
          recentHeapSamples.splice(0, recentHeapSamples.length - legacyTuning.menu.runtime.heapSampleWindow);
        }
      }

      if (recentHeapSamples.length < 2) {
        lastHeapPressureActive = false;
        return lastHeapPressureActive;
      }

      const first = recentHeapSamples[0];
      const last = recentHeapSamples.at(-1);
      if (!first || !last) {
        lastHeapPressureActive = false;
        return lastHeapPressureActive;
      }

      const growthBytes = Math.max(0, last.usedBytes - first.usedBytes);
      const threshold = lastHeapPressureActive
        ? legacyTuning.menu.runtime.heapGrowthRecoverBytes
        : legacyTuning.menu.runtime.heapGrowthThrottleBytes;
      lastHeapPressureActive = growthBytes >= threshold;
      return lastHeapPressureActive;
    };
    const updatePerformanceMode = (sceneHiddenState: boolean, nowMs = this.time.now): void => {
      const recentFrames = summarizeMenuSceneFrameWindow(
        recentFrameTimesMs,
        legacyTuning.menu.runtime.spikeFrameMs
      );
      performanceMode = resolveMenuScenePerformanceMode(performanceMode, {
        hidden: sceneHiddenState,
        lowPowerActive: runtimeConfig.lowPowerActive,
        recentAverageFrameMs: recentFrames.averageMs,
        recentSpikeCount: recentFrames.spikeCount,
        heapPressureActive: lastHeapPressureActive,
        recoveryHoldActive: hiddenRecoveryThrottleUntilMs > nowMs,
        tuning: legacyTuning.menu.runtime
      });
    };
    const publishRuntimeDiagnostics = (sceneHidden: boolean, force = false): void => {
      const nowMs = this.time.now;
      if (!force && nowMs - lastRuntimeDiagnosticsPublishedAt < legacyTuning.menu.runtime.diagnosticsPublishIntervalMs) {
        return;
      }

      const heapSample = resolveHeapSample();
      const heapPressureActive = resolveHeapPressureActive(nowMs, heapSample);
      const postHiddenRecoveryActive = hiddenRecoveryThrottleUntilMs > nowMs;
      updatePerformanceMode(sceneHidden, nowMs);
      lastRuntimeDiagnosticsPublishedAt = nowMs;

      if (!runtimeConfig.enabled) {
        return;
      }

      const recentFrames = summarizeMenuSceneFrameWindow(recentFrameTimesMs, legacyTuning.menu.runtime.spikeFrameMs);
      const averageFrameMs = totalFrameCount > 0
        ? Number((totalFrameTimeMs / totalFrameCount).toFixed(3))
        : 0;
      const sceneUpdateListeners = countEmitterListeners(this.events, Phaser.Scenes.Events.UPDATE);
      const sceneShutdownListeners = countEmitterListeners(this.events, Phaser.Scenes.Events.SHUTDOWN);
      const scaleResizeListeners = countEmitterListeners(this.scale, Phaser.Scale.Events.RESIZE);
      const listenerCount = sceneUpdateListeners
        + sceneShutdownListeners
        + scaleResizeListeners
        + (handleVisibilityChange ? 1 : 0)
        + (removeInstallSurfaceListener ? 1 : 0);
      const ambientDiagnostics = this.ambientSky?.getDiagnostics(
        episodePresentationShell
          ? Math.min(
            0,
            episodePresentationShell.boardAura.depth,
            episodePresentationShell.boardHalo.depth,
            episodePresentationShell.boardShade.depth
          )
          : 0,
        activeTitleContainer?.depth,
        installChrome?.depth
      );

      activeTweenCount = resolveActiveTweenCount();
      activeTimerCount = resolveActiveTimerCount();
      activeListenerCount = listenerCount;
      publishMenuSceneRuntimeDiagnostics({
        revision: ++runtimeDiagnosticsRevision,
        sceneInstanceId,
        updatedAt: nowMs,
        runtimeMs: Math.max(0, nowMs - sceneStartedAt),
        visibility: {
          hidden: sceneHidden,
          changeCount: visibilityChangeCount,
          suspendCount: visibilitySuspendCount
        },
        performance: {
          mode: performanceMode,
          averageFrameMs,
          recentAverageFrameMs: recentFrames.averageMs,
          recentFrameCount: recentFrames.count,
          worstFrameMs: Number(worstFrameTimeMs.toFixed(3)),
          worstRecentFrameMs: recentFrames.worstMs,
          spikeCount: totalSpikeCount,
          recentSpikeCount: recentFrames.spikeCount,
          estimatedFps: recentFrames.fps,
          lowPowerDetected: runtimeConfig.lowPowerDetected,
          lowPowerForced: runtimeConfig.lowPowerForced,
          lowPowerActive: runtimeConfig.lowPowerActive,
          heapPressureActive,
          postHiddenRecoveryActive,
          hardwareConcurrency: runtimeConfig.hardwareConcurrency,
          saveData: runtimeConfig.saveData
        },
        feed: lastIntentFeedDiagnostics,
        resources: {
          activeTweens: activeTweenCount,
          activeTimers: activeTimerCount,
          listenerCount: activeListenerCount,
          listenerBreakdown: {
            sceneUpdate: sceneUpdateListeners,
            sceneShutdown: sceneShutdownListeners,
            scaleResize: scaleResizeListeners,
            visibilityAttached: Boolean(handleVisibilityChange),
            installSurfaceAttached: Boolean(removeInstallSurfaceListener)
          },
          trailSegmentCount: lastTrailSegmentCount,
          trailSegmentCap: legacyTuning.demo.behavior.trailMaxLength,
          intentEntryCount: lastIntentEntryCount,
          intentEntryCap: legacyTuning.menu.intentFeed.maxVisibleEntries,
          deferredVisualTasksRemaining: deferredVisualTaskQueue.length,
          deferredTasksPerFrameCap: legacyTuning.menu.runtime.deferredTasksPerFrame[performanceMode],
          background: {
            clouds: ambientDiagnostics?.activeCounts.clouds ?? 0,
            farStars: ambientDiagnostics?.activeCounts.farStars ?? 0,
            nearStars: ambientDiagnostics?.activeCounts.nearStars ?? 0,
            twinkles: ambientDiagnostics?.activeCounts.twinkles ?? 0,
            veils: ambientDiagnostics?.activeCounts.veils ?? 0,
            driftMotes: ambientDiagnostics?.activeCounts.driftMotes ?? 0,
            moving: ambientDiagnostics?.activeCounts.moving ?? 0,
            movingCap: ambientDiagnostics?.caps.moving ?? 0,
            signatureCap: ambientDiagnostics?.caps.signatureEvents ?? 0
          },
          ...(heapSample ? { jsHeap: heapSample } : {})
        }
      });
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
      episodePresentationShell.intentFeedHud.destroy();
      episodePresentationShell.boardRenderer.destroy();
      episodePresentationShell.motifSecondary.destroy();
      episodePresentationShell.motifPrimary.destroy();
      episodePresentationShell.blueprintAccent.destroy();
      episodePresentationShell.boardVeil.destroy();
      episodePresentationShell.boardShade.destroy();
      episodePresentationShell.boardHalo.destroy();
      episodePresentationShell.boardAura.destroy();
      episodePresentationShell = undefined;
      intentRuntimeBootstrap?.remove(false);
      intentRuntimeBootstrap = undefined;
      intentRuntimeSession = undefined;
    };
    const destroyPresentation = (destroyEngine: boolean): void => {
      resizeRestart?.remove(false);
      resizeRestart = undefined;
      this.titlePulseTween?.remove();
      this.titlePulseTween = undefined;
      this.titleDriftTween?.remove();
      this.titleDriftTween = undefined;
      this.ambientSky?.destroy();
      this.ambientSky = undefined;
      destroyEpisodePresentationShell();
      if (destroyEngine) {
        patternEngine?.destroy();
        patternEngine = undefined;
      }
      this.time.removeAllEvents();
      this.tweens.killAll();
      this.children.removeAll(true);
      activeTitleBandFrame = undefined;
      activeTitleLockupLayout = undefined;
      activeTitleContainer = undefined;
      activeTitlePlateContainer = undefined;
      activeTitleText = undefined;
      activeTitleSubtitle = undefined;
      installChrome = undefined;
      activeInstallFrame = undefined;
      activeInstallBounds = undefined;
      deferredVisualSetupActive = false;
      deferredVisualSetupQueued = false;
      deferredVisualTaskQueue = [];
      clearMenuSceneVisualDiagnostics();
      clearMenuSceneRuntimeDiagnostics();
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
      this.cameras.main.fadeIn(reducedMotion ? 0 : variant === 'loading' ? 180 : 240, 0, 0, 0);
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
      this.add.rectangle(0, 0, width, height, sceneThemeProfile.palette.background.deepSpace, 1)
        .setOrigin(0)
        .setDepth(AMBIENT_SKY_DEPTHS.base - 1);
        let installPromptPending = false;
        const compactInstallChrome = sceneLayout.isTiny || sceneLayout.isNarrow;
      const maybeLogBootTimingReport = (): void => {
        if (bootTimingReportLogged || !firstInteractiveFrameSeen || !deferredVisualSetupComplete) {
          return;
        }

        bootTimingReportLogged = true;
        logBootTimingReport('Mazer 2D boot timing');
      };
      const hydrateEpisodePresentationDecorations = (
        shell: EpisodePresentationShell | undefined,
        themeProfile: AmbientThemeProfile
      ): void => {
        if (!shell) {
          return;
        }

        runOptional('blueprint accent setup', () => {
          drawBlueprintAccent(shell.blueprintAccent, shell.layout, themeProfile.palette.board.topHighlight);
        });
        runOptional('theme motif setup', () => {
          drawThemeMotifs(themeProfile, shell.motifPrimary, shell.motifSecondary, shell.layout);
        });
      };
      const completeDeferredVisualSetup = (): void => {
        if (deferredVisualSetupComplete) {
          return;
        }

        deferredVisualSetupComplete = true;
        deferredVisualSetupActive = false;
        deferredVisualTaskQueue = [];
        markBootTiming('menu-scene:deferred-visual-setup');
        maybeLogBootTimingReport();
      };
      const drainDeferredVisualSetup = (): void => {
        if (recoveryActivated || deferredVisualSetupComplete || !deferredVisualSetupActive) {
          return;
        }

        const taskBudget = legacyTuning.menu.runtime.deferredTasksPerFrame[performanceMode];
        if (taskBudget <= 0) {
          return;
        }

        let tasksRemaining = taskBudget;
        while (tasksRemaining > 0 && deferredVisualTaskQueue.length > 0) {
          const nextTask = deferredVisualTaskQueue.shift();
          if (!nextTask) {
            break;
          }

          runOptional(nextTask.label, nextTask.run);
          tasksRemaining -= 1;
        }

        if (deferredVisualTaskQueue.length === 0) {
          completeDeferredVisualSetup();
        }
      };
      const runDeferredVisualSetup = (): void => {
        if (recoveryActivated || deferredVisualSetupComplete) {
          return;
        }

        if (!deferredVisualSetupActive) {
          deferredVisualSetupActive = true;
          deferredVisualTaskQueue = [
            {
              label: 'scene chrome',
              run: () => {
                renderSceneChrome();
              }
            },
            {
              label: 'ambient sky',
              run: () => {
                this.drawStarfield(width, height, sceneThemeProfile, scheduleSeed, variant, deploymentProfileId, reducedMotion);
              }
            },
            {
              label: 'presentation decorations',
              run: () => {
                if (episodePresentationShell) {
                  hydrateEpisodePresentationDecorations(episodePresentationShell, sceneThemeProfile);
                  syncAmbientSkyReservedFrames();
                }
              }
            }
          ];
        }

        try {
          drainDeferredVisualSetup();
        } catch (error) {
          console.error('MenuScene deferred visual setup failed.', error);
          completeDeferredVisualSetup();
        }
      };
      const scheduleDeferredVisualSetup = (): void => {
        if (recoveryActivated || deferredVisualSetupComplete || deferredVisualSetupQueued) {
          return;
        }

        deferredVisualSetupQueued = true;
        this.time.delayedCall(0, () => {
          deferredVisualSetupQueued = false;
          runDeferredVisualSetup();
        });
      };
      const scheduleIntentRuntimeSession = (episode: MazeEpisode): void => {
        intentRuntimeBootstrap?.remove(false);
        intentRuntimeBootstrap = this.time.delayedCall(0, () => {
          if (recoveryActivated || !episodePresentationShell || patternFrame?.episode !== episode) {
            return;
          }

          intentRuntimeSession = createMenuIntentRuntimeSession(episode);
          renderDemo();
        });
      };
      const publishVisualDiagnostics = (
        view?: DemoWalkerViewFrame,
        renderedTrail?: { start: number; limit: number }
      ): void => {
        if (!visualCaptureConfig.enabled || !episodePresentationShell) {
          return;
        }

        const themeProfile = resolveAmbientThemeProfile(this.activeTheme);
        const trailRender = episodePresentationShell.boardRenderer.getTrailRenderDiagnostics();
        const bootTiming = buildBootTimingReport();
        const activePath = patternFrame?.episode.raster.pathIndices;
        const presentedBoardBounds = resolveBoardPresentationBounds(
          episodePresentationShell.layout,
          demoPresentation.frameOffsetX,
          demoPresentation.frameOffsetY
        );
        const renderedHeadIndex = renderedTrail && activePath && renderedTrail.limit > 0
          ? activePath[renderedTrail.limit - 1] ?? null
          : null;
        const trailHeadAttached = isTrailHeadAttachedToActor(trailRender);
        const expectedTrailHeadIndex = view
          ? resolveLiveTrailHeadIndex(view)
          : null;
        const titleBounds = activeTitleContainer ? toVisualSceneBounds(activeTitleContainer.getBounds()) : undefined;
        const titlePlateBounds = activeTitlePlateContainer ? toVisualSceneBounds(activeTitlePlateContainer.getBounds()) : undefined;
        const titleTextBounds = activeTitleText ? toVisualSceneBounds(activeTitleText.getBounds()) : undefined;
        const subtitleBounds = activeTitleSubtitle ? toVisualSceneBounds(activeTitleSubtitle.getBounds()) : undefined;
        const subtitleGapBelowTitle = subtitleBounds && titleTextBounds
          ? subtitleBounds.top - titleTextBounds.bottom
          : undefined;
        const subtitleGapBelowPlate = subtitleBounds && titlePlateBounds
          ? subtitleBounds.top - titlePlateBounds.bottom
          : undefined;
        const intentFeedLayout = episodePresentationShell.intentFeedHud.getLayoutSnapshot();
        const intentFeedBounds = intentFeedLayout.rect
          ? toVisualSceneBounds({
            x: intentFeedLayout.rect.left,
            y: intentFeedLayout.rect.top,
            width: intentFeedLayout.rect.width,
            height: intentFeedLayout.rect.height
          })
          : undefined;
        const subtitleDiagnostics = activeTitleSubtitle
          ? {
            visible: subtitleBounds !== undefined,
            lineCount: resolveRenderedTextLineCount(activeTitleSubtitle),
            ...(activeTitleLockupLayout ? { minimumGapBelowTitle: activeTitleLockupLayout.subtitleGap } : {}),
            ...(subtitleBounds ? { bounds: subtitleBounds } : {}),
            ...(subtitleGapBelowTitle !== undefined ? { gapBelowTitle: subtitleGapBelowTitle } : {}),
            ...(subtitleGapBelowPlate !== undefined ? { gapBelowPlate: subtitleGapBelowPlate } : {})
          }
          : undefined;

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
            bounds: presentedBoardBounds,
            safeBounds: episodePresentationShell.layout.safeBounds,
            tileSize: episodePresentationShell.layout.tileSize
          },
          title: {
            expected: titleVisible,
            visible: titleVisible && titleBounds !== undefined,
            ...(activeTitleBandFrame ? { frame: activeTitleBandFrame } : {}),
            ...(titleBounds ? { bounds: titleBounds } : {}),
            ...(titlePlateBounds ? { plateBounds: titlePlateBounds } : {}),
            ...(titleTextBounds ? { textBounds: titleTextBounds } : {}),
            ...(subtitleDiagnostics ? { subtitle: subtitleDiagnostics } : {})
          },
          install: {
            expected: activeInstallState.mode !== 'hidden',
            visible: activeInstallState.mode !== 'hidden' && activeInstallBounds !== undefined,
            forced: visualCaptureConfig.forceInstallMode !== undefined,
            state: activeInstallState.mode,
            ...(activeInstallFrame ? { frame: activeInstallFrame } : {}),
            ...(activeInstallBounds ? { bounds: activeInstallBounds } : {})
          },
          intentFeed: {
            visible: intentFeedLayout.visible,
            dock: intentFeedLayout.dock,
            compact: intentFeedLayout.compact,
            statusVisible: intentFeedLayout.statusVisible,
            quickThoughtCount: intentFeedLayout.quickThoughtCount,
            maxVisibleEvents: intentFeedLayout.maxVisibleEvents,
            ...(intentFeedBounds ? { bounds: intentFeedBounds } : {})
          },
          trail: {
            start: renderedTrail?.start ?? trailRender.trailStart,
            limit: renderedTrail?.limit ?? trailRender.trailLimit,
            currentIndex: view?.currentIndex ?? patternFrame?.episode.raster.startIndex ?? 0,
            nextIndex: view?.nextIndex ?? patternFrame?.episode.raster.startIndex ?? 0,
            progress: view?.progress ?? 0,
            cue: view?.cue ?? 'spawn',
            suppressesFuturePreview: expectedTrailHeadIndex === null || (
              renderedHeadIndex === expectedTrailHeadIndex
              && (
                !view
                || view.currentIndex === view.nextIndex
                || view.progress <= 0
                || trailHeadAttached
              )
            ),
            attachedToActor: trailRender.attachedToActor && trailHeadAttached,
            bridgeRendered: trailRender.bridgeRendered,
            render: trailRender
          },
          paletteReadability: getPaletteReadabilityReport(themeProfile.palette),
          ...(bootTiming ? { bootTiming } : {}),
          ...(this.ambientSky
            ? {
                ambient: this.ambientSky.getDiagnostics(
                  Math.min(0, episodePresentationShell.boardAura.depth, episodePresentationShell.boardHalo.depth, episodePresentationShell.boardShade.depth),
                  activeTitleContainer?.depth,
                  installChrome?.depth
                )
              }
            : {})
        });
      };
      const resolveInstallChromeLabel = (state: InstallSurfaceState): string => (
        state.mode === 'manual'
          ? (state.instruction ?? 'Add to Home Screen')
          : installPromptPending
            ? (compactInstallChrome ? 'Install...' : 'Install Mazer...')
            : (compactInstallChrome ? 'Install' : 'Install Mazer')
      );
      const createInstallChromeLabelStyle = (
        themeProfile: AmbientThemeProfile,
        state: InstallSurfaceState
      ) => ({
        color: state.mode === 'available'
          ? (installPromptPending ? themeProfile.title.pendingColor : themeProfile.title.installColor)
          : themeProfile.title.supportColor,
        fontFamily: themeProfile.title.supportFontFamily,
        fontSize: `${compactInstallChrome ? 9 : 10}px`,
        fontStyle: state.mode === 'available' ? 'bold' : 'normal',
        wordWrap: state.mode === 'manual'
          ? {
            width: Math.max(152, Math.min(264, width * (compactInstallChrome ? 0.56 : 0.4))),
            useAdvancedWrap: true
          }
          : undefined
      });
      const measureInstallChromeMetrics = (
        themeProfile: AmbientThemeProfile,
        state: InstallSurfaceState = activeInstallState
      ): { compactInstall: boolean; labelText: string; chipWidth: number; chipHeight: number } | undefined => {
        if (state.mode === 'hidden') {
          return undefined;
        }

        const labelText = resolveInstallChromeLabel(state);
        const label = this.add.text(-4096, -4096, labelText, createInstallChromeLabelStyle(themeProfile, state))
          .setOrigin(0.5)
          .setLetterSpacing(compactInstallChrome ? 1 : 2)
          .setVisible(false)
          .setAlpha(0);
        const chipWidth = Phaser.Math.Clamp(
          Math.ceil(label.width + (compactInstallChrome ? 22 : 28)),
          state.mode === 'manual' ? 164 : (compactInstallChrome ? 96 : 126),
          Math.max(
            state.mode === 'manual' ? 164 : (compactInstallChrome ? 96 : 126),
            Math.round(width * (state.mode === 'manual' ? (compactInstallChrome ? 0.66 : 0.46) : compactInstallChrome ? 0.36 : 0.24))
          )
        );
        const chipHeight = Math.max(compactInstallChrome ? 23 : 25, Math.ceil(label.height + (compactInstallChrome ? 12 : 14)));
        label.destroy();
        return {
          compactInstall: compactInstallChrome,
          labelText,
          chipWidth,
          chipHeight
        };
      };
      const createEpisodePresentationShell = (
        episode: MazeEpisode,
        themeId: PresentationThemeFamily
      ): EpisodePresentationShell => {
        const themeProfile = resolveAmbientThemeProfile(themeId);
        const titleFrame = titleVisible
          ? resolveTitleBandFrame(width, sceneLayout, undefined, viewportSafeInsets, deploymentProfileId)
          : undefined;
        const installMetrics = measureInstallChromeMetrics(sceneThemeProfile, activeInstallState);
        const installFrame = installMetrics
          ? resolveInstallChromeFrame(width, height, sceneLayout, undefined, installMetrics.chipWidth, installMetrics.chipHeight, viewportSafeInsets)
          : undefined;
        const boardCompositionFrame = resolveBoardCompositionFrame(
          width,
          height,
          sceneLayout,
          titleFrame,
          installFrame,
          viewportSafeInsets,
          deploymentProfileId
        );
        const layout = createBoardLayout(this, episode, {
          boardScale: 1,
          safeBounds: boardCompositionFrame
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
        const signalPriority = legacyTuning.menu.signalPriority;
        const boardRenderer = new BoardRenderer(this, episode, layout, {
          theme: {
            ...themeProfile.boardTheme,
            trailFillAlphaScale: (themeProfile.boardTheme.trailFillAlphaScale ?? 1) * signalPriority.trailFillAlphaScale,
            trailGlowAlphaScale: (themeProfile.boardTheme.trailGlowAlphaScale ?? 1) * signalPriority.trailGlowAlphaScale,
            trailCoreAlphaScale: (themeProfile.boardTheme.trailCoreAlphaScale ?? 1) * signalPriority.trailCoreAlphaScale,
            goalGlowAlphaScale: (themeProfile.boardTheme.goalGlowAlphaScale ?? 1) * signalPriority.goalGlowAlphaScale,
            actorHaloAlphaScale: (themeProfile.boardTheme.actorHaloAlphaScale ?? 1) * signalPriority.actorHaloAlphaScale,
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
          intentFeedHud: createIntentFeedHud(this, {
            palette: themeProfile.palette
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
      const syncAmbientSkyReservedFrames = (): void => {
        this.ambientSky?.setReservedFrames(
          episodePresentationShell?.layout.boardBounds,
          episodePresentationShell?.layout.tileSize,
          activeTitleBandFrame,
          activeInstallFrame
        );
      };
      syncAmbientSkyReservedFrames();
      const renderInstallChrome = (state: InstallSurfaceState = getInstallSurfaceState()): void => {
        installChrome ??= this.add.container(0, 0).setDepth(11);
        const resolvedState = resolveMenuSceneInstallSurfaceState(state, visualCaptureConfig);
        installChrome.removeAll(true);
        activeInstallState = resolvedState;
        activeInstallBounds = undefined;
        activeInstallFrame = undefined;

        if (resolvedState.mode === 'hidden') {
          installChrome.setVisible(false);
          return;
        }

        const installMetrics = measureInstallChromeMetrics(sceneThemeProfile, resolvedState);
        if (!installMetrics) {
          installChrome.setVisible(false);
          return;
        }

        const { compactInstall, labelText, chipWidth, chipHeight } = installMetrics;
        const label = this.add.text(0, 0, labelText, createInstallChromeLabelStyle(sceneThemeProfile, resolvedState))
          .setOrigin(0.5)
          .setLetterSpacing(compactInstall ? 1 : 2);
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
        syncAmbientSkyReservedFrames();
      };
      const renderTitleChrome = (): void => {
        activeTitleBandFrame = undefined;
        activeTitleLockupLayout = undefined;
        activeTitleContainer = undefined;
        activeTitlePlateContainer = undefined;
        activeTitleText = undefined;
        activeTitleSubtitle = undefined;
        if (!titleVisible) {
          return;
        }

        const titleBandFrame = resolveTitleBandFrame(width, sceneLayout, layout, viewportSafeInsets, deploymentProfileId);
        const titleLockup = resolveTitleLockupLayout(layout, sceneLayout, titleBandFrame, variant, chrome, deploymentProfileId);
        let titleY = titleLockup.titleY;
        let titleShadowY = titleLockup.titleShadowY;
        activeTitleBandFrame = titleBandFrame;
        activeTitleLockupLayout = titleLockup;
        const titleShadowContainer = this.add.container(titleLockup.titleX, titleShadowY).setDepth(6.9);
        const titleContainer = this.add.container(titleLockup.titleX, titleY).setDepth(9);
        const titlePlateContainer = this.add.container(0, 0);
        const titleAlpha = variantProfile.titleAlpha * chromeProfile.titleAlpha * deploymentProfile.titleAlphaScale;
        const signatureAlpha = variantProfile.signatureAlpha * chromeProfile.signatureAlpha * deploymentProfile.signatureAlphaScale;
        const plateAlpha = variantProfile.plateAlpha * chromeProfile.plateAlpha * deploymentProfile.plateAlphaScale;
        const panelAlpha = variantProfile.panelAlpha * chromeProfile.panelAlpha * deploymentProfile.panelAlphaScale;
        const titleShadowAlpha = Math.min(0.12, 0.08 * titleAlpha);
        const titleFontStyle = sceneThemeProfile.id === 'vellum' ? 'normal' : 'bold';
        const titleStrokeWidth = 1;
        titlePlateContainer.add([
          this.add.rectangle(0, 0, titleLockup.plateWidth, titleLockup.plateHeight, sceneThemeProfile.title.plateOuterColor, plateAlpha)
            .setStrokeStyle(1, sceneThemeProfile.palette.board.innerStroke, 0.28 * titleAlpha),
          this.add.rectangle(0, 0, titleLockup.plateWidth - 12, titleLockup.plateHeight - 10, sceneThemeProfile.title.plateInnerColor, panelAlpha)
            .setStrokeStyle(1, sceneThemeProfile.title.plateLineColor, 0.28 * titleAlpha),
          this.add.rectangle(
            0,
            -(titleLockup.plateHeight / 2) + 8,
            titleLockup.plateWidth - 24,
            1,
            sceneThemeProfile.title.plateLineColor,
            0.3 * titleAlpha
          )
        ]);
        titleShadowContainer.add([
          this.add.text(1, 1, legacyTuning.menu.title.text, {
            color: sceneThemeProfile.title.titleShadow,
            fontFamily: sceneThemeProfile.title.fontFamily,
            fontSize: `${titleLockup.titleFontSize}px`,
            fontStyle: titleFontStyle
          }).setOrigin(0.5).setLetterSpacing(titleLockup.titleLetterSpacing).setAlpha(titleShadowAlpha)
        ]);
        const title = this.add.text(0, -Math.round(titleLockup.plateHeight * 0.08), legacyTuning.menu.title.text, {
          color: sceneThemeProfile.title.titleColor,
          fontFamily: sceneThemeProfile.title.fontFamily,
          fontSize: `${titleLockup.titleFontSize}px`,
          fontStyle: titleFontStyle
        }).setOrigin(0.5).setLetterSpacing(titleLockup.titleLetterSpacing)
          .setAlpha(titleAlpha)
          .setStroke(sceneThemeProfile.title.titleStroke, titleStrokeWidth);
        const subtitle = this.add.text(0, titleLockup.subtitleTopOffsetY, TITLE_SIGNATURE_TEXT, {
          color: sceneThemeProfile.title.signatureColor,
          fontFamily: sceneThemeProfile.title.signatureFontFamily,
          fontSize: `${titleLockup.subtitleFontSize}px`
        }).setOrigin(0.5, 0)
          .setAlpha(signatureAlpha)
          .setLetterSpacing(titleLockup.subtitleLetterSpacing);

        titlePlateContainer.add(title);
        titleContainer.add([titlePlateContainer, subtitle]);

        const titleBounds = titleContainer.getBounds();
        const overflowTop = titleBandFrame.top - titleBounds.top;
        const overflowBottom = titleBounds.bottom - titleBandFrame.bottom;
        const titleShiftY = overflowBottom > 0
          ? -Math.ceil(overflowBottom)
          : overflowTop > 0
            ? Math.ceil(overflowTop)
            : 0;
        if (titleShiftY !== 0) {
          titleY += titleShiftY;
          titleShadowY += titleShiftY;
          titleContainer.y = titleY;
          titleShadowContainer.y = titleShadowY;
        }

        activeTitleContainer = titleContainer;
        activeTitlePlateContainer = titlePlateContainer;
        activeTitleText = title;
        activeTitleSubtitle = subtitle;
        if (reducedMotion || chrome === 'minimal') {
          titleContainer.setAlpha(1).setScale(1);
          titleShadowContainer.setAlpha(1).setScale(1);
          return;
        }

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
      };
      const renderSceneChrome = (): void => {
        if (deferredSceneChromeReady) {
          return;
        }

        deferredSceneChromeReady = true;
        renderInstallChrome();
        removeInstallSurfaceListener = subscribeInstallSurface((state) => {
          try {
            renderInstallChrome(state);
          } catch (error) {
            console.error('MenuScene optional install surface skipped.', error);
          }
        });
        renderTitleChrome();
        syncAmbientSkyReservedFrames();
      };

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
        intentRuntimeSession = undefined;
        scheduleIntentRuntimeSession(patternFrame.episode);
        if (deferredVisualSetupComplete) {
          hydrateEpisodePresentationDecorations(
            episodePresentationShell,
            resolveAmbientThemeProfile(demoCyclePlan.theme)
          );
        }
        syncAmbientSkyReservedFrames();
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
      renderDemo = (): void => {
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
        const renderedTrail = resolveDemoTrailRenderBounds(path, view, demoPresentation.trailWindow);
        const intentStep = Math.max(0, renderedTrail.limit - 1);
        lastTrailSegmentCount = Math.max(0, renderedTrail.limit - renderedTrail.start);

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
        intentRuntimeSession?.advanceToStep(intentStep);

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
        runOptional('intent feed', () => {
          const trailDiagnostics = shell.boardRenderer.getTrailRenderDiagnostics();
          const presentedBoardBounds = resolveBoardPresentationBounds(
            shell.layout,
            demoPresentation.frameOffsetX,
            demoPresentation.frameOffsetY
          );
          const fallbackPlayerX = shell.layout.boardX
            + (xFromIndex(view.currentIndex, episode.raster.width) * shell.layout.tileSize)
            + (shell.layout.tileSize / 2);
          const fallbackPlayerY = shell.layout.boardY
            + (yFromIndex(view.currentIndex, episode.raster.width) * shell.layout.tileSize)
            + (shell.layout.tileSize / 2);
          const objectiveX = shell.layout.boardX
            + (xFromIndex(episode.raster.endIndex, episode.raster.width) * shell.layout.tileSize)
            + (shell.layout.tileSize / 2);
          const objectiveY = shell.layout.boardY
            + (yFromIndex(episode.raster.endIndex, episode.raster.width) * shell.layout.tileSize)
            + (shell.layout.tileSize / 2);
          const anchorSize = legacyTuning.menu.intentFeed.anchorSizePx;
          const feedState = intentRuntimeSession?.getDisplayFeedState(intentStep, this.time.now) ?? null;
          lastIntentFeedDiagnostics = summarizeMenuSceneRuntimeFeed({
            step: feedState?.step ?? null,
            visibleEntries: toRuntimeFeedEntries(feedState),
            previous: lastIntentFeedDiagnostics,
            nowMs: this.time.now
          });
          lastIntentEntryCount = lastIntentFeedDiagnostics.visibleEntryCount;

          shell.intentFeedHud.setState(feedState, {
            player: {
              x: (trailDiagnostics.headCenter?.x ?? fallbackPlayerX) + demoPresentation.frameOffsetX,
              y: (trailDiagnostics.headCenter?.y ?? fallbackPlayerY) + demoPresentation.frameOffsetY,
              width: anchorSize,
              height: anchorSize
            },
            objective: {
              x: objectiveX + demoPresentation.frameOffsetX,
              y: objectiveY + demoPresentation.frameOffsetY,
              width: anchorSize,
              height: anchorSize
            },
            board: {
              x: presentedBoardBounds.centerX,
              y: presentedBoardBounds.centerY,
              width: presentedBoardBounds.width,
              height: presentedBoardBounds.height
            },
            title: activeTitleBandFrame
              ? {
                x: activeTitleBandFrame.centerX,
                y: activeTitleBandFrame.centerY,
                width: activeTitleBandFrame.width,
                height: activeTitleBandFrame.height
              }
              : undefined,
            install: activeInstallBounds
              ? {
                x: activeInstallBounds.centerX,
                y: activeInstallBounds.centerY,
                width: activeInstallBounds.width,
                height: activeInstallBounds.height
              }
              : undefined,
            avoid: [
              ...(activeTitleBandFrame
                ? [{
                  x: activeTitleBandFrame.centerX,
                  y: activeTitleBandFrame.centerY,
                  width: activeTitleBandFrame.width,
                  height: activeTitleBandFrame.height
                }]
                : []),
              ...(activeInstallBounds
                ? [{
                  x: activeInstallBounds.centerX,
                  y: activeInstallBounds.centerY,
                  width: activeInstallBounds.width,
                  height: activeInstallBounds.height
                }]
                : [])
            ]
          });
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
      const setSceneHiddenState = (hidden: boolean): void => {
        if (sceneHidden === hidden) {
          return;
        }

        sceneHidden = hidden;
        visibilityChangeCount += 1;
        if (hidden) {
          visibilitySuspendCount += 1;
          hiddenRecoveryThrottleUntilMs = 0;
          recentFrameTimesMs.length = 0;
        }

        const sceneTweens = this.tweens as Phaser.Tweens.TweenManager & {
          pauseAll?: () => void;
          resumeAll?: () => void;
        };
        const sceneClock = this.time as Phaser.Time.Clock & { paused?: boolean };

        if (hidden) {
          patternEngine?.suspend();
          sceneClock.paused = true;
          sceneTweens.pauseAll?.();
          ambientSkyDeltaBudgetMs = 0;
          updatePerformanceMode(true);
          publishRuntimeDiagnostics(true, true);
          return;
        }

        sceneClock.paused = false;
        sceneTweens.resumeAll?.();
        ambientSkyDeltaBudgetMs = 0;
        recentFrameTimesMs.length = 0;
        hiddenRecoveryThrottleUntilMs = this.time.now + legacyTuning.menu.runtime.postHiddenRecoveryMs;
        updatePerformanceMode(false, this.time.now);
        publishRuntimeDiagnostics(false, true);
      };
      handleVisibilityChange = (): void => {
        if (typeof document === 'undefined' || recoveryActivated) {
          return;
        }

        if (isDocumentSceneHidden()) {
          setSceneHiddenState(true);
          return;
        }

        if (!sceneHidden) {
          return;
        }

        setSceneHiddenState(false);
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
      markBootTiming('menu-scene:create-core-ready');
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', handleVisibilityChange);
      }
      this.scale.on(Phaser.Scale.Events.RESIZE, handleResize);
      if (sceneHidden) {
        const sceneTweens = this.tweens as Phaser.Tweens.TweenManager & { pauseAll?: () => void };
        const sceneClock = this.time as Phaser.Time.Clock & { paused?: boolean };
        patternEngine?.suspend();
        sceneClock.paused = true;
        sceneTweens.pauseAll?.();
        updatePerformanceMode(true, sceneStartedAt);
      }
      publishRuntimeDiagnostics(sceneHidden, true);
      updateDemo = (_time: number, delta: number): void => {
        if (sceneHidden) {
          return;
        }

        const safeDelta = Math.max(0, Math.min(delta, 250));
        totalFrameCount += 1;
        totalFrameTimeMs += safeDelta;
        worstFrameTimeMs = Math.max(worstFrameTimeMs, safeDelta);
        if (safeDelta >= legacyTuning.menu.runtime.spikeFrameMs) {
          totalSpikeCount += 1;
        }
        recentFrameTimesMs.push(safeDelta);
        if (recentFrameTimesMs.length > legacyTuning.menu.runtime.recentFrameWindow) {
          recentFrameTimesMs.splice(0, recentFrameTimesMs.length - legacyTuning.menu.runtime.recentFrameWindow);
        }
        updatePerformanceMode(false);

        if (!firstInteractiveFrameSeen) {
          firstInteractiveFrameSeen = true;
          markBootTiming('menu-scene:first-interactive-frame');
          scheduleDeferredVisualSetup();
          maybeLogBootTimingReport();
        }

        if (deferredVisualSetupActive) {
          drainDeferredVisualSetup();
        }

        ambientSkyDeltaBudgetMs += safeDelta;
        if (ambientSkyDeltaBudgetMs >= legacyTuning.menu.runtime.ambientUpdateIntervalMs[performanceMode]) {
          const delta = Math.min(ambientSkyDeltaBudgetMs, AMBIENT_SKY_MAX_DELTA_MS);
          ambientSkyDeltaBudgetMs = 0;
          this.ambientSky?.update(delta);
        }
        if (recoveryActivated || !patternEngine) {
          publishRuntimeDiagnostics(false);
          return;
        }

        try {
          const nextFrame = patternEngine.next(safeDelta / 1000);
          if (!patternFrame) {
            patternFrame = nextFrame;
            recoveryEpisode = nextFrame.episode;
            renderDemo();
            publishRuntimeDiagnostics(false);
            return;
          }

          if (nextFrame.episode !== patternFrame.episode) {
            applyPatternFrame(nextFrame);
            publishRuntimeDiagnostics(false);
            return;
          }

          patternFrame = nextFrame;
          renderDemo();
          publishRuntimeDiagnostics(false);
        } catch (error) {
          failOpen(error);
        }
      };
      this.events.on(Phaser.Scenes.Events.UPDATE, updateDemo);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        removeRuntimeListeners();
        destroyPresentation(true);
      });
      markBootTiming('menu-scene:create-end');
    } catch (error) {
      failOpen(error);
    }
  }

  private drawStarfield(
    width: number,
    height: number,
    themeProfile: AmbientThemeProfile,
    seed: number = legacyTuning.demo.seed,
    variant: AmbientPresentationVariant = this.presentationVariant,
    profile = this.launchConfig.profile,
    reducedMotion = prefersReducedMotion()
  ): void {
    const safeWidth = sanitizePositive(width, DEFAULT_VIEWPORT_WIDTH);
    const safeHeight = sanitizePositive(height, DEFAULT_VIEWPORT_HEIGHT);
    this.ambientSky?.destroy();
    this.ambientSky = new AmbientSkyLayer(this, {
      width: safeWidth,
      height: safeHeight,
      seed,
      themeProfile,
      variant,
      profile,
      reducedMotion
    });
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

    this.drawStarfield(safeWidth, safeHeight, themeProfile, legacyTuning.demo.seed, this.presentationVariant, this.launchConfig.profile, true);
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

const roundClampedCadenceMs = (value: number, min: number, max: number): number => (
  Math.round(clamp(value, min, max))
);

const resolveTargetTraverseMs = (episode: MazeEpisode, cycle: MenuDemoCycle, pathSegments: number): number => {
  const difficultyBias = episode.difficulty === 'chill'
    ? -140
    : episode.difficulty === 'standard'
      ? -40
      : episode.difficulty === 'spicy'
        ? 90
        : 170;
  const sizeBias = episode.size === 'small'
    ? -120
    : episode.size === 'medium'
      ? 0
      : episode.size === 'large'
        ? 110
        : 170;
  const moodBias = cycle.mood === 'scan'
    ? -60
    : cycle.mood === 'blueprint'
      ? 90
      : 25;

  return clamp(
    1420 + Math.min(1200, pathSegments * 24) + difficultyBias + sizeBias + moodBias,
    1400,
    3200
  );
};

export const resolveDemoConfig = (episode: MazeEpisode, cycle: MenuDemoCycle): DemoWalkerConfig => {
  const pathSegments = Math.max(1, episode.raster.pathIndices.length - 1);
  const baseSpawnHoldMs = legacyTuning.demo.cadence.spawnHoldMs + cycle.pacing.spawnHoldMs + (cycle.mood === 'blueprint' ? 60 : 0);
  const baseExploreStepMs = legacyTuning.demo.cadence.exploreStepMs + cycle.pacing.exploreStepMs + (cycle.mood === 'scan' ? 8 : 0);
  const baseGoalHoldMs = legacyTuning.demo.cadence.goalHoldMs + cycle.pacing.goalHoldMs + (episode.difficulty === 'brutal' ? 100 : 0);
  const baseResetHoldMs = legacyTuning.demo.cadence.resetHoldMs + cycle.pacing.resetHoldMs + (cycle.mood === 'solve' ? 18 : 0);
  const targetExploreStepMs = resolveTargetTraverseMs(episode, cycle, pathSegments) / pathSegments;
  const spawnHoldMs = roundClampedCadenceMs(
    baseSpawnHoldMs
      + (pathSegments <= 10 ? 34 : pathSegments >= 28 ? 10 : 20)
      + (episode.size === 'small' ? 18 : episode.size === 'huge' ? -10 : 0),
    180,
    340
  );
  const exploreStepMs = roundClampedCadenceMs(
    (baseExploreStepMs * 0.44) + (targetExploreStepMs * 0.56),
    72,
    132
  );
  const goalHoldMs = roundClampedCadenceMs(
    baseGoalHoldMs
      + Math.min(420, pathSegments * 9)
      + (episode.difficulty === 'chill' ? -90 : episode.difficulty === 'brutal' ? 120 : 0),
    2400,
    3900
  );
  const resetHoldMs = roundClampedCadenceMs(
    baseResetHoldMs
      + (pathSegments <= 10 ? 52 : 82)
      + (cycle.mood === 'blueprint' ? 24 : 0),
    320,
    520
  );

  return {
    ...legacyTuning.demo,
    cadence: {
      ...legacyTuning.demo.cadence,
      spawnHoldMs,
      exploreStepMs,
      goalHoldMs,
      resetHoldMs
    }
  };
};

export const resolveDemoTrailRenderBounds = (
  path: ArrayLike<number>,
  view: DemoWalkerViewFrame,
  trailWindow = Math.max(1, view.trailLimit - view.trailStart)
): { start: number; limit: number } => {
  if (path.length <= 0) {
    return { start: 0, limit: 0 };
  }

  const visibleWindow = Math.max(
    1,
    Math.min(
      path.length,
      Math.max(1, trailWindow)
    )
  );
  const clampWindow = (limit: number): { start: number; limit: number } => {
    const safeLimit = Math.max(0, Math.min(path.length, limit));
    return {
      start: Math.max(0, safeLimit - visibleWindow),
      limit: safeLimit
    };
  };
  const headIndex = resolveLiveTrailHeadIndex(view);
  let headCursor = -1;
  for (let index = 0; index < path.length; index += 1) {
    if (path[index] === headIndex) {
      headCursor = index;
      break;
    }
  }

  if (headCursor < 0) {
    return clampWindow(Math.max(1, Math.min(path.length, view.trailLimit)));
  }

  return clampWindow(headCursor + 1);
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
    legacyTuning.demo.behavior.trailMaxLength
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
