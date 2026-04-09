import Phaser from 'phaser';
import { resolveDemoWalkerViewFrame, type DemoWalkerConfig, type DemoWalkerCue } from '../domain/ai';
import { disposeMazeEpisode, generateMaze, PatternEngine, type PatternFrame } from '../domain/maze';
import { createBoardLayout, BoardRenderer } from '../render/boardRenderer';
import { createDemoStatusHud } from '../render/hudRenderer';
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
      boardRenderer.drawBase({ showSolutionPath: true });
      boardRenderer.drawStart('spawn');
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

      const demoStatusHud = createDemoStatusHud(
        this,
        width / 2,
        Math.max(titleY + (titlePlateHeight / 2) + 26, layout.boardY - 22),
        layout.boardWidth * 0.9
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
      document.addEventListener('visibilitychange', handleVisibilityChange);
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

      const playPrompt = this.createPlayPrompt(
        width / 2,
        layout.boardY + layout.boardHeight + Math.max(28, isNarrow ? 24 : 30),
        Math.min(layout.boardWidth * 0.92, width - 32),
        launchManualPlay
      );
      playPrompt.setAlpha(0);
      playPrompt.y += 5;
      this.tweens.add({
        targets: playPrompt,
        alpha: 1,
        y: playPrompt.y - 5,
        duration: 220,
        delay: 120,
        ease: 'Quad.easeOut'
      });

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
        const shouldPlay = event.code === 'Enter'
          || event.code === 'Space'
          || (event.code === 'KeyM' && event.shiftKey);
        if (!this.overlayManager.isOverlayActive() && shouldPlay) {
          launchManualPlay();
        }
      };
    this.input.keyboard?.on('keydown-ESC', escHandler);
    this.input.keyboard?.on('keydown', manualShortcutHandler);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.titlePulseTween?.remove();
        this.starDriftTween?.remove();
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        this.events.off(Phaser.Scenes.Events.UPDATE, updateDemo);
        this.overlayManager.closeAll();
        demoStatusHud.destroy();
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

  private createPlayPrompt(
    x: number,
    y: number,
    width: number,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const isTouchPrimary = window.matchMedia('(pointer: coarse)').matches;
    const plate = this.add.graphics();
    const prompt = this.add
      .text(0, -8, 'REACH THE RED CORE', {
        color: '#d7ffde',
        fontFamily: '"Courier New", monospace',
        fontSize: `${isTouchPrimary ? 12 : 13}px`,
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    const cta = this.add
      .text(0, 11, isTouchPrimary ? 'TAP TO PLAY' : 'ENTER / SPACE TO PLAY', {
        color: '#9ec9ff',
        fontFamily: '"Courier New", monospace',
        fontSize: `${isTouchPrimary ? 10 : 11}px`
      })
      .setOrigin(0.5)
      .setAlpha(0.84);
    const hit = this.add
      .rectangle(0, 0, width, 40, 0x000000, 0.001)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    const container = this.add.container(x, y, [plate, prompt, cta, hit]).setDepth(12);
    let hovered = false;

    const draw = (pressed: boolean): void => {
      plate.clear();
      plate.fillStyle(palette.ui.buttonFill, hovered ? 0.72 : 0.58);
      plate.fillRoundedRect(-width / 2, -20, width, 40, 8);
      plate.lineStyle(1, palette.board.outerStroke, hovered ? 0.94 : 0.7);
      plate.strokeRoundedRect(-width / 2 + 0.5, -19.5, width - 1, 39, 8);
      plate.lineStyle(1, palette.board.innerStroke, hovered ? 0.4 : 0.24);
      plate.strokeRoundedRect(-width / 2 + 3.5, -16.5, width - 7, 33, 6);
      prompt.setAlpha(pressed ? 0.92 : 1);
      cta.setAlpha(pressed ? 0.96 : hovered ? 0.94 : 0.84);
    };

    hit.on('pointerover', () => {
      hovered = true;
      this.tweens.add({
        targets: container,
        scaleX: 1.018,
        scaleY: 1.018,
        duration: 90,
        ease: 'Sine.easeOut'
      });
      draw(false);
      playSfx('move');
    });
    hit.on('pointerout', () => {
      hovered = false;
      this.tweens.add({
        targets: container,
        scaleX: 1,
        scaleY: 1,
        duration: 90,
        ease: 'Sine.easeOut'
      });
      draw(false);
    });
    hit.on('pointerdown', () => {
      draw(true);
      playSfx('confirm');
    });
    hit.on('pointerup', () => {
      draw(false);
      onClick();
    });

    draw(false);
    return container;
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

const resolveDemoConfig = (episode: PatternFrame['episode']): DemoWalkerConfig => ({
  ...legacyTuning.demo,
  cadence: {
    ...legacyTuning.demo.cadence,
    spawnHoldMs: legacyTuning.demo.cadence.spawnHoldMs
      + (episode.difficulty === 'chill'
        ? 120
        : episode.difficulty === 'standard'
          ? 60
          : 0),
    goalHoldMs: legacyTuning.demo.cadence.goalHoldMs
      + (episode.difficulty === 'brutal'
        ? 100
        : 0),
    resetHoldMs: legacyTuning.demo.cadence.resetHoldMs
      + (episode.difficulty === 'chill' ? 40 : 0)
  }
});

const resolveDemoTrailWindow = (episode: PatternFrame['episode']): number => {
  switch (episode.difficulty) {
    case 'chill':
      return 18;
    case 'standard':
      return 22;
    case 'spicy':
      return 26;
    case 'brutal':
      return 30;
    default:
      return 22;
  }
};
