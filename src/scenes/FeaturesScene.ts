import Phaser from 'phaser';
import { createMenuButton } from '../ui/menuButton';
import { createOverlaySheet } from '../ui/overlaySheet';

export class FeaturesScene extends Phaser.Scene {
  private cameraFollow = true;
  private trailFade = true;

  public constructor() {
    super('FeaturesScene');
  }

  public create(): void {
    const { width } = this.scale;
    const { contentY } = createOverlaySheet(this, 'Features', 'Classic toggle sheet');

    const cameraText = this.add
      .text(width / 2, contentY + 2, '', {
        color: '#d8dcf3',
        fontFamily: 'monospace',
        fontSize: '17px'
      })
      .setOrigin(0.5);

    const trailText = this.add
      .text(width / 2, contentY + 56, '', {
        color: '#d8dcf3',
        fontFamily: 'monospace',
        fontSize: '17px'
      })
      .setOrigin(0.5);

    const refreshCopy = () => {
      cameraText.setText(`Camera Follow: ${this.cameraFollow ? 'ON' : 'OFF'}`);
      trailText.setText(`Trail Fade: ${this.trailFade ? 'ON' : 'OFF'}`);
    };
    refreshCopy();

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 118,
      label: 'Toggle Camera Follow',
      width: 320,
      onClick: () => {
        this.cameraFollow = !this.cameraFollow;
        refreshCopy();
      }
    });

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 174,
      label: 'Toggle Trail Fade',
      width: 320,
      onClick: () => {
        this.trailFade = !this.trailFade;
        refreshCopy();
      }
    });

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 242,
      label: 'Back to Options',
      width: 280,
      onClick: () => this.scene.get('MenuScene').events.emit('overlay-open', 'OptionsScene')
    });

    const escHandler = () => this.scene.get('MenuScene').events.emit('overlay-open', 'OptionsScene');
    this.input.keyboard?.on('keydown-ESC', escHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', escHandler);
    });
  }
}
