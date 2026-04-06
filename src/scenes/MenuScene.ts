import Phaser from 'phaser';

export class MenuScene extends Phaser.Scene {
  public constructor() {
    super('MenuScene');
  }

  public create(): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2, 'MAZER\nMenu foundation', {
        align: 'center',
        color: '#f8f8ff',
        fontFamily: 'monospace',
        fontSize: '28px'
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 + 90, 'Press SPACE to open GameScene placeholder', {
        color: '#95a0ff',
        fontFamily: 'monospace',
        fontSize: '16px'
      })
      .setOrigin(0.5);

    this.input.keyboard?.once('keydown-SPACE', () => {
      this.scene.start('GameScene');
    });
  }
}
