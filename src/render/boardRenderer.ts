import Phaser from 'phaser';
import type { MazeBuildResult } from '../domain/maze';
import { legacyTuning } from '../config/tuning';
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
  private readonly ambientContainer: Phaser.GameObjects.Container;

  public constructor(private readonly scene: Phaser.Scene, private readonly maze: MazeBuildResult, private readonly layout: BoardLayout) {
    this.ambientContainer = this.scene.add.container(0, 0);
    this.base = this.scene.add.graphics();
    this.grid = this.scene.add.graphics();
    this.goal = this.scene.add.graphics();
    this.trail = this.scene.add.graphics();
    this.actor = this.scene.add.graphics();
    this.ambientContainer.add([this.base, this.grid, this.goal, this.trail, this.actor]);
  }

  public drawBoardChrome(): void {
    const { boardX, boardY, boardSize } = this.layout;

    this.scene
      .add
      .rectangle(
        boardX + boardSize / 2,
        boardY + boardSize / 2 + legacyTuning.board.frame.shadowOffsetY,
        boardSize + legacyTuning.board.frame.shadowExpandPx,
        boardSize + legacyTuning.board.frame.shadowExpandPx,
        palette.board.shadow,
        legacyTuning.board.frame.shadowAlpha
      )
      .setOrigin(0.5);

    this.scene
      .add
      .rectangle(
        boardX + boardSize / 2,
        boardY + boardSize / 2,
        boardSize + legacyTuning.board.frame.outerExpandPx,
        boardSize + legacyTuning.board.frame.outerExpandPx,
        palette.board.outer,
        legacyTuning.board.frame.outerAlpha
      )
      .setStrokeStyle(legacyTuning.board.frame.outerStrokeWidth, palette.board.outerStroke, 0.95);

    this.scene
      .add
      .rectangle(boardX + boardSize / 2, boardY + boardSize / 2, boardSize, boardSize, palette.board.panel, 0.76)
      .setStrokeStyle(legacyTuning.board.frame.innerStrokeWidth, palette.board.innerStroke, 0.66);

    this.scene
      .add
      .rectangle(
        boardX + boardSize / 2,
        boardY + boardSize / 2 - boardSize / 2 + legacyTuning.board.frame.topHighlightInsetPx,
        boardSize - (legacyTuning.board.frame.topHighlightInsetPx * 2),
        legacyTuning.board.frame.topHighlightHeightPx,
        palette.board.topHighlight,
        legacyTuning.board.frame.topHighlightAlpha
      )
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
        this.base.fillStyle(palette.board.floor, legacyTuning.board.tile.floorOuterAlpha);
        this.base.fillRect(x, y, tileSize, tileSize);

        const floorInset = tileSize * legacyTuning.board.tile.floorInsetRatio;
        this.base.fillStyle(palette.board.floor, legacyTuning.board.tile.floorInsetAlpha);
        this.base.fillRect(x + floorInset, y + floorInset, tileSize - floorInset * 2, tileSize - floorInset * 2);

        this.grid.lineStyle(1, palette.board.innerStroke, legacyTuning.board.tile.floorGridAlpha);
        this.grid.strokeRect(x + 0.5, y + 0.5, tileSize - 1, tileSize - 1);

        this.base.fillStyle(palette.board.topHighlight, legacyTuning.board.tile.floorSheenAlpha);
        this.base.fillRect(x + 1, y + 1, tileSize - 2, Math.max(1, tileSize * 0.2));
      } else {
        this.base.fillStyle(palette.board.wall, legacyTuning.board.tile.wallAlpha);
        this.base.fillRect(x, y, tileSize, tileSize);

        this.grid.lineStyle(1, palette.board.shadow, legacyTuning.board.tile.wallGridAlpha);
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
    const pulse = legacyTuning.board.goalPulse.basePulse
      + (Math.sin(this.scene.time.now * legacyTuning.board.goalPulse.waveSpeed) * legacyTuning.board.goalPulse.waveAmplitude);
    const sparkPulse = 0.65 + (Math.sin((this.scene.time.now * legacyTuning.board.goalPulse.waveSpeed * 0.66) + 0.85) * 0.35);

    this.goal.fillStyle(palette.board.goal, legacyTuning.board.goalPulse.glowAlpha * pulse);
    this.goal.fillCircle(centerX, centerY, tileSize * legacyTuning.board.goalPulse.glowRadiusRatio);

    this.goal.lineStyle(
      Math.max(2, tileSize * legacyTuning.board.goalPulse.ringWidthRatio),
      palette.board.goal,
      legacyTuning.board.goalPulse.ringAlpha + ((pulse - legacyTuning.board.goalPulse.basePulse) * 0.5)
    );
    this.goal.strokeCircle(centerX, centerY, tileSize * legacyTuning.board.goalPulse.ringRadiusRatio);

    this.goal.lineStyle(
      Math.max(1, tileSize * legacyTuning.board.goalPulse.outerRingWidthRatio),
      palette.board.goal,
      legacyTuning.board.goalPulse.outerRingAlpha * pulse
    );
    this.goal.strokeCircle(centerX, centerY, tileSize * legacyTuning.board.goalPulse.outerRingRadiusRatio);

    this.goal.fillStyle(palette.board.goal, 1);
    this.goal.fillCircle(centerX, centerY, tileSize * legacyTuning.board.goalPulse.coreRadiusRatio);

    this.goal.lineStyle(Math.max(1, tileSize * 0.035), palette.board.goal, 0.45 * sparkPulse);
    this.goal.lineBetween(centerX - tileSize * 0.1, centerY, centerX + tileSize * 0.1, centerY);
    this.goal.lineBetween(centerX, centerY - tileSize * 0.1, centerX, centerY + tileSize * 0.1);
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
      const alpha = Phaser.Math.Linear(legacyTuning.board.trail.minAlpha, legacyTuning.board.trail.maxAlpha, t);
      const cellInset = tileSize * legacyTuning.board.trail.insetRatio;

      this.trail.fillStyle(palette.board.trail, alpha);
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
      this.trail.lineStyle(
        Math.max(2, tileSize * legacyTuning.board.trail.lineWidthRatio),
        palette.board.trail,
        Phaser.Math.Linear(legacyTuning.board.trail.minLineAlpha, legacyTuning.board.trail.maxLineAlpha, t)
      );
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

    this.actor.lineStyle(Math.max(2, tileSize * 0.09), palette.board.player, 0.95);
    this.actor.strokeCircle(centerX, centerY, tileSize * 0.27);
  }

  public startAmbientMotion(distancePx: number, durationMs: number): void {
    this.scene.tweens.add({
      targets: this.ambientContainer,
      y: distancePx,
      duration: durationMs,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }
}
