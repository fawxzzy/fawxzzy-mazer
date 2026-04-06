import Phaser from 'phaser';
import { createMenuButton } from '../ui/menuButton';
import { createOverlaySheet } from '../ui/overlaySheet';

export class OptionsScene extends Phaser.Scene {
  private scaleIndex = 1;
  private camScaleIndex = 1;
  private readonly scaleOptions = [0.75, 1.0, 1.25] as const;
  private readonly camScaleOptions = [0.9, 1.0, 1.1] as const;

  public constructor() {
    super('OptionsScene');
  }

  public create(): void {
    const { width } = this.scale;
    const { container, contentY } = createOverlaySheet(this, 'Options', 'Compact control deck');

    const rowStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      color: '#d7ddf7',
      fontFamily: 'monospace',
      fontSize: '18px'
    };

    const scaleText = this.add
      .text(width / 2, contentY + 2, '', rowStyle)
      .setOrigin(0.5);
    const camScaleText = this.add
      .text(width / 2, contentY + 50, '', rowStyle)
      .setOrigin(0.5);

    const refresh = () => {
      scaleText.setText(`Scale: x${this.scaleOptions[this.scaleIndex].toFixed(2)}`);
      camScaleText.setText(`Cam Scale: x${this.camScaleOptions[this.camScaleIndex].toFixed(2)}`);
    };
    refresh();

    createMenuButton(this, {
      x: width / 2 - 140,
      y: contentY + 98,
      width: 164,
      label: 'Scale -',
      onClick: () => {
        this.scaleIndex = (this.scaleIndex + this.scaleOptions.length - 1) % this.scaleOptions.length;
        refresh();
      }
    });

    createMenuButton(this, {
      x: width / 2 + 140,
      y: contentY + 98,
      width: 164,
      label: 'Scale +',
      onClick: () => {
        this.scaleIndex = (this.scaleIndex + 1) % this.scaleOptions.length;
        refresh();
      }
    });

    createMenuButton(this, {
      x: width / 2 - 140,
      y: contentY + 150,
      width: 164,
      label: 'Cam -',
      onClick: () => {
        this.camScaleIndex = (this.camScaleIndex + this.camScaleOptions.length - 1) % this.camScaleOptions.length;
        refresh();
      }
    });

    createMenuButton(this, {
      x: width / 2 + 140,
      y: contentY + 150,
      width: 164,
      label: 'Cam +',
      onClick: () => {
        this.camScaleIndex = (this.camScaleIndex + 1) % this.camScaleOptions.length;
        refresh();
      }
    });

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 202,
      label: 'Features',
      width: 248,
      onClick: () => this.scene.get('MenuScene').events.emit('overlay-open', 'FeaturesScene')
    });

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 254,
      label: 'Game Modes',
      width: 248,
      onClick: () => this.scene.get('MenuScene').events.emit('overlay-open', 'ModesScene')
    });

    const advancedLabel = this.add
      .text(width / 2, contentY + 296, 'Advanced appearance is intentionally secondary.', {
        color: '#aab3d8',
        fontFamily: 'monospace',
        fontSize: '14px'
      })
      .setOrigin(0.5);

    const advancedButton = createMenuButton(this, {
      x: width / 2,
      y: contentY + 330,
      label: 'Advanced Appearance',
      width: 300,
      onClick: () => {
        advancedSheet.setVisible(true);
        advancedSheet.setDepth(20);
      }
    });

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 382,
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
        ['Path RGB channels', 'Wall RGB channels', 'future art tuning', '', 'Kept off the main Options flow by design.'].join('\n'),
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
    scaleText.setDepth(11);
    camScaleText.setDepth(11);
    advancedLabel.setDepth(11);
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
