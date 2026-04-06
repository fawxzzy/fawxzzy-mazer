import Phaser from 'phaser';
import { createMenuButton } from '../ui/menuButton';
import { createOverlaySheet } from '../ui/overlaySheet';

export class ModesScene extends Phaser.Scene {
  private activeMode: 'Classic' | 'Timed' | 'Endless' = 'Classic';
  private modeText!: Phaser.GameObjects.Text;

  public constructor() {
    super('ModesScene');
  }

  public create(): void {
    const { width } = this.scale;
    const { container, contentY } = createOverlaySheet(this, 'Game Modes', 'Choose a run style');

    this.modeText = this.add
      .text(width / 2, contentY, '', {
        color: '#d8f5ff',
        fontFamily: 'monospace',
        fontSize: '20px'
      })
      .setOrigin(0.5);
    this.refreshCopy();

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 64,
      label: 'Classic',
      onClick: () => {
        this.activeMode = 'Classic';
        this.refreshCopy();
      }
    });

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 120,
      label: 'Timed',
      onClick: () => {
        this.activeMode = 'Timed';
        this.refreshCopy();
      }
    });

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 176,
      label: 'Endless',
      onClick: () => {
        this.activeMode = 'Endless';
        this.refreshCopy();
      }
    });

    createMenuButton(this, {
      x: width / 2,
      y: contentY + 242,
      label: 'Back to Options',
      width: 280,
      onClick: () => this.scene.get('MenuScene').events.emit('overlay-open', 'OptionsScene')
    });

    container.setDepth(10);
    this.modeText.setDepth(11);

    const escHandler = () => this.scene.get('MenuScene').events.emit('overlay-open', 'OptionsScene');
    this.input.keyboard?.on('keydown-ESC', escHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', escHandler);
    });
  }

  private refreshCopy(): void {
    this.modeText.setText(`Current: ${this.activeMode}`);
  }
}
