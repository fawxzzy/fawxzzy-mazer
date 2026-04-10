import Phaser from 'phaser';
import type { AmbientPresentationVariant } from '../boot/presentation';
import { DEFAULT_PRESENTATION_VARIANT, resolvePatternEngineMode } from '../boot/presentation';
import { resolveDemoWalkerViewFrame, type DemoWalkerConfig, type DemoWalkerCue } from '../domain/ai';
import {
  disposeMazeEpisode,
  generateMazeForDifficulty,
  MAZE_SIZE_ORDER,
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

export interface MenuSceneInitData {
  presentation?: AmbientPresentationVariant;
}

export interface MenuDemoCycle {
  difficulty: MazeDifficulty;
  size: MazeSize;
  mood: DemoMood;
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

interface SceneLayoutProfile {
  isNarrow: boolean;
  isPortrait: boolean;
  isShort: boolean;
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
    trailWindowOffset: 8,
    trailWindowScale: 1,
    ambientDriftPx: 2.4,
    ambientDriftMs: 3400,
    actorPulseBoost: 0.02,
    metadataAlpha: 0.56,
    auraAlpha: 0.1,
    haloAlpha: 0.034,
    shadeAlpha: 0.028
  },
  scan: {
    solutionPathAlpha: 0.14,
    trailWindowOffset: -10,
    trailWindowScale: 0.42,
    ambientDriftPx: 3.1,
    ambientDriftMs: 3000,
    actorPulseBoost: 0.08,
    metadataAlpha: 0.48,
    auraAlpha: 0.12,
    haloAlpha: 0.04,
    shadeAlpha: 0.044
  },
  blueprint: {
    solutionPathAlpha: 0.46,
    trailWindowOffset: -4,
    trailWindowScale: 0.72,
    ambientDriftPx: 1.9,
    ambientDriftMs: 3800,
    actorPulseBoost: 0.03,
    metadataAlpha: 0.6,
    auraAlpha: 0.086,
    haloAlpha: 0.028,
    shadeAlpha: 0.02
  }
};

const VARIANT_PROFILES: Record<AmbientPresentationVariant, VariantProfile> = {
  title: {
    boardScaleWide: 0.985,
    boardScaleNarrow: 0.966,
    topReserveRatio: 0.102,
    topReserveMinPx: 88,
    bottomPaddingPx: 26,
    sidePaddingPx: 12,
    titleScale: 1,
    titleAlpha: legacyTuning.menu.title.alpha,
    signatureAlpha: 0.68,
    passiveAlpha: 0.48,
    plateAlpha: 0.15,
    panelAlpha: 0.22,
    titleYOffsetRatio: 0.16,
    titleAnchor: 'center',
    titleDriftX: 3,
    titleDriftY: 2,
    titleDriftMs: 3600,
    titleLetterSpacingWide: 4,
    titleLetterSpacingNarrow: 2,
    solutionPathScale: 1,
    metadataAlphaScale: 1,
    flashAlphaScale: 1,
    boardAuraBias: 0,
    boardHaloBias: 0,
    boardShadeBias: 0,
    boardVeilBias: 0,
    boardOffsetRangeX: 6,
    boardOffsetRangeY: 4,
    hudOffsetRangeX: 8,
    hudOffsetRangeY: 4,
    driftScale: 1,
    actorPulseBias: 0
  },
  ambient: {
    boardScaleWide: 0.992,
    boardScaleNarrow: 0.976,
    topReserveRatio: 0.086,
    topReserveMinPx: 72,
    bottomPaddingPx: 24,
    sidePaddingPx: 10,
    titleScale: 0.8,
    titleAlpha: 0.46,
    signatureAlpha: 0.5,
    passiveAlpha: 0.34,
    plateAlpha: 0.08,
    panelAlpha: 0.14,
    titleYOffsetRatio: 0.12,
    titleAnchor: 'center',
    titleDriftX: 4,
    titleDriftY: 1,
    titleDriftMs: 4200,
    titleLetterSpacingWide: 5,
    titleLetterSpacingNarrow: 3,
    solutionPathScale: 0.82,
    metadataAlphaScale: 0.72,
    flashAlphaScale: 0,
    boardAuraBias: 0.018,
    boardHaloBias: 0.01,
    boardShadeBias: -0.004,
    boardVeilBias: -0.008,
    boardOffsetRangeX: 10,
    boardOffsetRangeY: 6,
    hudOffsetRangeX: 12,
    hudOffsetRangeY: 6,
    driftScale: 1.15,
    actorPulseBias: 0.012
  },
  loading: {
    boardScaleWide: 0.988,
    boardScaleNarrow: 0.972,
    topReserveRatio: 0.092,
    topReserveMinPx: 76,
    bottomPaddingPx: 34,
    sidePaddingPx: 12,
    titleScale: 0.88,
    titleAlpha: 0.58,
    signatureAlpha: 0.54,
    passiveAlpha: 0.42,
    plateAlpha: 0.11,
    panelAlpha: 0.18,
    titleYOffsetRatio: 0.13,
    titleAnchor: 'left',
    titleDriftX: 2,
    titleDriftY: 2,
    titleDriftMs: 3000,
    titleLetterSpacingWide: 3,
    titleLetterSpacingNarrow: 2,
    solutionPathScale: 0.9,
    metadataAlphaScale: 1.08,
    flashAlphaScale: 1.12,
    boardAuraBias: 0.028,
    boardHaloBias: 0.014,
    boardShadeBias: 0.01,
    boardVeilBias: 0.012,
    boardOffsetRangeX: 8,
    boardOffsetRangeY: 5,
    hudOffsetRangeX: 10,
    hudOffsetRangeY: 4,
    driftScale: 0.9,
    actorPulseBias: 0.016
  }
};

export class MenuScene extends Phaser.Scene {
  private titlePulseTween?: Phaser.Tweens.Tween;
  private titleDriftTween?: Phaser.Tweens.Tween;
  private starDriftTween?: Phaser.Tweens.Tween;
  private presentationVariant: AmbientPresentationVariant = DEFAULT_PRESENTATION_VARIANT;

  public constructor() {
    super('MenuScene');
  }

  public init(data: MenuSceneInitData = {}): void {
    this.presentationVariant = data.presentation ?? DEFAULT_PRESENTATION_VARIANT;
  }

  public create(): void {
    const { width, height } = this.scale;
    const reducedMotion = prefersReducedMotion();
    const variantProfile = VARIANT_PROFILES[this.presentationVariant];
    const sceneLayout = resolveSceneLayoutProfile(width, height, this.presentationVariant);
    this.cameras.main.fadeIn(reducedMotion ? 0 : this.presentationVariant === 'loading' ? 220 : 280, 0, 0, 0);
    this.drawStarfield(width, height);

    let demoSeed = legacyTuning.demo.seed;
    let demoCycle = 0;
    let pendingCyclePlan: MenuDemoCycle | undefined;
    const patternEngine = new PatternEngine(() => {
      const cycle = resolveMenuDemoCycle(demoSeed, demoCycle);
      pendingCyclePlan = cycle;
      const resolved = generateMazeForDifficulty({
        scale: legacyTuning.board.scale,
        seed: demoSeed,
        size: cycle.size,
        checkPointModifier: legacyTuning.board.checkPointModifier,
        shortcutCountModifier: legacyTuning.board.shortcutCountModifier.menu
      }, cycle.difficulty);
      demoSeed += legacyTuning.demo.behavior.regenerateSeedStep;
      demoCycle += 1;
      return resolved.episode;
    }, resolvePatternEngineMode(this.presentationVariant));
    let patternFrame = patternEngine.next(0);
    let demoCyclePlan = pendingCyclePlan ?? resolveMenuDemoCycle(patternFrame.episode.seed, 0);
    let sceneHidden = typeof document !== 'undefined' && document.hidden;

    const layout = createBoardLayout(this, patternFrame.episode, {
      boardScale: sceneLayout.boardScale
        + (resolveBoardScaleFromCamScale(legacyTuning.camera.camScaleDefault) - legacyTuning.camera.normalizedBaseline),
      topReserve: sceneLayout.topReserve,
      sidePadding: sceneLayout.sidePadding,
      bottomPadding: sceneLayout.bottomPadding
    });
    const boardCenterX = layout.boardX + (layout.boardWidth / 2);
    const boardCenterY = layout.boardY + (layout.boardHeight / 2);
    const boardRenderer = new BoardRenderer(this, patternFrame.episode, layout);
    boardRenderer.drawBoardChrome();

    const boardAura = this.add.ellipse(
      boardCenterX,
      boardCenterY,
      layout.boardWidth * 1.14,
      layout.boardHeight * 1.08,
      palette.background.nebulaCore,
      0.1
    ).setOrigin(0.5).setDepth(-2.5).setBlendMode(Phaser.BlendModes.SCREEN);
    const boardHalo = this.add.ellipse(
      boardCenterX,
      boardCenterY,
      layout.boardWidth * 1.05,
      layout.boardHeight * 1.03,
      palette.board.topHighlight,
      0.032
    ).setOrigin(0.5).setDepth(6).setBlendMode(Phaser.BlendModes.SCREEN);
    const boardShade = this.add.rectangle(
      boardCenterX,
      boardCenterY,
      layout.boardWidth,
      layout.boardHeight,
      palette.board.topHighlight,
      0.02
    ).setOrigin(0.5).setDepth(7).setBlendMode(Phaser.BlendModes.SCREEN);
    const boardVeil = this.add.rectangle(
      boardCenterX,
      boardCenterY,
      layout.boardWidth,
      layout.boardHeight,
      palette.background.deepSpace,
      0
    ).setOrigin(0.5).setDepth(7.2);

    const titlePlateWidth = Phaser.Math.Clamp(
      Math.round(layout.boardSize * (sceneLayout.isNarrow ? 0.48 : legacyTuning.menu.title.plateWidthRatio) * variantProfile.titleScale),
      variantProfile.titleAnchor === 'left' ? 200 : 216,
      sceneLayout.isPortrait ? 356 : 404
    );
    const titlePlateHeight = Phaser.Math.Clamp(
      Math.round(layout.boardSize * legacyTuning.menu.title.plateHeightRatio * Phaser.Math.Linear(0.86, 1, variantProfile.titleScale)),
      38,
      legacyTuning.menu.title.plateHeightMaxPx
    );
    const titleY = Math.max(
      titlePlateHeight / 2 + 10,
      layout.boardY - Math.round(titlePlateHeight * variantProfile.titleYOffsetRatio) - (sceneLayout.isPortrait ? 2 : 0)
    );
    const titleX = variantProfile.titleAnchor === 'left'
      ? layout.boardX + Math.round(titlePlateWidth * 0.54)
      : width / 2;
    const titleContainer = this.add.container(titleX, titleY).setDepth(9);
    titleContainer.add([
      this.add.rectangle(0, 6, titlePlateWidth + 8, titlePlateHeight + 10, palette.board.shadow, 0.26 * variantProfile.plateAlpha),
      this.add.rectangle(0, 0, titlePlateWidth, titlePlateHeight, palette.board.well, variantProfile.plateAlpha)
        .setStrokeStyle(1, palette.board.innerStroke, 0.18 * variantProfile.titleAlpha),
      this.add.rectangle(0, 0, titlePlateWidth - 14, titlePlateHeight - 12, palette.board.panel, variantProfile.panelAlpha)
        .setStrokeStyle(1, palette.board.topHighlight, 0.08 * variantProfile.titleAlpha),
      this.add.rectangle(0, -(titlePlateHeight / 2) + 7, titlePlateWidth - 18, 2, palette.board.topHighlight, 0.12 * variantProfile.titleAlpha)
    ]);
    const title = this.add.text(0, -7, legacyTuning.menu.title.text, {
      color: '#75f78f',
      fontFamily: 'monospace',
      fontSize: `${Phaser.Math.Clamp(Math.round(layout.boardSize * legacyTuning.menu.title.fontScaleToBoard * variantProfile.titleScale), 28, 84)}px`,
      fontStyle: 'bold'
    }).setOrigin(0.5).setLetterSpacing(sceneLayout.isNarrow ? variantProfile.titleLetterSpacingNarrow : variantProfile.titleLetterSpacingWide).setAlpha(variantProfile.titleAlpha)
      .setStroke('#17381f', legacyTuning.menu.title.strokePx).setShadow(0, 0, '#2c9c48', legacyTuning.menu.title.shadowBlur - 4, true, true);
    const signature = this.add.text(0, Math.round(titlePlateHeight * 0.23), '\u00b0 by fawxzzy', {
      color: '#a5d7af',
      fontFamily: '"Courier New", monospace',
      fontSize: `${sceneLayout.isNarrow ? 9 : 10}px`
    }).setOrigin(0.5).setAlpha(variantProfile.signatureAlpha).setLetterSpacing(1);
    const passiveTag = this.add.text(0, Math.round(titlePlateHeight * 0.42), PASSIVE_TAGLINES[this.presentationVariant], {
      color: '#d7deef',
      fontFamily: '"Courier New", monospace',
      fontSize: `${sceneLayout.isNarrow ? 10 : 11}px`
    }).setOrigin(0.5).setAlpha(variantProfile.passiveAlpha).setLetterSpacing(sceneLayout.isNarrow ? 1 : 2);
    titleContainer.add([title, signature, passiveTag]);
    if (reducedMotion) {
      titleContainer.setAlpha(1).setScale(1);
    } else {
      titleContainer.setAlpha(0);
      titleContainer.y -= 12;
      titleContainer.setScale(0.985);
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
          from: Math.max(0.28, variantProfile.titleAlpha - 0.08),
          to: Math.min(0.92, variantProfile.titleAlpha + 0.06)
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
    }

    const demoStatusHud = createDemoStatusHud(this, layout, { reducedMotion });

    let lastCue: DemoWalkerCue = 'spawn';
    let demoConfig = resolveDemoConfig(patternFrame.episode, demoCyclePlan);
    let demoPresentation = resolveMenuDemoPresentation(
      patternFrame.episode,
      demoCyclePlan,
      0,
      demoConfig,
      this.presentationVariant
    );
    const applyPresentationOffsets = (presentation: MenuDemoPresentation): void => {
      boardRenderer.setPresentationOffset(presentation.frameOffsetX, presentation.frameOffsetY);
      boardAura.setPosition(boardCenterX + presentation.frameOffsetX, boardCenterY + presentation.frameOffsetY);
      boardHalo.setPosition(boardCenterX + presentation.frameOffsetX, boardCenterY + presentation.frameOffsetY);
      boardShade.setPosition(boardCenterX + presentation.frameOffsetX, boardCenterY + presentation.frameOffsetY);
      boardVeil.setPosition(boardCenterX + presentation.frameOffsetX, boardCenterY + presentation.frameOffsetY);
    };
    const applyEpisodePresentation = (): void => {
      demoConfig = resolveDemoConfig(patternFrame.episode, demoCyclePlan);
      demoPresentation = resolveMenuDemoPresentation(
        patternFrame.episode,
        demoCyclePlan,
        0,
        demoConfig,
        this.presentationVariant
      );
      boardRenderer.setEpisode(patternFrame.episode);
      applyPresentationOffsets(demoPresentation);
      boardRenderer.drawBase({ solutionPathAlpha: demoPresentation.solutionPathAlpha });
      boardRenderer.drawStart('spawn');
      boardRenderer.drawGoal();
      if (!reducedMotion) {
        boardRenderer.startAmbientMotion(
          demoPresentation.ambientDriftPxX,
          demoPresentation.ambientDriftPxY,
          demoPresentation.ambientDriftMs
        );
      }
    };
    applyEpisodePresentation();

    const accentCueBeat = (cue: DemoWalkerCue): void => {
      if (reducedMotion) {
        return;
      }

      const pulseBoard = (shadeFrom: number, haloFrom: number, auraFrom: number, duration: number, scaleFrom = 1.015): void => {
        this.tweens.add({ targets: boardShade, alpha: { from: shadeFrom, to: boardShade.alpha }, duration, ease: 'Quad.easeOut' });
        this.tweens.add({
          targets: boardHalo,
          alpha: { from: haloFrom, to: boardHalo.alpha },
          scaleX: { from: scaleFrom, to: boardHalo.scaleX },
          scaleY: { from: scaleFrom, to: boardHalo.scaleY },
          duration,
          ease: 'Quad.easeOut'
        });
        this.tweens.add({
          targets: boardAura,
          alpha: { from: auraFrom, to: boardAura.alpha },
          scaleX: { from: scaleFrom + 0.01, to: boardAura.scaleX },
          scaleY: { from: scaleFrom + 0.01, to: boardAura.scaleY },
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
      demoPresentation = resolveMenuDemoPresentation(
        patternFrame.episode,
        demoCyclePlan,
        patternFrame.t * 1000,
        demoConfig,
        this.presentationVariant
      );
      const view = resolveDemoWalkerViewFrame(
        patternFrame.episode,
        patternFrame.t * 1000,
        demoConfig,
        demoPresentation.trailWindow
      );
      const path = patternFrame.episode.raster.pathIndices;

      applyPresentationOffsets(demoPresentation);
      boardAura.setAlpha(demoPresentation.boardAuraAlpha).setScale(demoPresentation.boardAuraScale);
      boardHalo.setAlpha(demoPresentation.boardHaloAlpha).setScale(demoPresentation.boardHaloScale);
      boardShade.setAlpha(demoPresentation.boardShadeAlpha);
      boardVeil.setAlpha(demoPresentation.boardVeilAlpha);

      boardRenderer.drawStart(view.cue);
      boardRenderer.drawGoal(view.cue);
      boardRenderer.drawTrail(path, {
        cue: view.cue,
        limit: view.trailLimit,
        start: view.trailStart,
        emphasis: 'demo'
      });

      if (view.currentIndex === view.nextIndex || view.progress <= 0) {
        boardRenderer.drawActor(view.currentIndex, view.direction, view.cue, demoPresentation.actorPulseBoost);
      } else {
        boardRenderer.drawActorMotion(
          view.currentIndex,
          view.nextIndex,
          view.progress,
          view.direction,
          view.cue,
          demoPresentation.actorPulseBoost
        );
      }

      demoStatusHud.setState(
        patternFrame.episode,
        demoPresentation.mood,
        demoPresentation.sequence,
        demoPresentation.variant,
        demoPresentation.metadataAlpha,
        demoPresentation.flashAlpha,
        demoPresentation.phaseLabel,
        demoPresentation.hudOffsetX,
        demoPresentation.hudOffsetY
      );
      if (view.cue !== lastCue) {
        accentCueBeat(view.cue);
        lastCue = view.cue;
      }
    };
    const applyPatternFrame = (nextFrame: PatternFrame): void => {
      const previousEpisode = patternFrame.episode;
      patternFrame = nextFrame;
      demoCyclePlan = pendingCyclePlan ?? demoCyclePlan;
      applyEpisodePresentation();
      renderDemo();
      disposeMazeEpisode(previousEpisode);
    };
    const handleVisibilityChange = (): void => {
      if (typeof document === 'undefined') {
        return;
      }

      if (document.hidden) {
        sceneHidden = true;
        patternEngine.suspend();
        return;
      }

      if (!sceneHidden) {
        return;
      }

      sceneHidden = false;
      patternEngine.resumeFresh();
      applyPatternFrame(patternEngine.next(0));
    };

    let resizeRestart: Phaser.Time.TimerEvent | undefined;
    const handleResize = (): void => {
      resizeRestart?.remove(false);
      resizeRestart = this.time.delayedCall(80, () => {
        this.scene.restart({ presentation: this.presentationVariant });
      });
    };

    renderDemo();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
    this.scale.on(Phaser.Scale.Events.RESIZE, handleResize);
    const updateDemo = (_time: number, delta: number): void => {
      if (sceneHidden) {
        return;
      }

      const nextFrame = patternEngine.next(delta / 1000);
      if (nextFrame.episode !== patternFrame.episode) {
        applyPatternFrame(nextFrame);
        return;
      }

      patternFrame = nextFrame;
      renderDemo();
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, updateDemo);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      resizeRestart?.remove(false);
      this.titlePulseTween?.remove();
      this.titleDriftTween?.remove();
      this.starDriftTween?.remove();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      this.scale.off(Phaser.Scale.Events.RESIZE, handleResize);
      this.events.off(Phaser.Scenes.Events.UPDATE, updateDemo);
      demoStatusHud.destroy();
      patternEngine.destroy();
      boardRenderer.destroy();
      this.time.removeAllEvents();
      this.tweens.killAll();
      this.children.removeAll(true);
    });
  }

  private drawStarfield(width: number, height: number): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(
      palette.background.deepSpace,
      palette.background.deepSpace,
      palette.background.nebulaCore,
      palette.background.nebula,
      1
    );
    bg.fillRect(0, 0, width, height);

    const clouds = this.add.graphics();
    clouds.setBlendMode(Phaser.BlendModes.SCREEN);
    for (let i = 0; i < legacyTuning.menu.starfield.cloudCount; i += 1) {
      const x = Phaser.Math.Between(width * 0.12, width * 0.88);
      const y = Phaser.Math.Between(height * 0.16, height * 0.84);
      const radius = Phaser.Math.Between(legacyTuning.menu.starfield.cloudRadiusMin, legacyTuning.menu.starfield.cloudRadiusMax);
      clouds.fillStyle(
        palette.background.cloud,
        Phaser.Math.FloatBetween(legacyTuning.menu.starfield.cloudAlphaMin, legacyTuning.menu.starfield.cloudAlphaMax)
      );
      clouds.fillCircle(x, y, radius);
    }

    const farStars = this.add.graphics();
    for (let i = 0; i < Math.floor(legacyTuning.menu.starfield.starCount * 0.58); i += 1) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(0, height);
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
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(0, height);
      const r = Phaser.Math.FloatBetween(legacyTuning.menu.starfield.starRadiusMin, legacyTuning.menu.starfield.starRadiusMax);
      nearStars.fillStyle(
        palette.background.star,
        Phaser.Math.FloatBetween(legacyTuning.menu.starfield.starAlphaMin, legacyTuning.menu.starfield.starAlphaMax)
      );
      nearStars.fillCircle(x, y, r);
    }

    this.starDriftTween = this.tweens.add({
      targets: nearStars,
      y: legacyTuning.menu.starfield.starsDriftRangePx,
      duration: legacyTuning.menu.starfield.starsDriftDurationMs,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    const vignette = this.add.graphics();
    vignette.fillStyle(palette.background.vignette, legacyTuning.menu.starfield.vignetteAlpha);
    vignette.fillRect(0, 0, width, height * legacyTuning.menu.starfield.vignetteBandRatio);
    vignette.fillRect(0, height * (1 - legacyTuning.menu.starfield.vignetteBandRatio), width, height * legacyTuning.menu.starfield.vignetteBandRatio);
  }
}

const resolveSceneLayoutProfile = (
  width: number,
  height: number,
  variant: AmbientPresentationVariant
): SceneLayoutProfile => {
  const profile = VARIANT_PROFILES[variant];
  const isNarrow = width <= legacyTuning.menu.layout.narrowBreakpoint;
  const isPortrait = height > (width * 1.12);
  const isShort = height < 720;
  const boardScale = Phaser.Math.Clamp(
    (isNarrow ? profile.boardScaleNarrow : profile.boardScaleWide)
      + (isPortrait ? 0.008 : 0)
      - (isShort ? 0.012 : 0),
    0.92,
    0.996
  );

  return {
    isNarrow,
    isPortrait,
    isShort,
    boardScale,
    topReserve: Math.max(
      profile.topReserveMinPx + (isPortrait ? 12 : 0) - (variant === 'ambient' ? 6 : 0),
      Math.round(height * (profile.topReserveRatio + (isPortrait ? 0.024 : 0) - (isShort ? 0.016 : 0)))
    ),
    bottomPadding: profile.bottomPaddingPx + (isPortrait ? 4 : 0) + (variant === 'loading' ? 4 : 0),
    sidePadding: profile.sidePaddingPx + (isPortrait ? 2 : 0) + (isNarrow ? -2 : 0)
  };
};

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
  return Math.max(
    4,
    Math.round((difficultyBase + sizeOffset + moodProfile.trailWindowOffset) * moodProfile.trailWindowScale)
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
  variant: AmbientPresentationVariant = DEFAULT_PRESENTATION_VARIANT
): MenuDemoPresentation => {
  const moodProfile = DEMO_MOOD_PROFILES[cycle.mood];
  const variantProfile = VARIANT_PROFILES[variant];
  const sequenceState = resolveMenuDemoSequence(episode, elapsedMs, config);
  const progress = ease(sequenceState.progress);
  const wave = 0.5 + (Math.sin((elapsedMs + (episode.seed * 17)) * 0.0022) * 0.5);
  const offsets = resolvePresentationOffsets(episode.seed, variant);
  let boardVeilAlpha = 0.03;
  let boardAuraAlpha = moodProfile.auraAlpha;
  let boardHaloAlpha = moodProfile.haloAlpha;
  let boardShadeAlpha = moodProfile.shadeAlpha;
  let boardAuraScale = 1;
  let boardHaloScale = 1;
  let metadataAlpha = moodProfile.metadataAlpha * variantProfile.metadataAlphaScale;
  let flashAlpha = variant === 'loading' ? 0.24 : 0;

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
      flashAlpha = variant === 'loading' ? lerp(0.22, 0.12, progress) : 0;
      break;
  }

  return {
    variant,
    mood: cycle.mood,
    sequence: sequenceState.sequence,
    phaseLabel: resolvePhaseLabel(sequenceState.sequence, episode.seed, cycle.mood, variant),
    solutionPathAlpha: clamp(moodProfile.solutionPathAlpha * variantProfile.solutionPathScale, 0.14, 1),
    trailWindow: resolveDemoTrailWindow(episode, cycle.mood),
    ambientDriftPxX: offsets.driftX * moodProfile.ambientDriftPx * variantProfile.driftScale,
    ambientDriftPxY: offsets.driftY * moodProfile.ambientDriftPx * variantProfile.driftScale,
    ambientDriftMs: moodProfile.ambientDriftMs,
    frameOffsetX: offsets.frameOffsetX,
    frameOffsetY: offsets.frameOffsetY,
    hudOffsetX: offsets.hudOffsetX,
    hudOffsetY: offsets.hudOffsetY,
    boardVeilAlpha: clamp(boardVeilAlpha + variantProfile.boardVeilBias, 0, 0.24),
    boardAuraAlpha: clamp(boardAuraAlpha + variantProfile.boardAuraBias, 0.06, 0.22),
    boardHaloAlpha: clamp(boardHaloAlpha + variantProfile.boardHaloBias, 0.018, 0.16),
    boardShadeAlpha: clamp(boardShadeAlpha + variantProfile.boardShadeBias, 0.012, 0.18),
    boardAuraScale: clamp(boardAuraScale + (wave * variantProfile.boardAuraBias * 0.1), 1, 1.05),
    boardHaloScale: clamp(boardHaloScale + (wave * variantProfile.boardHaloBias * 0.1), 1, 1.03),
    actorPulseBoost: moodProfile.actorPulseBoost + variantProfile.actorPulseBias,
    metadataAlpha: clamp(metadataAlpha, 0.18, 0.82),
    flashAlpha: clamp(flashAlpha * variantProfile.flashAlphaScale, 0, 0.84)
  };
};

export const resolveMenuDemoCycle = (seed: number, cycle: number): MenuDemoCycle => {
  const mood = resolveCuratedMood(seed, cycle);
  return {
    difficulty: pickCuratedCycleValue(ROTATING_DIFFICULTIES, seed ^ 0x517cc1b7, cycle + 1, 0x517cc1b7),
    size: pickCuratedCycleValue(ROTATING_SIZES, seed, cycle, 0x2d2816fe),
    mood,
    pacing: DEMO_PACING_PROFILES[mix(seed, cycle, 0x6d2b79f5) % DEMO_PACING_PROFILES.length]
  };
};

const resolveCuratedMood = (seed: number, cycle: number): DemoMood => {
  const block = Math.floor(cycle / 6);
  const slot = cycle % 6;
  const blueprintSlot = 1 + (mix(seed, block, 0x7f4a7c15) % 4);

  if (slot === blueprintSlot) {
    return 'blueprint';
  }

  const alternatingSlot = slot > blueprintSlot ? slot - 1 : slot;
  return ((alternatingSlot + (mix(seed, block, 0x1c69b3f1) & 1)) & 1) === 0 ? 'solve' : 'scan';
};

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
  const profile = VARIANT_PROFILES[variant];
  const mixed = mix(seed, 0, variant.charCodeAt(0));
  const alt = mix(seed ^ 0x9e3779b9, 1, variant.charCodeAt(variant.length - 1));

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
  if (variant !== 'loading') {
    return PASSIVE_TAGLINES[variant];
  }

  const labels = LOADING_PHASE_LABELS[sequence];
  return labels[mix(seed, mood.charCodeAt(0), sequence.charCodeAt(0)) % labels.length];
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

const prefersReducedMotion = (): boolean => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);
