import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  public constructor() {
    super('BootScene');
  }

  public preload(): void {
    // Intentionally empty for foundation wave.
  }

  public create(): void {
    if (this.scene.isActive()) {
      this.scene.start('MenuScene');
    }
  }
}
