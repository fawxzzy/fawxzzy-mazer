import Phaser from 'phaser';
import { advanceDemoWalker, createDemoWalkerState } from '../domain/ai';
import { generateMaze } from '../domain/maze/generator';
import { createBoardLayout, BoardRenderer } from '../render/boardRenderer';
import { palette } from '../render/palette';
import { legacyTuning, resolveBoardScaleFromCamScale } from '../config/tuning';
import { OverlayManager } from '../ui/overlayManager';
import { createMenuButton } from '../ui/menuButton';
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
  private boardGoalPulse?: Phaser.Time.TimerEvent;
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
    const buttonHeight = 44;
    const buttonBottomReserve = buttonHeight + legacyTuning.menu.layout.buttonBottomInsetPx + 28;
    const boardScale = (isNarrow ? legacyTuning.menu.layout.boardScaleNarrow : legacyTuning.menu.layout.boardScaleWide)
      + (resolveBoardScaleFromCamScale(legacyTuning.camera.camScaleDefault) - legacyTuning.camera.normalizedBaseline);

    const layout = createBoardLayout(this, maze, {
      boardScale,
      topReserve: Math.max(legacyTuning.menu.layout.topReserveMinPx, Math.round(height * legacyTuning.menu.layout.topReserveRatio)),
      sidePadding: isNarrow ? legacyTuning.menu.layout.sidePaddingPx + 12 : legacyTuning.menu.layout.sidePaddingPx,
      bottomPadding: Math.max(legacyTuning.menu.layout.bottomPaddingPx, buttonBottomReserve)
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

    const titlePlateWidth = layout.boardSize * legacyTuning.menu.title.plateWidthRatio;
    const titlePlateHeight = Phaser.Math.Clamp(
      Math.round(layout.boardSize * legacyTuning.menu.title.plateHeightRatio),
      legacyTuning.menu.title.plateHeightMinPx,
      legacyTuning.menu.title.plateHeightMaxPx
    );
    const titleY = Math.max(
      titlePlateHeight / 2 + 10,
      layout.boardY - Math.round(titlePlateHeight * (isNarrow ? 0.34 : 0.42))
    );
    this.add
      .rectangle(
        width / 2,
        titleY,
        titlePlateWidth,
        titlePlateHeight,
        palette.board.well,
        legacyTuning.menu.title.plateAlpha
      )
      .setStrokeStyle(1, palette.board.innerStroke, 0.2)
      .setDepth(9);

    const title = this.add
      .text(width / 2, titleY, legacyTuning.menu.title.text, {
        color: '#75f78f',
        fontFamily: 'monospace',
        fontSize: `${Phaser.Math.Clamp(Math.round(layout.boardSize * legacyTuning.menu.title.fontScaleToBoard), 38, 84)}px`,
        fontStyle: 'bold'
      })
      .setOrigin(0.5)
      .setAlpha(legacyTuning.menu.title.alpha)
      .setStroke('#17381f', legacyTuning.menu.title.strokePx)
      .setShadow(0, 0, '#2c9c48', legacyTuning.menu.title.shadowBlur, true, true)
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
    const renderDemo = (): void => {
      boardRenderer.drawTrail(demo.trailSteps.slice(-legacyTuning.demo.behavior.trailMaxLength));
      boardRenderer.drawActor(demo.currentIndex, demo.lastDirection);
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

    this.boardGoalPulse = this.time.addEvent({
      delay: legacyTuning.demo.cadence.goalPulseMs,
      loop: true,
      callback: () => {
        boardRenderer.drawGoal();
      }
    });

    const exitButtonWidth = isNarrow ? legacyTuning.menu.buttons.widthNarrowPx : legacyTuning.menu.buttons.widths.left;
    const optionsButtonWidth = isNarrow ? legacyTuning.menu.buttons.widthNarrowPx : legacyTuning.menu.buttons.widths.right;
    const buttonY = Math.min(
      height - legacyTuning.menu.layout.buttonBottomInsetPx,
      layout.boardY + layout.boardSize + legacyTuning.menu.buttons.laneBottomOffset
    );
    const requestedRowGap = Phaser.Math.Clamp(
      Math.round(width * legacyTuning.menu.buttons.spacingRatio),
      legacyTuning.menu.buttons.spacingMinPx,
      legacyTuning.menu.buttons.spacingMaxPx
    );
    const rowGap = Math.max(
      12,
      Math.min(
        requestedRowGap,
        Math.floor(
          (
            width
            - exitButtonWidth
            - optionsButtonWidth
            - (legacyTuning.menu.layout.buttonSideInsetPx * 2)
          ) / 4
        )
      )
    );
    const exitButtonX = Math.max(
      legacyTuning.menu.layout.buttonSideInsetPx + (exitButtonWidth / 2),
      (width / 2) - rowGap - (exitButtonWidth / 2)
    );
    const optionsButtonX = Math.min(
      width - legacyTuning.menu.layout.buttonSideInsetPx - (optionsButtonWidth / 2),
      (width / 2) + rowGap + (optionsButtonWidth / 2)
    );

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

    const optionsButton = createMenuButton(this, {
      x: optionsButtonX,
      y: buttonY,
      label: legacyTuning.menu.labels[0],
      width: optionsButtonWidth,
      onClick: () => {
        if (this.transitionLocked) {
          return;
        }
        this.events.emit(OVERLAY_EVENTS.open, 'OptionsScene');
      },
      clickSfx: 'confirm'
    });

    const quitButton = createMenuButton(this, {
      x: exitButtonX,
      y: buttonY,
      label: legacyTuning.menu.labels[1],
      width: exitButtonWidth,
      onClick: () => {
        queueTransition(() => {
          this.overlayManager.closeAll();
          this.game.destroy(true);
        }, 86);
      },
      clickSfx: 'cancel'
    });

    const buttons = [quitButton, optionsButton];
    buttons.forEach((button, index) => {
      button.setAlpha(legacyTuning.menu.buttons.alpha);
      const targetAlpha = button.alpha;
      button.setAlpha(0);
      button.y += legacyTuning.menu.buttons.introRisePx;
      this.tweens.add({
        targets: button,
        alpha: targetAlpha,
        y: button.y - legacyTuning.menu.buttons.introRisePx,
        duration: legacyTuning.menu.buttons.introDurationMs,
        ease: 'Quad.easeOut',
        delay: legacyTuning.menu.buttons.introDelayStartMs + (index * legacyTuning.menu.buttons.introDelayStepMs)
      });
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
    const enterHandler = () => {
      if (!this.overlayManager.isOverlayActive()) {
        launchManualPlay();
      }
    };
    this.input.keyboard?.on('keydown-ESC', escHandler);
    this.input.keyboard?.on('keydown-M', enterHandler);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.titlePulseTween?.remove();
      this.starDriftTween?.remove();
      this.boardGoalPulse?.remove(false);
      this.demoStepTimer?.remove(false);
      this.overlayManager.closeAll();
      this.input.keyboard?.off('keydown-ESC', escHandler);
      this.input.keyboard?.off('keydown-M', enterHandler);
      this.events.off(OVERLAY_EVENTS.manualPlay, launchManualPlay);
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
