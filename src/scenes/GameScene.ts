import Phaser from 'phaser';

export class GameScene extends Phaser.Scene {
  public constructor() {
    super('GameScene');
  }

  public create(): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2, 'GameScene placeholder\n(board-first shell next wave)', {
        align: 'center',
        color: '#f8f8ff',
        fontFamily: 'monospace',
        fontSize: '24px'
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 + 80, 'Press ESC to return to menu', {
        color: '#95a0ff',
        fontFamily: 'monospace',
        fontSize: '16px'
      })
      .setOrigin(0.5);

    this.input.keyboard?.once('keydown-ESC', () => {
      this.scene.start('MenuScene');
    });
  }
}
