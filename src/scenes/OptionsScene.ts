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
    const { container, contentY } = createOverlaySheet(this, 'Options', 'Shell tuning for this run');

    const rowStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      color: '#d7ddf7',
      fontFamily: 'monospace',
      fontSize: '18px'
    };

    const scaleText = this.add
      .text(width / 2, contentY + 2, '', rowStyle)
      .setOrigin(0.5);
    const camScaleText = this.add
      .text(width / 2, contentY + 54, '', rowStyle)
      .setOrigin(0.5);

    const refresh = () => {
      scaleText.setText(`Board Scale: x${this.scaleOptions[this.scaleIndex].toFixed(2)}`);
      camScaleText.setText(`Camera Scale: x${this.camScaleOptions[this.camScaleIndex].toFixed(2)}`);
    };
    refresh();

    createMenuButton(this, {
      x: width / 2 - 140,
      y: contentY + 104,
      width: 164,
      label: 'Scale -',
      onClick: () => {
        this.scaleIndex = (this.scaleIndex + this.scaleOptions.length - 1) % this.scaleOptions.length;
        refresh();
      }
    });

    createMenuButton(this, {
      x: width / 2 + 140,
      y: contentY + 104,
      width: 164,
      label: 'Scale +',
      onClick: () => {
        this.scaleIndex = (this.scaleIndex + 1) % this.scaleOptions.length;
        refresh();
      }
    });

    createMenuButton(this, {
      x: width / 2 - 140,
      y: contentY + 156,
      width: 164,
      label: 'Camera -',
      onClick: () => {
        this.camScaleIndex = (this.camScaleIndex + this.camScaleOptions.length - 1) % this.camScaleOptions.length;
        refresh();
      }
    });

    createMenuButton(this, {
      x: width / 2 + 140,
      y: contentY + 156,
      width: 164,
      label: 'Camera +',
      onClick: () => {
        this.camScaleIndex = (this.camScaleIndex + 1) % this.camScaleOptions.length;
        refresh();
      }
    });

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 216,
      label: 'Features',
      width: 248,
      onClick: () => this.scene.get('MenuScene').events.emit('overlay-open', 'FeaturesScene')
    });

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 268,
      label: 'Modes',
      width: 248,
      onClick: () => this.scene.get('MenuScene').events.emit('overlay-open', 'ModesScene')
    });

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 332,
      label: 'Back',
      onClick: () => this.scene.get('MenuScene').events.emit('overlay-close')
    });

    container.setDepth(10);
    scaleText.setDepth(11);
    camScaleText.setDepth(11);

    const escHandler = () => {
      this.scene.get('MenuScene').events.emit('overlay-close');
    };
    this.input.keyboard?.on('keydown-ESC', escHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', escHandler);
    });
  }
}
