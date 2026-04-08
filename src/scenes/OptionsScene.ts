import Phaser from 'phaser';
import { createMenuButton } from '../ui/menuButton';
import { createOverlaySheet } from '../ui/overlaySheet';

export class OptionsScene extends Phaser.Scene {
  public constructor() {
    super('OptionsScene');
  }

  public create(): void {
    const { width } = this.scale;
    const compact = width <= 620;
    const buttonWidth = compact ? 220 : 248;
    const copyWrapWidth = compact ? Math.max(240, width * 0.68) : 360;
    const { container, contentY } = createOverlaySheet(this, 'Options', 'QA utility only. Attract mode stays on the front door');

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 104,
      label: 'QA Manual Play',
      width: buttonWidth,
      onClick: () => this.scene.get('MenuScene').events.emit('overlay-manual-play')
    });

    const copy = this.add
      .text(width / 2, contentY + 166, 'Local QA only. The public surface is the live demo. Hidden shortcut: Shift+M on the menu.', {
        color: '#c7d0e6',
        fontFamily: 'monospace',
        fontSize: compact ? '14px' : '16px',
        align: 'center',
        wordWrap: { width: copyWrapWidth }
      })
      .setOrigin(0.5)
      .setAlpha(0.82);

    createMenuButton(this, {
      x: width / 2,
      y: contentY + (compact ? 254 : 248),
      label: 'Back',
      width: compact ? 176 : undefined,
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
