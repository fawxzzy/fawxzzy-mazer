import Phaser from 'phaser';
import { legacyTuning } from '../config/tuning';
import { createOverlaySheet } from '../ui/overlaySheet';
import { createMenuButton } from '../ui/menuButton';
import { attachSfxInputUnlock, playSfx } from '../audio/proceduralSfx';

export class PauseScene extends Phaser.Scene {
  public constructor() {
    super('PauseScene');
  }

  public create(): void {
    attachSfxInputUnlock(this);
    const { width } = this.scale;
    const { container, contentY } = createOverlaySheet(this, 'Paused', 'Run is paused');

    const resumeButton = createMenuButton(this, {
      x: width / 2,
      y: contentY,
      label: 'Resume',
      onClick: () => this.emitAction('resume'),
      clickSfx: 'cancel'
    });

    const resetButton = createMenuButton(this, {
      x: width / 2,
      y: contentY + legacyTuning.overlays.listSpacingPx,
      label: 'Reset Run',
      onClick: () => this.emitAction('reset'),
      clickSfx: 'confirm'
    });

    const menuButton = createMenuButton(this, {
      x: width / 2,
      y: contentY + (legacyTuning.overlays.listSpacingPx * 2),
      label: 'Main Menu',
      onClick: () => this.emitAction('menu'),
      clickSfx: 'cancel'
    });

    container.setAlpha(0);
    container.setScale(legacyTuning.overlays.intro.pauseScaleStart);
    this.tweens.add({
      targets: container,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: legacyTuning.overlays.intro.panelDurationMs,
      y: '-=4',
      ease: 'Quad.easeOut'
    });

    [resumeButton, resetButton, menuButton].forEach((button, index) => {
      button.setAlpha(0);
      button.y += legacyTuning.overlays.intro.buttonRisePausePx;
      this.tweens.add({
        targets: button,
        alpha: 1,
        y: button.y - legacyTuning.overlays.intro.buttonRisePausePx,
        duration: legacyTuning.overlays.intro.buttonDurationMs,
        delay: legacyTuning.overlays.intro.buttonDelayStartMs + (index * legacyTuning.overlays.intro.buttonDelayStepMs),
        ease: 'Quad.easeOut'
      });
    });

    this.input.keyboard?.once('keydown-P', () => {
      playSfx('cancel');
      this.emitAction('resume');
    });
    this.input.keyboard?.once('keydown-ESC', () => {
      playSfx('cancel');
      this.emitAction('resume');
    });
  }

  private emitAction(action: 'resume' | 'menu' | 'reset'): void {
    this.scene.get('GameScene').events.emit('pause-action', { action });
  }
}
