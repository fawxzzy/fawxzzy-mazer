import Phaser from 'phaser';
import type { MazeBuildResult } from '../domain/maze';
import { palette } from './palette';

export interface BoardLayout {
  boardX: number;
  boardY: number;
  boardSize: number;
  tileSize: number;
}

export const createBoardLayout = (scene: Phaser.Scene, maze: MazeBuildResult, boardScale = 0.82): BoardLayout => {
  const { width, height } = scene.scale;
  const boardSize = Math.min(width, height) * boardScale;
  const boardX = width / 2 - boardSize / 2;
  const boardY = height / 2 - boardSize / 2;

  return {
    boardX,
    boardY,
    boardSize,
    tileSize: boardSize / maze.scale
  };
};

export class BoardRenderer {
  private readonly base: Phaser.GameObjects.Graphics;
  private readonly goal: Phaser.GameObjects.Graphics;
  private readonly trail: Phaser.GameObjects.Graphics;
  private readonly actor: Phaser.GameObjects.Graphics;

  public constructor(private readonly scene: Phaser.Scene, private readonly maze: MazeBuildResult, private readonly layout: BoardLayout) {
    this.base = this.scene.add.graphics();
    this.goal = this.scene.add.graphics();
    this.trail = this.scene.add.graphics();
    this.actor = this.scene.add.graphics();
  }

  public drawBoardChrome(): void {
    const { boardX, boardY, boardSize } = this.layout;
    this.scene.add.rectangle(boardX + boardSize / 2, boardY + boardSize / 2, boardSize + 20, boardSize + 20, palette.board.panel, 0.3).setStrokeStyle(2, palette.board.panelStroke, 0.9);
    this.scene.add.rectangle(boardX + boardSize / 2, boardY + boardSize / 2, boardSize, boardSize, palette.board.panel, 0.66).setStrokeStyle(1, palette.board.panelStroke, 0.62);
  }

  public drawBase(): void {
    const { boardX, boardY, tileSize } = this.layout;
    this.base.clear();

    this.maze.tiles.forEach((tile) => {
      const color = tile.floor ? palette.board.floor : palette.board.wall;
      this.base.fillStyle(color, tile.floor ? 0.82 : 0.97);
      this.base.fillRect(boardX + tile.x * tileSize, boardY + tile.y * tileSize, tileSize, tileSize);
    });
  }

  public drawGoal(): void {
    const { boardX, boardY, tileSize } = this.layout;
    const goalTile = this.maze.tiles[this.maze.endIndex];
    this.goal.clear();
    this.goal.fillStyle(palette.board.goal, 1);
    this.goal.fillRect(boardX + goalTile.x * tileSize + tileSize * 0.24, boardY + goalTile.y * tileSize + tileSize * 0.24, tileSize * 0.52, tileSize * 0.52);
  }

  public drawTrail(indices: number[]): void {
    const { boardX, boardY, tileSize } = this.layout;
    this.trail.clear();
    for (const index of indices) {
      const tile = this.maze.tiles[index];
      this.trail.fillStyle(palette.board.path, 0.95);
      this.trail.fillRect(boardX + tile.x * tileSize + tileSize * 0.16, boardY + tile.y * tileSize + tileSize * 0.16, tileSize * 0.68, tileSize * 0.68);
    }
  }

  public drawActor(index: number): void {
    const { boardX, boardY, tileSize } = this.layout;
    const tile = this.maze.tiles[index];
    this.actor.clear();
    this.actor.fillStyle(0xffffff, 0.98);
    this.actor.fillCircle(boardX + tile.x * tileSize + (tileSize / 2), boardY + tile.y * tileSize + (tileSize / 2), tileSize * 0.28);
  }
}
