import Phaser from 'phaser';
import { createOverlaySheet } from '../ui/overlaySheet';
import { createMenuButton } from '../ui/menuButton';

export class WinScene extends Phaser.Scene {
  public constructor() {
    super('WinScene');
  }

  public create(): void {
    const { width } = this.scale;
    const { container, contentY } = createOverlaySheet(this, 'Maze Complete', 'You reached the goal');

    const resetButton = createMenuButton(this, {
      x: width / 2,
      y: contentY,
      label: 'Reset Run',
      onClick: () => this.emitAction('reset-run')
    });

    const newMazeButton = createMenuButton(this, {
      x: width / 2,
      y: contentY + 54,
      label: 'New Maze',
      onClick: () => this.emitAction('new-maze')
    });

    const menuButton = createMenuButton(this, {
      x: width / 2,
      y: contentY + 108,
      label: 'Main Menu',
      onClick: () => this.emitAction('menu')
    });

    container.setAlpha(0);
    container.setScale(0.975);
    this.tweens.add({
      targets: container,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 180,
      ease: 'Quad.easeOut'
    });

    [resetButton, newMazeButton, menuButton].forEach((button, index) => {
      button.setAlpha(0);
      button.y += 8;
      this.tweens.add({
        targets: button,
        alpha: 1,
        y: button.y - 8,
        duration: 160,
        delay: 80 + (index * 45),
        ease: 'Quad.easeOut'
      });
    });

    this.input.keyboard?.once('keydown-ESC', () => this.emitAction('menu'));
  }

  private emitAction(action: 'reset-run' | 'new-maze' | 'menu'): void {
    this.scene.get('GameScene').events.emit('win-action', { action });
  }
}
