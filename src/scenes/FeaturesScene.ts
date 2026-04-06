import Phaser from 'phaser';
import { createMenuButton } from '../ui/menuButton';
import { createOverlaySheet } from '../ui/overlaySheet';

export class FeaturesScene extends Phaser.Scene {
  private cameraFollow = true;
  private trailFade = true;
  private hintPulse?: Phaser.Tweens.Tween;

  public constructor() {
    super('FeaturesScene');
  }

  public create(): void {
    const { width } = this.scale;
    const { container, contentY } = createOverlaySheet(this, 'Features', 'Retro runtime toggles');

    const cameraText = this.add
      .text(width / 2, contentY + 2, '', {
        color: '#d8f5ff',
        fontFamily: 'monospace',
        fontSize: '18px'
      })
      .setOrigin(0.5);

    const trailText = this.add
      .text(width / 2, contentY + 56, '', {
        color: '#d8f5ff',
        fontFamily: 'monospace',
        fontSize: '18px'
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

    const hint = this.add
      .text(width / 2, contentY + 292, 'ESC returns to Options', {
        color: '#9daad5',
        fontFamily: 'monospace',
        fontSize: '14px'
      })
      .setOrigin(0.5);

    this.hintPulse = this.tweens.add({
      targets: hint,
      alpha: { from: 0.45, to: 0.9 },
      duration: 1200,
      yoyo: true,
      repeat: -1
    });

    container.setDepth(10);
    cameraText.setDepth(11);
    trailText.setDepth(11);
    hint.setDepth(11);

    const escHandler = () => this.scene.get('MenuScene').events.emit('overlay-open', 'OptionsScene');
    this.input.keyboard?.on('keydown-ESC', escHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', escHandler);
      this.hintPulse?.remove();
    });
  }
}
