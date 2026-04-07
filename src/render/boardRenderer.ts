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
  private readonly chromeBack: Phaser.GameObjects.Graphics;
  private readonly base: Phaser.GameObjects.Graphics;
  private readonly grid: Phaser.GameObjects.Graphics;
  private readonly goal: Phaser.GameObjects.Graphics;
  private readonly trail: Phaser.GameObjects.Graphics;
  private readonly actor: Phaser.GameObjects.Graphics;
  private readonly chromeFront: Phaser.GameObjects.Graphics;
  private readonly ambientContainer: Phaser.GameObjects.Container;

  public constructor(private readonly scene: Phaser.Scene, private readonly maze: MazeBuildResult, private readonly layout: BoardLayout) {
    this.ambientContainer = this.scene.add.container(0, 0);
    this.chromeBack = this.scene.add.graphics();
    this.base = this.scene.add.graphics();
    this.grid = this.scene.add.graphics();
    this.goal = this.scene.add.graphics();
    this.trail = this.scene.add.graphics();
    this.actor = this.scene.add.graphics();
    this.chromeFront = this.scene.add.graphics();
    this.ambientContainer.add([this.chromeBack, this.base, this.grid, this.goal, this.trail, this.actor, this.chromeFront]);
  }

  public drawBoardChrome(): void {
    const { boardX, boardY, boardSize } = this.layout;
    const centerX = boardX + boardSize / 2;
    const centerY = boardY + boardSize / 2;
    const {
      shadowOffsetY,
      shadowExpandPx,
      shadowAlpha,
      outerExpandPx,
      outerAlpha,
      outerStrokeWidth,
      innerStrokeWidth,
      panelAlpha,
      glowExpandPx,
      glowAlpha,
      wellInsetPx,
      wellAlpha,
      edgeShadeWidthPx,
      edgeShadeAlpha,
      cornerTickInsetPx,
      cornerTickLengthPx,
      cornerTickAlpha,
      topHighlightInsetPx,
      topHighlightHeightPx,
      topHighlightAlpha
    } = legacyTuning.board.frame;

    this.chromeBack.clear();
    this.chromeFront.clear();

    this.chromeBack.fillStyle(palette.board.shadow, shadowAlpha);
    this.chromeBack.fillRect(
      centerX - (boardSize + shadowExpandPx) / 2,
      centerY - (boardSize + shadowExpandPx) / 2 + shadowOffsetY,
      boardSize + shadowExpandPx,
      boardSize + shadowExpandPx
    );

    this.chromeBack.fillStyle(palette.board.glow, glowAlpha);
    this.chromeBack.fillRect(
      centerX - (boardSize + glowExpandPx) / 2,
      centerY - (boardSize + glowExpandPx) / 2,
      boardSize + glowExpandPx,
      boardSize + glowExpandPx
    );

    this.chromeBack.fillStyle(palette.board.outer, outerAlpha);
    this.chromeBack.fillRect(
      centerX - (boardSize + outerExpandPx) / 2,
      centerY - (boardSize + outerExpandPx) / 2,
      boardSize + outerExpandPx,
      boardSize + outerExpandPx
    );
    this.chromeBack.lineStyle(outerStrokeWidth, palette.board.outerStroke, 0.95);
    this.chromeBack.strokeRect(
      centerX - (boardSize + outerExpandPx) / 2,
      centerY - (boardSize + outerExpandPx) / 2,
      boardSize + outerExpandPx,
      boardSize + outerExpandPx
    );

    this.chromeBack.fillStyle(palette.board.panel, panelAlpha);
    this.chromeBack.fillRect(boardX, boardY, boardSize, boardSize);
    this.chromeBack.lineStyle(1, palette.board.panelStroke, 0.74);
    this.chromeBack.strokeRect(boardX + 4, boardY + 4, boardSize - 8, boardSize - 8);
    this.chromeBack.lineStyle(innerStrokeWidth, palette.board.innerStroke, 0.66);
    this.chromeBack.strokeRect(boardX + 1, boardY + 1, boardSize - 2, boardSize - 2);

    this.chromeBack.fillStyle(palette.board.well, wellAlpha);
    this.chromeBack.fillRect(
      boardX + wellInsetPx,
      boardY + wellInsetPx,
      boardSize - (wellInsetPx * 2),
      boardSize - (wellInsetPx * 2)
    );

    this.chromeBack.fillStyle(palette.board.shadow, edgeShadeAlpha);
    this.chromeBack.fillRect(boardX, boardY, edgeShadeWidthPx, boardSize);
    this.chromeBack.fillRect(boardX, boardY + boardSize - edgeShadeWidthPx, boardSize, edgeShadeWidthPx);
    this.chromeBack.fillRect(boardX + boardSize - edgeShadeWidthPx, boardY, edgeShadeWidthPx, boardSize);

    this.chromeBack.fillStyle(palette.board.topHighlight, topHighlightAlpha);
    this.chromeBack.fillRect(
      boardX + topHighlightInsetPx,
      boardY + topHighlightInsetPx,
      boardSize - (topHighlightInsetPx * 2),
      topHighlightHeightPx
    );

    this.chromeFront.lineStyle(2, palette.board.outerStroke, cornerTickAlpha);
    this.chromeFront.lineBetween(boardX + cornerTickInsetPx, boardY + cornerTickInsetPx, boardX + cornerTickInsetPx + cornerTickLengthPx, boardY + cornerTickInsetPx);
    this.chromeFront.lineBetween(boardX + cornerTickInsetPx, boardY + cornerTickInsetPx, boardX + cornerTickInsetPx, boardY + cornerTickInsetPx + cornerTickLengthPx);
    this.chromeFront.lineBetween(boardX + boardSize - cornerTickInsetPx, boardY + cornerTickInsetPx, boardX + boardSize - cornerTickInsetPx - cornerTickLengthPx, boardY + cornerTickInsetPx);
    this.chromeFront.lineBetween(boardX + boardSize - cornerTickInsetPx, boardY + cornerTickInsetPx, boardX + boardSize - cornerTickInsetPx, boardY + cornerTickInsetPx + cornerTickLengthPx);
    this.chromeFront.lineBetween(boardX + cornerTickInsetPx, boardY + boardSize - cornerTickInsetPx, boardX + cornerTickInsetPx + cornerTickLengthPx, boardY + boardSize - cornerTickInsetPx);
    this.chromeFront.lineBetween(boardX + cornerTickInsetPx, boardY + boardSize - cornerTickInsetPx, boardX + cornerTickInsetPx, boardY + boardSize - cornerTickInsetPx - cornerTickLengthPx);
    this.chromeFront.lineBetween(boardX + boardSize - cornerTickInsetPx, boardY + boardSize - cornerTickInsetPx, boardX + boardSize - cornerTickInsetPx - cornerTickLengthPx, boardY + boardSize - cornerTickInsetPx);
    this.chromeFront.lineBetween(boardX + boardSize - cornerTickInsetPx, boardY + boardSize - cornerTickInsetPx, boardX + boardSize - cornerTickInsetPx, boardY + boardSize - cornerTickInsetPx - cornerTickLengthPx);
  }

  public drawBase(): void {
    const { boardX, boardY, tileSize } = this.layout;
    const bevel = Math.max(1, Math.round(tileSize * legacyTuning.board.tile.bevelRatio));
    this.base.clear();
    this.grid.clear();

    this.maze.tiles.forEach((tile) => {
      const x = boardX + tile.x * tileSize;
      const y = boardY + tile.y * tileSize;

      if (tile.floor) {
        this.base.fillStyle(palette.board.path, legacyTuning.board.tile.floorOuterAlpha);
        this.base.fillRect(x, y, tileSize, tileSize);

        const floorInset = tileSize * legacyTuning.board.tile.floorInsetRatio;
        this.base.fillStyle(palette.board.floor, legacyTuning.board.tile.floorInsetAlpha);
        this.base.fillRect(x + floorInset, y + floorInset, tileSize - floorInset * 2, tileSize - floorInset * 2);

        this.base.fillStyle(palette.board.topHighlight, legacyTuning.board.tile.floorHighlightAlpha);
        this.base.fillRect(x + bevel, y + bevel, tileSize - (bevel * 2), bevel);
        this.base.fillRect(x + bevel, y + bevel, bevel, tileSize - (bevel * 2));

        this.base.fillStyle(palette.board.shadow, legacyTuning.board.tile.floorShadowAlpha);
        this.base.fillRect(x + tileSize - (bevel * 2), y + bevel, bevel, tileSize - (bevel * 2));
        this.base.fillRect(x + bevel, y + tileSize - (bevel * 2), tileSize - (bevel * 2), bevel);

        this.grid.lineStyle(1, palette.board.innerStroke, legacyTuning.board.tile.floorGridAlpha);
        this.grid.strokeRect(x + 0.5, y + 0.5, tileSize - 1, tileSize - 1);

        this.base.fillStyle(palette.board.topHighlight, legacyTuning.board.tile.floorSheenAlpha);
        this.base.fillRect(x + 1, y + 1, tileSize - 2, Math.max(1, tileSize * 0.2));
      } else {
        this.base.fillStyle(palette.board.wall, legacyTuning.board.tile.wallAlpha);
        this.base.fillRect(x, y, tileSize, tileSize);

        this.base.fillStyle(palette.board.shadow, legacyTuning.board.tile.wallEdgeAlpha);
        this.base.fillRect(x + tileSize - bevel, y, bevel, tileSize);
        this.base.fillRect(x, y + tileSize - bevel, tileSize, bevel);

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
      Math.max(1, tileSize * legacyTuning.board.goalPulse.outerRingWidthRatio),
      palette.board.goal,
      legacyTuning.board.goalPulse.outerRingAlpha * pulse
    );
    this.goal.strokeRect(
      centerX - tileSize * legacyTuning.board.goalPulse.outerRingRadiusRatio * 0.72,
      centerY - tileSize * legacyTuning.board.goalPulse.outerRingRadiusRatio * 0.72,
      tileSize * legacyTuning.board.goalPulse.outerRingRadiusRatio * 1.44,
      tileSize * legacyTuning.board.goalPulse.outerRingRadiusRatio * 1.44
    );

    this.goal.lineStyle(
      Math.max(2, tileSize * legacyTuning.board.goalPulse.ringWidthRatio),
      palette.board.goal,
      legacyTuning.board.goalPulse.ringAlpha + ((pulse - legacyTuning.board.goalPulse.basePulse) * 0.5)
    );
    this.goal.strokeCircle(centerX, centerY, tileSize * legacyTuning.board.goalPulse.ringRadiusRatio);

    this.goal.lineStyle(1, palette.board.goal, legacyTuning.board.goalPulse.outerRingAlpha * pulse);
    this.goal.strokeCircle(centerX, centerY, tileSize * legacyTuning.board.goalPulse.outerRingRadiusRatio);

    this.goal.fillStyle(palette.board.goal, 1);
    this.goal.fillCircle(centerX, centerY, tileSize * legacyTuning.board.goalPulse.coreRadiusRatio);

    this.goal.fillStyle(palette.board.goalCore, 0.96);
    this.goal.fillCircle(centerX, centerY, tileSize * legacyTuning.board.goalPulse.coreHighlightRadiusRatio);

    this.goal.lineStyle(Math.max(1, tileSize * 0.035), palette.board.goalCore, legacyTuning.board.goalPulse.sparkAlpha * sparkPulse);
    this.goal.lineBetween(
      centerX - tileSize * legacyTuning.board.goalPulse.sparkLengthRatio,
      centerY,
      centerX + tileSize * legacyTuning.board.goalPulse.sparkLengthRatio,
      centerY
    );
    this.goal.lineBetween(
      centerX,
      centerY - tileSize * legacyTuning.board.goalPulse.sparkLengthRatio,
      centerX,
      centerY + tileSize * legacyTuning.board.goalPulse.sparkLengthRatio
    );
  }

  public drawTrail(indices: number[]): void {
    const { boardX, boardY, tileSize } = this.layout;
    this.trail.clear();
    let previousCenterX = 0;
    let previousCenterY = 0;

    for (let i = 0; i < indices.length; i += 1) {
      const index = indices[i];
      const tile = this.maze.tiles[index];
      const centerX = boardX + tile.x * tileSize + tileSize / 2;
      const centerY = boardY + tile.y * tileSize + tileSize / 2;
      const t = indices.length <= 1 ? 1 : i / (indices.length - 1);
      const alpha = Phaser.Math.Linear(legacyTuning.board.trail.minAlpha, legacyTuning.board.trail.maxAlpha, t);
      const glowAlpha = Phaser.Math.Linear(legacyTuning.board.trail.glowMinAlpha, legacyTuning.board.trail.glowMaxAlpha, t);
      const cellInset = tileSize * legacyTuning.board.trail.insetRatio;
      const nodeRadius = Math.max(2, tileSize * legacyTuning.board.trail.nodeRadiusRatio);

      this.trail.fillStyle(palette.board.trail, alpha);
      this.trail.fillRect(
        boardX + tile.x * tileSize + cellInset,
        boardY + tile.y * tileSize + cellInset,
        tileSize - cellInset * 2,
        tileSize - cellInset * 2
      );
      this.trail.fillStyle(palette.board.trailGlow, glowAlpha * 0.9);
      this.trail.fillCircle(centerX, centerY, nodeRadius * 1.4);
      this.trail.fillStyle(palette.board.trailCore, Math.min(1, alpha + 0.28));
      this.trail.fillCircle(centerX, centerY, nodeRadius);

      if (i === 0) {
        previousCenterX = centerX;
        previousCenterY = centerY;
        continue;
      }

      this.trail.lineStyle(
        Math.max(3, tileSize * legacyTuning.board.trail.glowLineWidthRatio),
        palette.board.trailGlow,
        glowAlpha
      );
      this.trail.lineBetween(previousCenterX, previousCenterY, centerX, centerY);
      this.trail.lineStyle(
        Math.max(2, tileSize * legacyTuning.board.trail.lineWidthRatio),
        palette.board.trailCore,
        Phaser.Math.Linear(legacyTuning.board.trail.minLineAlpha, legacyTuning.board.trail.maxLineAlpha, t)
      );
      this.trail.lineBetween(previousCenterX, previousCenterY, centerX, centerY);
      previousCenterX = centerX;
      previousCenterY = centerY;
    }
  }

  public drawActor(index: number, direction: 0 | 1 | 2 | 3 | null = null): void {
    const { boardX, boardY, tileSize } = this.layout;
    const tile = this.maze.tiles[index];
    const centerX = boardX + tile.x * tileSize + (tileSize / 2);
    const centerY = boardY + tile.y * tileSize + (tileSize / 2);

    this.actor.clear();
    this.actor.fillStyle(palette.board.playerShadow, 0.46);
    this.actor.fillCircle(centerX, centerY + tileSize * 0.04, tileSize * 0.34);

    this.actor.fillStyle(palette.board.playerHalo, 0.28);
    this.actor.fillCircle(centerX, centerY, tileSize * 0.34);

    this.actor.fillStyle(palette.board.playerCore, 1);
    this.actor.fillCircle(centerX, centerY, tileSize * 0.22);

    this.actor.lineStyle(Math.max(2, tileSize * 0.065), palette.board.player, 0.95);
    this.actor.strokeCircle(centerX, centerY, tileSize * 0.27);

    this.actor.fillStyle(palette.board.playerHalo, 0.85);
    this.actor.fillCircle(centerX - tileSize * 0.06, centerY - tileSize * 0.06, tileSize * 0.055);

    if (direction !== null) {
      const offset = tileSize * 0.14;
      const directionOffsets = [
        { x: 0, y: -offset },
        { x: 0, y: offset },
        { x: -offset, y: 0 },
        { x: offset, y: 0 }
      ] as const;
      const facing = directionOffsets[direction];

      this.actor.lineStyle(Math.max(2, tileSize * 0.05), palette.board.playerCore, 0.9);
      this.actor.lineBetween(centerX, centerY, centerX + facing.x, centerY + facing.y);
      this.actor.fillStyle(palette.board.playerCore, 0.98);
      this.actor.fillCircle(centerX + facing.x, centerY + facing.y, tileSize * 0.042);
    }
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
