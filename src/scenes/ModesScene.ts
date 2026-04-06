import Phaser from 'phaser';
import { createMenuButton } from '../ui/menuButton';
import { createOverlaySheet } from '../ui/overlaySheet';

export class ModesScene extends Phaser.Scene {
  public constructor() {
    super('ModesScene');
  }

  public create(): void {
    const { width } = this.scale;
    const { contentY } = createOverlaySheet(this, 'Modes', 'Choose a path style');

    this.add
      .text(width / 2, contentY, 'Classic / Timed / Endless mode shells.', {
        color: '#e9f0ff',
        fontFamily: 'monospace',
        fontSize: '16px'
      })
      .setOrigin(0.5);

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 84,
      label: 'Back to Options',
      width: 280,
      onClick: () => this.scene.get('MenuScene').events.emit('overlay-open', 'OptionsScene')
    });
  }
}
