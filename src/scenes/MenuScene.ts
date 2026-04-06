import Phaser from 'phaser';
import { createDemoWalkerState, stepDemoWalker } from '../domain/ai';
import { generateMaze } from '../domain/maze/generator';
import { createBoardLayout, BoardRenderer } from '../render/boardRenderer';
import { palette } from '../render/palette';
import { legacyTuning, resolveBoardScaleFromCamScale } from '../config/tuning';
import { OverlayManager } from '../ui/overlayManager';
import { createMenuButton } from '../ui/menuButton';

const OVERLAY_EVENTS = {
  open: 'overlay-open',
  close: 'overlay-close'
} as const;

export class MenuScene extends Phaser.Scene {
  private overlayManager!: OverlayManager;
  private titlePulseTween?: Phaser.Tweens.Tween;
  private starDriftTween?: Phaser.Tweens.Tween;
  private boardGoalPulse?: Phaser.Time.TimerEvent;

  public constructor() {
    super('MenuScene');
  }

  public create(): void {
    const { width, height } = this.scale;
    this.overlayManager = new OverlayManager(this, ['OptionsScene', 'FeaturesScene', 'ModesScene']);

    this.cameras.main.fadeIn(280, 0, 0, 0);
    this.drawStarfield(width, height);

    const maze = generateMaze({
      scale: legacyTuning.board.scale,
      seed: 1988,
      checkPointModifier: legacyTuning.board.checkPointModifier,
      shortcutCountModifier: legacyTuning.board.shortcutCountModifier.menu
    });

    const layout = createBoardLayout(this, maze, {
      boardScale: (width < 900 ? legacyTuning.menu.layout.boardScaleNarrow : legacyTuning.menu.layout.boardScaleWide)
        + (resolveBoardScaleFromCamScale(legacyTuning.camera.camScaleDefault) - legacyTuning.camera.normalizedBaseline),
      topReserve: Math.max(legacyTuning.menu.layout.topReserveMinPx, Math.round(height * legacyTuning.menu.layout.topReserveRatio)),
      bottomPadding: legacyTuning.menu.layout.bottomPaddingPx
    });
    const boardRenderer = new BoardRenderer(this, maze, layout);
    boardRenderer.drawBoardChrome();
    boardRenderer.drawBase();
    boardRenderer.drawGoal();

    const boardShade = this.add
      .rectangle(
        layout.boardX + layout.boardSize / 2,
        layout.boardY + layout.boardSize / 2,
        layout.boardSize,
        layout.boardSize,
        0x8a8a9a,
        0.2
      )
      .setOrigin(0.5)
      .setBlendMode(Phaser.BlendModes.SCREEN);

    const title = this.add
      .text(width / 2, layout.boardY + legacyTuning.menu.title.yOffsetFromBoardTop, legacyTuning.menu.title.text, {
        color: '#22af3f',
        fontFamily: 'monospace',
        fontSize: `${Math.round(layout.boardSize * legacyTuning.menu.title.fontScaleToBoard)}px`,
        fontStyle: 'bold'
      })
      .setOrigin(0.5)
      .setAlpha(legacyTuning.menu.title.alpha)
      .setStroke('#0a561b', legacyTuning.menu.title.strokePx)
      .setShadow(0, 0, '#123f1d', legacyTuning.menu.title.shadowBlur, true, true)
      .setDepth(10);

    const subtitle = this.add
      .text(width / 2, title.y + legacyTuning.menu.subtitle.yOffsetFromTitle, legacyTuning.menu.subtitle.text, {
        color: '#aeb6d9',
        fontFamily: 'monospace',
        fontSize: `${legacyTuning.menu.subtitle.fontSizePx}px`
      })
      .setOrigin(0.5)
      .setDepth(10);

    this.titlePulseTween = this.tweens.add({
      targets: [title, boardShade],
      alpha: {
        from: legacyTuning.menu.title.pulseMinAlpha,
        to: legacyTuning.menu.title.pulseMaxAlpha
      },
      duration: legacyTuning.menu.title.pulseDurationMs,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    const demo = createDemoWalkerState(maze);
    boardRenderer.drawTrail(demo.trailIndices);
    boardRenderer.drawActor(demo.currentIndex);

    this.time.addEvent({
      delay: legacyTuning.demo.stepMs,
      loop: true,
      callback: () => {
        const next = stepDemoWalker(maze, demo);
        demo.currentIndex = next.currentIndex;
        demo.trailIndices = next.trailIndices;
        demo.alternatives = next.alternatives;
        demo.visited = next.visited;
        demo.loops = next.loops;
        demo.reachedGoal = next.reachedGoal;

        boardRenderer.drawTrail(demo.trailIndices);
        boardRenderer.drawActor(demo.currentIndex);
      }
    });

    this.boardGoalPulse = this.time.addEvent({
      delay: legacyTuning.demo.goalPulseMs,
      loop: true,
      callback: () => {
        boardRenderer.drawGoal();
      }
    });

    const buttonY = height - legacyTuning.menu.buttons.laneBottomOffset;
    const spacing = Phaser.Math.Clamp(
      Math.round(width * legacyTuning.menu.buttons.spacingRatio),
      legacyTuning.menu.buttons.spacingMinPx,
      legacyTuning.menu.buttons.spacingMaxPx
    );

    const playButton = createMenuButton(this, {
      x: width / 2,
      y: buttonY,
      label: legacyTuning.menu.labels[0],
      width: legacyTuning.menu.buttons.widths.center,
      onClick: () => {
        this.overlayManager.closeAll();
        this.cameras.main.fadeOut(120, 0, 0, 0);
        this.time.delayedCall(120, () => this.scene.start('GameScene'));
      }
    });

    const optionsButton = createMenuButton(this, {
      x: width / 2 + spacing,
      y: buttonY,
      label: legacyTuning.menu.labels[1],
      width: legacyTuning.menu.buttons.widths.right,
      onClick: () => this.events.emit(OVERLAY_EVENTS.open, 'OptionsScene')
    });

    const quitButton = createMenuButton(this, {
      x: width / 2 - spacing,
      y: buttonY,
      label: legacyTuning.menu.labels[2],
      width: legacyTuning.menu.buttons.widths.left,
      onClick: () => {
        this.overlayManager.closeAll();
        this.game.destroy(true);
      }
    });

    const buttons = [quitButton, playButton, optionsButton];
    buttons.forEach((button, index) => {
      button.setAlpha(0);
      button.y += legacyTuning.menu.buttons.introRisePx;
      this.tweens.add({
        targets: button,
        alpha: 1,
        y: button.y - legacyTuning.menu.buttons.introRisePx,
        duration: legacyTuning.menu.buttons.introDurationMs,
        ease: 'Quad.easeOut',
        delay: legacyTuning.menu.buttons.introDelayStartMs + (index * legacyTuning.menu.buttons.introDelayStepMs)
      });
    });

    this.events.on(OVERLAY_EVENTS.open, (key: string) => this.overlayManager.open(key));
    this.events.on(OVERLAY_EVENTS.close, () => this.overlayManager.closeActive());

    this.input.keyboard?.on('keydown-ESC', () => {
      this.overlayManager.closeActive();
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.titlePulseTween?.remove();
      this.starDriftTween?.remove();
      this.boardGoalPulse?.remove(false);
      this.overlayManager.closeAll();
    });

    subtitle.setDepth(11);
  }

  private drawStarfield(width: number, height: number): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(palette.background.deepSpace, palette.background.deepSpace, palette.background.nebula, palette.background.nebula, 1);
    bg.fillRect(0, 0, width, height);

    const clouds = this.add.graphics();
    for (let i = 0; i < legacyTuning.menu.starfield.cloudCount; i += 1) {
      const x = Phaser.Math.Between(width * 0.12, width * 0.88);
      const y = Phaser.Math.Between(height * 0.16, height * 0.84);
      const radius = Phaser.Math.Between(legacyTuning.menu.starfield.cloudRadiusMin, legacyTuning.menu.starfield.cloudRadiusMax);
      clouds.fillStyle(palette.background.cloud, Phaser.Math.FloatBetween(legacyTuning.menu.starfield.cloudAlphaMin, legacyTuning.menu.starfield.cloudAlphaMax));
      clouds.fillCircle(x, y, radius);
    }

    const stars = this.add.graphics();
    for (let i = 0; i < legacyTuning.menu.starfield.starCount; i += 1) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(0, height);
      const r = Phaser.Math.FloatBetween(legacyTuning.menu.starfield.starRadiusMin, legacyTuning.menu.starfield.starRadiusMax);
      stars.fillStyle(palette.background.star, Phaser.Math.FloatBetween(legacyTuning.menu.starfield.starAlphaMin, legacyTuning.menu.starfield.starAlphaMax));
      stars.fillCircle(x, y, r);
    }

    this.starDriftTween = this.tweens.add({
      targets: stars,
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
