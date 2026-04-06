import Phaser from 'phaser';
import { createMenuButton } from '../ui/menuButton';
import { createOverlaySheet } from '../ui/overlaySheet';

export class ModesScene extends Phaser.Scene {
  private activeMode: 'Classic' | 'Timed' | 'Endless' = 'Classic';

  public constructor() {
    super('ModesScene');
  }

  public create(): void {
    const { width } = this.scale;
    const { contentY } = createOverlaySheet(this, 'Modes', 'Choose a run style');

    const modeText = this.add
      .text(width / 2, contentY, '', {
        color: '#d8dcf3',
        fontFamily: 'monospace',
        fontSize: '18px'
      })
      .setOrigin(0.5);

    const refreshCopy = () => {
      modeText.setText(`Current: ${this.activeMode}`);
    };
    refreshCopy();

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 64,
      label: 'Classic',
      onClick: () => {
        this.activeMode = 'Classic';
        refreshCopy();
      }
    });

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 120,
      label: 'Timed',
      onClick: () => {
        this.activeMode = 'Timed';
        refreshCopy();
      }
    });

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 176,
      label: 'Endless',
      onClick: () => {
        this.activeMode = 'Endless';
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
