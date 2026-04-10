import Phaser from 'phaser';
import type {
  AmbientPresentationVariant,
  PresentationChrome,
  PresentationDeploymentProfile,
  PresentationLaunchConfig,
  PresentationMood
} from '../boot/presentation';
import {
  DEFAULT_PRESENTATION_CHROME,
  DEFAULT_PRESENTATION_LAUNCH_CONFIG,
  DEFAULT_PRESENTATION_VARIANT,
  isDeterministicPresentationCapture,
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
import { resolveDemoWalkerViewFrame, type DemoWalkerConfig, type DemoWalkerCue } from '../domain/ai';
import {
  disposeMazeEpisode,
  generateMazeForDifficulty,
  MAZE_SIZE_ORDER,
  type MazePresentationPreset,
  PatternEngine,
  type MazeDifficulty,
  type MazeEpisode,
  type MazeSize,
  type PatternFrame
} from '../domain/maze';
import { legacyTuning, resolveBoardScaleFromCamScale } from '../config/tuning';
import { createBoardLayout, BoardRenderer } from '../render/boardRenderer';
import { createDemoStatusHud } from '../render/hudRenderer';
import { palette } from '../render/palette';
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
  presentationPreset: MazePresentationPreset;
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
  actorPulseBoost: number;
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
}

interface MenuDemoCycleOverrides {
  difficulty?: MazeDifficulty;
  size?: MazeSize;
  mood?: DemoMood;
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

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const sanitizePositive = (value: unknown, fallback: number, minimum = 1): number => (
  isFiniteNumber(value) && value >= minimum ? value : fallback
);
const sanitizeOffset = (value: unknown): number => (isFiniteNumber(value) ? value : 0);

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
    topReserveRatio: 0.102,
    topReserveMinPx: 88,
    bottomPaddingPx: 26,
    sidePaddingPx: 12,
    titleScale: 1.05,
    titleAlpha: Math.min(0.94, legacyTuning.menu.title.alpha + 0.08),
    signatureAlpha: 0.78,
    passiveAlpha: 0.42,
    plateAlpha: 0.18,
    panelAlpha: 0.26,
    titleYOffsetRatio: 0.18,
    titleAnchor: 'center',
    titleDriftX: 2,
    titleDriftY: 1,
    titleDriftMs: 4000,
    titleLetterSpacingWide: 5,
    titleLetterSpacingNarrow: 3,
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
    topReserveRatio: 0.086,
    topReserveMinPx: 72,
    bottomPaddingPx: 24,
    sidePaddingPx: 10,
    titleScale: 0.72,
    titleAlpha: 0.34,
    signatureAlpha: 0.42,
    passiveAlpha: 0.28,
    plateAlpha: 0.05,
    panelAlpha: 0.1,
    titleYOffsetRatio: 0.11,
    titleAnchor: 'center',
    titleDriftX: 3,
    titleDriftY: 1,
    titleDriftMs: 4600,
    titleLetterSpacingWide: 4,
    titleLetterSpacingNarrow: 2,
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
    topReserveRatio: 0.092,
    topReserveMinPx: 76,
    bottomPaddingPx: 34,
    sidePaddingPx: 12,
    titleScale: 0.84,
    titleAlpha: 0.62,
    signatureAlpha: 0.58,
    passiveAlpha: 0.48,
    plateAlpha: 0.12,
    panelAlpha: 0.2,
    titleYOffsetRatio: 0.13,
    titleAnchor: 'left',
    titleDriftX: 2,
    titleDriftY: 2,
    titleDriftMs: 3200,
    titleLetterSpacingWide: 3,
    titleLetterSpacingNarrow: 2,
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
    boardScaleBias: 0.008,
    topReserveBias: -18,
    bottomPaddingBias: -4,
    sidePaddingBias: -1,
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
    boardScaleBias: 0.018,
    portraitBoardScaleBias: -0.006,
    topReserveBias: -12,
    portraitTopReserveBias: 6,
    bottomPaddingBias: -4,
    sidePaddingBias: -4,
    maxBoardScale: 0.996,
    titlePlateWidthScale: 0.92,
    titlePlateHeightScale: 0.96,
    titleLineSpacingScale: 1,
    titleYOffsetBias: -4,
    titleAlphaScale: 2.55,
    signatureAlphaScale: 2.1,
    passiveAlphaScale: 1.8,
    plateAlphaScale: 3,
    panelAlphaScale: 2.2,
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
    boardScaleBias: -0.024,
    portraitBoardScaleBias: -0.02,
    topReserveBias: 18,
    portraitTopReserveBias: 18,
    bottomPaddingBias: 12,
    sidePaddingBias: 8,
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

const resolveDeploymentPresentationProfile = (
  profile: PresentationDeploymentProfile | null | undefined
): DeploymentPresentationProfile => (
  profile ? DEPLOYMENT_PRESENTATION_PROFILES[profile] : DEFAULT_DEPLOYMENT_PRESENTATION_PROFILE
);

export function resolveMenuPresentationModel(
  width: number,
  height: number,
  variant: AmbientPresentationVariant,
  chrome: PresentationChrome = DEFAULT_PRESENTATION_CHROME,
  titleVisible = true,
  profile?: PresentationDeploymentProfile
): MenuPresentationModel {
  const viewport = resolveViewportSize(width, height, DEFAULT_VIEWPORT_WIDTH, DEFAULT_VIEWPORT_HEIGHT);

  return {
    viewport,
    layout: resolveSceneLayoutProfile(viewport.width, viewport.height, variant, chrome, titleVisible, profile)
  };
}

export class MenuScene extends Phaser.Scene {
  private titlePulseTween?: Phaser.Tweens.Tween;
  private titleDriftTween?: Phaser.Tweens.Tween;
  private starDriftTween?: Phaser.Tweens.Tween;
  private presentationVariant: AmbientPresentationVariant = DEFAULT_PRESENTATION_VARIANT;
  private launchConfig: PresentationLaunchConfig = { ...DEFAULT_PRESENTATION_LAUNCH_CONFIG };

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
    const presentationModel = resolveMenuPresentationModel(
      this.scale.width,
      this.scale.height,
      variant,
      chrome,
      titleVisible,
      deploymentProfileId
    );
    const { width, height } = presentationModel.viewport;
    const reducedMotion = prefersReducedMotion();
    const variantProfile = VARIANT_PROFILES[variant];
    const chromeProfile = CHROME_PROFILES[chrome];
    const sceneLayout = presentationModel.layout;
    let recoveryActivated = false;
    let recoveryEpisode: MazeEpisode | undefined;
    let patternEngine: PatternEngine | undefined;
    let patternFrame: PatternFrame | undefined;
    let episodePresentationShell: EpisodePresentationShell | undefined;
    let resizeRestart: Phaser.Time.TimerEvent | undefined;
    let handleVisibilityChange: (() => void) | undefined;
    let handleResize: ((gameSize?: { width?: number; height?: number }) => void) | undefined;
    let removeInstallSurfaceListener: (() => void) | undefined;
    let updateDemo: ((time: number, delta: number) => void) | undefined;

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
      this.cameras.main.fadeIn(reducedMotion ? 0 : variant === 'loading' ? 220 : 280, 0, 0, 0);
      this.drawStarfield(width, height);

