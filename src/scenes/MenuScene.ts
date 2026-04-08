import Phaser from 'phaser';
import { advanceDemoWalker, createDemoWalkerState } from '../domain/ai';
import { generateMaze } from '../domain/maze/generator';
import { createBoardLayout, BoardRenderer } from '../render/boardRenderer';
import { palette } from '../render/palette';
import { legacyTuning, resolveBoardScaleFromCamScale } from '../config/tuning';
import { OverlayManager } from '../ui/overlayManager';
import { attachSfxInputUnlock, playSfx } from '../audio/proceduralSfx';
import { createDemoStatusHud } from '../render/hudRenderer';

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
  private demoStepTimer?: Phaser.Time.TimerEvent;
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

    const maze = generateMaze({
      scale: legacyTuning.board.scale,
      seed: legacyTuning.demo.seed,
      checkPointModifier: legacyTuning.board.checkPointModifier,
      shortcutCountModifier: legacyTuning.board.shortcutCountModifier.menu
    });
    let demoSeed: number = legacyTuning.demo.seed;
    const boardScale = (isNarrow ? legacyTuning.menu.layout.boardScaleNarrow : legacyTuning.menu.layout.boardScaleWide)
      + (resolveBoardScaleFromCamScale(legacyTuning.camera.camScaleDefault) - legacyTuning.camera.normalizedBaseline);

    const layout = createBoardLayout(this, maze, {
      boardScale,
      topReserve: Math.max(legacyTuning.menu.layout.topReserveMinPx, Math.round(height * legacyTuning.menu.layout.topReserveRatio)),
      sidePadding: isNarrow ? legacyTuning.menu.layout.sidePaddingPx + 4 : legacyTuning.menu.layout.sidePaddingPx,
      bottomPadding: legacyTuning.menu.layout.bottomPaddingPx
    });
    const boardRenderer = new BoardRenderer(this, maze, layout);
    boardRenderer.drawBoardChrome();
    boardRenderer.drawBase();
    boardRenderer.drawGoal();
    boardRenderer.startAmbientMotion(2.2, 2600);

    this.add
      .ellipse(
        layout.boardX + layout.boardSize / 2,
        layout.boardY + layout.boardSize / 2,
        layout.boardSize * 1.18,
        layout.boardSize * 1.12,
        palette.background.nebulaCore,
        0.11
      )
      .setOrigin(0.5)
      .setDepth(-2)
      .setBlendMode(Phaser.BlendModes.SCREEN);

    const boardShade = this.add
      .rectangle(
        layout.boardX + layout.boardSize / 2,
        layout.boardY + layout.boardSize / 2,
        layout.boardSize,
        layout.boardSize,
        palette.board.topHighlight,
        0.026
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
      titlePlateHeight / 2 + 12,
      layout.boardY - Math.round(titlePlateHeight * (isNarrow ? 0.18 : 0.3))
    );
    this.add
      .rectangle(
        width / 2,
        titleY + 7,
        titlePlateWidth + 10,
        titlePlateHeight + 12,
        palette.board.shadow,
        0.38
      )
      .setDepth(8);
    this.add
      .rectangle(
        width / 2,
        titleY,
        titlePlateWidth,
        titlePlateHeight,
        palette.board.well,
        0.22
      )
      .setStrokeStyle(1, palette.board.innerStroke, 0.24)
      .setDepth(9);
    this.add
      .rectangle(
        width / 2,
        titleY,
        titlePlateWidth - 14,
        titlePlateHeight - 12,
        palette.board.panel,
        0.36
      )
      .setStrokeStyle(1, palette.board.topHighlight, 0.1)
      .setDepth(9);
    this.add
      .rectangle(
        width / 2,
        titleY - (titlePlateHeight / 2) + 7,
        titlePlateWidth - 18,
        2,
        palette.board.topHighlight,
        0.18
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
      .setShadow(0, 0, '#2c9c48', legacyTuning.menu.title.shadowBlur - 2, true, true)
      .setDepth(10);
    const demoStatusHud = createDemoStatusHud(
      this,
      width / 2,
      titleY + legacyTuning.menu.status.insetY,
      titlePlateWidth - 18
    );

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
      targets: boardShade,
      alpha: {
        from: legacyTuning.menu.title.pulseMinAlpha * 0.06,
        to: legacyTuning.menu.title.pulseMaxAlpha * 0.08
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

    const primeDemoState = (): ReturnType<typeof createDemoWalkerState> => {
      let state = createDemoWalkerState(maze);
      const prerollSteps = legacyTuning.demo.behavior.prerollSteps ?? 0;

      for (let step = 0; step < prerollSteps; step += 1) {
        const next = advanceDemoWalker(maze, state, legacyTuning.demo);
        if (next.shouldRegenerateMaze || next.state.phase === 'reset-hold') {
          break;
        }
        state = next.state;
      }

      return state;
    };

    let demo = primeDemoState();
    let lastCue = demo.cue;
    const syncDemoPresentation = (): void => {
      boardRenderer.drawGoal(demo.cue);
      boardRenderer.drawTrail(demo.trailSteps.slice(-legacyTuning.demo.behavior.trailMaxLength), {
        cue: demo.cue,
        targetIndex: demo.targetIndex
      });
      boardRenderer.drawActor(demo.currentIndex, demo.lastDirection, demo.cue);
      demoStatusHud.setCue(demo.cue);
    };
    const accentCueBeat = (): void => {
      if (demo.cue === 'dead-end' || demo.cue === 'goal') {
        this.tweens.add({
          targets: boardShade,
          alpha: { from: 0.16, to: 0.026 },
          duration: demo.cue === 'goal' ? 340 : 220,
          ease: 'Quad.easeOut'
        });
      } else if (demo.cue === 'reacquire') {
        this.tweens.add({
          targets: boardShade,
          alpha: { from: 0.11, to: 0.026 },
          duration: 220,
          ease: 'Quad.easeOut'
        });
      }
    };
    const renderDemo = (): void => {
      syncDemoPresentation();
      if (demo.cue !== lastCue) {
        accentCueBeat();
        lastCue = demo.cue;
      }
    };
    const scheduleDemoAdvance = (delayMs: number): void => {
      this.demoStepTimer?.remove(false);
      this.demoStepTimer = this.time.delayedCall(delayMs, () => {
        if (!this.scene.isActive()) {
          return;
        }

        const next = advanceDemoWalker(maze, demo, legacyTuning.demo);
        if (next.shouldRegenerateMaze) {
          demoSeed = next.nextSeed ?? (demoSeed + legacyTuning.demo.behavior.regenerateSeedStep);
          Object.assign(maze, generateMaze({
            scale: legacyTuning.board.scale,
            seed: demoSeed,
            checkPointModifier: legacyTuning.board.checkPointModifier,
            shortcutCountModifier: legacyTuning.board.shortcutCountModifier.menu
          }));
          boardRenderer.drawBase();
          boardRenderer.drawGoal();
          demo = {
            ...primeDemoState(),
            loops: next.state.loops
          };
        } else {
          demo = next.state;
        }

        renderDemo();
        scheduleDemoAdvance(next.delayMs);
      });
    };

    renderDemo();
    scheduleDemoAdvance(legacyTuning.demo.cadence.exploreStepMs);

    this.heroRefreshTimer = this.time.addEvent({
      delay: legacyTuning.demo.cadence.heroRefreshMs,
      loop: true,
      callback: () => {
        syncDemoPresentation();
      }
    });

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
        playSfx('cancel');
        this.overlayManager.closeActive();
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
      this.demoStepTimer?.remove(false);
      this.overlayManager.closeAll();
      this.input.keyboard?.off('keydown-ESC', escHandler);
      this.input.keyboard?.off('keydown', manualShortcutHandler);
      this.events.off(OVERLAY_EVENTS.manualPlay, launchManualPlay);
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
