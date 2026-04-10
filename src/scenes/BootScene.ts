import Phaser from 'phaser';
import { DEFAULT_PRESENTATION_VARIANT, resolveBootPresentationVariant } from '../boot/presentation';

export class BootScene extends Phaser.Scene {
  public constructor() {
    super('BootScene');
  }

  public preload(): void {
    // Intentionally empty for foundation wave.
  }

  public create(): void {
    let presentation = DEFAULT_PRESENTATION_VARIANT;

    try {
      presentation = resolveBootPresentationVariant();
    } catch (error) {
      console.error('BootScene presentation resolution failed; falling back to title.', error);
    }

    try {
      this.scene.start('MenuScene', {
        presentation
      });
    } catch (error) {
      console.error('BootScene failed to start MenuScene; rendering recovery shell.', error);
      this.renderRecoveryShell();
    }
  }

  private renderRecoveryShell(): void {
    const width = resolveSceneDimension(this.scale.width, this.cameras.main?.width, 1280);
    const height = resolveSceneDimension(this.scale.height, this.cameras.main?.height, 720);

    this.cameras.main.setBackgroundColor('#101018');
    this.add.rectangle(width / 2, height / 2, width, height, 0x101018, 1).setOrigin(0.5);
    this.add.text(width / 2, Math.max(48, height * 0.34), 'Mazer', {
      color: '#75f78f',
      fontFamily: 'monospace',
      fontSize: `${Math.max(36, Math.round(Math.min(width, height) * 0.085))}px`,
      fontStyle: 'bold'
    }).setOrigin(0.5);
    this.add.text(width / 2, Math.max(92, height * 0.46), '\u00b0 by fawxzzy', {
      color: '#a5d7af',
      fontFamily: '"Courier New", monospace',
      fontSize: '14px'
    }).setOrigin(0.5);
    this.add.text(width / 2, Math.max(124, height * 0.54), 'recovery demo', {
      color: '#d7deef',
      fontFamily: '"Courier New", monospace',
      fontSize: '12px'
    }).setOrigin(0.5);
  }
}

const resolveSceneDimension = (primary: number | undefined, secondary: number | undefined, fallback: number): number => {
  const candidate = typeof primary === 'number' && Number.isFinite(primary) && primary > 0
    ? primary
    : secondary;

  return typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0
    ? candidate
    : fallback;
};