      let demoSeed = launchConfig.seed ?? legacyTuning.demo.seed;
      let demoCycle = 0;
      let pendingCyclePlan: MenuDemoCycle | undefined;
      patternEngine = new PatternEngine(() => {
        const cycleSeed = deterministicCapture ? (launchConfig.seed ?? demoSeed) : demoSeed;
        const cycle = resolveMenuDemoCycle(cycleSeed, deterministicCapture ? 0 : demoCycle, {
          difficulty: launchConfig.difficulty,
          size: launchConfig.size,
          mood: moodOverride
        });
        pendingCyclePlan = cycle;
        const resolved = generateMazeForDifficulty({
          scale: legacyTuning.board.scale,
          seed: cycleSeed,
          size: cycle.size,
          presentationPreset: cycle.presentationPreset,
          checkPointModifier: legacyTuning.board.checkPointModifier,
          shortcutCountModifier: legacyTuning.board.shortcutCountModifier.menu
        }, cycle.difficulty);

        if (!deterministicCapture) {
          demoSeed += legacyTuning.demo.behavior.regenerateSeedStep;
          demoCycle += 1;
        }

        return resolved.episode;
      }, resolvePatternEngineMode(variant));
      patternFrame = patternEngine.next(0);
      recoveryEpisode = patternFrame.episode;
      let demoCyclePlan = pendingCyclePlan ?? resolveMenuDemoCycle(patternFrame.episode.seed, 0, {
        difficulty: launchConfig.difficulty,
        size: launchConfig.size,
        mood: moodOverride
      });
      pendingCyclePlan = undefined;
      let sceneHidden = typeof document !== 'undefined' && document.hidden;
      const createEpisodePresentationShell = (episode: MazeEpisode): EpisodePresentationShell => {
        const layout = createBoardLayout(this, episode, {
          boardScale: sceneLayout.boardScale
            + (resolveBoardScaleFromCamScale(legacyTuning.camera.camScaleDefault) - legacyTuning.camera.normalizedBaseline),
          topReserve: sceneLayout.topReserve,
          sidePadding: sceneLayout.sidePadding,
          bottomPadding: sceneLayout.bottomPadding
        });
        const boardCenterX = layout.boardX + (layout.boardWidth / 2);
        const boardCenterY = layout.boardY + (layout.boardHeight / 2);
        const boardRenderer = new BoardRenderer(this, episode, layout);
        boardRenderer.drawBoardChrome();

        const boardAura = this.add.ellipse(
          boardCenterX,
          boardCenterY,
          Math.max(24, layout.boardWidth * 1.14),
          Math.max(24, layout.boardHeight * 1.08),
          palette.background.nebulaCore,
          0.1
        ).setOrigin(0.5).setDepth(-2.5).setBlendMode(Phaser.BlendModes.SCREEN);
        const boardHalo = this.add.ellipse(
          boardCenterX,
          boardCenterY,
          Math.max(20, layout.boardWidth * 1.05),
          Math.max(20, layout.boardHeight * 1.03),
          palette.board.topHighlight,
          0.032
        ).setOrigin(0.5).setDepth(6).setBlendMode(Phaser.BlendModes.SCREEN);
        const boardShade = this.add.rectangle(
          boardCenterX,
          boardCenterY,
          Math.max(16, layout.boardWidth),
          Math.max(16, layout.boardHeight),
          palette.board.topHighlight,
          0.02
        ).setOrigin(0.5).setDepth(7).setBlendMode(Phaser.BlendModes.SCREEN);
        const boardVeil = this.add.rectangle(
          boardCenterX,
          boardCenterY,
          Math.max(16, layout.boardWidth),
          Math.max(16, layout.boardHeight),
          palette.background.deepSpace,
          0
        ).setOrigin(0.5).setDepth(7.2);
        const blueprintAccent = this.add.graphics().setDepth(7.1).setBlendMode(Phaser.BlendModes.SCREEN);
        runOptional('blueprint accent setup', () => {
          drawBlueprintAccent(blueprintAccent, layout);
        });

        return {
          layout,
          boardCenterX,
          boardCenterY,
          boardRenderer,
          demoStatusHud: createDemoStatusHud(this, layout, { reducedMotion, chrome, profile: deploymentProfileId }),
          boardAura,
          boardHalo,
          boardShade,
          boardVeil,
          blueprintAccent
        };
      };
      episodePresentationShell = createEpisodePresentationShell(patternFrame.episode);
      const layout = episodePresentationShell.layout;

