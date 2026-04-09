import Phaser from 'phaser';
import type { DemoTrailStep, DemoWalkerCue } from '../domain/ai';
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

export interface BoardCueOptions {
  cue?: DemoWalkerCue;
  targetIndex?: number | null;
}

const ACTOR_DIRECTION_OFFSETS = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 }
] as const;

const ACTOR_PERPENDICULAR_OFFSETS = [
  { x: 1, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: 1 }
] as const;

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
  private readonly signal: Phaser.GameObjects.Graphics;
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
    this.signal = this.scene.add.graphics();
    this.trail = this.scene.add.graphics();
    this.actor = this.scene.add.graphics();
    this.chromeFront = this.scene.add.graphics();
    this.ambientContainer.add([this.chromeBack, this.base, this.grid, this.goal, this.signal, this.trail, this.actor, this.chromeFront]);
  }

  private drawTileBrackets(
    graphics: Phaser.GameObjects.Graphics,
    tileX: number,
    tileY: number,
    tileSize: number,
    inset: number,
    length: number
  ): void {
    graphics.lineBetween(tileX + inset, tileY + inset, tileX + inset + length, tileY + inset);
    graphics.lineBetween(tileX + inset, tileY + inset, tileX + inset, tileY + inset + length);
    graphics.lineBetween(tileX + tileSize - inset, tileY + inset, tileX + tileSize - inset - length, tileY + inset);
    graphics.lineBetween(tileX + tileSize - inset, tileY + inset, tileX + tileSize - inset, tileY + inset + length);
    graphics.lineBetween(tileX + inset, tileY + tileSize - inset, tileX + inset + length, tileY + tileSize - inset);
    graphics.lineBetween(tileX + inset, tileY + tileSize - inset, tileX + inset, tileY + tileSize - inset - length);
    graphics.lineBetween(
      tileX + tileSize - inset,
      tileY + tileSize - inset,
      tileX + tileSize - inset - length,
      tileY + tileSize - inset
    );
    graphics.lineBetween(
      tileX + tileSize - inset,
      tileY + tileSize - inset,
      tileX + tileSize - inset,
      tileY + tileSize - inset - length
    );
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

  public drawGoal(cue: DemoWalkerCue = 'explore'): void {
    const { boardX, boardY, tileSize } = this.layout;
    const goalTile = this.maze.tiles[this.maze.endIndex];
    const now = this.scene.time.now;
    this.goal.clear();

    const centerX = boardX + goalTile.x * tileSize + tileSize / 2;
    const centerY = boardY + goalTile.y * tileSize + tileSize / 2;
    const tileX = boardX + goalTile.x * tileSize;
    const tileY = boardY + goalTile.y * tileSize;
    const haloSize = tileSize * 0.92;
    const cueBoost = cue === 'goal'
      ? 1.34
      : cue === 'anticipate'
        ? 1.12
      : cue === 'reacquire'
        ? 1.18
        : cue === 'dead-end'
          ? 0.94
          : cue === 'reset'
            ? 0.88
          : 1;
    const pulse = legacyTuning.board.goalPulse.basePulse
      + (Math.sin(now * legacyTuning.board.goalPulse.waveSpeed) * legacyTuning.board.goalPulse.waveAmplitude * cueBoost);
    const sparkPulse = 0.65 + (Math.sin((now * legacyTuning.board.goalPulse.waveSpeed * 0.66) + 0.85) * 0.35);
    const bracketInset = tileSize * legacyTuning.board.goalPulse.reticleInsetRatio;
    const bracketLength = tileSize * 0.18;
    const beaconRadius = tileSize * legacyTuning.board.goalPulse.beaconRadiusRatio * cueBoost;
    const sweepPulse = 0.76 + (Math.sin((now * legacyTuning.board.goalPulse.waveSpeed * 0.34) + 1.3) * 0.24);

    this.goal.fillStyle(palette.board.goal, 0.16 * pulse);
    this.goal.fillRect(tileX + 1, tileY + 1, tileSize - 2, tileSize - 2);
    this.goal.lineStyle(Math.max(1, tileSize * 0.055), palette.board.goalCore, 0.82 * pulse);
    this.goal.strokeRect(tileX + 1.5, tileY + 1.5, tileSize - 3, tileSize - 3);

    this.goal.fillStyle(palette.board.goal, legacyTuning.board.goalPulse.beaconAlpha * pulse);
    this.goal.fillCircle(centerX, centerY, beaconRadius);

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

    this.goal.lineStyle(Math.max(1, tileSize * 0.03), palette.board.goalCore, 0.28 * cueBoost * sweepPulse);
    this.goal.strokeRect(
      centerX - tileSize * legacyTuning.board.goalPulse.outerRingRadiusRatio * sweepPulse,
      centerY - tileSize * legacyTuning.board.goalPulse.outerRingRadiusRatio * sweepPulse,
      tileSize * legacyTuning.board.goalPulse.outerRingRadiusRatio * sweepPulse * 2,
      tileSize * legacyTuning.board.goalPulse.outerRingRadiusRatio * sweepPulse * 2
    );

    this.goal.lineStyle(1, palette.board.goal, legacyTuning.board.goalPulse.outerRingAlpha * pulse);
    this.goal.strokeCircle(centerX, centerY, tileSize * legacyTuning.board.goalPulse.outerRingRadiusRatio);
    this.goal.lineStyle(Math.max(1, tileSize * 0.03), palette.board.goal, legacyTuning.board.goalPulse.outerRingAlpha * 0.72 * pulse);
    this.goal.strokeRect(
      centerX - tileSize * legacyTuning.board.goalPulse.outerRingRadiusRatio * 0.86,
      centerY - tileSize * legacyTuning.board.goalPulse.outerRingRadiusRatio * 0.86,
      tileSize * legacyTuning.board.goalPulse.outerRingRadiusRatio * 1.72,
      tileSize * legacyTuning.board.goalPulse.outerRingRadiusRatio * 1.72
    );

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
    this.drawTileBrackets(this.goal, tileX, tileY, tileSize, bracketInset, bracketLength);
  }

  public drawTrail(trail: ReadonlyArray<number | DemoTrailStep>, options: BoardCueOptions = {}): void {
    const { boardX, boardY, tileSize } = this.layout;
    const cue = options.cue ?? 'explore';
    const now = this.scene.time.now;
    this.trail.clear();
    this.signal.clear();
    let previousCenterX = 0;
    let previousCenterY = 0;
    let headCenterX = 0;
    let headCenterY = 0;
    const headIndex = trail.length - 1;
    const headPulse = 1 + (Math.sin(now * 0.008) * legacyTuning.board.trail.headPulseAmplitude);
    const targetPulse = 0.7 + (Math.sin(now * 0.01) * 0.3);
    const cueHeadBoost = cue === 'anticipate'
      ? 0.18
      : cue === 'reacquire'
        ? 0.12
        : cue === 'goal'
          ? 0.16
          : 0;

    for (let i = 0; i < trail.length; i += 1) {
      const step = trail[i];
      const index = typeof step === 'number' ? step : step.index;
      const mode = typeof step === 'number' ? 'explore' : step.mode;
      const tile = this.maze.tiles[index];
      const centerX = boardX + tile.x * tileSize + tileSize / 2;
      const centerY = boardY + tile.y * tileSize + tileSize / 2;
      const t = trail.length <= 1 ? 1 : i / (trail.length - 1);
      const isHead = i === headIndex;
      const isBacktrack = mode === 'backtrack';
      const isGoalStep = mode === 'goal';
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
            ? legacyTuning.board.trail.headRadiusRatio * (headPulse + cueHeadBoost)
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
      if (isHead) {
        headCenterX = centerX;
        headCenterY = centerY;
      }

      if (isBacktrack) {
        this.trail.fillStyle(segmentGlowColor, legacyTuning.board.trail.backtrackGlowAlpha * glowAlpha);
        this.trail.fillRect(
          boardX + tile.x * tileSize + (cellInset * 0.72),
          boardY + tile.y * tileSize + (cellInset * 0.72),
          tileSize - (cellInset * 1.44),
          tileSize - (cellInset * 1.44)
        );
        this.trail.lineStyle(Math.max(1, tileSize * 0.05), segmentCoreColor, legacyTuning.board.trail.backtrackOutlineAlpha * Math.min(1, alpha + 0.14));
        this.trail.strokeRect(
          boardX + tile.x * tileSize + cellInset,
          boardY + tile.y * tileSize + cellInset,
          tileSize - cellInset * 2,
          tileSize - cellInset * 2
        );
        this.trail.lineStyle(Math.max(1, tileSize * 0.03), segmentCoreColor, alpha * 0.84);
        this.trail.lineBetween(centerX - nodeRadius, centerY - nodeRadius, centerX + nodeRadius, centerY + nodeRadius);
      } else {
        this.trail.fillStyle(segmentFillColor, alpha * (isGoalStep ? 0.92 : 0.76));
        this.trail.fillRect(
          boardX + tile.x * tileSize + cellInset,
          boardY + tile.y * tileSize + cellInset,
          tileSize - cellInset * 2,
          tileSize - cellInset * 2
        );
      }

      if (isBacktrack) {
        const glowSize = nodeRadius * 2.5;
        const coreSize = nodeRadius * 1.75;
        this.trail.fillStyle(segmentGlowColor, glowAlpha * 0.8);
        this.trail.fillRect(centerX - glowSize / 2, centerY - glowSize / 2, glowSize, glowSize);
        this.trail.fillStyle(segmentCoreColor, Math.min(1, alpha + 0.22));
        this.trail.fillRect(centerX - coreSize / 2, centerY - coreSize / 2, coreSize, coreSize);
      } else {
        this.trail.fillStyle(segmentGlowColor, glowAlpha * 0.92);
        this.trail.fillCircle(centerX, centerY, nodeRadius * 1.55);
        this.trail.fillStyle(segmentCoreColor, Math.min(1, alpha + (isGoalStep ? 0.34 : 0.24)));
        this.trail.fillCircle(centerX, centerY, nodeRadius);
      }

      if (i === 0) {
        previousCenterX = centerX;
        previousCenterY = centerY;
        continue;
      }

      this.trail.lineStyle(
        Math.max(
          isBacktrack ? 2 : 3,
          tileSize * (isBacktrack ? legacyTuning.board.trail.backtrackGlowLineWidthRatio : legacyTuning.board.trail.glowLineWidthRatio)
        ),
        segmentGlowColor,
        glowAlpha * (isHead ? 1 : isBacktrack ? 0.62 : 0.9)
      );
      this.trail.lineBetween(previousCenterX, previousCenterY, centerX, centerY);
      this.trail.lineStyle(
        Math.max(
          isBacktrack ? 1 : 2,
          tileSize * (isBacktrack ? legacyTuning.board.trail.backtrackLineWidthRatio : legacyTuning.board.trail.lineWidthRatio)
        ),
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

    if (options.targetIndex !== null
      && options.targetIndex !== undefined
      && cue !== 'explore'
      && cue !== 'spawn'
      && cue !== 'goal'
      && cue !== 'reset') {
      const targetTile = this.maze.tiles[options.targetIndex];
      const targetX = boardX + targetTile.x * tileSize;
      const targetY = boardY + targetTile.y * tileSize;
      const targetCenterX = targetX + tileSize / 2;
      const targetCenterY = targetY + tileSize / 2;
      const bracketInset = tileSize * legacyTuning.board.trail.targetBracketInsetRatio;
      const bracketLength = tileSize * legacyTuning.board.trail.targetBracketLengthRatio;
      const signalColor = cue === 'dead-end' ? palette.board.goal : palette.board.topHighlight;
      const lineAlpha = cue === 'anticipate'
        ? 0.44 + (targetPulse * 0.22)
        : cue === 'reacquire'
          ? 0.38 + (targetPulse * 0.2)
          : 0.26 + (targetPulse * 0.18);

      this.signal.lineStyle(Math.max(1, tileSize * 0.035), signalColor, lineAlpha);
      this.signal.lineBetween(headCenterX, headCenterY, targetCenterX, targetCenterY);
      this.signal.fillStyle(signalColor, legacyTuning.board.trail.targetTileAlpha * targetPulse);
      this.signal.fillRect(targetX + 1, targetY + 1, tileSize - 2, tileSize - 2);
      this.signal.fillStyle(signalColor, 0.18 + (targetPulse * 0.18));
      this.signal.fillCircle(targetCenterX, targetCenterY, tileSize * 0.18);
      this.signal.lineStyle(
        Math.max(1, tileSize * (cue === 'anticipate' ? 0.05 : 0.04)),
        signalColor,
        legacyTuning.board.trail.targetBracketAlpha * targetPulse
      );
      this.drawTileBrackets(this.signal, targetX, targetY, tileSize, bracketInset, bracketLength);
    }

    if (cue === 'dead-end' && trail[headIndex]) {
      const headStep = trail[headIndex];
      const headIndexValue = typeof headStep === 'number' ? headStep : headStep.index;
      const headTile = this.maze.tiles[headIndexValue];
      const headX = boardX + headTile.x * tileSize;
      const headY = boardY + headTile.y * tileSize;
      const pulseInset = tileSize * 0.14;
      this.signal.lineStyle(Math.max(1, tileSize * 0.045), palette.board.goal, 0.42 + (targetPulse * 0.26));
      this.signal.strokeRect(
        headX + pulseInset,
        headY + pulseInset,
        tileSize - (pulseInset * 2),
        tileSize - (pulseInset * 2)
      );
      this.signal.lineBetween(
        headX + pulseInset,
        headY + pulseInset,
        headX + tileSize - pulseInset,
        headY + tileSize - pulseInset
      );
      this.signal.lineBetween(
        headX + tileSize - pulseInset,
        headY + pulseInset,
        headX + pulseInset,
        headY + tileSize - pulseInset
      );
    } else if (cue === 'anticipate' && trail[headIndex]) {
      const headStep = trail[headIndex];
      const headIndexValue = typeof headStep === 'number' ? headStep : headStep.index;
      const headTile = this.maze.tiles[headIndexValue];
      const pulseInset = tileSize * 0.18;
      this.signal.lineStyle(Math.max(1, tileSize * 0.035), palette.board.topHighlight, 0.28 + (targetPulse * 0.18));
      this.signal.strokeRect(
        boardX + headTile.x * tileSize + pulseInset,
        boardY + headTile.y * tileSize + pulseInset,
        tileSize - (pulseInset * 2),
        tileSize - (pulseInset * 2)
      );
    }
  }

  public drawActor(index: number, direction: 0 | 1 | 2 | 3 | null = null, cue: DemoWalkerCue = 'explore'): void {
    const { boardX, boardY, tileSize } = this.layout;
    const tile = this.maze.tiles[index];
    const now = this.scene.time.now;
    const tileX = boardX + tile.x * tileSize;
    const tileY = boardY + tile.y * tileSize;
    const centerX = boardX + tile.x * tileSize + (tileSize / 2);
    const centerY = boardY + tile.y * tileSize + (tileSize / 2);
    const actorTuning = legacyTuning.board.actor;
    const cuePulse = 1 + (Math.sin(now * actorTuning.pulseSpeed) * actorTuning.pulseAmplitude);
    const facingVector = direction === null ? null : ACTOR_DIRECTION_OFFSETS[direction];
    const perpendicular = direction === null ? null : ACTOR_PERPENDICULAR_OFFSETS[direction];
    const nudgeRatio = cue === 'anticipate'
      ? actorTuning.anticipationNudgeRatio
      : cue === 'reacquire'
        ? actorTuning.reacquireNudgeRatio
        : 0;
    const nudgeScale = facingVector === null ? 0 : (0.62 + (Math.sin(now * 0.012) * 0.38));
    const bodyCenterX = centerX + ((facingVector?.x ?? 0) * tileSize * nudgeRatio * nudgeScale);
    const bodyCenterY = centerY + ((facingVector?.y ?? 0) * tileSize * nudgeRatio * nudgeScale);
    const actorPulse = cue === 'goal'
      ? cuePulse * 1.06
      : cue === 'anticipate'
        ? cuePulse * 1.14
      : cue === 'reacquire'
        ? cuePulse * 1.12
        : cuePulse;
    const haloAlpha = cue === 'goal'
      ? actorTuning.goalHaloAlpha
      : cue === 'anticipate'
        ? actorTuning.haloAlpha + 0.08
        : cue === 'backtrack'
          ? actorTuning.backtrackHaloAlpha
          : actorTuning.haloAlpha;
    const outerRingAlpha = cue === 'reacquire'
      ? actorTuning.reacquireRingAlpha
      : cue === 'anticipate'
        ? 0.88
      : cue === 'dead-end'
        ? actorTuning.deadEndRingAlpha
        : actorTuning.outerRingAlpha;
    const ringColor = cue === 'goal'
      ? palette.board.goal
      : cue === 'backtrack'
        ? palette.board.topHighlight
        : palette.board.player;
    const pointerColor = cue === 'goal'
      ? palette.board.goalCore
      : cue === 'backtrack'
        ? palette.board.topHighlight
        : palette.board.playerCore;

    this.actor.clear();
    this.actor.fillStyle(palette.board.player, cue === 'anticipate' ? 0.2 : 0.16);
    this.actor.fillRect(tileX + 1, tileY + 1, tileSize - 2, tileSize - 2);
    this.actor.lineStyle(Math.max(1, tileSize * 0.05), palette.board.playerHalo, cue === 'dead-end' ? 0.8 : 0.66);
    this.actor.strokeRect(tileX + 1.5, tileY + 1.5, tileSize - 3, tileSize - 3);
    this.actor.fillStyle(palette.board.playerShadow, actorTuning.shadowAlpha);
    this.actor.fillCircle(
      bodyCenterX,
      bodyCenterY + tileSize * actorTuning.shadowOffsetYRatio,
      tileSize * actorTuning.shadowRadiusRatio
    );

    this.actor.fillStyle(palette.board.playerHalo, haloAlpha);
    this.actor.fillCircle(bodyCenterX, bodyCenterY, tileSize * actorTuning.haloRadiusRatio * actorPulse);

    this.actor.fillStyle(palette.board.playerCore, 1);
    this.actor.fillCircle(bodyCenterX, bodyCenterY, tileSize * actorTuning.coreRadiusRatio);

    this.actor.lineStyle(Math.max(2, tileSize * actorTuning.ringWidthRatio), ringColor, cue === 'backtrack' ? 0.86 : 0.95);
    this.actor.strokeCircle(bodyCenterX, bodyCenterY, tileSize * actorTuning.ringRadiusRatio);
    this.actor.lineStyle(Math.max(1, tileSize * 0.03), pointerColor, outerRingAlpha);
    this.actor.strokeCircle(bodyCenterX, bodyCenterY, tileSize * actorTuning.outerRingRadiusRatio * actorPulse);

    this.actor.fillStyle(palette.board.playerHalo, 0.85);
    this.actor.fillCircle(
      bodyCenterX - tileSize * actorTuning.highlightOffsetRatio,
      bodyCenterY - tileSize * actorTuning.highlightOffsetRatio,
      tileSize * actorTuning.highlightRadiusRatio
    );

    if (direction !== null && facingVector !== null && perpendicular !== null) {
      const offset = tileSize * actorTuning.pointerOffsetRatio;
      const tipX = bodyCenterX + (facingVector.x * tileSize * actorTuning.pointerLengthRatio);
      const tipY = bodyCenterY + (facingVector.y * tileSize * actorTuning.pointerLengthRatio);
      const baseX = bodyCenterX + (facingVector.x * offset);
      const baseY = bodyCenterY + (facingVector.y * offset);
      const tailX = bodyCenterX - (facingVector.x * tileSize * 0.12);
      const tailY = bodyCenterY - (facingVector.y * tileSize * 0.12);
      const halfWidth = tileSize * actorTuning.pointerBaseWidthRatio;

      this.actor.lineStyle(Math.max(2, tileSize * actorTuning.pointerWidthRatio), pointerColor, 0.96);
      this.actor.lineBetween(bodyCenterX, bodyCenterY, baseX, baseY);
      this.actor.fillStyle(pointerColor, 0.98);
      this.actor.fillTriangle(
        tipX,
        tipY,
        baseX + (perpendicular.x * halfWidth),
        baseY + (perpendicular.y * halfWidth),
        baseX - (perpendicular.x * halfWidth),
        baseY - (perpendicular.y * halfWidth)
      );
      this.actor.fillCircle(baseX, baseY, tileSize * actorTuning.pointerRadiusRatio);
      this.actor.lineStyle(Math.max(1, tileSize * 0.03), pointerColor, cue === 'anticipate' ? 0.68 : 0.34);
      this.actor.lineBetween(bodyCenterX, bodyCenterY, tailX, tailY);
    }

    if (cue === 'dead-end') {
      const inset = tileSize * 0.1;
      this.actor.lineStyle(Math.max(1, tileSize * 0.04), palette.board.goal, 0.4 + (Math.sin(now * 0.012) * 0.14));
      this.actor.strokeRect(tileX + inset, tileY + inset, tileSize - (inset * 2), tileSize - (inset * 2));
      this.actor.lineBetween(tileX + inset, tileY + inset, tileX + tileSize - inset, tileY + tileSize - inset);
      this.actor.lineBetween(tileX + tileSize - inset, tileY + inset, tileX + inset, tileY + tileSize - inset);
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
