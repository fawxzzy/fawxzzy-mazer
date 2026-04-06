import Phaser from 'phaser';
import { createMenuButton } from '../ui/menuButton';
import { createOverlaySheet } from '../ui/overlaySheet';

export class OptionsScene extends Phaser.Scene {
  public constructor() {
    super('OptionsScene');
  }

  public create(): void {
    const { width } = this.scale;
    const { container, contentY } = createOverlaySheet(this, 'Options', 'Menu-time settings');

    this.add
      .text(width / 2, contentY - 6, 'Compact options first. Advanced tuning is nested.', {
        color: '#c5c9e8',
        fontFamily: 'monospace',
        fontSize: '14px'
      })
      .setOrigin(0.5);

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 38,
      label: 'Features',
      onClick: () => this.scene.get('MenuScene').events.emit('overlay-open', 'FeaturesScene')
    });

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 94,
      label: 'Game Modes',
      onClick: () => this.scene.get('MenuScene').events.emit('overlay-open', 'ModesScene')
    });

    const advancedButton = createMenuButton(this, {
      x: width / 2,
      y: contentY + 150,
      label: 'Advanced Appearance',
      width: 320,
      onClick: () => {
        advancedSheet.setVisible(true);
        advancedSheet.setDepth(20);
      }
    });

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 214,
      label: 'Back',
      onClick: () => this.scene.get('MenuScene').events.emit('overlay-close')
    });

    const advancedSheet = this.add.container(0, 0).setVisible(false);
    const dim = this.add.rectangle(width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x040408, 0.56).setOrigin(0.5);
    const panel = this.add
      .rectangle(width / 2, this.scale.height / 2, Math.min(this.scale.width * 0.6, 520), 242, 0x11162a, 0.94)
      .setStrokeStyle(2, 0x5c6489, 0.96)
      .setOrigin(0.5);
    const title = this.add
      .text(width / 2, panel.y - 82, 'Advanced Appearance', {
        color: '#8fd7ff',
        fontFamily: 'monospace',
        fontSize: '24px'
      })
      .setOrigin(0.5);
    const copy = this.add
      .text(
        width / 2,
        panel.y - 18,
        ['Path RGB channels', 'Wall RGB channels', 'Camera/Maze scale sliders', '', 'These controls stay here to keep Options compact.'].join('\n'),
        {
          color: '#d9ddf3',
          fontFamily: 'monospace',
          fontSize: '16px',
          align: 'center',
          lineSpacing: 4
        }
      )
      .setOrigin(0.5, 0);
    const closeButton = createMenuButton(this, {
      x: width / 2,
      y: panel.y + 86,
      label: 'Close',
      onClick: () => advancedSheet.setVisible(false)
    });
    advancedSheet.add([dim, panel, title, copy, closeButton]);
    container.setDepth(10);
    advancedButton.setDepth(11);

    const escHandler = () => {
      if (advancedSheet.visible) {
        advancedSheet.setVisible(false);
        return;
      }
      this.scene.get('MenuScene').events.emit('overlay-close');
    };
    this.input.keyboard?.on('keydown-ESC', escHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', escHandler);
    });
  }
}