      if (titleVisible) {
        const titlePlateMaxWidth = Math.max(96, width - Math.max(24, sceneLayout.sidePadding * 4));
        const titlePlateWidth = Phaser.Math.Clamp(
          Math.round(
            layout.boardSize
              * (sceneLayout.isNarrow ? 0.48 : legacyTuning.menu.title.plateWidthRatio)
              * variantProfile.titleScale
              * chromeProfile.titleScale
              * deploymentProfile.titlePlateWidthScale
          ),
          Math.min(variantProfile.titleAnchor === 'left' ? 200 : 216, titlePlateMaxWidth),
          Math.max(Math.min(sceneLayout.isPortrait ? 356 : 404, titlePlateMaxWidth), 96)
        );
        const titlePlateHeight = Phaser.Math.Clamp(
          Math.round(
            layout.boardSize
              * legacyTuning.menu.title.plateHeightRatio
              * Phaser.Math.Linear(0.86, 1, variantProfile.titleScale * Math.max(0.72, chromeProfile.titleScale))
              * deploymentProfile.titlePlateHeightScale
          ),
          sceneLayout.isTiny ? 28 : 38,
          legacyTuning.menu.title.plateHeightMaxPx
        );
        const titleY = Math.max(
          titlePlateHeight / 2 + 10,
          layout.boardY
            - Math.round(titlePlateHeight * variantProfile.titleYOffsetRatio)
            - (sceneLayout.isPortrait ? 2 : 0)
            - deploymentProfile.titleYOffsetBias
        );
        const titleX = variantProfile.titleAnchor === 'left'
          ? layout.boardX + Math.round(titlePlateWidth * 0.54)
          : width / 2;
        const titleContainer = this.add.container(titleX, titleY).setDepth(9);
        const titleAlpha = variantProfile.titleAlpha * chromeProfile.titleAlpha * deploymentProfile.titleAlphaScale;
        const signatureAlpha = variantProfile.signatureAlpha * chromeProfile.signatureAlpha * deploymentProfile.signatureAlphaScale;
        const passiveAlpha = variantProfile.passiveAlpha * chromeProfile.passiveAlpha * deploymentProfile.passiveAlphaScale;
        const plateAlpha = variantProfile.plateAlpha * chromeProfile.plateAlpha * deploymentProfile.plateAlphaScale;
        const panelAlpha = variantProfile.panelAlpha * chromeProfile.panelAlpha * deploymentProfile.panelAlphaScale;
        titleContainer.add([
          this.add.rectangle(0, 6, titlePlateWidth + 8, titlePlateHeight + 10, palette.board.shadow, 0.26 * plateAlpha),
          this.add.rectangle(0, 0, titlePlateWidth, titlePlateHeight, palette.board.well, plateAlpha)
            .setStrokeStyle(1, palette.board.innerStroke, 0.18 * titleAlpha),
          this.add.rectangle(0, 0, titlePlateWidth - 14, titlePlateHeight - 12, palette.board.panel, panelAlpha)
            .setStrokeStyle(1, palette.board.topHighlight, 0.08 * titleAlpha),
          this.add.rectangle(0, -(titlePlateHeight / 2) + 7, titlePlateWidth - 18, 2, palette.board.topHighlight, 0.12 * titleAlpha)
        ]);
        const title = this.add.text(0, -7, legacyTuning.menu.title.text, {
          color: '#75f78f',
          fontFamily: 'monospace',
          fontSize: `${Phaser.Math.Clamp(Math.round(layout.boardSize * legacyTuning.menu.title.fontScaleToBoard * variantProfile.titleScale * chromeProfile.titleScale), 24, 84)}px`,
          fontStyle: chrome === 'minimal' ? 'normal' : 'bold'
        }).setOrigin(0.5).setLetterSpacing(sceneLayout.isNarrow ? variantProfile.titleLetterSpacingNarrow : variantProfile.titleLetterSpacingWide)
          .setAlpha(titleAlpha)
          .setStroke('#17381f', legacyTuning.menu.title.strokePx).setShadow(0, 0, '#2c9c48', legacyTuning.menu.title.shadowBlur - 4, true, true);
        const signature = this.add.text(
          0,
          Math.round(titlePlateHeight * 0.23 * deploymentProfile.titleLineSpacingScale),
          '\u00b0 by fawxzzy',
          {
          color: '#a5d7af',
          fontFamily: '"Courier New", monospace',
            fontSize: `${Math.round((sceneLayout.isTiny ? 8 : sceneLayout.isNarrow ? 9 : 10) * deploymentProfile.titleLineSpacingScale)}px`
          }
        ).setOrigin(0.5).setAlpha(signatureAlpha).setLetterSpacing(1);
        const supportSlot = this.add.container(0, Math.round(titlePlateHeight * 0.42 * deploymentProfile.titleLineSpacingScale));
        let installPromptPending = false;
        const renderSupportSlot = (state: InstallSurfaceState = getInstallSurfaceState()): void => {
          supportSlot.removeAll(true);

          if (state.mode === 'available') {
            const label = this.add.text(0, 0, installPromptPending ? 'Install Mazer...' : 'Install Mazer', {
              color: installPromptPending ? '#d7deef' : '#75f78f',
              fontFamily: '"Courier New", monospace',
              fontSize: `${Math.round((sceneLayout.isTiny ? 9 : sceneLayout.isNarrow ? 10 : 11) * deploymentProfile.titleLineSpacingScale)}px`,
              fontStyle: 'bold'
            }).setOrigin(0.5).setLetterSpacing(1);
            const buttonWidth = Phaser.Math.Clamp(
              Math.ceil(label.width + (sceneLayout.isNarrow ? 22 : 28)),
              138,
              Math.max(138, titlePlateWidth - 18)
            );
            const buttonHeight = sceneLayout.isTiny ? 20 : 22;
            const shadow = this.add.rectangle(0, 2, buttonWidth + 4, buttonHeight + 4, palette.board.shadow, 0.2);
            const button = this.add.rectangle(
              0,
              0,
              buttonWidth,
              buttonHeight,
              palette.board.panel,
              installPromptPending ? 0.3 : Math.min(0.86, panelAlpha + 0.16)
            ).setStrokeStyle(1, palette.board.topHighlight, installPromptPending ? 0.12 : 0.28);
            const highlightAlpha = Math.min(0.18, 0.08 + (titleAlpha * 0.12));
            const setButtonState = (hovered: boolean): void => {
              button.setFillStyle(
                palette.board.panel,
                installPromptPending
                  ? 0.3
                  : hovered
                    ? Math.min(0.94, panelAlpha + 0.26)
                    : Math.min(0.86, panelAlpha + 0.16)
              );
              button.setStrokeStyle(1, palette.board.topHighlight, hovered && !installPromptPending ? 0.36 : 0.28);
              label.setAlpha(hovered && !installPromptPending ? 1 : 0.96);
            };

            if (!installPromptPending) {
              button.setInteractive({ useHandCursor: true });
              button.on('pointerover', () => {
                setButtonState(true);
              });
              button.on('pointerout', () => {
                setButtonState(false);
              });
              button.on('pointerup', () => {
                if (installPromptPending) {
                  return;
                }

                installPromptPending = true;
                renderSupportSlot();
                void promptInstallSurface()
                  .catch((error) => {
                    console.error('MenuScene install prompt failed open.', error);
                  })
                  .finally(() => {
                    installPromptPending = false;
                    renderSupportSlot();
                  });
              });
            }

            setButtonState(false);
            supportSlot.add([
              shadow,
              button,
              this.add.rectangle(0, -(buttonHeight / 2) + 3, buttonWidth - 10, 2, palette.board.topHighlight, highlightAlpha),
              label
            ]);
            return;
          }

          const supportText = this.add.text(
            0,
            0,
            state.mode === 'manual' && state.instruction ? state.instruction : PASSIVE_TAGLINES[variant],
            {
              color: '#d7deef',
              fontFamily: '"Courier New", monospace',
              fontSize: `${Math.round((sceneLayout.isTiny ? 8 : sceneLayout.isNarrow ? 9 : 11) * deploymentProfile.titleLineSpacingScale)}px`,
              wordWrap: {
                width: Math.max(118, titlePlateWidth - 28),
                useAdvancedWrap: true
              }
            }
          ).setOrigin(0.5).setAlpha(state.mode === 'manual' ? Math.min(0.84, passiveAlpha + 0.16) : passiveAlpha)
            .setLetterSpacing(sceneLayout.isNarrow ? 1 : 2);
          supportSlot.add(supportText);
        };

        titleContainer.add([title, signature, supportSlot]);
        renderSupportSlot();
        removeInstallSurfaceListener = subscribeInstallSurface((state) => {
          try {
            renderSupportSlot(state);
          } catch (error) {
            console.error('MenuScene optional install surface skipped.', error);
          }
        });
        if (reducedMotion || chrome === 'minimal') {
          titleContainer.setAlpha(1).setScale(1);
        } else {
          titleContainer.setAlpha(0);
          titleContainer.y -= 12;
          titleContainer.setScale(0.985);
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
            this.titlePulseTween = this.tweens.add({
              targets: title,
              alpha: {
                from: Math.max(0.18, titleAlpha - 0.08),
                to: Math.min(0.92, titleAlpha + 0.06)
              },
              duration: legacyTuning.menu.title.pulseDurationMs,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut'
            });
            this.titleDriftTween = this.tweens.add({
              targets: titleContainer,
              x: titleX + variantProfile.titleDriftX,
              y: titleY + variantProfile.titleDriftY,
              duration: variantProfile.titleDriftMs,
              yoyo: true,
              repeat: -1,
              ease: 'Sine.easeInOut'
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
          shell.blueprintAccent.setPosition(shell.layout.boardX + offsetX, shell.layout.boardY + offsetY)
            .setAlpha(resolveBlueprintAccentAlpha(presentation));
        });
      };
      const applyEpisodePresentation = (): void => {
        if (!patternFrame) {
          return;
        }

        destroyEpisodePresentationShell();
        episodePresentationShell = createEpisodePresentationShell(patternFrame.episode);
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

        applyPresentationLayer(demoPresentation);

        shell.boardRenderer.drawStart(view.cue);
        shell.boardRenderer.drawGoal(view.cue);
        shell.boardRenderer.drawTrail(path, {
          cue: view.cue,
          limit: view.trailLimit,
          start: view.trailStart,
          emphasis: 'demo'
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
        if (!nextViewport.measured) {
          return;
        }

        resizeRestart?.remove(false);
        resizeRestart = this.time.delayedCall(80, () => {
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

  private drawStarfield(width: number, height: number): void {
    const safeWidth = sanitizePositive(width, DEFAULT_VIEWPORT_WIDTH);
    const safeHeight = sanitizePositive(height, DEFAULT_VIEWPORT_HEIGHT);
    const bg = this.add.graphics();
    bg.fillGradientStyle(
      palette.background.deepSpace,
      palette.background.deepSpace,
      palette.background.nebulaCore,
      palette.background.nebula,
      1
    );
    bg.fillRect(0, 0, safeWidth, safeHeight);

    const clouds = this.add.graphics();
    clouds.setBlendMode(Phaser.BlendModes.SCREEN);
    for (let i = 0; i < legacyTuning.menu.starfield.cloudCount; i += 1) {
      const x = Phaser.Math.Between(safeWidth * 0.12, safeWidth * 0.88);
      const y = Phaser.Math.Between(safeHeight * 0.16, safeHeight * 0.84);
      const radius = Phaser.Math.Between(legacyTuning.menu.starfield.cloudRadiusMin, legacyTuning.menu.starfield.cloudRadiusMax);
      clouds.fillStyle(
        palette.background.cloud,
        Phaser.Math.FloatBetween(legacyTuning.menu.starfield.cloudAlphaMin, legacyTuning.menu.starfield.cloudAlphaMax)
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
        palette.background.star,
        Phaser.Math.FloatBetween(
          legacyTuning.menu.starfield.starAlphaMin * 0.7,
          legacyTuning.menu.starfield.starAlphaMax * 0.52
        )
      );
      farStars.fillCircle(x, y, r);
    }

    const nearStars = this.add.graphics();
    for (let i = 0; i < Math.ceil(legacyTuning.menu.starfield.starCount * 0.42); i += 1) {
      const x = Phaser.Math.Between(0, safeWidth);
      const y = Phaser.Math.Between(0, safeHeight);
      const r = Phaser.Math.FloatBetween(legacyTuning.menu.starfield.starRadiusMin, legacyTuning.menu.starfield.starRadiusMax);
      nearStars.fillStyle(
        palette.background.star,
        Phaser.Math.FloatBetween(legacyTuning.menu.starfield.starAlphaMin, legacyTuning.menu.starfield.starAlphaMax)
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
    vignette.fillStyle(palette.background.vignette, legacyTuning.menu.starfield.vignetteAlpha);
    vignette.fillRect(0, 0, safeWidth, safeHeight * legacyTuning.menu.starfield.vignetteBandRatio);
    vignette.fillRect(0, safeHeight * (1 - legacyTuning.menu.starfield.vignetteBandRatio), safeWidth, safeHeight * legacyTuning.menu.starfield.vignetteBandRatio);
  }

  private renderRecoveryShell(width: number, height: number, episode?: MazeEpisode): void {
    const safeWidth = sanitizePositive(width, DEFAULT_VIEWPORT_WIDTH);
    const safeHeight = sanitizePositive(height, DEFAULT_VIEWPORT_HEIGHT);
    const layoutModel = resolveMenuPresentationModel(
      safeWidth,
      safeHeight,
      this.presentationVariant,
      'full',
      true,
      this.launchConfig.profile
    );

    this.drawStarfield(safeWidth, safeHeight);
    this.add.text(safeWidth / 2, Math.max(56, safeHeight * 0.18), legacyTuning.menu.title.text, {
      color: '#75f78f',
      fontFamily: 'monospace',
      fontSize: `${Math.max(32, Math.round(Math.min(safeWidth, safeHeight) * 0.08))}px`,
      fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(20);
    this.add.text(safeWidth / 2, Math.max(100, safeHeight * 0.26), '\u00b0 by fawxzzy', {
      color: '#a5d7af',
      fontFamily: '"Courier New", monospace',
      fontSize: '14px'
    }).setOrigin(0.5).setDepth(20);
    this.add.text(safeWidth / 2, Math.max(132, safeHeight * 0.32), 'recovery demo', {
      color: '#d7deef',
      fontFamily: '"Courier New", monospace',
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
      const recoveryBoard = new BoardRenderer(this, episode, layout);
      recoveryBoard.drawBoardChrome();
      recoveryBoard.drawBase({ solutionPathAlpha: 0.2 });
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
  deploymentProfileId?: PresentationDeploymentProfile
): SceneLayoutProfile {
  const safeVariant = sanitizePresentationVariant(variant);
  const safeChrome = CHROME_PROFILES[chrome] ? chrome : DEFAULT_PRESENTATION_CHROME;
  const chromeProfile = CHROME_PROFILES[safeChrome];
  const profile = VARIANT_PROFILES[safeVariant];
  const deploymentProfile = resolveDeploymentPresentationProfile(deploymentProfileId);
  const safeWidth = sanitizePositive(width, DEFAULT_VIEWPORT_WIDTH);
  const safeHeight = sanitizePositive(height, DEFAULT_VIEWPORT_HEIGHT);
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
  const topReserve = Math.max(
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
  );
  const bottomPadding = Math.max(
    6,
    profile.bottomPaddingPx
      + chromeProfile.bottomPaddingBias
      + deploymentProfile.bottomPaddingBias
      + (isPortrait ? 4 : 0)
      + (safeVariant === 'loading' ? 4 : 0)
      - (isTiny ? 12 : 0)
  );
  const sidePadding = Math.max(
    2,
    profile.sidePaddingPx
      + chromeProfile.sidePaddingBias
      + deploymentProfile.sidePaddingBias
      + (isPortrait ? 2 : 0)
      + (isNarrow ? -2 : 0)
      - (isTiny ? 4 : 0)
  );
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
  const variantProfile = VARIANT_PROFILES[safeVariant];
  const deploymentProfile = resolveDeploymentPresentationProfile(deploymentProfileId);
  const sequenceState = resolveMenuDemoSequence(episode, elapsedMs, config);
  const progress = ease(sequenceState.progress);
  const oscillationTimeMs = normalizeAnimationTime(elapsedMs);
  const wave = 0.5 + (Math.sin((oscillationTimeMs + (episode.seed * 17)) * 0.0022) * 0.5);
  const offsets = resolvePresentationOffsets(episode.seed, safeVariant);
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
  const boardAuraScaleDelta = (boardAuraScale - 1) * deploymentProfile.boardAuraMotionScale;
  const boardHaloScaleDelta = (boardHaloScale - 1) * deploymentProfile.boardHaloMotionScale;

  return {
    variant: safeVariant,
    mood: cycle.mood,
    sequence: sequenceState.sequence,
    phaseLabel: resolvePhaseLabel(sequenceState.sequence, episode.seed, cycle.mood, safeVariant),
    solutionPathAlpha: clamp(moodProfile.solutionPathAlpha * variantProfile.solutionPathScale, 0.14, 1),
    trailWindow: resolveDemoTrailWindow(episode, cycle.mood),
    ambientDriftPxX: offsets.driftX * moodProfile.ambientDriftPx * variantProfile.driftScale * deploymentProfile.driftScale || 0,
    ambientDriftPxY: offsets.driftY * moodProfile.ambientDriftPx * variantProfile.driftScale * deploymentProfile.driftScale || 0,
    ambientDriftMs: clamp(Math.round(moodProfile.ambientDriftMs * deploymentProfile.driftDurationScale), 1200, 12000),
    frameOffsetX: Math.round(offsets.frameOffsetX * deploymentProfile.offsetScale) || 0,
    frameOffsetY: Math.round(offsets.frameOffsetY * deploymentProfile.offsetScale) || 0,
    hudOffsetX: Math.round(offsets.hudOffsetX * deploymentProfile.offsetScale) || 0,
    hudOffsetY: Math.round(offsets.hudOffsetY * deploymentProfile.offsetScale) || 0,
    boardVeilAlpha: clamp(boardVeilAlpha + (variantProfile.boardVeilBias * deploymentProfile.boardVeilBiasScale), 0, 0.24),
    boardAuraAlpha: clamp(boardAuraAlpha + (variantProfile.boardAuraBias * deploymentProfile.boardAuraBiasScale), 0.06, 0.22),
    boardHaloAlpha: clamp(boardHaloAlpha + (variantProfile.boardHaloBias * deploymentProfile.boardHaloBiasScale), 0.018, 0.16),
    boardShadeAlpha: clamp(boardShadeAlpha + (variantProfile.boardShadeBias * deploymentProfile.boardShadeBiasScale), 0.012, 0.18),
    boardAuraScale: clamp(1 + boardAuraScaleDelta + (wave * variantProfile.boardAuraBias * 0.1 * deploymentProfile.boardAuraBiasScale), 1, 1.05),
    boardHaloScale: clamp(1 + boardHaloScaleDelta + (wave * variantProfile.boardHaloBias * 0.1 * deploymentProfile.boardHaloBiasScale), 1, 1.03),
    actorPulseBoost: clamp(moodProfile.actorPulseBoost + variantProfile.actorPulseBias, 0, 0.12),
    metadataAlpha: clamp(metadataAlpha * deploymentProfile.metadataAlphaScale, 0.18, 0.82),
    flashAlpha: clamp(flashAlpha * variantProfile.flashAlphaScale * deploymentProfile.flashAlphaScale, 0, 0.84)
  };
};

export const resolveMenuDemoCycle = (seed: number, cycle: number, overrides: MenuDemoCycleOverrides = {}): MenuDemoCycle => {
  const mood = overrides.mood ?? resolveCuratedMood(seed, cycle);
  const presetCycle = overrides.mood || overrides.size || overrides.difficulty ? 0 : cycle;
  return {
    difficulty: overrides.difficulty ?? pickCuratedCycleValue(ROTATING_DIFFICULTIES, seed ^ 0x517cc1b7, cycle + 1, 0x517cc1b7),
    size: overrides.size ?? pickCuratedCycleValue(ROTATING_SIZES, seed, cycle, 0x2d2816fe),
    mood,
    presentationPreset: resolveMenuDemoPreset(seed, presetCycle, mood),
    pacing: DEMO_PACING_PROFILES[mix(seed, cycle, 0x6d2b79f5) % DEMO_PACING_PROFILES.length]
  };
};

export const resolveMenuDemoPreset = (
  seed: number,
  cycle: number,
  mood: DemoMood
): MazePresentationPreset => {
  const mixed = mix(seed, cycle, 0x31b7c3d1 ^ mood.charCodeAt(0));
  switch (mood) {
    case 'scan':
      return (mixed & 1) === 0 ? 'framed' : 'braided';
    case 'blueprint':
      return mixed % 7 === 0 ? 'blueprint-rare' : 'framed';
    case 'solve':
    default:
      return mixed % 5 === 0 ? 'braided' : 'classic';
  }
};

const resolveCuratedMood = (seed: number, cycle: number): DemoMood => {
  const block = Math.floor(cycle / CURATED_MOOD_PATTERNS[0].length);
  const slot = cycle % CURATED_MOOD_PATTERNS[0].length;
  const pattern = CURATED_MOOD_PATTERNS[mix(seed, block, 0x7f4a7c15) % CURATED_MOOD_PATTERNS.length];
  return pattern[slot];
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

const resolveBlueprintAccentAlpha = (presentation: MenuDemoPresentation): number => {
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
  return clamp(variantBase * sequenceScale, 0, 0.42);
};

const drawBlueprintAccent = (graphics: Phaser.GameObjects.Graphics, layout: ReturnType<typeof createBoardLayout>): void => {
  const safeTileSize = Math.max(2, Math.round(layout.tileSize));
  const width = Math.max(16, Math.round(layout.boardWidth));
  const height = Math.max(16, Math.round(layout.boardHeight));
  const step = Math.max(safeTileSize * 4, Math.round(Math.min(width, height) * 0.18));
  const inset = Math.max(2, Math.round(safeTileSize * 0.45));

  graphics.clear();
  graphics.lineStyle(1, palette.board.topHighlight, 0.12);
  for (let x = step; x < width; x += step) {
    graphics.lineBetween(x + 0.5, inset, x + 0.5, height - inset);
  }
  for (let y = step; y < height; y += step) {
    graphics.lineBetween(inset, y + 0.5, width - inset, y + 0.5);
  }
  graphics.lineStyle(1, palette.board.innerStroke, 0.22);
  graphics.strokeRect(inset + 0.5, inset + 0.5, width - (inset * 2) - 1, height - (inset * 2) - 1);
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
