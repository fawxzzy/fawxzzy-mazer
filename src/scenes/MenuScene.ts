import Phaser from 'phaser';
import { generateMaze } from '../domain/maze/generator';
import { palette } from '../render/palette';
import { createMenuButton } from '../ui/menuButton';
import { OverlayManager } from '../ui/overlayManager';

const OVERLAY_EVENTS = {
  open: 'overlay-open',
  close: 'overlay-close'
} as const;

export class MenuScene extends Phaser.Scene {
  private overlayManager!: OverlayManager;

  public constructor() {
    super('MenuScene');
  }

  public create(): void {
    const { width, height } = this.scale;
    this.overlayManager = new OverlayManager(this, ['OptionsScene', 'FeaturesScene', 'ModesScene']);

    this.drawStarfield(width, height);

    const boardSize = Math.min(width, height) * (width < 900 ? 0.58 : 0.62);
    const boardX = width / 2 - boardSize / 2;
    const boardY = height / 2 - boardSize / 2;

    this.drawBoardShell(boardX, boardY, boardSize);
    this.drawMazeDemo(boardX, boardY, boardSize);

    this.add
      .text(width / 2, height / 2 - boardSize * 0.24, 'Mazer', {
        color: '#8cffa4',
        fontFamily: 'monospace',
        fontSize: `${Math.round(boardSize * 0.2)}px`
      })
      .setOrigin(0.5)
      .setAlpha(0.42);

    const buttonY = Math.min(height - 64, boardY + boardSize + 58);
    const spacing = Math.min(220, width * 0.24);

    createMenuButton(this, {
      x: width / 2 - spacing,
      y: buttonY,
      label: 'Start',
      onClick: () => this.scene.start('GameScene')
    });

    createMenuButton(this, {
      x: width / 2,
      y: buttonY,
      label: 'Options',
      onClick: () => this.events.emit(OVERLAY_EVENTS.open, 'OptionsScene')
    });

    createMenuButton(this, {
      x: width / 2 + spacing,
      y: buttonY,
      label: 'Exit',
      onClick: () => {
        this.game.destroy(true);
      }
    });

    this.events.on(OVERLAY_EVENTS.open, (key: string) => this.overlayManager.open(key));
    this.events.on(OVERLAY_EVENTS.close, () => this.overlayManager.closeActive());

    this.input.keyboard?.on('keydown-ESC', () => {
      this.overlayManager.closeActive();
    });
  }

  private drawStarfield(width: number, height: number): void {
    const bg = this.add.graphics();
    bg.fillGradientStyle(palette.background.deepSpace, palette.background.deepSpace, palette.background.nebula, palette.background.nebula, 1);
    bg.fillRect(0, 0, width, height);

    const stars = this.add.graphics();
    for (let i = 0; i < 240; i += 1) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(0, height);
      const r = Phaser.Math.FloatBetween(0.5, 1.7);
      stars.fillStyle(palette.background.star, Phaser.Math.FloatBetween(0.25, 0.95));
      stars.fillCircle(x, y, r);
    }

    const vignette = this.add.graphics();
    vignette.fillStyle(palette.background.vignette, 0.24);
    vignette.fillRect(0, 0, width, height * 0.14);
    vignette.fillRect(0, height * 0.86, width, height * 0.14);
  }

  private drawBoardShell(x: number, y: number, size: number): void {
    this.add.rectangle(x + size / 2, y + size / 2, size + 24, size + 24, palette.board.panel, 0.28).setStrokeStyle(2, palette.board.panelStroke, 0.92);
    this.add.rectangle(x + size / 2, y + size / 2, size, size, palette.board.panel, 0.68).setStrokeStyle(1, palette.board.panelStroke, 0.65);
  }

  private drawMazeDemo(boardX: number, boardY: number, boardSize: number): void {
    const maze = generateMaze({
      scale: 24,
      seed: 1988,
      checkPointModifier: 0.35,
      shortcutCountModifier: 0.13
    });

    const tileSize = boardSize / maze.scale;
    const graphics = this.add.graphics();

    maze.tiles.forEach((tile) => {
      const color = tile.floor ? palette.board.floor : palette.board.wall;
      graphics.fillStyle(color, tile.floor ? 0.82 : 0.95);
      graphics.fillRect(boardX + tile.x * tileSize, boardY + tile.y * tileSize, tileSize, tileSize);
    });

    graphics.fillStyle(palette.board.goal, 1);
    const goal = maze.tiles[maze.endIndex];
    graphics.fillRect(boardX + goal.x * tileSize + tileSize * 0.23, boardY + goal.y * tileSize + tileSize * 0.23, tileSize * 0.54, tileSize * 0.54);

    const trail = this.add.graphics();
    let progress = 1;

    this.time.addEvent({
      delay: 70,
      loop: true,
      callback: () => {
        progress = (progress + 1) % maze.pathIndices.length;
        trail.clear();

        const drawCount = Math.max(6, progress);
        for (let i = 0; i < drawCount; i += 1) {
          const tile = maze.tiles[maze.pathIndices[i]];
          trail.fillStyle(palette.board.path, 0.95);
          trail.fillRect(
            boardX + tile.x * tileSize + tileSize * 0.16,
            boardY + tile.y * tileSize + tileSize * 0.16,
            tileSize * 0.68,
            tileSize * 0.68
          );
        }
      }
    });
  }
}
