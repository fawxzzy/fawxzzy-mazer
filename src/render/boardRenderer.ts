import Phaser from 'phaser';
import type { MazeBuildResult } from '../domain/maze';
import { palette } from './palette';

export interface BoardLayout {
  boardX: number;
  boardY: number;
  boardSize: number;
  tileSize: number;
}

interface BoardLayoutOptions {
  boardScale?: number;
  topReserve?: number;
  sidePadding?: number;
  bottomPadding?: number;
}

export const createBoardLayout = (
  scene: Phaser.Scene,
  maze: MazeBuildResult,
  options: BoardLayoutOptions | number = {}
): BoardLayout => {
  const normalizedOptions: BoardLayoutOptions = typeof options === 'number'
    ? { boardScale: options }
    : options;

  const boardScale = normalizedOptions.boardScale ?? 0.82;
  const topReserve = normalizedOptions.topReserve ?? 64;
  const sidePadding = normalizedOptions.sidePadding ?? 20;
  const bottomPadding = normalizedOptions.bottomPadding ?? sidePadding;

  const { width, height } = scene.scale;
  const availableWidth = width - (sidePadding * 2);
  const availableHeight = height - topReserve - bottomPadding;
  const boardSize = Math.min(availableWidth, availableHeight) * boardScale;
  const boardX = width / 2 - boardSize / 2;
  const boardY = topReserve + ((availableHeight - boardSize) / 2);

  return {
    boardX,
    boardY,
    boardSize,
    tileSize: boardSize / maze.scale
  };
};

export class BoardRenderer {
  private readonly base: Phaser.GameObjects.Graphics;
  private readonly grid: Phaser.GameObjects.Graphics;
  private readonly goal: Phaser.GameObjects.Graphics;
  private readonly trail: Phaser.GameObjects.Graphics;
  private readonly actor: Phaser.GameObjects.Graphics;

  public constructor(private readonly scene: Phaser.Scene, private readonly maze: MazeBuildResult, private readonly layout: BoardLayout) {
    this.base = this.scene.add.graphics();
    this.grid = this.scene.add.graphics();
    this.goal = this.scene.add.graphics();
    this.trail = this.scene.add.graphics();
    this.actor = this.scene.add.graphics();
  }

  public drawBoardChrome(): void {
    const { boardX, boardY, boardSize } = this.layout;

    this.scene
      .add
      .rectangle(boardX + boardSize / 2, boardY + boardSize / 2 + 8, boardSize + 30, boardSize + 30, 0x02040a, 0.34)
      .setOrigin(0.5);

    this.scene
      .add
      .rectangle(boardX + boardSize / 2, boardY + boardSize / 2, boardSize + 22, boardSize + 22, 0x080c16, 0.74)
      .setStrokeStyle(2, 0x2f4f73, 0.95);

    this.scene
      .add
      .rectangle(boardX + boardSize / 2, boardY + boardSize / 2, boardSize, boardSize, palette.board.panel, 0.76)
      .setStrokeStyle(1, 0x5f90bf, 0.66);

    this.scene
      .add
      .rectangle(boardX + boardSize / 2, boardY + boardSize / 2 - boardSize / 2 + 3, boardSize - 6, 2, 0xa0d0ff, 0.25)
      .setOrigin(0.5, 0.5);
  }

  public drawBase(): void {
    const { boardX, boardY, tileSize } = this.layout;
    this.base.clear();
    this.grid.clear();

    this.maze.tiles.forEach((tile) => {
      const x = boardX + tile.x * tileSize;
      const y = boardY + tile.y * tileSize;

      if (tile.floor) {
        this.base.fillStyle(0x1d3557, 0.96);
        this.base.fillRect(x, y, tileSize, tileSize);

        const floorInset = tileSize * 0.11;
        this.base.fillStyle(0x2a4d78, 0.78);
        this.base.fillRect(x + floorInset, y + floorInset, tileSize - floorInset * 2, tileSize - floorInset * 2);

        this.grid.lineStyle(1, 0x95c8ff, 0.3);
        this.grid.strokeRect(x + 0.5, y + 0.5, tileSize - 1, tileSize - 1);

        this.base.fillStyle(0xb9d9ff, 0.05);
        this.base.fillRect(x + 1, y + 1, tileSize - 2, Math.max(1, tileSize * 0.2));
      } else {
        this.base.fillStyle(0x08101d, 0.98);
        this.base.fillRect(x, y, tileSize, tileSize);

        this.grid.lineStyle(1, 0x060a12, 0.92);
        this.grid.strokeRect(x + 0.5, y + 0.5, tileSize - 1, tileSize - 1);
      }
    });
  }

