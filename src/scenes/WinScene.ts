import Phaser from 'phaser';
import { legacyTuning } from '../config/tuning';
import { createOverlaySheet } from '../ui/overlaySheet';
import { createMenuButton } from '../ui/menuButton';
import { attachSfxInputUnlock, playSfx } from '../audio/proceduralSfx';
import type { WinSummaryData } from './gameSceneSummary';

export class WinScene extends Phaser.Scene {
  private actionLocked = false;
  private overlayContainer?: Phaser.GameObjects.Container;

  public constructor() {
    super('WinScene');
  }

  public create(data?: WinSummaryData): void {
    attachSfxInputUnlock(this);
    const { width } = this.scale;
    const { container, contentY } = createOverlaySheet(
      this,
      data?.title ?? 'Maze Complete',
      data?.subtitle ?? 'CORE SECURED',
      {
        heightRatio: 0.76,
        maxSheetHeight: 470
      }
    );
    this.actionLocked = false;
    this.overlayContainer = container;

    const detailLines = data?.detailLines ?? [];
    detailLines.forEach((line, index) => {
      container.add(this.add
        .text(width / 2, contentY + (index * 24), line, {
          color: line.includes('NEW BEST') ? '#c8ffd0' : '#d7deef',
          fontFamily: '"Courier New", monospace',
          fontSize: '15px',
          fontStyle: line.includes('NEW BEST') ? 'bold' : 'normal'
        })
        .setOrigin(0.5, 0.5)
        .setAlpha(line.includes('NEW BEST') ? 0.98 : 0.88));
    });

    const buttonBaseY = contentY + (detailLines.length * 24) + 28;
    const playAgainButton = createMenuButton(this, {
      x: width / 2,
      y: buttonBaseY,
      label: 'Play Again',
      onClick: () => this.emitAction('play-again', 74),
      clickSfx: 'confirm'
    });

    const newMazeButton = createMenuButton(this, {
      x: width / 2,
      y: buttonBaseY + legacyTuning.overlays.listSpacingPx,
      label: 'Next Maze',
      onClick: () => this.emitAction('next-maze', 82),
      clickSfx: 'confirm'
    });

    const menuButton = createMenuButton(this, {
      x: width / 2,
      y: buttonBaseY + (legacyTuning.overlays.listSpacingPx * 2),
      label: 'Back To Menu',
      onClick: () => this.emitAction('menu', 78),
      clickSfx: 'cancel'
    });

    container.setAlpha(0);
    container.setScale(legacyTuning.overlays.intro.winScaleStart);
    this.tweens.add({
      targets: container,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: legacyTuning.overlays.intro.panelDurationMs,
      y: '-=6',
      ease: 'Back.easeOut'
    });

    [playAgainButton, newMazeButton, menuButton].forEach((button, index) => {
      button.setAlpha(0);
      button.y += legacyTuning.overlays.intro.buttonRiseWinPx;
      this.tweens.add({
        targets: button,
        alpha: 1,
        y: button.y - legacyTuning.overlays.intro.buttonRiseWinPx,
        duration: legacyTuning.overlays.intro.buttonDurationMs,
        delay: legacyTuning.overlays.intro.buttonDelayStartMs + (index * legacyTuning.overlays.intro.buttonDelayStepMs),
        ease: 'Quad.easeOut'
      });
    });

    this.input.keyboard?.once('keydown-ENTER', () => {
      playSfx('confirm');
      this.emitAction('play-again', 52);
    });
    this.input.keyboard?.once('keydown-N', () => {
      playSfx('confirm');
      this.emitAction('next-maze', 56);
    });
    this.input.keyboard?.once('keydown-ESC', () => {
      playSfx('cancel');
      this.emitAction('menu', 56);
    });
  }

  private emitAction(action: 'menu' | 'next-maze' | 'play-again', delayMs = 82): void {
    if (this.actionLocked) {
      return;
    }

    this.actionLocked = true;
    this.input.enabled = false;
    if (this.overlayContainer) {
      this.tweens.add({
        targets: this.overlayContainer,
        scaleX: 0.991,
        scaleY: 0.991,
        duration: Math.max(46, delayMs - 10),
        yoyo: true,
        ease: 'Sine.easeOut'
      });
    }

    this.time.delayedCall(delayMs, () => {
      if (this.scene.isActive()) {
        this.scene.get('GameScene').events.emit('win-action', { action });
      }
    });
  }
}
