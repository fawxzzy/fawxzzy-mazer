import Phaser from 'phaser';
import { createMenuButton } from '../ui/menuButton';
import { createOverlaySheet } from '../ui/overlaySheet';

export class OptionsScene extends Phaser.Scene {
  public constructor() {
    super('OptionsScene');
  }

  public create(): void {
    const { width } = this.scale;
    const { contentY } = createOverlaySheet(this, 'Options', 'Retro menu shell');

    createMenuButton(this, {
      x: width / 2,
      y: contentY,
      label: 'Features',
      onClick: () => this.scene.get('MenuScene').events.emit('overlay-open', 'FeaturesScene')
    });

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 56,
      label: 'Modes',
      onClick: () => this.scene.get('MenuScene').events.emit('overlay-open', 'ModesScene')
    });

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 112,
      label: 'Advanced Appearance',
      width: 320,
      onClick: () => undefined
    });

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 182,
      label: 'Back',
      onClick: () => this.scene.get('MenuScene').events.emit('overlay-close')
    });

    this.input.keyboard?.once('keydown-ESC', () => {
      this.scene.get('MenuScene').events.emit('overlay-close');
    });
  }
}
