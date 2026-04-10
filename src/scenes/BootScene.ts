import Phaser from 'phaser';
import { DEFAULT_PRESENTATION_LAUNCH_CONFIG, resolveBootPresentationConfig } from '../boot/presentation';
import { resolveSceneViewport } from '../render/viewport';

export class BootScene extends Phaser.Scene {
  public constructor() {
    super('BootScene');
  }

  public preload(): void {
    // Intentionally empty for foundation wave.
  }

  public create(): void {
    let launchConfig = { ...DEFAULT_PRESENTATION_LAUNCH_CONFIG };

    try {
      launchConfig = resolveBootPresentationConfig(resolveWindowSearch());
    } catch (error) {
      console.error('BootScene presentation resolution failed; falling back to title.', error);
    }

    try {
      this.scene.start('MenuScene', launchConfig);
    } catch (error) {
      console.error('BootScene failed to start MenuScene; rendering recovery shell.', error);
      this.renderRecoveryShell();
    }
  }

  private renderRecoveryShell(): void {
    const { width, height } = resolveSceneViewport(this);

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

const resolveWindowSearch = (): string => {
  if (typeof window === 'undefined') {
    return '';
  }

  try {
    return typeof window.location?.search === 'string' ? window.location.search : '';
  } catch {
    return '';
  }
};
