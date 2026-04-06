import Phaser from 'phaser';
import { createOverlaySheet } from '../ui/overlaySheet';
import { createMenuButton } from '../ui/menuButton';

export class WinScene extends Phaser.Scene {
  public constructor() {
    super('WinScene');
  }

  public create(): void {
    const { width } = this.scale;
    const { contentY } = createOverlaySheet(this, 'Maze Complete', 'You reached the goal');

    createMenuButton(this, {
      x: width / 2,
      y: contentY,
      label: 'Reset Run',
      onClick: () => this.emitAction('reset-run')
    });

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 54,
      label: 'New Maze',
      onClick: () => this.emitAction('new-maze')
    });

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 108,
      label: 'Main Menu',
      onClick: () => this.emitAction('menu')
    });

    this.input.keyboard?.once('keydown-ESC', () => this.emitAction('menu'));
  }

  private emitAction(action: 'reset-run' | 'new-maze' | 'menu'): void {
    this.scene.get('GameScene').events.emit('win-action', { action });
  }
}
