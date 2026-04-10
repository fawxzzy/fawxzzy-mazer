import Phaser from 'phaser';
import { resolveDemoWalkerViewFrame, type DemoWalkerConfig, type DemoWalkerCue } from '../domain/ai';
import {
  disposeMazeEpisode,
  generateMazeForDifficulty,
  MAZE_SIZE_ORDER,
  PatternEngine,
  type MazeDifficulty,
  type MazeSize,
  type PatternFrame
} from '../domain/maze';
import { legacyTuning, resolveBoardScaleFromCamScale } from '../config/tuning';
import { createBoardLayout, BoardRenderer } from '../render/boardRenderer';
import { createDemoStatusHud } from '../render/hudRenderer';
import { palette } from '../render/palette';

const PASSIVE_TAGLINE = 'live demo';
const ROTATING_DIFFICULTIES: readonly MazeDifficulty[] = ['chill', 'standard', 'spicy', 'brutal'];
const ROTATING_SIZES: readonly MazeSize[] = MAZE_SIZE_ORDER;

export class MenuScene extends Phaser.Scene {
  private titlePulseTween?: Phaser.Tweens.Tween;
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
    const patternEngine = new PatternEngine(() => {
      const cycle = resolveMenuDemoCycle(demoSeed, demoCycle);
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
    boardRenderer.drawBase({ showSolutionPath: true });
    boardRenderer.drawStart('spawn');
    boardRenderer.drawGoal();
    if (!reducedMotion) {
      boardRenderer.startAmbientMotion(2.6, 3000);
    }

    const boardAura = this.add.ellipse(
      layout.boardX + layout.boardWidth / 2,
      layout.boardY + layout.boardHeight / 2,
      layout.boardWidth * 1.14,
      layout.boardHeight * 1.08,
      palette.background.nebulaCore,
      0.1
    ).setOrigin(0.5).setDepth(-2.5).setBlendMode(Phaser.BlendModes.SCREEN);
    const boardHalo = this.add.ellipse(
      layout.boardX + layout.boardWidth / 2,
      layout.boardY + layout.boardHeight / 2,
      layout.boardWidth * 1.05,
      layout.boardHeight * 1.03,
      palette.board.topHighlight,
      0.032
    ).setOrigin(0.5).setDepth(6).setBlendMode(Phaser.BlendModes.SCREEN);
    const boardShade = this.add.rectangle(
      layout.boardX + layout.boardWidth / 2,
      layout.boardY + layout.boardHeight / 2,
      layout.boardWidth,
      layout.boardHeight,
      palette.board.topHighlight,
      0.02
    ).setOrigin(0.5).setDepth(7).setBlendMode(Phaser.BlendModes.SCREEN);

    const titlePlateWidth = Phaser.Math.Clamp(
      Math.round(layout.boardSize * (isNarrow ? 0.52 : legacyTuning.menu.title.plateWidthRatio)),
      220,
      420
    );
    const titlePlateHeight = Phaser.Math.Clamp(
      Math.round(layout.boardSize * legacyTuning.menu.title.plateHeightRatio),
      legacyTuning.menu.title.plateHeightMinPx,
      legacyTuning.menu.title.plateHeightMaxPx
    );
    const titleY = Math.max(titlePlateHeight / 2 + 10, layout.boardY - Math.round(titlePlateHeight * (isNarrow ? 0.06 : 0.12)));
    this.add.rectangle(width / 2, titleY + 6, titlePlateWidth + 8, titlePlateHeight + 10, palette.board.shadow, 0.26).setDepth(8);
    this.add.rectangle(width / 2, titleY, titlePlateWidth, titlePlateHeight, palette.board.well, 0.16)
      .setStrokeStyle(1, palette.board.innerStroke, 0.18).setDepth(9);
    this.add.rectangle(width / 2, titleY, titlePlateWidth - 14, titlePlateHeight - 12, palette.board.panel, 0.24)
      .setStrokeStyle(1, palette.board.topHighlight, 0.08).setDepth(9);
    this.add.rectangle(width / 2, titleY - (titlePlateHeight / 2) + 7, titlePlateWidth - 18, 2, palette.board.topHighlight, 0.12)
      .setDepth(9);

    const title = this.add.text(width / 2, titleY - 7, legacyTuning.menu.title.text, {
      color: '#75f78f',
      fontFamily: 'monospace',
      fontSize: `${Phaser.Math.Clamp(Math.round(layout.boardSize * legacyTuning.menu.title.fontScaleToBoard), 38, 84)}px`,
      fontStyle: 'bold'
    }).setOrigin(0.5).setLetterSpacing(isNarrow ? 2 : 4).setAlpha(legacyTuning.menu.title.alpha)
      .setStroke('#17381f', legacyTuning.menu.title.strokePx).setShadow(0, 0, '#2c9c48', legacyTuning.menu.title.shadowBlur - 4, true, true)
      .setDepth(10);
    this.add.text(width / 2, titleY + Math.round(titlePlateHeight * 0.23), '\u00b0 by fawxzzy', {
      color: '#a5d7af',
      fontFamily: '"Courier New", monospace',
      fontSize: `${isNarrow ? 9 : 10}px`,
      letterSpacing: 1
    }).setOrigin(0.5).setAlpha(0.68).setDepth(10);
    this.add.text(width / 2, titleY + Math.round(titlePlateHeight * 0.4), PASSIVE_TAGLINE, {
      color: '#d7deef',
      fontFamily: '"Courier New", monospace',
      fontSize: `${isNarrow ? 10 : 11}px`,
      fontStyle: 'bold'
    }).setOrigin(0.5).setAlpha(0.52).setDepth(10);

    if (!reducedMotion) {
      this.titlePulseTween = this.tweens.add({
        targets: title,
        alpha: { from: legacyTuning.menu.title.pulseMinAlpha, to: legacyTuning.menu.title.pulseMaxAlpha },
        duration: legacyTuning.menu.title.pulseDurationMs,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
      this.tweens.add({ targets: boardAura, alpha: { from: 0.08, to: 0.12 }, duration: 3600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: boardHalo, alpha: { from: 0.024, to: 0.04 }, duration: 3200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.tweens.add({
        targets: boardShade,
        alpha: { from: legacyTuning.menu.title.pulseMinAlpha * 0.03, to: legacyTuning.menu.title.pulseMaxAlpha * 0.05 },
        duration: legacyTuning.menu.title.pulseDurationMs,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
      this.tweens.add({ targets: title, y: '+=2', duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    const demoStatusHud = createDemoStatusHud(
      this,
      width / 2,
      Math.max(titleY + (titlePlateHeight / 2) + 26, layout.boardY - 22),
      layout.boardWidth * 0.9,
      { reducedMotion }
    );

    let lastCue: DemoWalkerCue = 'spawn';
    let demoConfig = resolveDemoConfig(patternFrame.episode);
    const applyPatternFrame = (nextFrame: PatternFrame): void => {
      const previousEpisode = patternFrame.episode;
      patternFrame = nextFrame;
      demoConfig = resolveDemoConfig(nextFrame.episode);
      boardRenderer.setEpisode(nextFrame.episode);
      boardRenderer.drawBase({ showSolutionPath: true });
      boardRenderer.drawStart('spawn');
      boardRenderer.drawGoal();
      renderDemo();
      disposeMazeEpisode(previousEpisode);
    };
    const accentCueBeat = (cue: DemoWalkerCue): void => {
      if (reducedMotion) {
        return;
      }

      const pulseBoard = (shadeFrom: number, haloFrom: number, auraFrom: number, duration: number, scaleFrom = 1.015): void => {
        this.tweens.add({ targets: boardShade, alpha: { from: shadeFrom, to: 0.02 }, duration, ease: 'Quad.easeOut' });
        this.tweens.add({
          targets: boardHalo,
          alpha: { from: haloFrom, to: 0.032 },
          scaleX: { from: scaleFrom, to: 1 },
          scaleY: { from: scaleFrom, to: 1 },
          duration,
          ease: 'Quad.easeOut'
        });
        this.tweens.add({
          targets: boardAura,
          alpha: { from: auraFrom, to: 0.1 },
          scaleX: { from: scaleFrom + 0.01, to: 1 },
          scaleY: { from: scaleFrom + 0.01, to: 1 },
          duration: duration + 60,
          ease: 'Quad.easeOut'
        });
      };

      if (cue === 'goal') {
        pulseBoard(0.18, 0.16, 0.2, 360, 1.024);
      } else if (cue === 'reset') {
        pulseBoard(0.1, 0.08, 0.12, 200, 1.012);
      } else if (cue === 'spawn') {
        pulseBoard(0.1, 0.12, 0.16, 210, 1.012);
      }
    };
    const renderDemo = (): void => {
      const view = resolveDemoWalkerViewFrame(
        patternFrame.episode,
        patternFrame.t * 1000,
        demoConfig,
        resolveDemoTrailWindow(patternFrame.episode)
      );
      const path = patternFrame.episode.raster.pathIndices;
      boardRenderer.drawStart(view.cue);
      boardRenderer.drawGoal(view.cue);
      boardRenderer.drawTrail(path, {
        cue: view.cue,
        limit: view.trailLimit,
        start: view.trailStart,
        emphasis: 'demo'
      });

      if (view.currentIndex === view.nextIndex || view.progress <= 0) {
        boardRenderer.drawActor(view.currentIndex, view.direction, view.cue);
      } else {
        boardRenderer.drawActorMotion(view.currentIndex, view.nextIndex, view.progress, view.direction, view.cue);
      }

      demoStatusHud.setState(view.cue, patternFrame.episode);
      if (view.cue !== lastCue) {
        accentCueBeat(view.cue);
        lastCue = view.cue;
      }
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

const resolveDemoConfig = (episode: PatternFrame['episode']): DemoWalkerConfig => {
  const plan = resolveMenuDemoCycle(episode.seed, episode.seed);
  const pace = plan.pacing;
  return {
    ...legacyTuning.demo,
    cadence: {
      ...legacyTuning.demo.cadence,
      spawnHoldMs: legacyTuning.demo.cadence.spawnHoldMs + pace.spawnHoldMs + (episode.difficulty === 'chill' ? 120 : episode.difficulty === 'standard' ? 60 : 0),
      exploreStepMs: legacyTuning.demo.cadence.exploreStepMs + pace.exploreStepMs,
      goalHoldMs: legacyTuning.demo.cadence.goalHoldMs + pace.goalHoldMs + (episode.difficulty === 'brutal' ? 100 : 0),
      resetHoldMs: legacyTuning.demo.cadence.resetHoldMs + pace.resetHoldMs + (episode.difficulty === 'chill' ? 40 : 0)
    }
  };
};

const resolveDemoTrailWindow = (episode: PatternFrame['episode']): number => {
  const sizeOffset = episode.size === 'small' ? -2 : episode.size === 'medium' ? 0 : episode.size === 'large' ? 2 : 4;
  switch (episode.difficulty) {
    case 'chill':
      return 18 + sizeOffset;
    case 'standard':
      return 22 + sizeOffset;
    case 'spicy':
      return 26 + sizeOffset;
    case 'brutal':
      return 30 + sizeOffset;
    default:
      return 22 + sizeOffset;
  }
};

interface MenuDemoCycle {
  difficulty: MazeDifficulty;
  size: MazeSize;
  pacing: {
    exploreStepMs: number;
    goalHoldMs: number;
    resetHoldMs: number;
    spawnHoldMs: number;
  };
}

const DEMO_PACING_PROFILES: readonly MenuDemoCycle['pacing'][] = [
  { exploreStepMs: -8, goalHoldMs: 40, resetHoldMs: 18, spawnHoldMs: 12 },
  { exploreStepMs: 0, goalHoldMs: 0, resetHoldMs: 0, spawnHoldMs: 0 },
  { exploreStepMs: 7, goalHoldMs: 86, resetHoldMs: 28, spawnHoldMs: 18 }
] as const;

export const resolveMenuDemoCycle = (seed: number, cycle: number): MenuDemoCycle => {
  const mixed = Math.imul((seed >>> 0) ^ Math.imul((cycle + 1) >>> 0, 0x9e3779b1), 0x85ebca6b) >>> 0;
  return {
    difficulty: ROTATING_DIFFICULTIES[mixed % ROTATING_DIFFICULTIES.length],
    size: ROTATING_SIZES[(mixed >>> 5) % ROTATING_SIZES.length],
    pacing: DEMO_PACING_PROFILES[(mixed >>> 9) % DEMO_PACING_PROFILES.length]
  };
};

const prefersReducedMotion = (): boolean => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
);
