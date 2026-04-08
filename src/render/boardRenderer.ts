import Phaser from 'phaser';
import type { DemoTrailStep } from '../domain/ai';
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

const normalizeTrailSteps = (trail: ReadonlyArray<number | DemoTrailStep>): DemoTrailStep[] => trail.map((step) => (
  typeof step === 'number'
    ? { index: step, mode: 'explore' }
    : step
));

export const createBoardLayout = (
  scene: Phaser.Scene,
  maze: MazeBuildResult,
  options: BoardLayoutOptions | number = {}
): BoardLayout => {
  const normalizedOptions: BoardLayoutOptions = typeof options === 'number'
    ? { boardScale: options }
    : options;

  const boardScale = normalizedOptions.boardScale ?? 0.9;
  const topReserve = normalizedOptions.topReserve ?? 64;
  const sidePadding = normalizedOptions.sidePadding ?? 16;
  const bottomPadding = normalizedOptions.bottomPadding ?? sidePadding;

  const { width, height } = scene.scale;
  const availableWidth = Math.max(0, width - (sidePadding * 2));
  const availableHeight = Math.max(0, height - topReserve - bottomPadding);
  const boardSize = Math.floor(Math.min(availableWidth, availableHeight) * boardScale);
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
    const frameScale = Phaser.Math.Clamp(boardSize / 560, 0.72, 1.4);
    const scaleMetric = (value: number, minimum = 1): number => Math.max(minimum, Math.round(value * frameScale));
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
      centerX - (boardSize + scaleMetric(shadowExpandPx)) / 2,
      centerY - (boardSize + scaleMetric(shadowExpandPx)) / 2 + scaleMetric(shadowOffsetY),
      boardSize + scaleMetric(shadowExpandPx),
      boardSize + scaleMetric(shadowExpandPx)
    );

    this.chromeBack.fillStyle(palette.board.glow, glowAlpha);
    this.chromeBack.fillRect(
      centerX - (boardSize + scaleMetric(glowExpandPx)) / 2,
      centerY - (boardSize + scaleMetric(glowExpandPx)) / 2,
      boardSize + scaleMetric(glowExpandPx),
      boardSize + scaleMetric(glowExpandPx)
    );

    this.chromeBack.fillStyle(palette.board.outer, outerAlpha);
    this.chromeBack.fillRect(
      centerX - (boardSize + scaleMetric(outerExpandPx)) / 2,
      centerY - (boardSize + scaleMetric(outerExpandPx)) / 2,
      boardSize + scaleMetric(outerExpandPx),
      boardSize + scaleMetric(outerExpandPx)
    );
    this.chromeBack.lineStyle(scaleMetric(outerStrokeWidth), palette.board.outerStroke, 0.95);
    this.chromeBack.strokeRect(
      centerX - (boardSize + scaleMetric(outerExpandPx)) / 2,
      centerY - (boardSize + scaleMetric(outerExpandPx)) / 2,
      boardSize + scaleMetric(outerExpandPx),
      boardSize + scaleMetric(outerExpandPx)
    );

    this.chromeBack.fillStyle(palette.board.panel, panelAlpha);
    this.chromeBack.fillRect(boardX, boardY, boardSize, boardSize);
    this.chromeBack.lineStyle(1, palette.board.panelStroke, 0.74);
    this.chromeBack.strokeRect(
      boardX + scaleMetric(4),
      boardY + scaleMetric(4),
      boardSize - scaleMetric(8),
      boardSize - scaleMetric(8)
    );
    this.chromeBack.lineStyle(scaleMetric(innerStrokeWidth), palette.board.innerStroke, 0.66);
    this.chromeBack.strokeRect(boardX + 1, boardY + 1, boardSize - 2, boardSize - 2);

    this.chromeBack.fillStyle(palette.board.well, wellAlpha);
    this.chromeBack.fillRect(
      boardX + scaleMetric(wellInsetPx),
      boardY + scaleMetric(wellInsetPx),
      boardSize - (scaleMetric(wellInsetPx) * 2),
      boardSize - (scaleMetric(wellInsetPx) * 2)
    );

    this.chromeBack.fillStyle(palette.board.shadow, edgeShadeAlpha);
    this.chromeBack.fillRect(boardX, boardY, scaleMetric(edgeShadeWidthPx), boardSize);
    this.chromeBack.fillRect(
      boardX,
      boardY + boardSize - scaleMetric(edgeShadeWidthPx),
      boardSize,
      scaleMetric(edgeShadeWidthPx)
    );
    this.chromeBack.fillRect(
      boardX + boardSize - scaleMetric(edgeShadeWidthPx),
      boardY,
      scaleMetric(edgeShadeWidthPx),
      boardSize
    );

    this.chromeBack.fillStyle(palette.board.topHighlight, topHighlightAlpha);
    this.chromeBack.fillRect(
      boardX + scaleMetric(topHighlightInsetPx),
      boardY + scaleMetric(topHighlightInsetPx),
      boardSize - (scaleMetric(topHighlightInsetPx) * 2),
      scaleMetric(topHighlightHeightPx)
    );

    const tickInset = scaleMetric(cornerTickInsetPx);
    const tickLength = scaleMetric(cornerTickLengthPx);
    this.chromeFront.lineStyle(scaleMetric(2), palette.board.outerStroke, cornerTickAlpha);
    this.chromeFront.lineBetween(boardX + tickInset, boardY + tickInset, boardX + tickInset + tickLength, boardY + tickInset);
    this.chromeFront.lineBetween(boardX + tickInset, boardY + tickInset, boardX + tickInset, boardY + tickInset + tickLength);
    this.chromeFront.lineBetween(boardX + boardSize - tickInset, boardY + tickInset, boardX + boardSize - tickInset - tickLength, boardY + tickInset);
    this.chromeFront.lineBetween(boardX + boardSize - tickInset, boardY + tickInset, boardX + boardSize - tickInset, boardY + tickInset + tickLength);
    this.chromeFront.lineBetween(boardX + tickInset, boardY + boardSize - tickInset, boardX + tickInset + tickLength, boardY + boardSize - tickInset);
    this.chromeFront.lineBetween(boardX + tickInset, boardY + boardSize - tickInset, boardX + tickInset, boardY + boardSize - tickInset - tickLength);
    this.chromeFront.lineBetween(boardX + boardSize - tickInset, boardY + boardSize - tickInset, boardX + boardSize - tickInset - tickLength, boardY + boardSize - tickInset);
    this.chromeFront.lineBetween(boardX + boardSize - tickInset, boardY + boardSize - tickInset, boardX + boardSize - tickInset, boardY + boardSize - tickInset - tickLength);
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
    const tileX = boardX + goalTile.x * tileSize;
    const tileY = boardY + goalTile.y * tileSize;
    const haloSize = tileSize * 0.92;
    const pulse = legacyTuning.board.goalPulse.basePulse
      + (Math.sin(this.scene.time.now * legacyTuning.board.goalPulse.waveSpeed) * legacyTuning.board.goalPulse.waveAmplitude);
    const sparkPulse = 0.65 + (Math.sin((this.scene.time.now * legacyTuning.board.goalPulse.waveSpeed * 0.66) + 0.85) * 0.35);
    const bracketInset = tileSize * 0.16;
    const bracketLength = tileSize * 0.18;

    this.goal.fillStyle(palette.board.goal, 0.16 * pulse);
    this.goal.fillRect(tileX + 1, tileY + 1, tileSize - 2, tileSize - 2);
    this.goal.lineStyle(Math.max(1, tileSize * 0.055), palette.board.goalCore, 0.82 * pulse);
    this.goal.strokeRect(tileX + 1.5, tileY + 1.5, tileSize - 3, tileSize - 3);

    this.goal.fillStyle(palette.board.goal, legacyTuning.board.goalPulse.tileHaloAlpha * pulse);
    this.goal.fillRect(centerX - haloSize / 2, centerY - haloSize / 2, haloSize, haloSize);

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

    this.goal.lineStyle(Math.max(1, tileSize * 0.045), palette.board.goalCore, 0.7 * pulse);
    this.goal.lineBetween(tileX + bracketInset, tileY + bracketInset, tileX + bracketInset + bracketLength, tileY + bracketInset);
    this.goal.lineBetween(tileX + bracketInset, tileY + bracketInset, tileX + bracketInset, tileY + bracketInset + bracketLength);
    this.goal.lineBetween(tileX + tileSize - bracketInset, tileY + bracketInset, tileX + tileSize - bracketInset - bracketLength, tileY + bracketInset);
    this.goal.lineBetween(tileX + tileSize - bracketInset, tileY + bracketInset, tileX + tileSize - bracketInset, tileY + bracketInset + bracketLength);
    this.goal.lineBetween(tileX + bracketInset, tileY + tileSize - bracketInset, tileX + bracketInset + bracketLength, tileY + tileSize - bracketInset);
    this.goal.lineBetween(tileX + bracketInset, tileY + tileSize - bracketInset, tileX + bracketInset, tileY + tileSize - bracketInset - bracketLength);
    this.goal.lineBetween(tileX + tileSize - bracketInset, tileY + tileSize - bracketInset, tileX + tileSize - bracketInset - bracketLength, tileY + tileSize - bracketInset);
    this.goal.lineBetween(tileX + tileSize - bracketInset, tileY + tileSize - bracketInset, tileX + tileSize - bracketInset, tileY + tileSize - bracketInset - bracketLength);
  }

  public drawTrail(trail: ReadonlyArray<number | DemoTrailStep>): void {
    const { boardX, boardY, tileSize } = this.layout;
    const steps = normalizeTrailSteps(trail);
    this.trail.clear();
    let previousCenterX = 0;
    let previousCenterY = 0;
    const headIndex = steps.length - 1;
    const headPulse = 1 + (Math.sin(this.scene.time.now * 0.008) * legacyTuning.board.trail.headPulseAmplitude);

    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      const index = step.index;
      const tile = this.maze.tiles[index];
      const centerX = boardX + tile.x * tileSize + tileSize / 2;
      const centerY = boardY + tile.y * tileSize + tileSize / 2;
      const t = steps.length <= 1 ? 1 : i / (steps.length - 1);
      const isHead = i === headIndex;
      const isBacktrack = step.mode === 'backtrack';
      const isGoalStep = step.mode === 'goal';
      const alphaBase = Phaser.Math.Linear(legacyTuning.board.trail.minAlpha, legacyTuning.board.trail.maxAlpha, t);
      const alphaScale = isBacktrack ? legacyTuning.board.trail.backtrackAlphaScale : 1;
      const alpha = Phaser.Math.Clamp(
        (alphaBase + (isHead ? legacyTuning.board.trail.headAlphaBoost : 0)) * alphaScale,
        0,
        1
      );
      const glowAlpha = Phaser.Math.Clamp(
        Phaser.Math.Linear(legacyTuning.board.trail.glowMinAlpha, legacyTuning.board.trail.glowMaxAlpha, t)
          + (isHead ? legacyTuning.board.trail.headAlphaBoost * 0.6 : 0),
        0,
        1
      ) * alphaScale;
      const cellInset = tileSize * (
        isBacktrack
          ? legacyTuning.board.trail.backtrackInsetRatio
          : legacyTuning.board.trail.insetRatio
      );
      const nodeRadius = Math.max(
        2,
        tileSize * (
          isHead
            ? legacyTuning.board.trail.headRadiusRatio * headPulse
            : isBacktrack
              ? legacyTuning.board.trail.backtrackNodeRadiusRatio
              : legacyTuning.board.trail.nodeRadiusRatio
        )
      );
      const segmentCoreColor = isGoalStep
        ? palette.board.goalCore
        : isBacktrack
          ? palette.board.topHighlight
          : palette.board.trailCore;
      const segmentGlowColor = isGoalStep
        ? palette.board.goal
        : isBacktrack
          ? palette.board.innerStroke
          : palette.board.trailGlow;
      const segmentFillColor = isGoalStep ? palette.board.goal : palette.board.trail;

      if (isBacktrack) {
        this.trail.lineStyle(Math.max(1, tileSize * 0.04), segmentCoreColor, Math.min(1, alpha + 0.18));
        this.trail.strokeRect(
          boardX + tile.x * tileSize + cellInset,
          boardY + tile.y * tileSize + cellInset,
          tileSize - cellInset * 2,
          tileSize - cellInset * 2
        );
      } else {
        this.trail.fillStyle(segmentFillColor, alpha * (isGoalStep ? 0.88 : 0.7));
        this.trail.fillRect(
          boardX + tile.x * tileSize + cellInset,
          boardY + tile.y * tileSize + cellInset,
          tileSize - cellInset * 2,
          tileSize - cellInset * 2
        );
      }

      this.trail.fillStyle(segmentGlowColor, glowAlpha * (isBacktrack ? 0.7 : 0.92));
      this.trail.fillCircle(centerX, centerY, nodeRadius * (isBacktrack ? 1.2 : 1.55));
      this.trail.fillStyle(segmentCoreColor, Math.min(1, alpha + (isGoalStep ? 0.34 : 0.24)));
      this.trail.fillCircle(centerX, centerY, nodeRadius);

      if (i === 0) {
        previousCenterX = centerX;
        previousCenterY = centerY;
        continue;
      }

      this.trail.lineStyle(
        Math.max(3, tileSize * legacyTuning.board.trail.glowLineWidthRatio),
        segmentGlowColor,
        glowAlpha * (isHead ? 1 : isBacktrack ? 0.62 : 0.9)
      );
      this.trail.lineBetween(previousCenterX, previousCenterY, centerX, centerY);
      this.trail.lineStyle(
        Math.max(isBacktrack ? 1 : 2, tileSize * legacyTuning.board.trail.lineWidthRatio * (isBacktrack ? 0.7 : 1)),
        segmentCoreColor,
        Phaser.Math.Clamp(
          Phaser.Math.Linear(legacyTuning.board.trail.minLineAlpha, legacyTuning.board.trail.maxLineAlpha, t)
            + (isHead ? legacyTuning.board.trail.headAlphaBoost * 0.5 : 0),
          0,
          1
        ) * (isBacktrack ? legacyTuning.board.trail.backtrackLineAlphaScale : 1)
      );
      this.trail.lineBetween(previousCenterX, previousCenterY, centerX, centerY);
      previousCenterX = centerX;
      previousCenterY = centerY;
    }
  }

  public drawActor(index: number, direction: 0 | 1 | 2 | 3 | null = null): void {
    const { boardX, boardY, tileSize } = this.layout;
    const tile = this.maze.tiles[index];
    const tileX = boardX + tile.x * tileSize;
    const tileY = boardY + tile.y * tileSize;
    const centerX = boardX + tile.x * tileSize + (tileSize / 2);
    const centerY = boardY + tile.y * tileSize + (tileSize / 2);
    const actorTuning = legacyTuning.board.actor;
    const actorPulse = 1 + (Math.sin(this.scene.time.now * actorTuning.pulseSpeed) * actorTuning.pulseAmplitude);

    this.actor.clear();
    this.actor.fillStyle(palette.board.player, 0.16);
    this.actor.fillRect(tileX + 1, tileY + 1, tileSize - 2, tileSize - 2);
    this.actor.lineStyle(Math.max(1, tileSize * 0.05), palette.board.playerHalo, 0.66);
    this.actor.strokeRect(tileX + 1.5, tileY + 1.5, tileSize - 3, tileSize - 3);
    this.actor.fillStyle(palette.board.playerShadow, actorTuning.shadowAlpha);
    this.actor.fillCircle(
      centerX,
      centerY + tileSize * actorTuning.shadowOffsetYRatio,
      tileSize * actorTuning.shadowRadiusRatio
    );

    this.actor.fillStyle(palette.board.playerHalo, actorTuning.haloAlpha);
    this.actor.fillCircle(centerX, centerY, tileSize * actorTuning.haloRadiusRatio * actorPulse);

    this.actor.fillStyle(palette.board.playerCore, 1);
    this.actor.fillCircle(centerX, centerY, tileSize * actorTuning.coreRadiusRatio);

    this.actor.lineStyle(Math.max(2, tileSize * actorTuning.ringWidthRatio), palette.board.player, 0.95);
    this.actor.strokeCircle(centerX, centerY, tileSize * actorTuning.ringRadiusRatio);
    this.actor.lineStyle(Math.max(1, tileSize * 0.03), palette.board.playerCore, actorTuning.outerRingAlpha);
    this.actor.strokeCircle(centerX, centerY, tileSize * actorTuning.outerRingRadiusRatio * actorPulse);

    this.actor.fillStyle(palette.board.playerHalo, 0.85);
    this.actor.fillCircle(
      centerX - tileSize * actorTuning.highlightOffsetRatio,
      centerY - tileSize * actorTuning.highlightOffsetRatio,
      tileSize * actorTuning.highlightRadiusRatio
    );

    if (direction !== null) {
      const offset = tileSize * actorTuning.pointerOffsetRatio;
      const directionOffsets = [
        { x: 0, y: -offset },
        { x: 0, y: offset },
        { x: -offset, y: 0 },
        { x: offset, y: 0 }
      ] as const;
      const facing = directionOffsets[direction];

      this.actor.lineStyle(Math.max(2, tileSize * actorTuning.pointerWidthRatio), palette.board.playerCore, 0.96);
      this.actor.lineBetween(centerX, centerY, centerX + facing.x, centerY + facing.y);
      this.actor.fillStyle(palette.board.playerCore, 0.98);
      this.actor.fillCircle(centerX + facing.x, centerY + facing.y, tileSize * actorTuning.pointerRadiusRatio);
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
