import Phaser from 'phaser';
import { setSfxMuted } from '../audio/proceduralSfx';
import { mazerStorage } from '../storage/mazerStorage';

export class BootScene extends Phaser.Scene {
  public constructor() {
    super('BootScene');
  }

  public preload(): void {
    // Intentionally empty for foundation wave.
  }

  public create(): void {
    void mazerStorage.bootstrap().finally(() => {
      setSfxMuted(mazerStorage.getSettings().muted);
      if (this.scene.isActive()) {
        this.scene.start('MenuScene');
      }
    });
  }
}
