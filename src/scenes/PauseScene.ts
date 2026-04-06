import Phaser from 'phaser';
import { createOverlaySheet } from '../ui/overlaySheet';
import { createMenuButton } from '../ui/menuButton';

export class PauseScene extends Phaser.Scene {
  public constructor() {
    super('PauseScene');
  }

  public create(): void {
    const { width } = this.scale;
    const { contentY } = createOverlaySheet(this, 'Paused', 'Run is paused');

    createMenuButton(this, {
      x: width / 2,
      y: contentY,
      label: 'Resume',
      onClick: () => this.emitAction('resume')
    });

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 54,
      label: 'Reset Run',
      onClick: () => this.emitAction('reset')
    });

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 108,
      label: 'Main Menu',
      onClick: () => this.emitAction('menu')
    });

    this.input.keyboard?.once('keydown-P', () => this.emitAction('resume'));
    this.input.keyboard?.once('keydown-ESC', () => this.emitAction('resume'));
  }

  private emitAction(action: 'resume' | 'menu' | 'reset'): void {
    this.scene.get('GameScene').events.emit('pause-action', { action });
  }
}