  public drawGoal(): void {
    const { boardX, boardY, tileSize } = this.layout;
    const goalTile = this.maze.tiles[this.maze.endIndex];
    this.goal.clear();

    const centerX = boardX + goalTile.x * tileSize + tileSize / 2;
    const centerY = boardY + goalTile.y * tileSize + tileSize / 2;
    const pulse = 0.85 + (Math.sin(this.scene.time.now * 0.005) * 0.15);

    this.goal.fillStyle(0xff4358, 0.21 * pulse);
    this.goal.fillCircle(centerX, centerY, tileSize * 0.42);

    this.goal.lineStyle(Math.max(2, tileSize * 0.08), palette.board.goal, 0.9 + ((pulse - 0.85) * 0.5));
    this.goal.strokeCircle(centerX, centerY, tileSize * 0.32);

    this.goal.lineStyle(Math.max(1, tileSize * 0.05), 0xff97a3, 0.38 * pulse);
    this.goal.strokeCircle(centerX, centerY, tileSize * 0.46);

    this.goal.fillStyle(0xff7a88, 1);
    this.goal.fillCircle(centerX, centerY, tileSize * 0.16);
  }

  public drawTrail(indices: number[]): void {
    const { boardX, boardY, tileSize } = this.layout;
    this.trail.clear();

    const centerOf = (index: number): Phaser.Math.Vector2 => {
      const tile = this.maze.tiles[index];
      return new Phaser.Math.Vector2(
        boardX + tile.x * tileSize + tileSize / 2,
        boardY + tile.y * tileSize + tileSize / 2
      );
    };

    for (let i = 0; i < indices.length; i += 1) {
      const index = indices[i];
      const tile = this.maze.tiles[index];
      const t = indices.length <= 1 ? 1 : i / (indices.length - 1);
      const alpha = Phaser.Math.Linear(0.12, 0.7, t);
      const cellInset = tileSize * 0.24;

      this.trail.fillStyle(0x7ec7ff, alpha);
      this.trail.fillRect(
        boardX + tile.x * tileSize + cellInset,
        boardY + tile.y * tileSize + cellInset,
        tileSize - cellInset * 2,
        tileSize - cellInset * 2
      );

      if (i === 0) {
        continue;
      }

      const prev = centerOf(indices[i - 1]);
      const curr = centerOf(indices[i]);
      this.trail.lineStyle(Math.max(2, tileSize * 0.1), 0x9ed8ff, Phaser.Math.Linear(0.15, 0.58, t));
      this.trail.lineBetween(prev.x, prev.y, curr.x, curr.y);
    }
  }

  public drawActor(index: number): void {
    const { boardX, boardY, tileSize } = this.layout;
    const tile = this.maze.tiles[index];
    const centerX = boardX + tile.x * tileSize + (tileSize / 2);
    const centerY = boardY + tile.y * tileSize + (tileSize / 2);

    this.actor.clear();
    this.actor.fillStyle(0x0c1326, 0.55);
    this.actor.fillCircle(centerX, centerY + tileSize * 0.04, tileSize * 0.34);

    this.actor.fillStyle(0xffffff, 1);
    this.actor.fillCircle(centerX, centerY, tileSize * 0.26);

    this.actor.lineStyle(Math.max(2, tileSize * 0.09), 0x3a7cff, 0.95);
    this.actor.strokeCircle(centerX, centerY, tileSize * 0.27);
  }
}
