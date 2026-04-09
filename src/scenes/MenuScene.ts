import Phaser from 'phaser';
import type { DemoWalkerCue } from '../domain/ai';
import { disposeMazeEpisode, generateMaze, PatternEngine } from '../domain/maze';
import { createBoardLayout, BoardRenderer } from '../render/boardRenderer';
import { palette } from '../render/palette';
import { legacyTuning, resolveBoardScaleFromCamScale } from '../config/tuning';
import { OverlayManager } from '../ui/overlayManager';
import { attachSfxInputUnlock, playSfx } from '../audio/proceduralSfx';

const OVERLAY_EVENTS = {
  open: 'overlay-open',
  close: 'overlay-close',
  manualPlay: 'overlay-manual-play'
} as const;

export class MenuScene extends Phaser.Scene {
  private overlayManager!: OverlayManager;
  private titlePulseTween?: Phaser.Tweens.Tween;
  private starDriftTween?: Phaser.Tweens.Tween;
  private heroRefreshTimer?: Phaser.Time.TimerEvent;
  private transitionLocked = false;

  public constructor() {
    super('MenuScene');
  }

  public create(): void {
    const { width, height } = this.scale;
    const isNarrow = width <= legacyTuning.menu.layout.narrowBreakpoint;
    attachSfxInputUnlock(this);
    this.transitionLocked = false;
    this.overlayManager = new OverlayManager(this, ['OptionsScene']);

    this.cameras.main.fadeIn(280, 0, 0, 0);
    this.drawStarfield(width, height);

    let demoSeed: number = legacyTuning.demo.seed;
    const patternEngine = new PatternEngine(
      () => {
        const episode = generateMaze({
          scale: legacyTuning.board.scale,
          seed: demoSeed,
          checkPointModifier: legacyTuning.board.checkPointModifier,
          shortcutCountModifier: legacyTuning.board.shortcutCountModifier.menu
        });
        demoSeed += legacyTuning.demo.behavior.regenerateSeedStep;
        return episode;
      },
      'demo'
    );
    let patternFrame = patternEngine.next(0);
    let sceneHidden = document.hidden;
    const episode = patternFrame.episode;
    const boardScale = (isNarrow ? legacyTuning.menu.layout.boardScaleNarrow : legacyTuning.menu.layout.boardScaleWide)
      + (resolveBoardScaleFromCamScale(legacyTuning.camera.camScaleDefault) - legacyTuning.camera.normalizedBaseline);

    const layout = createBoardLayout(this, episode, {
      boardScale,
      topReserve: Math.max(legacyTuning.menu.layout.topReserveMinPx, Math.round(height * legacyTuning.menu.layout.topReserveRatio)),
      sidePadding: isNarrow ? legacyTuning.menu.layout.sidePaddingPx + 4 : legacyTuning.menu.layout.sidePaddingPx,
      bottomPadding: legacyTuning.menu.layout.bottomPaddingPx
    });
    const boardRenderer = new BoardRenderer(this, episode, layout);
    boardRenderer.drawBoardChrome();
    boardRenderer.drawBase();
    boardRenderer.drawGoal();
    boardRenderer.startAmbientMotion(2.6, 3000);

    const boardAura = this.add
      .ellipse(
        layout.boardX + layout.boardWidth / 2,
        layout.boardY + layout.boardHeight / 2,
        layout.boardWidth * 1.14,
        layout.boardHeight * 1.08,
        palette.background.nebulaCore,
        0.1
      )
      .setOrigin(0.5)
      .setDepth(-2.5)
      .setBlendMode(Phaser.BlendModes.SCREEN);

    const boardHalo = this.add
      .ellipse(
        layout.boardX + layout.boardWidth / 2,
        layout.boardY + layout.boardHeight / 2,
        layout.boardWidth * 1.05,
        layout.boardHeight * 1.03,
        palette.board.topHighlight,
        0.032
      )
      .setOrigin(0.5)
      .setDepth(6)
      .setBlendMode(Phaser.BlendModes.SCREEN);

    const boardShade = this.add
      .rectangle(
        layout.boardX + layout.boardWidth / 2,
        layout.boardY + layout.boardHeight / 2,
        layout.boardWidth,
        layout.boardHeight,
        palette.board.topHighlight,
        0.02
      )
      .setOrigin(0.5)
      .setDepth(7)
      .setBlendMode(Phaser.BlendModes.SCREEN);

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
    const titleY = Math.max(
      titlePlateHeight / 2 + 10,
      layout.boardY - Math.round(titlePlateHeight * (isNarrow ? 0.06 : 0.12))
    );
    this.add
      .rectangle(
        width / 2,
        titleY + 6,
        titlePlateWidth + 8,
        titlePlateHeight + 10,
        palette.board.shadow,
        0.26
      )
      .setDepth(8);
    this.add
      .rectangle(
        width / 2,
        titleY,
        titlePlateWidth,
        titlePlateHeight,
        palette.board.well,
        0.16
      )
      .setStrokeStyle(1, palette.board.innerStroke, 0.18)
      .setDepth(9);
    this.add
      .rectangle(
        width / 2,
        titleY,
        titlePlateWidth - 14,
        titlePlateHeight - 12,
        palette.board.panel,
        0.24
      )
      .setStrokeStyle(1, palette.board.topHighlight, 0.08)
      .setDepth(9);
    this.add
      .rectangle(
        width / 2,
        titleY - (titlePlateHeight / 2) + 7,
        titlePlateWidth - 18,
        2,
        palette.board.topHighlight,
        0.12
      )
      .setDepth(9);

    const title = this.add
      .text(width / 2, titleY - 5, legacyTuning.menu.title.text, {
        color: '#75f78f',
        fontFamily: 'monospace',
        fontSize: `${Phaser.Math.Clamp(Math.round(layout.boardSize * legacyTuning.menu.title.fontScaleToBoard), 38, 84)}px`,
        fontStyle: 'bold'
      })
      .setOrigin(0.5)
      .setLetterSpacing(isNarrow ? 2 : 4)
      .setAlpha(legacyTuning.menu.title.alpha)
      .setStroke('#17381f', legacyTuning.menu.title.strokePx)
      .setShadow(0, 0, '#2c9c48', legacyTuning.menu.title.shadowBlur - 4, true, true)
      .setDepth(10);

    this.titlePulseTween = this.tweens.add({
      targets: title,
      alpha: {
        from: legacyTuning.menu.title.pulseMinAlpha,
        to: legacyTuning.menu.title.pulseMaxAlpha
      },
      duration: legacyTuning.menu.title.pulseDurationMs,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    this.tweens.add({
      targets: boardAura,
      alpha: {
        from: 0.08,
        to: 0.12
      },
      duration: 3600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    this.tweens.add({
      targets: boardHalo,
      alpha: {
        from: 0.024,
        to: 0.04
      },
      duration: 3200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    this.tweens.add({
      targets: boardShade,
      alpha: {
        from: legacyTuning.menu.title.pulseMinAlpha * 0.03,
        to: legacyTuning.menu.title.pulseMaxAlpha * 0.05
      },
      duration: legacyTuning.menu.title.pulseDurationMs,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
    this.tweens.add({
      targets: title,
      y: '+=2',
      duration: 2600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    let lastCue: DemoWalkerCue = 'spawn';
    const syncDemoPresentation = (): void => {
      const pathCursor = resolvePathCursor(
        patternFrame.t,
        patternFrame.episode.raster.pathIndices.length,
        legacyTuning.demo.cadence.exploreStepMs
      );
      const currentIndex = patternFrame.episode.raster.pathIndices[pathCursor] ?? patternFrame.episode.raster.startIndex;
      const cue = resolveDemoCue(patternFrame.t, pathCursor, patternFrame.episode.raster.pathIndices.length);
      const lastTrailIndex = pathCursor > 0
        ? patternFrame.episode.raster.pathIndices[pathCursor - 1]
        : currentIndex;

      boardRenderer.drawGoal(cue);
      boardRenderer.drawTrail(patternFrame.episode.raster.pathIndices, { cue, limit: pathCursor + 1 });
      boardRenderer.drawActor(currentIndex, resolveDirection(patternFrame.episode, lastTrailIndex, currentIndex), cue);
    };
    const accentCueBeat = (): void => {
      const pulseBoard = (
        shadeFrom: number,
        haloFrom: number,
        auraFrom: number,
        duration: number,
        scaleFrom = 1.015
      ): void => {
        this.tweens.add({
          targets: boardShade,
          alpha: { from: shadeFrom, to: 0.02 },
          duration,
          ease: 'Quad.easeOut'
        });
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

      const cue = resolveDemoCue(patternFrame.t, resolvePathCursor(
        patternFrame.t,
        patternFrame.episode.raster.pathIndices.length,
        legacyTuning.demo.cadence.exploreStepMs
      ), patternFrame.episode.raster.pathIndices.length);
      if (cue === 'goal') {
        pulseBoard(0.18, 0.16, 0.2, 360, 1.024);
      } else if (cue === 'reset') {
        pulseBoard(0.1, 0.08, 0.12, 200, 1.012);
      } else if (cue === 'spawn') {
        pulseBoard(0.1, 0.12, 0.16, 210, 1.012);
      }
    };
    const renderDemo = (): void => {
      const cue = resolveDemoCue(
        patternFrame.t,
        resolvePathCursor(patternFrame.t, patternFrame.episode.raster.pathIndices.length, legacyTuning.demo.cadence.exploreStepMs),
        patternFrame.episode.raster.pathIndices.length
      );
      syncDemoPresentation();
      if (cue !== lastCue) {
        accentCueBeat();
        lastCue = cue;
      }
    };
    const swapEpisode = (nextFrame: typeof patternFrame): void => {
      const previousEpisode = patternFrame.episode;
      patternFrame = nextFrame;
      boardRenderer.setEpisode(nextFrame.episode);
      boardRenderer.drawBase();
      boardRenderer.drawGoal();
      renderDemo();
      disposeMazeEpisode(previousEpisode);
    };
    const handleVisibilityChange = (): void => {
      if (document.hidden) {
        sceneHidden = true;
        patternEngine.suspend();
        if (this.heroRefreshTimer) {
          this.heroRefreshTimer.paused = true;
        }
        return;
      }

      if (!sceneHidden) {
        return;
      }

      sceneHidden = false;
      const previousEpisode = patternFrame.episode;
      patternEngine.resumeFresh();
      patternFrame = patternEngine.next(0);
      boardRenderer.setEpisode(patternFrame.episode);
      boardRenderer.drawBase();
      boardRenderer.drawGoal();
      renderDemo();
      disposeMazeEpisode(previousEpisode);
      if (this.heroRefreshTimer) {
        this.heroRefreshTimer.paused = false;
      }
    };

    renderDemo();

    this.heroRefreshTimer = this.time.addEvent({
      delay: legacyTuning.demo.cadence.heroRefreshMs,
      loop: true,
      callback: () => {
        if (sceneHidden) {
          return;
        }

        const nextFrame = patternEngine.next(legacyTuning.demo.cadence.heroRefreshMs / 1000);
        if (nextFrame.episode !== patternFrame.episode) {
          swapEpisode(nextFrame);
        } else {
          patternFrame = nextFrame;
          renderDemo();
        }
      }
    });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const queueTransition = (action: () => void, delayMs = 78): void => {
      if (this.transitionLocked) {
        return;
      }

      this.transitionLocked = true;
      this.time.delayedCall(delayMs, () => {
        if (this.scene.isActive()) {
          action();
        }
      });
    };

    const launchManualPlay = (): void => {
      queueTransition(() => {
        this.overlayManager.closeAll();
        this.tweens.add({
          targets: this.cameras.main,
          zoom: 1.015,
          duration: 120,
          yoyo: true,
          ease: 'Sine.easeOut'
        });
        this.cameras.main.fadeOut(140, 0, 0, 0);
        this.time.delayedCall(140, () => this.scene.start('GameScene'));
      });
    };

    // CSS shell padding already honors safe-area insets, so the scene only needs a small internal offset.
    const optionsGear = this.createOptionsGearButton(
      width - legacyTuning.menu.utilityButton.insetSidePx - (legacyTuning.menu.utilityButton.hitSizePx / 2),
      legacyTuning.menu.utilityButton.insetTopPx + (legacyTuning.menu.utilityButton.hitSizePx / 2),
      () => {
        if (this.transitionLocked) {
          return;
        }
        this.events.emit(OVERLAY_EVENTS.open, 'OptionsScene');
      }
    );
    optionsGear.setAlpha(0);
    optionsGear.y += legacyTuning.menu.utilityButton.introRisePx;
    this.tweens.add({
      targets: optionsGear,
      alpha: legacyTuning.menu.utilityButton.alpha,
      y: optionsGear.y - legacyTuning.menu.utilityButton.introRisePx,
      duration: legacyTuning.menu.utilityButton.introDurationMs,
      ease: 'Quad.easeOut',
      delay: legacyTuning.menu.utilityButton.introDelayMs
    });

    this.events.on(OVERLAY_EVENTS.open, (key: string) => this.overlayManager.open(key));
    this.events.on(OVERLAY_EVENTS.close, () => this.overlayManager.closeActive());
    this.events.on(OVERLAY_EVENTS.manualPlay, launchManualPlay);

    const escHandler = () => {
      if (!this.overlayManager.isOverlayActive()) {
        this.events.emit(OVERLAY_EVENTS.open, 'OptionsScene');
      } else {
        const activeOverlay = this.overlayManager.getActiveOverlay();
        if (!activeOverlay) {
          return;
        }

        const handled = this.scene.get(activeOverlay).events.emit('overlay-request-close');
        if (!handled) {
          playSfx('cancel');
          this.overlayManager.closeActive();
        }
      }
    };
    const manualShortcutHandler = (event: KeyboardEvent) => {
      if (!this.overlayManager.isOverlayActive() && event.code === 'KeyM' && event.shiftKey) {
        launchManualPlay();
      }
    };
    this.input.keyboard?.on('keydown-ESC', escHandler);
    this.input.keyboard?.on('keydown', manualShortcutHandler);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.titlePulseTween?.remove();
      this.starDriftTween?.remove();
      this.heroRefreshTimer?.remove(false);
      this.heroRefreshTimer = undefined;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      this.overlayManager.closeAll();
      patternEngine.destroy();
      boardRenderer.destroy();
      this.input.keyboard?.off('keydown-ESC', escHandler);
      this.input.keyboard?.off('keydown', manualShortcutHandler);
      this.events.off(OVERLAY_EVENTS.open);
      this.events.off(OVERLAY_EVENTS.close);
      this.events.off(OVERLAY_EVENTS.manualPlay, launchManualPlay);
      this.time.removeAllEvents();
      this.tweens.killAll();
      this.children.removeAll(true);
    });
  }

  private createOptionsGearButton(
    x: number,
    y: number,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const size = legacyTuning.menu.utilityButton.sizePx;
    const hitSize = legacyTuning.menu.utilityButton.hitSizePx;
    const plate = this.add.graphics();
    const gloss = this.add.graphics();
    const icon = this.add.graphics();
    const hit = this.add
      .rectangle(0, 0, hitSize, hitSize, 0x000000, 0.001)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const button = this.add.container(x, y, [plate, gloss, icon, hit]).setDepth(12);
    let hovered = false;

    const draw = (pressed: boolean): void => {
      const plateSize = pressed ? size - 1 : size;
      const fillAlpha = hovered ? 0.8 : 0.62;
      const edgeAlpha = hovered ? 0.9 : 0.6;
      const gearAlpha = hovered ? 0.96 : 0.76;

      plate.clear();
      gloss.clear();
      icon.clear();

      plate.fillStyle(palette.ui.buttonFill, fillAlpha);
      plate.fillRect(-plateSize / 2, -plateSize / 2, plateSize, plateSize);
      plate.lineStyle(1, palette.board.outerStroke, edgeAlpha);
      plate.strokeRect(-plateSize / 2 + 0.5, -plateSize / 2 + 0.5, plateSize - 1, plateSize - 1);
      plate.lineStyle(1, palette.board.innerStroke, hovered ? 0.38 : 0.24);
      plate.strokeRect(-plateSize / 2 + 3.5, -plateSize / 2 + 3.5, plateSize - 7, plateSize - 7);

      const tickInset = plateSize / 2 - 3;
      const tickLength = 6;
      plate.lineStyle(1, palette.board.topHighlight, hovered ? 0.3 : 0.18);
      plate.lineBetween(-tickInset, -tickInset, -tickInset + tickLength, -tickInset);
      plate.lineBetween(-tickInset, -tickInset, -tickInset, -tickInset + tickLength);
      plate.lineBetween(tickInset, -tickInset, tickInset - tickLength, -tickInset);
      plate.lineBetween(tickInset, -tickInset, tickInset, -tickInset + tickLength);
      plate.lineBetween(-tickInset, tickInset, -tickInset + tickLength, tickInset);
      plate.lineBetween(-tickInset, tickInset, -tickInset, tickInset - tickLength);
      plate.lineBetween(tickInset, tickInset, tickInset - tickLength, tickInset);
      plate.lineBetween(tickInset, tickInset, tickInset, tickInset - tickLength);

      gloss.fillStyle(palette.board.topHighlight, hovered ? 0.14 : 0.08);
      gloss.fillRect(-plateSize / 2 + 4, -plateSize / 2 + 4, plateSize - 8, 2);

      icon.lineStyle(1.8, palette.board.topHighlight, gearAlpha);
      for (let tooth = 0; tooth < 8; tooth += 1) {
        const angle = (Math.PI * 2 * tooth) / 8;
        const innerRadius = 7;
        const outerRadius = 11;
        icon.lineBetween(
          Math.cos(angle) * innerRadius,
          Math.sin(angle) * innerRadius,
          Math.cos(angle) * outerRadius,
          Math.sin(angle) * outerRadius
        );
      }
      icon.strokeCircle(0, 0, 7);
      icon.fillStyle(palette.ui.text, gearAlpha);
      icon.fillCircle(0, 0, 2.2);
    };

    const tweenToState = (pressed: boolean): void => {
      this.tweens.killTweensOf(button);
      this.tweens.add({
        targets: button,
        scaleX: pressed ? 0.97 : hovered ? 1.04 : 1,
        scaleY: pressed ? 0.97 : hovered ? 1.04 : 1,
        duration: pressed ? 45 : 90,
        ease: pressed ? 'Quad.easeOut' : 'Sine.easeOut'
      });
      draw(pressed);
    };

    hit.on('pointerover', () => {
      hovered = true;
      tweenToState(false);
      playSfx('move');
    });
    hit.on('pointerout', () => {
      hovered = false;
      tweenToState(false);
    });
    hit.on('pointerdown', () => {
      tweenToState(true);
      playSfx('confirm');
    });
    hit.on('pointerup', () => {
      tweenToState(false);
      onClick();
    });

    draw(false);
    return button;
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
      clouds.fillStyle(palette.background.cloud, Phaser.Math.FloatBetween(legacyTuning.menu.starfield.cloudAlphaMin, legacyTuning.menu.starfield.cloudAlphaMax));
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
      nearStars.fillStyle(palette.background.star, Phaser.Math.FloatBetween(legacyTuning.menu.starfield.starAlphaMin, legacyTuning.menu.starfield.starAlphaMax));
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

const resolvePathCursor = (elapsedSeconds: number, pathLength: number, stepMs: number): number => {
  if (pathLength <= 1) {
    return 0;
  }

  return Math.min(pathLength - 1, Math.floor((elapsedSeconds * 1000) / stepMs));
};

const resolveDemoCue = (elapsedSeconds: number, pathCursor: number, pathLength: number): DemoWalkerCue => {
  if (pathCursor >= Math.max(0, pathLength - 1)) {
    return 'goal';
  }
  if (elapsedSeconds <= 0.08) {
    return 'reset';
  }
  if (elapsedSeconds <= 0.2) {
    return 'spawn';
  }
  return 'explore';
};

const resolveDirection = (
  episode: { raster: { tiles: { neighbors: readonly [number, number, number, number] }[] } },
  fromIndex: number,
  toIndex: number
): 0 | 1 | 2 | 3 | null => {
  if (fromIndex === toIndex) {
    return null;
  }

  const direction = episode.raster.tiles[fromIndex].neighbors.findIndex((neighbor) => neighbor === toIndex);
  if (direction < 0 || direction > 3) {
    return null;
  }
  return direction as 0 | 1 | 2 | 3;
};
