import Phaser from 'phaser';
import { createMenuButton } from '../ui/menuButton';
import { createOverlaySheet } from '../ui/overlaySheet';

export class OptionsScene extends Phaser.Scene {
  public constructor() {
    super('OptionsScene');
  }

  public create(): void {
    const { width } = this.scale;
    const { container, contentY } = createOverlaySheet(this, 'Options', 'Attract mode stays on the front door');

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 104,
      label: 'Manual Play',
      width: 248,
      onClick: () => this.scene.get('MenuScene').events.emit('overlay-manual-play')
    });

    const copy = this.add
      .text(width / 2, contentY + 164, 'Local QA only. The public surface is the live demo.', {
        color: '#c7d0e6',
        fontFamily: 'monospace',
        fontSize: '16px',
        align: 'center',
        wordWrap: { width: 360 }
      })
      .setOrigin(0.5)
      .setAlpha(0.82);

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 250,
      label: 'Back',
      onClick: () => this.scene.get('MenuScene').events.emit('overlay-close')
    });

    container.setDepth(10);
    copy.setDepth(11);

    const escHandler = () => {
      this.scene.get('MenuScene').events.emit('overlay-close');
    };
    this.input.keyboard?.on('keydown-ESC', escHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', escHandler);
    });
  }
}
