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
      data?.subtitle ?? 'You reached the goal'
    );
    this.actionLocked = false;
    this.overlayContainer = container;

    const resetButton = createMenuButton(this, {
      x: width / 2,
      y: contentY,
      label: 'Reset Run',
      onClick: () => this.emitAction('reset-run', 84),
      clickSfx: 'confirm'
    });

    const newMazeButton = createMenuButton(this, {
      x: width / 2,
      y: contentY + legacyTuning.overlays.listSpacingPx,
      label: 'New Maze',
      onClick: () => this.emitAction('new-maze', 92),
      clickSfx: 'confirm'
    });

    const menuButton = createMenuButton(this, {
      x: width / 2,
      y: contentY + (legacyTuning.overlays.listSpacingPx * 2),
      label: 'Main Menu',
      onClick: () => this.emitAction('menu', 82),
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

    [resetButton, newMazeButton, menuButton].forEach((button, index) => {
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

    this.input.keyboard?.once('keydown-ESC', () => {
      playSfx('cancel');
      this.emitAction('menu', 56);
    });
  }

  private emitAction(action: 'reset-run' | 'new-maze' | 'menu', delayMs = 82): void {
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
