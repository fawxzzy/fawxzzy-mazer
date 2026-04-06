import Phaser from 'phaser';
import { createOverlaySheet } from '../ui/overlaySheet';
import { createMenuButton } from '../ui/menuButton';

export class PauseScene extends Phaser.Scene {
  public constructor() {
    super('PauseScene');
  }

  public create(): void {
    const { width } = this.scale;
    const { container, contentY } = createOverlaySheet(this, 'Paused', 'Run is paused');

    const resumeButton = createMenuButton(this, {
      x: width / 2,
      y: contentY,
      label: 'Resume',
      onClick: () => this.emitAction('resume')
    });

    const resetButton = createMenuButton(this, {
      x: width / 2,
      y: contentY + 54,
      label: 'Reset Run',
      onClick: () => this.emitAction('reset')
    });

    const menuButton = createMenuButton(this, {
      x: width / 2,
      y: contentY + 108,
      label: 'Main Menu',
      onClick: () => this.emitAction('menu')
    });

    container.setAlpha(0);
    container.setScale(0.98);
    this.tweens.add({
      targets: container,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 170,
      ease: 'Quad.easeOut'
    });

    [resumeButton, resetButton, menuButton].forEach((button, index) => {
      button.setAlpha(0);
      button.y += 6;
      this.tweens.add({
        targets: button,
        alpha: 1,
        y: button.y - 6,
        duration: 150,
        delay: 70 + (index * 40),
        ease: 'Quad.easeOut'
      });
    });

    this.input.keyboard?.once('keydown-P', () => this.emitAction('resume'));
    this.input.keyboard?.once('keydown-ESC', () => this.emitAction('resume'));
  }

  private emitAction(action: 'resume' | 'menu' | 'reset'): void {
    this.scene.get('GameScene').events.emit('pause-action', { action });
  }
}
