import Phaser from 'phaser';
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

const PASSIVE_TAGLINE = 'pattern engine';
const ROTATING_DIFFICULTIES: readonly MazeDifficulty[] = ['chill', 'standard', 'spicy', 'brutal'];
const ROTATING_SIZES: readonly MazeSize[] = MAZE_SIZE_ORDER;
const ROTATING_MOODS: readonly DemoMood[] = ['solve', 'scan', 'blueprint'];

export type DemoMood = 'solve' | 'scan' | 'blueprint';
export type MenuDemoSequence = 'intro' | 'reveal' | 'arrival' | 'fade';

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
  mood: DemoMood;
  sequence: MenuDemoSequence;
  solutionPathAlpha: number;
  trailWindow: number;
  ambientDriftPx: number;
  ambientDriftMs: number;
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

export class MenuScene extends Phaser.Scene {
  private titlePulseTween?: Phaser.Tweens.Tween;
  private titleDriftTween?: Phaser.Tweens.Tween;
  private starDriftTween?: Phaser.Tweens.Tween;

  public constructor() {
    super('MenuScene');
  }

  public create(): void {
    const { width, height } = this.scale;
    const isNarrow = width <= legacyTuning.menu.layout.narrowBreakpoint;
    const reducedMotion = prefersReducedMotion();
    this.cameras.main.fadeIn(reducedMotion ? 0 : 280, 0, 0, 0);
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
    }, 'demo');
    let patternFrame = patternEngine.next(0);
    let demoCyclePlan = pendingCyclePlan ?? resolveMenuDemoCycle(patternFrame.episode.seed, 0);
    let sceneHidden = typeof document !== 'undefined' && document.hidden;

    const layout = createBoardLayout(this, patternFrame.episode, {
      boardScale: (isNarrow ? legacyTuning.menu.layout.boardScaleNarrow : legacyTuning.menu.layout.boardScaleWide)
        + (resolveBoardScaleFromCamScale(legacyTuning.camera.camScaleDefault) - legacyTuning.camera.normalizedBaseline),
      topReserve: Math.max(legacyTuning.menu.layout.topReserveMinPx, Math.round(height * legacyTuning.menu.layout.topReserveRatio)),
      sidePadding: isNarrow ? legacyTuning.menu.layout.sidePaddingPx + 4 : legacyTuning.menu.layout.sidePaddingPx,
      bottomPadding: legacyTuning.menu.layout.bottomPaddingPx
    });
    const boardRenderer = new BoardRenderer(this, patternFrame.episode, layout);
    boardRenderer.drawBoardChrome();

    const boardAura = this.add.ellipse(
      layout.boardX + (layout.boardWidth / 2),
      layout.boardY + (layout.boardHeight / 2),
      layout.boardWidth * 1.14,
      layout.boardHeight * 1.08,
      palette.background.nebulaCore,
      0.1
    ).setOrigin(0.5).setDepth(-2.5).setBlendMode(Phaser.BlendModes.SCREEN);
    const boardHalo = this.add.ellipse(
      layout.boardX + (layout.boardWidth / 2),
      layout.boardY + (layout.boardHeight / 2),
      layout.boardWidth * 1.05,
      layout.boardHeight * 1.03,
      palette.board.topHighlight,
      0.032
    ).setOrigin(0.5).setDepth(6).setBlendMode(Phaser.BlendModes.SCREEN);
    const boardShade = this.add.rectangle(
      layout.boardX + (layout.boardWidth / 2),
      layout.boardY + (layout.boardHeight / 2),
      layout.boardWidth,
      layout.boardHeight,
      palette.board.topHighlight,
      0.02
    ).setOrigin(0.5).setDepth(7).setBlendMode(Phaser.BlendModes.SCREEN);
    const boardVeil = this.add.rectangle(
      layout.boardX + (layout.boardWidth / 2),
      layout.boardY + (layout.boardHeight / 2),
      layout.boardWidth,
      layout.boardHeight,
      palette.background.deepSpace,
      0
    ).setOrigin(0.5).setDepth(7.2);

    const titlePlateWidth = Phaser.Math.Clamp(
      Math.round(layout.boardSize * (isNarrow ? 0.5 : legacyTuning.menu.title.plateWidthRatio)),
      216,
      404
    );
    const titlePlateHeight = Phaser.Math.Clamp(
      Math.round(layout.boardSize * legacyTuning.menu.title.plateHeightRatio),
      legacyTuning.menu.title.plateHeightMinPx,
      legacyTuning.menu.title.plateHeightMaxPx
    );
    const titleY = Math.max(titlePlateHeight / 2 + 10, layout.boardY - Math.round(titlePlateHeight * (isNarrow ? 0.1 : 0.14)));
    const titleContainer = this.add.container(width / 2, titleY).setDepth(9);
    titleContainer.add([
      this.add.rectangle(0, 6, titlePlateWidth + 8, titlePlateHeight + 10, palette.board.shadow, 0.26),
      this.add.rectangle(0, 0, titlePlateWidth, titlePlateHeight, palette.board.well, 0.15)
        .setStrokeStyle(1, palette.board.innerStroke, 0.18),
      this.add.rectangle(0, 0, titlePlateWidth - 14, titlePlateHeight - 12, palette.board.panel, 0.22)
        .setStrokeStyle(1, palette.board.topHighlight, 0.08),
      this.add.rectangle(0, -(titlePlateHeight / 2) + 7, titlePlateWidth - 18, 2, palette.board.topHighlight, 0.12)
    ]);
    const title = this.add.text(0, -7, legacyTuning.menu.title.text, {
      color: '#75f78f',
      fontFamily: 'monospace',
      fontSize: `${Phaser.Math.Clamp(Math.round(layout.boardSize * legacyTuning.menu.title.fontScaleToBoard), 38, 84)}px`,
      fontStyle: 'bold'
    }).setOrigin(0.5).setLetterSpacing(isNarrow ? 2 : 4).setAlpha(legacyTuning.menu.title.alpha)
      .setStroke('#17381f', legacyTuning.menu.title.strokePx).setShadow(0, 0, '#2c9c48', legacyTuning.menu.title.shadowBlur - 4, true, true);
    const signature = this.add.text(0, Math.round(titlePlateHeight * 0.23), '\u00b0 by fawxzzy', {
      color: '#a5d7af',
      fontFamily: '"Courier New", monospace',
      fontSize: `${isNarrow ? 9 : 10}px`
    }).setOrigin(0.5).setAlpha(0.68).setLetterSpacing(1);
    const passiveTag = this.add.text(0, Math.round(titlePlateHeight * 0.42), PASSIVE_TAGLINE, {
      color: '#d7deef',
      fontFamily: '"Courier New", monospace',
      fontSize: `${isNarrow ? 10 : 11}px`
    }).setOrigin(0.5).setAlpha(0.48).setLetterSpacing(isNarrow ? 1 : 2);
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
        alpha: { from: legacyTuning.menu.title.pulseMinAlpha, to: legacyTuning.menu.title.pulseMaxAlpha },
        duration: legacyTuning.menu.title.pulseDurationMs,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
      this.titleDriftTween = this.tweens.add({
        targets: titleContainer,
        y: titleY + 2,
        duration: 3200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

    const demoStatusHud = createDemoStatusHud(this, layout, { reducedMotion });

    let lastCue: DemoWalkerCue = 'spawn';
    let demoConfig = resolveDemoConfig(patternFrame.episode, demoCyclePlan);
    let demoPresentation = resolveMenuDemoPresentation(patternFrame.episode, demoCyclePlan, 0, demoConfig);
    const applyEpisodePresentation = (): void => {
      demoConfig = resolveDemoConfig(patternFrame.episode, demoCyclePlan);
      demoPresentation = resolveMenuDemoPresentation(patternFrame.episode, demoCyclePlan, 0, demoConfig);
      boardRenderer.setEpisode(patternFrame.episode);
      boardRenderer.drawBase({ solutionPathAlpha: demoPresentation.solutionPathAlpha });
      boardRenderer.drawStart('spawn');
      boardRenderer.drawGoal();
      if (!reducedMotion) {
        boardRenderer.startAmbientMotion(demoPresentation.ambientDriftPx, demoPresentation.ambientDriftMs);
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
      demoPresentation = resolveMenuDemoPresentation(patternFrame.episode, demoCyclePlan, patternFrame.t * 1000, demoConfig);
      const view = resolveDemoWalkerViewFrame(
        patternFrame.episode,
        patternFrame.t * 1000,
        demoConfig,
        demoPresentation.trailWindow
      );
      const path = patternFrame.episode.raster.pathIndices;

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
        demoPresentation.metadataAlpha,
        demoPresentation.flashAlpha
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

    renderDemo();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }
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
      this.titlePulseTween?.remove();
      this.titleDriftTween?.remove();
      this.starDriftTween?.remove();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
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
  config: DemoWalkerConfig
): MenuDemoPresentation => {
  const moodProfile = DEMO_MOOD_PROFILES[cycle.mood];
  const sequenceState = resolveMenuDemoSequence(episode, elapsedMs, config);
  const progress = ease(sequenceState.progress);
  const wave = 0.5 + (Math.sin((elapsedMs + (episode.seed * 17)) * 0.0022) * 0.5);
  let boardVeilAlpha = 0.03;
  let boardAuraAlpha = moodProfile.auraAlpha;
  let boardHaloAlpha = moodProfile.haloAlpha;
  let boardShadeAlpha = moodProfile.shadeAlpha;
  let boardAuraScale = 1;
  let boardHaloScale = 1;
  let metadataAlpha = moodProfile.metadataAlpha;
  let flashAlpha = 0;

  switch (sequenceState.sequence) {
    case 'intro':
      boardVeilAlpha = lerp(cycle.mood === 'scan' ? 0.18 : 0.22, 0.04, progress);
      boardAuraAlpha = moodProfile.auraAlpha + ((1 - progress) * 0.05);
      boardHaloAlpha = moodProfile.haloAlpha + ((1 - progress) * 0.045);
      boardShadeAlpha = moodProfile.shadeAlpha + ((1 - progress) * 0.03);
      boardAuraScale = lerp(1.035, 1, progress);
      boardHaloScale = lerp(1.022, 1, progress);
      metadataAlpha = clamp((moodProfile.metadataAlpha * 0.82) + (progress * 0.08), 0.18, 0.82);
      flashAlpha = cycle.mood === 'blueprint' ? lerp(0.82, 0.24, progress) : 0;
      break;
    case 'reveal':
      boardVeilAlpha = clamp((cycle.mood === 'scan' ? 0.04 : 0.024) + (wave * (cycle.mood === 'scan' ? 0.016 : 0.008)), 0, 0.24);
      boardAuraAlpha = moodProfile.auraAlpha + (wave * (cycle.mood === 'scan' ? 0.05 : 0.028));
      boardHaloAlpha = moodProfile.haloAlpha + (wave * (cycle.mood === 'scan' ? 0.032 : 0.018));
      boardShadeAlpha = moodProfile.shadeAlpha + (wave * (cycle.mood === 'scan' ? 0.032 : 0.015));
      boardAuraScale = 1 + (wave * 0.012);
      boardHaloScale = 1 + (wave * 0.008);
      metadataAlpha = clamp(moodProfile.metadataAlpha + (cycle.mood === 'blueprint' ? 0.08 : 0.04), 0.18, 0.82);
      flashAlpha = cycle.mood === 'blueprint' ? Math.max(0, 0.46 - (progress * 0.46)) : 0;
      break;
    case 'arrival': {
      const arrivalGlow = 1 - Math.abs((progress * 2) - 1);
      boardVeilAlpha = 0.022;
      boardAuraAlpha = moodProfile.auraAlpha + 0.03 + (arrivalGlow * 0.07);
      boardHaloAlpha = moodProfile.haloAlpha + 0.02 + (arrivalGlow * 0.06);
      boardShadeAlpha = moodProfile.shadeAlpha + (arrivalGlow * 0.025);
      boardAuraScale = 1.01 + (arrivalGlow * 0.016);
      boardHaloScale = 1.008 + (arrivalGlow * 0.012);
      metadataAlpha = clamp(moodProfile.metadataAlpha + 0.12, 0.18, 0.82);
      flashAlpha = cycle.mood === 'blueprint' ? 0.14 * (1 - progress) : 0;
      break;
    }
    case 'fade':
      boardVeilAlpha = lerp(0.06, 0.22, progress);
      boardAuraAlpha = lerp(moodProfile.auraAlpha + 0.02, 0.08, progress);
      boardHaloAlpha = lerp(moodProfile.haloAlpha + 0.024, 0.018, progress);
      boardShadeAlpha = lerp(moodProfile.shadeAlpha + 0.018, 0.012, progress);
      boardAuraScale = lerp(1.014, 1.024, progress);
      boardHaloScale = lerp(1.01, 1.018, progress);
      metadataAlpha = clamp(lerp(moodProfile.metadataAlpha * 0.9, 0.28, progress), 0.18, 0.82);
      flashAlpha = 0;
      break;
  }

  return {
    mood: cycle.mood,
    sequence: sequenceState.sequence,
    solutionPathAlpha: moodProfile.solutionPathAlpha,
    trailWindow: resolveDemoTrailWindow(episode, cycle.mood),
    ambientDriftPx: moodProfile.ambientDriftPx,
    ambientDriftMs: moodProfile.ambientDriftMs,
    boardVeilAlpha: clamp(boardVeilAlpha, 0, 0.24),
    boardAuraAlpha: clamp(boardAuraAlpha, 0.06, 0.22),
    boardHaloAlpha: clamp(boardHaloAlpha, 0.018, 0.16),
    boardShadeAlpha: clamp(boardShadeAlpha, 0.012, 0.18),
    boardAuraScale: clamp(boardAuraScale, 1, 1.05),
    boardHaloScale: clamp(boardHaloScale, 1, 1.03),
    actorPulseBoost: moodProfile.actorPulseBoost,
    metadataAlpha: clamp(metadataAlpha, 0.18, 0.82),
    flashAlpha: clamp(flashAlpha, 0, 0.84)
  };
};

export const resolveMenuDemoCycle = (seed: number, cycle: number): MenuDemoCycle => {
  const mixed = Math.imul((seed >>> 0) ^ Math.imul((cycle + 1) >>> 0, 0x9e3779b1), 0x85ebca6b) >>> 0;
  return {
    difficulty: ROTATING_DIFFICULTIES[mixed % ROTATING_DIFFICULTIES.length],
    size: ROTATING_SIZES[(mixed >>> 5) % ROTATING_SIZES.length],
    mood: ROTATING_MOODS[(mixed >>> 9) % ROTATING_MOODS.length],
    pacing: DEMO_PACING_PROFILES[(mixed >>> 13) % DEMO_PACING_PROFILES.length]
  };
};

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
