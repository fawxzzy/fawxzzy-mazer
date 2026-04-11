import Phaser from 'phaser';
import type { DemoTrailStep, DemoWalkerCue } from '../domain/ai';
import type { MazeEpisode } from '../domain/maze';
import { legacyTuning } from '../config/tuning';
import { isTileFloor, isTilePath, xFromIndex, yFromIndex } from '../domain/maze';
import { palette } from './palette';
import { resolveSceneViewport } from './viewport';

export interface BoardLayout {
  boardX: number;
  boardY: number;
  boardWidth: number;
  boardHeight: number;
  boardSize: number;
  tileSize: number;
  boardBounds: BoardBounds;
  safeBounds: BoardBounds;
}

export interface BoardBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

interface BoardLayoutOptions {
  boardScale?: number;
  topReserve?: number;
  sidePadding?: number;
  bottomPadding?: number;
}

interface BaseRenderOptions {
  showSolutionPath?: boolean;
  solutionPathAlpha?: number;
}

export interface BoardThemeStyle {
  palette?: typeof palette;
  solutionPathGlowAlphaScale?: number;
  solutionPathCoreAlphaScale?: number;
  trailFillAlphaScale?: number;
  trailGlowAlphaScale?: number;
  trailCoreAlphaScale?: number;
  actorHaloAlphaScale?: number;
  goalGlowAlphaScale?: number;
}

interface BoardRendererOptions {
  theme?: BoardThemeStyle;
}

export interface BoardCueOptions {
  cue?: DemoWalkerCue;
  targetIndex?: number | null;
  limit?: number;
  start?: number;
  emphasis?: 'player' | 'demo';
  persistentTrail?: boolean;
  persistentFadeFloor?: number;
  pulseBoost?: number;
  activeMotion?: {
    fromIndex: number;
    toIndex: number;
    progress: number;
  };
}

interface BoardRenderPresetProfile {
  floorInsetAlphaScale: number;
  floorGridAlphaScale: number;
  wallAlphaScale: number;
  pathGlowAlphaScale: number;
  pathCoreAlphaScale: number;
  showFrameGuide: boolean;
  showBlueprintGuide: boolean;
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

const MIN_BOARD_SIZE = 24;
const ANIMATION_TIME_WRAP_MS = 600_000;
const BOARD_RENDER_PRESET_PROFILES: Record<MazeEpisode['presentationPreset'], BoardRenderPresetProfile> = {
  classic: {
    floorInsetAlphaScale: 1,
    floorGridAlphaScale: 1,
    wallAlphaScale: 1,
    pathGlowAlphaScale: 1,
    pathCoreAlphaScale: 1,
    showFrameGuide: false,
    showBlueprintGuide: false
  },
  braided: {
    floorInsetAlphaScale: 0.96,
    floorGridAlphaScale: 0.92,
    wallAlphaScale: 0.94,
    pathGlowAlphaScale: 1.12,
    pathCoreAlphaScale: 1.08,
    showFrameGuide: false,
    showBlueprintGuide: false
  },
  framed: {
    floorInsetAlphaScale: 1.04,
    floorGridAlphaScale: 0.86,
    wallAlphaScale: 0.92,
    pathGlowAlphaScale: 1.06,
    pathCoreAlphaScale: 1.04,
    showFrameGuide: true,
    showBlueprintGuide: false
  },
  'blueprint-rare': {
    floorInsetAlphaScale: 1.08,
    floorGridAlphaScale: 1.22,
    wallAlphaScale: 0.9,
    pathGlowAlphaScale: 0.94,
    pathCoreAlphaScale: 1.12,
    showFrameGuide: true,
    showBlueprintGuide: true
  }
};

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const sanitizePositive = (value: unknown, fallback: number, minimum = 1): number => (
  isFiniteNumber(value) && value >= minimum ? value : fallback
);
const sanitizeRange = (value: unknown, fallback: number, min: number, max: number): number => (
  Phaser.Math.Clamp(isFiniteNumber(value) ? value : fallback, min, max)
);
const normalizeAnimationTime = (value: number, periodMs = ANIMATION_TIME_WRAP_MS): number => {
  if (!Number.isFinite(value) || periodMs <= 0) {
    return 0;
  }

  const wrapped = value % periodMs;
  return wrapped < 0 ? wrapped + periodMs : wrapped;
};
const createBounds = (left: number, top: number, width: number, height: number): BoardBounds => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
  centerX: left + (width / 2),
  centerY: top + (height / 2)
});
export const isRenderableLayout = (layout: BoardLayout): boolean => (
  isFiniteNumber(layout.boardX)
  && isFiniteNumber(layout.boardY)
  && isFiniteNumber(layout.boardWidth)
  && isFiniteNumber(layout.boardHeight)
  && isFiniteNumber(layout.tileSize)
  && layout.boardWidth > 0
  && layout.boardHeight > 0
  && layout.tileSize > 0
);

export const createBoardLayout = (
  scene: Phaser.Scene,
  episode: MazeEpisode,
  options: BoardLayoutOptions | number = {}
): BoardLayout => {
  const normalizedOptions: BoardLayoutOptions = typeof options === 'number'
    ? { boardScale: options }
    : options;

  const boardScale = sanitizeRange(normalizedOptions.boardScale, 0.9, 0.2, 1);
  const topReserve = sanitizePositive(normalizedOptions.topReserve, 64, 0);
  const sidePadding = sanitizePositive(normalizedOptions.sidePadding, 16, 0);
  const bottomPadding = sanitizePositive(normalizedOptions.bottomPadding, sidePadding, 0);
  const viewport = resolveSceneViewport(scene);
  const width = viewport.width;
  const height = viewport.height;
  const rasterWidth = sanitizePositive(episode?.raster?.width, 1, 1);
  const rasterHeight = sanitizePositive(episode?.raster?.height, 1, 1);
  const availableWidth = Math.max(1, width - (sidePadding * 2));
  const availableHeight = Math.max(1, height - topReserve - bottomPadding);
  const minimumBoardSize = Math.min(MIN_BOARD_SIZE, availableWidth, availableHeight);
  const boardSize = Math.max(minimumBoardSize, Math.floor(Math.min(availableWidth, availableHeight) * boardScale));
  const tileSize = Math.max(1, Math.floor(boardSize / Math.max(rasterWidth, rasterHeight)));
  const boardWidth = tileSize * rasterWidth;
  const boardHeight = tileSize * rasterHeight;
  const maxBoardX = Math.max(0, width - sidePadding - boardWidth);
  const minBoardX = Math.min(sidePadding, maxBoardX);
  const maxBoardY = Math.max(0, height - bottomPadding - boardHeight);
  const minBoardY = Math.min(topReserve, maxBoardY);
  const boardX = Phaser.Math.Clamp(
    (width / 2) - (boardWidth / 2),
    minBoardX,
    Math.max(minBoardX, maxBoardX)
  );
  const boardY = Phaser.Math.Clamp(
    topReserve + ((availableHeight - boardHeight) / 2),
    minBoardY,
    Math.max(minBoardY, maxBoardY)
  );
  const safeBounds = createBounds(sidePadding, topReserve, availableWidth, availableHeight);
  const boardBounds = createBounds(boardX, boardY, boardWidth, boardHeight);

  return {
    boardX,
    boardY,
    boardSize,
    boardWidth,
    boardHeight,
    tileSize,
    boardBounds,
    safeBounds
  };
};

export const resolveBoardPresentationBounds = (
  layout: BoardLayout,
  offsetX = 0,
  offsetY = 0
): BoardBounds => createBounds(
  layout.boardX + (isFiniteNumber(offsetX) ? offsetX : 0),
  layout.boardY + (isFiniteNumber(offsetY) ? offsetY : 0),
  layout.boardWidth,
  layout.boardHeight
);

export class BoardRenderer {
  private episode: MazeEpisode;
  private readonly theme: BoardThemeStyle;
  private readonly chromeBack: Phaser.GameObjects.Graphics;
  private readonly base: Phaser.GameObjects.Graphics;
  private readonly grid: Phaser.GameObjects.Graphics;
  private readonly start: Phaser.GameObjects.Graphics;
  private readonly goal: Phaser.GameObjects.Graphics;
  private readonly signal: Phaser.GameObjects.Graphics;
  private readonly trail: Phaser.GameObjects.Graphics;
  private readonly actor: Phaser.GameObjects.Graphics;
  private readonly chromeFront: Phaser.GameObjects.Graphics;
  private readonly ambientContainer: Phaser.GameObjects.Container;
  private ambientTween?: Phaser.Tweens.Tween;
  private baseOffsetX = 0;
  private baseOffsetY = 0;

  public constructor(
    private readonly scene: Phaser.Scene,
    episode: MazeEpisode,
    private readonly layout: BoardLayout,
    options: BoardRendererOptions = {}
  ) {
    this.episode = episode;
    this.theme = options.theme ?? {};
    this.ambientContainer = this.scene.add.container(0, 0);
    this.chromeBack = this.scene.add.graphics();
    this.base = this.scene.add.graphics();
    this.grid = this.scene.add.graphics();
    this.start = this.scene.add.graphics();
    this.goal = this.scene.add.graphics();
    this.signal = this.scene.add.graphics();
    this.trail = this.scene.add.graphics();
    this.actor = this.scene.add.graphics();
    this.chromeFront = this.scene.add.graphics();
    this.ambientContainer.add([
      this.chromeBack,
      this.base,
      this.grid,
      this.start,
      this.goal,
      this.signal,
      this.trail,
      this.actor,
      this.chromeFront
    ]);
  }

  public setEpisode(episode: MazeEpisode): void {
    this.episode = episode;
  }

  private get colors(): typeof palette {
    return this.theme.palette ?? palette;
  }

  private getScale(value: number | undefined, fallback = 1): number {
    return isFiniteNumber(value) ? value : fallback;
  }

  public getTileSize(): number {
    return Math.max(1, this.layout.tileSize);
  }

  public setPresentationOffset(x: number, y: number): void {
    this.baseOffsetX = isFiniteNumber(x) ? x : 0;
    this.baseOffsetY = isFiniteNumber(y) ? y : 0;
    this.ambientContainer.setPosition(this.baseOffsetX, this.baseOffsetY);
  }

  private tileX(index: number): number {
    const rasterWidth = sanitizePositive(this.episode?.raster?.width, 1, 1);
    return this.layout.boardX + (xFromIndex(index, rasterWidth) * this.layout.tileSize);
  }

  private tileY(index: number): number {
    const rasterWidth = sanitizePositive(this.episode?.raster?.width, 1, 1);
    return this.layout.boardY + (yFromIndex(index, rasterWidth) * this.layout.tileSize);
  }

  private tileCenter(index: number): { x: number; y: number } {
    return {
      x: this.tileX(index) + (this.layout.tileSize / 2),
      y: this.tileY(index) + (this.layout.tileSize / 2)
    };
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

  private fillAxisAlignedSegment(
    graphics: Phaser.GameObjects.Graphics,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    thickness: number,
    color: number,
    alpha: number
  ): void {
    const width = Math.max(1, thickness);
    const minX = Math.min(fromX, toX);
    const maxX = Math.max(fromX, toX);
    const minY = Math.min(fromY, toY);
    const maxY = Math.max(fromY, toY);

    graphics.fillStyle(color, alpha);
    if (Math.abs(fromX - toX) >= Math.abs(fromY - toY)) {
      graphics.fillRect(
        minX,
        fromY - (width / 2),
        Math.max(width, (maxX - minX) + width),
        width
      );
      return;
    }

    graphics.fillRect(
      fromX - (width / 2),
      minY,
      width,
      Math.max(width, (maxY - minY) + width)
    );
  }

  public drawBoardChrome(): void {
    if (!isRenderableLayout(this.layout)) {
      this.chromeBack.clear();
      this.chromeFront.clear();
      return;
    }

    const { boardX, boardY, boardWidth, boardHeight, boardSize } = this.layout;
    const colors = this.colors;
    const centerX = boardX + boardWidth / 2;
    const centerY = boardY + boardHeight / 2;
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
    const outerAlphaGlass = Math.min(0.38, outerAlpha * 0.26);
    const panelAlphaGlass = Math.min(0.32, panelAlpha * 0.38);
    const wellAlphaGlass = Math.min(0.14, (wellAlpha * 0.52) + 0.01);
    const shadowAlphaGlass = Math.min(0.2, shadowAlpha * 0.36);
    const glowAlphaGlass = Math.min(0.05, glowAlpha * 0.22);
    const edgeShadeAlphaGlass = edgeShadeAlpha * 0.14;
    const topHighlightAlphaGlass = topHighlightAlpha * 0.24;

    this.chromeBack.clear();
    this.chromeFront.clear();

    this.chromeBack.fillStyle(colors.board.shadow, shadowAlphaGlass);
    this.chromeBack.fillRect(
      centerX - (boardWidth + scaleMetric(shadowExpandPx * 0.72)) / 2,
      centerY - (boardHeight + scaleMetric(shadowExpandPx * 0.48)) / 2 + scaleMetric(shadowOffsetY * 0.7),
      boardWidth + scaleMetric(shadowExpandPx * 0.72),
      boardHeight + scaleMetric(shadowExpandPx * 0.48)
    );

    this.chromeBack.fillStyle(colors.board.glow, glowAlphaGlass);
    this.chromeBack.fillRect(
      centerX - (boardWidth + scaleMetric(glowExpandPx)) / 2,
      centerY - (boardHeight + scaleMetric(glowExpandPx)) / 2,
      boardWidth + scaleMetric(glowExpandPx),
      boardHeight + scaleMetric(glowExpandPx)
    );

    this.chromeBack.fillStyle(colors.board.outer, outerAlphaGlass);
    this.chromeBack.fillRect(
      centerX - (boardWidth + scaleMetric(outerExpandPx)) / 2,
      centerY - (boardHeight + scaleMetric(outerExpandPx)) / 2,
      boardWidth + scaleMetric(outerExpandPx),
      boardHeight + scaleMetric(outerExpandPx)
    );
    this.chromeBack.lineStyle(scaleMetric(outerStrokeWidth), colors.board.outerStroke, 0.82);
    this.chromeBack.strokeRect(
      centerX - (boardWidth + scaleMetric(outerExpandPx)) / 2,
      centerY - (boardHeight + scaleMetric(outerExpandPx)) / 2,
      boardWidth + scaleMetric(outerExpandPx),
      boardHeight + scaleMetric(outerExpandPx)
    );
    this.chromeBack.lineStyle(1, colors.board.panelStroke, 0.18);
    this.chromeBack.strokeRect(
      centerX - (boardWidth + scaleMetric(outerExpandPx - 6)) / 2,
      centerY - (boardHeight + scaleMetric(outerExpandPx - 6)) / 2,
      boardWidth + scaleMetric(outerExpandPx - 6),
      boardHeight + scaleMetric(outerExpandPx - 6)
    );

    this.chromeBack.fillStyle(colors.board.panel, panelAlphaGlass);
    this.chromeBack.fillRect(boardX, boardY, boardWidth, boardHeight);
    this.chromeBack.lineStyle(1, colors.board.panelStroke, 0.2);
    this.chromeBack.strokeRect(
      boardX + scaleMetric(5),
      boardY + scaleMetric(5),
      boardWidth - scaleMetric(10),
      boardHeight - scaleMetric(10)
    );
    this.chromeBack.lineStyle(scaleMetric(innerStrokeWidth), colors.board.innerStroke, 0.32);
    this.chromeBack.strokeRect(boardX + 1, boardY + 1, boardWidth - 2, boardHeight - 2);

    this.chromeBack.fillStyle(colors.board.well, wellAlphaGlass);
    this.chromeBack.fillRect(
      boardX + scaleMetric(wellInsetPx),
      boardY + scaleMetric(wellInsetPx),
      boardWidth - (scaleMetric(wellInsetPx) * 2),
      boardHeight - (scaleMetric(wellInsetPx) * 2)
    );

    const sheenInset = scaleMetric(Math.max(wellInsetPx + 4, 10));
    const sheenWidth = Math.max(12, boardWidth - (sheenInset * 2));
    const upperSheenHeight = Math.max(2, scaleMetric(12));
    const lowerShadeHeight = Math.max(2, scaleMetric(8));
    this.chromeBack.fillStyle(colors.board.topHighlight, 0.032);
    this.chromeBack.fillRect(boardX + sheenInset, boardY + sheenInset, sheenWidth, upperSheenHeight);
    this.chromeBack.fillStyle(colors.board.shadow, 0.032);
    this.chromeBack.fillRect(
      boardX + sheenInset,
      boardY + boardHeight - sheenInset - lowerShadeHeight,
      sheenWidth,
      lowerShadeHeight
    );

    this.chromeBack.fillStyle(colors.board.shadow, edgeShadeAlphaGlass);
    this.chromeBack.fillRect(boardX, boardY, scaleMetric(edgeShadeWidthPx), boardHeight);
    this.chromeBack.fillRect(
      boardX,
      boardY + boardHeight - scaleMetric(edgeShadeWidthPx),
      boardWidth,
      scaleMetric(edgeShadeWidthPx)
    );
    this.chromeBack.fillRect(
      boardX + boardWidth - scaleMetric(edgeShadeWidthPx),
      boardY,
      scaleMetric(edgeShadeWidthPx),
      boardHeight
    );

    this.chromeBack.fillStyle(colors.board.topHighlight, topHighlightAlphaGlass);
    this.chromeBack.fillRect(
      boardX + scaleMetric(topHighlightInsetPx + 2),
      boardY + scaleMetric(topHighlightInsetPx + 2),
      boardWidth - (scaleMetric(topHighlightInsetPx + 2) * 2),
      Math.max(1, scaleMetric(topHighlightHeightPx))
    );

    const tickInset = scaleMetric(cornerTickInsetPx);
    const tickLength = scaleMetric(cornerTickLengthPx);
    this.chromeFront.lineStyle(scaleMetric(1), colors.board.outerStroke, cornerTickAlpha * 0.42);
    this.chromeFront.lineBetween(boardX + tickInset, boardY + tickInset, boardX + tickInset + tickLength, boardY + tickInset);
    this.chromeFront.lineBetween(boardX + tickInset, boardY + tickInset, boardX + tickInset, boardY + tickInset + tickLength);
    this.chromeFront.lineBetween(boardX + boardWidth - tickInset, boardY + tickInset, boardX + boardWidth - tickInset - tickLength, boardY + tickInset);
    this.chromeFront.lineBetween(boardX + boardWidth - tickInset, boardY + tickInset, boardX + boardWidth - tickInset, boardY + tickInset + tickLength);
    this.chromeFront.lineBetween(boardX + tickInset, boardY + boardHeight - tickInset, boardX + tickInset + tickLength, boardY + boardHeight - tickInset);
    this.chromeFront.lineBetween(boardX + tickInset, boardY + boardHeight - tickInset, boardX + tickInset, boardY + boardHeight - tickInset - tickLength);
    this.chromeFront.lineBetween(boardX + boardWidth - tickInset, boardY + boardHeight - tickInset, boardX + boardWidth - tickInset - tickLength, boardY + boardHeight - tickInset);
    this.chromeFront.lineBetween(boardX + boardWidth - tickInset, boardY + boardHeight - tickInset, boardX + boardWidth - tickInset, boardY + boardHeight - tickInset - tickLength);
  }

  public drawBase(options: BaseRenderOptions = {}): void {
    if (!isRenderableLayout(this.layout)) {
      this.base.clear();
      this.grid.clear();
      return;
    }

    const { tileSize, boardX, boardY, boardWidth, boardHeight } = this.layout;
    const colors = this.colors;
    const bevel = Math.max(1, Math.round(tileSize * legacyTuning.board.tile.bevelRatio));
    const presetProfile = BOARD_RENDER_PRESET_PROFILES[this.episode.presentationPreset];
    const solutionGlowScale = this.getScale(this.theme.solutionPathGlowAlphaScale);
    const solutionCoreScale = this.getScale(this.theme.solutionPathCoreAlphaScale);
    const solutionPathAlpha = Phaser.Math.Clamp(
      options.solutionPathAlpha ?? (options.showSolutionPath === true ? 1 : 0),
      0,
      1
    );
    const showSolutionPath = solutionPathAlpha > 0;
    this.base.clear();
    this.grid.clear();

    this.base.fillStyle(colors.board.panel, 0.025);
    this.base.fillRect(boardX, boardY, boardWidth, boardHeight);

    for (let index = 0; index < this.episode.raster.tiles.length; index += 1) {
      const x = this.tileX(index);
      const y = this.tileY(index);

      if (isTileFloor(this.episode.raster.tiles, index)) {
        this.base.fillStyle(colors.board.path, 0.82);
        this.base.fillRect(x, y, tileSize, tileSize);

        const floorInset = tileSize * legacyTuning.board.tile.floorInsetRatio;
        this.base.fillStyle(colors.board.floor, legacyTuning.board.tile.floorInsetAlpha * presetProfile.floorInsetAlphaScale);
        this.base.fillRect(x + floorInset, y + floorInset, tileSize - floorInset * 2, tileSize - floorInset * 2);

        this.base.fillStyle(colors.board.topHighlight, legacyTuning.board.tile.floorHighlightAlpha * 0.72);
        this.base.fillRect(x + bevel, y + bevel, tileSize - (bevel * 2), bevel);
        this.base.fillRect(x + bevel, y + bevel, bevel, tileSize - (bevel * 2));

        if (showSolutionPath && isTilePath(this.episode.raster.tiles, index)) {
          const hintInset = tileSize * 0.26;
          this.base.fillStyle(
            colors.board.route,
            0.3 * solutionPathAlpha * presetProfile.pathGlowAlphaScale
          );
          this.base.fillRect(
            x + hintInset,
            y + hintInset,
            tileSize - (hintInset * 2),
            tileSize - (hintInset * 2)
          );
          this.grid.lineStyle(
            Math.max(1, tileSize * 0.048),
            colors.board.routeGlow,
            0.34 * solutionPathAlpha * presetProfile.pathGlowAlphaScale * solutionGlowScale
          );
          this.grid.strokeRect(
            x + hintInset + 0.5,
            y + hintInset + 0.5,
            tileSize - (hintInset * 2) - 1,
            tileSize - (hintInset * 2) - 1
          );
          this.grid.lineStyle(
            Math.max(1, tileSize * 0.03),
            colors.board.routeCore,
            0.64 * solutionPathAlpha * presetProfile.pathCoreAlphaScale * solutionCoreScale
          );
          this.grid.strokeRect(
            x + hintInset + tileSize * 0.08 + 0.5,
            y + hintInset + tileSize * 0.08 + 0.5,
            tileSize - ((hintInset + tileSize * 0.08) * 2) - 1,
            tileSize - ((hintInset + tileSize * 0.08) * 2) - 1
          );
        }

        this.base.fillStyle(colors.board.shadow, legacyTuning.board.tile.floorShadowAlpha * 0.7);
        this.base.fillRect(x + tileSize - (bevel * 2), y + bevel, bevel, tileSize - (bevel * 2));
        this.base.fillRect(x + bevel, y + tileSize - (bevel * 2), tileSize - (bevel * 2), bevel);

        const floorGridAlpha = legacyTuning.board.tile.floorGridAlpha * presetProfile.floorGridAlphaScale;
        this.grid.lineStyle(1, colors.board.innerStroke, floorGridAlpha);
        this.grid.strokeRect(x + 0.5, y + 0.5, tileSize - 1, tileSize - 1);

        this.base.fillStyle(colors.board.topHighlight, legacyTuning.board.tile.floorSheenAlpha * 0.58);
        this.base.fillRect(x + 1, y + 1, tileSize - 2, Math.max(1, tileSize * 0.2));
      } else {
        this.base.fillStyle(colors.board.wall, legacyTuning.board.tile.wallAlpha * presetProfile.wallAlphaScale);
        this.base.fillRect(x, y, tileSize, tileSize);
      }
    }

    this.base.fillStyle(colors.board.topHighlight, 0.025);
    this.base.fillRect(boardX + 1, boardY + 1, Math.max(2, boardWidth - 2), Math.max(2, Math.round(tileSize * 0.55)));
    this.base.fillStyle(colors.board.shadow, 0.05);
    this.base.fillRect(
      boardX + 1,
      boardY + boardHeight - Math.max(2, Math.round(tileSize * 0.46)) - 1,
      Math.max(2, boardWidth - 2),
      Math.max(2, Math.round(tileSize * 0.46))
    );

    if (presetProfile.showFrameGuide) {
      const inset = Math.max(2, Math.round(tileSize * 1.2));
      this.grid.lineStyle(
        Math.max(1, tileSize * 0.05),
        colors.board.topHighlight,
        this.episode.presentationPreset === 'blueprint-rare' ? 0.16 : 0.1
      );
      this.grid.strokeRect(
        boardX + inset + 0.5,
        boardY + inset + 0.5,
        Math.max(2, boardWidth - (inset * 2) - 1),
        Math.max(2, boardHeight - (inset * 2) - 1)
      );
    }

    if (presetProfile.showBlueprintGuide) {
      const step = Math.max(3, Math.round(tileSize * 4));
      this.grid.lineStyle(1, colors.board.topHighlight, 0.1);
      for (let x = boardX + step; x < boardX + boardWidth - step; x += step) {
        this.grid.lineBetween(x + 0.5, boardY + 1, x + 0.5, boardY + boardHeight - 1);
      }
      for (let y = boardY + step; y < boardY + boardHeight - step; y += step) {
        this.grid.lineBetween(boardX + 1, y + 0.5, boardX + boardWidth - 1, y + 0.5);
      }
    }
  }

  public drawStart(cue: DemoWalkerCue = 'spawn'): void {
    if (!isRenderableLayout(this.layout)) {
      this.start.clear();
      return;
    }

    const { tileSize } = this.layout;
    const colors = this.colors;
    const haloScale = this.getScale(this.theme.actorHaloAlphaScale);
    const now = normalizeAnimationTime(this.scene.time.now);
    const tileX = this.tileX(this.episode.raster.startIndex);
    const tileY = this.tileY(this.episode.raster.startIndex);
    const centerX = tileX + tileSize / 2;
    const centerY = tileY + tileSize / 2;
    const cueBoost = cue === 'spawn'
      ? 1.18
      : cue === 'goal'
        ? 0.92
        : cue === 'reset'
          ? 0.86
          : 1;
    const pulse = 0.92 + (Math.sin((now * 0.0044) + 0.65) * 0.16 * cueBoost);
    const bracketInset = tileSize * 0.14;
    const bracketLength = tileSize * 0.18;
    const coreRadius = tileSize * 0.12;
    const ringRadius = tileSize * 0.32;
    const innerSize = Math.max(2, tileSize * 0.44);
    const outerSize = Math.max(3, tileSize * 0.72);

    this.start.clear();
    this.start.fillStyle(colors.board.startGlow, 0.08 * pulse * haloScale);
    this.start.fillRect(tileX + 1, tileY + 1, tileSize - 2, tileSize - 2);
    this.start.lineStyle(Math.max(1, tileSize * 0.04), colors.board.startGlow, 0.36 * pulse * haloScale);
    this.start.strokeRect(tileX + 1.5, tileY + 1.5, tileSize - 3, tileSize - 3);
    this.start.fillStyle(colors.board.start, 0.12 * pulse * haloScale);
    this.start.fillCircle(centerX, centerY, tileSize * 0.42);
    this.start.lineStyle(Math.max(1, tileSize * 0.048), colors.board.start, 0.84 * pulse);
    this.start.strokeRect(centerX - (outerSize / 2), centerY - (outerSize / 2), outerSize, outerSize);
    this.start.fillStyle(colors.board.startCore, 0.98);
    this.start.fillCircle(centerX, centerY, coreRadius);
    this.start.lineStyle(Math.max(1, tileSize * 0.04), colors.board.startCore, 0.9);
    this.start.lineBetween(centerX - ringRadius, centerY, centerX + ringRadius, centerY);
    this.start.lineBetween(centerX, centerY - ringRadius, centerX, centerY + ringRadius);
    this.start.lineStyle(Math.max(1, tileSize * 0.032), colors.board.startCore, 0.82);
    this.start.strokeRect(centerX - (innerSize / 2), centerY - (innerSize / 2), innerSize, innerSize);
    this.drawTileBrackets(this.start, tileX, tileY, tileSize, bracketInset, bracketLength);
  }

  public drawGoal(cue: DemoWalkerCue = 'explore'): void {
    if (!isRenderableLayout(this.layout)) {
      this.goal.clear();
      return;
    }

    const { tileSize } = this.layout;
    const colors = this.colors;
    const goalGlowScale = this.getScale(this.theme.goalGlowAlphaScale);
    const now = normalizeAnimationTime(this.scene.time.now);
    this.goal.clear();

    const tileX = this.tileX(this.episode.raster.endIndex);
    const tileY = this.tileY(this.episode.raster.endIndex);
    const centerX = tileX + tileSize / 2;
    const centerY = tileY + tileSize / 2;
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

    this.goal.fillStyle(colors.board.goal, 0.09 * pulse * goalGlowScale);
    this.goal.fillRect(tileX + 1, tileY + 1, tileSize - 2, tileSize - 2);
    this.goal.lineStyle(Math.max(1, tileSize * 0.055), colors.board.goalCore, 0.7 * pulse);
    this.goal.strokeRect(tileX + 1.5, tileY + 1.5, tileSize - 3, tileSize - 3);

    this.goal.fillStyle(colors.board.goal, legacyTuning.board.goalPulse.beaconAlpha * pulse * goalGlowScale);
    this.goal.fillCircle(centerX, centerY, beaconRadius);

    this.goal.fillStyle(colors.board.goal, legacyTuning.board.goalPulse.tileHaloAlpha * 0.64 * pulse * goalGlowScale);
    this.goal.fillRect(centerX - haloSize / 2, centerY - haloSize / 2, haloSize, haloSize);

    this.goal.fillStyle(colors.board.goal, legacyTuning.board.goalPulse.glowAlpha * 0.74 * pulse * goalGlowScale);
    this.goal.fillCircle(centerX, centerY, tileSize * legacyTuning.board.goalPulse.glowRadiusRatio);

    this.goal.lineStyle(
      Math.max(1, tileSize * legacyTuning.board.goalPulse.outerRingWidthRatio),
      colors.board.goal,
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
      colors.board.goal,
      legacyTuning.board.goalPulse.ringAlpha + ((pulse - legacyTuning.board.goalPulse.basePulse) * 0.5)
    );
    this.goal.strokeCircle(centerX, centerY, tileSize * legacyTuning.board.goalPulse.ringRadiusRatio);

    this.goal.lineStyle(Math.max(1, tileSize * 0.03), colors.board.goalCore, 0.28 * cueBoost * sweepPulse);
    this.goal.strokeRect(
      centerX - tileSize * legacyTuning.board.goalPulse.outerRingRadiusRatio * sweepPulse,
      centerY - tileSize * legacyTuning.board.goalPulse.outerRingRadiusRatio * sweepPulse,
      tileSize * legacyTuning.board.goalPulse.outerRingRadiusRatio * sweepPulse * 2,
      tileSize * legacyTuning.board.goalPulse.outerRingRadiusRatio * sweepPulse * 2
    );

    this.goal.lineStyle(1, colors.board.goal, legacyTuning.board.goalPulse.outerRingAlpha * pulse);
    this.goal.strokeCircle(centerX, centerY, tileSize * legacyTuning.board.goalPulse.outerRingRadiusRatio);
    this.goal.lineStyle(Math.max(1, tileSize * 0.03), colors.board.goal, legacyTuning.board.goalPulse.outerRingAlpha * 0.72 * pulse);
    this.goal.strokeRect(
      centerX - tileSize * legacyTuning.board.goalPulse.outerRingRadiusRatio * 0.86,
      centerY - tileSize * legacyTuning.board.goalPulse.outerRingRadiusRatio * 0.86,
      tileSize * legacyTuning.board.goalPulse.outerRingRadiusRatio * 1.72,
      tileSize * legacyTuning.board.goalPulse.outerRingRadiusRatio * 1.72
    );

    this.goal.fillStyle(colors.board.goal, 1);
    this.goal.fillCircle(centerX, centerY, tileSize * legacyTuning.board.goalPulse.coreRadiusRatio);

    this.goal.fillStyle(colors.board.goalCore, 0.96);
    this.goal.fillCircle(centerX, centerY, tileSize * legacyTuning.board.goalPulse.coreHighlightRadiusRatio);

    this.goal.lineStyle(Math.max(1, tileSize * 0.035), colors.board.goalCore, legacyTuning.board.goalPulse.sparkAlpha * sparkPulse);
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

    this.goal.lineStyle(Math.max(1, tileSize * 0.045), colors.board.goalCore, 0.7 * pulse);
    this.drawTileBrackets(this.goal, tileX, tileY, tileSize, bracketInset, bracketLength);
  }

  public drawTrail(trail: ArrayLike<number | DemoTrailStep>, options: BoardCueOptions = {}): void {
    if (!isRenderableLayout(this.layout)) {
      this.trail.clear();
      this.signal.clear();
      return;
    }

    const { tileSize } = this.layout;
    const colors = this.colors;
    const trailFillScale = this.getScale(this.theme.trailFillAlphaScale);
    const trailGlowScale = this.getScale(this.theme.trailGlowAlphaScale);
    const trailCoreScale = this.getScale(this.theme.trailCoreAlphaScale);
    const cue = options.cue ?? 'explore';
    const now = normalizeAnimationTime(this.scene.time.now);
    const trailLength = Math.min(options.limit ?? trail.length, trail.length);
    const trailStart = Math.max(0, Math.min(options.start ?? 0, Math.max(0, trailLength - 1)));
    const demoEmphasis = options.emphasis === 'demo';
    const persistentTrail = options.persistentTrail === true || demoEmphasis;
    const persistentFadeFloor = Phaser.Math.Clamp(options.persistentFadeFloor ?? 0.22, 0, 0.92);
    const pulseBoost = Phaser.Math.Clamp(options.pulseBoost ?? 0, -0.08, 0.18);
    const activeMotion = options.activeMotion;
    const hasActiveMotion = activeMotion !== undefined
      && activeMotion.fromIndex !== activeMotion.toIndex
      && cue !== 'goal'
      && cue !== 'reset';
    const motionProgress = hasActiveMotion
      ? Phaser.Math.Clamp(activeMotion?.progress ?? 0, 0, 1)
      : 0;
    const easedMotionProgress = motionProgress * motionProgress * (3 - (2 * motionProgress));
    const motionFromCenter = hasActiveMotion ? this.tileCenter(activeMotion.fromIndex) : undefined;
    const motionToCenter = hasActiveMotion ? this.tileCenter(activeMotion.toIndex) : undefined;
    this.trail.clear();
    this.signal.clear();
    if (trailLength === 0 || trailStart >= trailLength) {
      return;
    }
    let previousCenterX = 0;
    let previousCenterY = 0;
    let headCenterX = 0;
    let headCenterY = 0;
    const headIndex = trailLength - 1;
    const headPulse = 1 + (Math.sin(now * 0.008) * (legacyTuning.board.trail.headPulseAmplitude + pulseBoost));
    const targetPulse = 0.7 + (Math.sin(now * 0.01) * 0.3);
    const cueHeadBoost = cue === 'anticipate'
      ? 0.18
      : cue === 'reacquire'
        ? 0.12
        : cue === 'goal'
        ? 0.16
        : 0;
    const visibleLength = Math.max(1, trailLength - trailStart);
    const insetScale = demoEmphasis ? 0.9 : 1;
    const alphaBoost = demoEmphasis ? 0.08 : 0;
    const glowBoost = demoEmphasis ? 0.06 : 0;

    for (let i = trailStart; i < trailLength; i += 1) {
      const step = trail[i];
      const index = typeof step === 'number' ? step : step.index;
      const mode = typeof step === 'number' ? 'explore' : step.mode;
      const tileX = this.tileX(index);
      const tileY = this.tileY(index);
      const centerX = tileX + tileSize / 2;
      const centerY = tileY + tileSize / 2;
      const t = visibleLength <= 1 ? 1 : (i - trailStart) / (visibleLength - 1);
      const isHead = i === headIndex;
      const isBacktrack = mode === 'backtrack';
      const isGoalStep = mode === 'goal' || (i === headIndex && (cue === 'goal' || cue === 'reset'));
      const alphaBase = persistentTrail
        ? Phaser.Math.Linear(Math.max(legacyTuning.board.trail.minAlpha, persistentFadeFloor), legacyTuning.board.trail.maxAlpha, t)
        : Phaser.Math.Linear(legacyTuning.board.trail.minAlpha, legacyTuning.board.trail.maxAlpha, t);
      const alphaScale = isBacktrack ? legacyTuning.board.trail.backtrackAlphaScale : 1;
      const alpha = Phaser.Math.Clamp(
        (alphaBase + alphaBoost + (isHead ? legacyTuning.board.trail.headAlphaBoost : 0)) * alphaScale,
        0,
        1
      );
      const glowAlpha = Phaser.Math.Clamp(
        Phaser.Math.Linear(legacyTuning.board.trail.glowMinAlpha, legacyTuning.board.trail.glowMaxAlpha, t)
          + glowBoost
          + (isHead ? legacyTuning.board.trail.headAlphaBoost * 0.6 : 0),
        0,
        1
      ) * alphaScale;
      const cellInset = tileSize * (
        isBacktrack
          ? legacyTuning.board.trail.backtrackInsetRatio
          : legacyTuning.board.trail.insetRatio
      ) * insetScale;
      const nodeRadius = Math.max(
        2,
        tileSize * (
          isHead
            ? legacyTuning.board.trail.headRadiusRatio * (headPulse + cueHeadBoost + (demoEmphasis ? 0.06 : 0))
            : isBacktrack
              ? legacyTuning.board.trail.backtrackNodeRadiusRatio
              : legacyTuning.board.trail.nodeRadiusRatio
        )
      );
      const renderCenterX = isHead && hasActiveMotion
        ? Phaser.Math.Linear(
          motionFromCenter?.x ?? centerX,
          motionToCenter?.x ?? centerX,
          easedMotionProgress
        )
        : centerX;
      const renderCenterY = isHead && hasActiveMotion
        ? Phaser.Math.Linear(
          motionFromCenter?.y ?? centerY,
          motionToCenter?.y ?? centerY,
          easedMotionProgress
        )
        : centerY;
      const segmentCoreColor = isGoalStep
        ? colors.board.goalCore
        : isBacktrack
          ? colors.board.topHighlight
          : colors.board.trailCore;
      const segmentGlowColor = isGoalStep
        ? colors.board.goal
        : isBacktrack
          ? colors.board.innerStroke
          : colors.board.trailGlow;
      const segmentFillColor = isGoalStep ? colors.board.goal : colors.board.trail;
      if (isHead) {
        headCenterX = renderCenterX;
        headCenterY = renderCenterY;
      }

      if (i !== trailStart) {
        const bodyGlowWidth = Math.max(
          2,
          tileSize * (isBacktrack ? legacyTuning.board.trail.backtrackGlowLineWidthRatio : legacyTuning.board.trail.glowLineWidthRatio)
        );
        const bodyCoreWidth = Math.max(
          1,
          tileSize * (isBacktrack ? legacyTuning.board.trail.backtrackLineWidthRatio : legacyTuning.board.trail.lineWidthRatio)
        );
        this.fillAxisAlignedSegment(
          this.trail,
          previousCenterX,
          previousCenterY,
          renderCenterX,
          renderCenterY,
          bodyGlowWidth,
          segmentGlowColor,
          glowAlpha * (isHead ? 0.68 : isBacktrack ? 0.38 : 0.32) * trailGlowScale
        );
        this.fillAxisAlignedSegment(
          this.trail,
          previousCenterX,
          previousCenterY,
          renderCenterX,
          renderCenterY,
          bodyCoreWidth,
          segmentCoreColor,
          Phaser.Math.Clamp(
            Phaser.Math.Linear(legacyTuning.board.trail.minLineAlpha, legacyTuning.board.trail.maxLineAlpha, t)
              + (isHead ? legacyTuning.board.trail.headAlphaBoost * 0.36 : 0),
            0,
            1
          ) * (isBacktrack ? legacyTuning.board.trail.backtrackLineAlphaScale : 1) * trailCoreScale
        );
      }

      if (isBacktrack) {
        this.trail.fillStyle(segmentGlowColor, legacyTuning.board.trail.backtrackGlowAlpha * glowAlpha * trailGlowScale);
        this.trail.fillRect(
          tileX + (cellInset * 0.72),
          tileY + (cellInset * 0.72),
          tileSize - (cellInset * 1.44),
          tileSize - (cellInset * 1.44)
        );
        this.trail.lineStyle(
          Math.max(1, tileSize * 0.05),
          segmentCoreColor,
          legacyTuning.board.trail.backtrackOutlineAlpha * Math.min(1, alpha + 0.14) * trailCoreScale
        );
        this.trail.strokeRect(
          tileX + cellInset,
          tileY + cellInset,
          tileSize - cellInset * 2,
          tileSize - cellInset * 2
        );
        this.trail.lineStyle(Math.max(1, tileSize * 0.03), segmentCoreColor, alpha * 0.84 * trailCoreScale);
        this.trail.lineBetween(renderCenterX - nodeRadius, renderCenterY - nodeRadius, renderCenterX + nodeRadius, renderCenterY + nodeRadius);
      } else {
        if (!isHead || !hasActiveMotion || isGoalStep) {
          this.trail.fillStyle(segmentFillColor, alpha * (isGoalStep ? 0.7 : 0.22) * trailFillScale);
          this.trail.fillRect(
            tileX + cellInset,
            tileY + cellInset,
            tileSize - cellInset * 2,
            tileSize - cellInset * 2
          );
          const coreNodeSize = Math.max(2, Math.round(nodeRadius * (isGoalStep ? 1.18 : 0.82)));
          this.trail.fillStyle(
            segmentCoreColor,
            Math.min(1, alpha * (isGoalStep ? 0.92 : 0.46)) * trailCoreScale
          );
          this.trail.fillRect(
            renderCenterX - (coreNodeSize / 2),
            renderCenterY - (coreNodeSize / 2),
            coreNodeSize,
            coreNodeSize
          );
        }
      }

      if (isBacktrack) {
        const glowSize = nodeRadius * 2.5;
        const coreSize = nodeRadius * 1.75;
        this.trail.fillStyle(segmentGlowColor, glowAlpha * 0.8 * trailGlowScale);
        this.trail.fillRect(renderCenterX - glowSize / 2, renderCenterY - glowSize / 2, glowSize, glowSize);
        this.trail.fillStyle(segmentCoreColor, Math.min(1, alpha + 0.22) * trailCoreScale);
        this.trail.fillRect(renderCenterX - coreSize / 2, renderCenterY - coreSize / 2, coreSize, coreSize);
      } else if (isHead || isGoalStep) {
        this.trail.fillStyle(segmentGlowColor, glowAlpha * (isHead ? 0.56 : 0.4) * trailGlowScale);
        this.trail.fillCircle(renderCenterX, renderCenterY, nodeRadius * (isHead ? 1.42 : 1.18));
        this.trail.fillStyle(segmentCoreColor, Math.min(1, alpha + (isGoalStep ? 0.28 : 0.2)) * trailCoreScale);
        this.trail.fillCircle(renderCenterX, renderCenterY, nodeRadius * (isHead ? 0.92 : 0.78));
      }

      if (i === trailStart) {
        previousCenterX = renderCenterX;
        previousCenterY = renderCenterY;
        continue;
      }
      previousCenterX = renderCenterX;
      previousCenterY = renderCenterY;
    }

    if (options.targetIndex !== null
      && options.targetIndex !== undefined
      && cue !== 'explore'
      && cue !== 'spawn'
      && cue !== 'goal'
      && cue !== 'reset') {
      const targetX = this.tileX(options.targetIndex);
      const targetY = this.tileY(options.targetIndex);
      const targetCenterX = targetX + tileSize / 2;
      const targetCenterY = targetY + tileSize / 2;
      const bracketInset = tileSize * legacyTuning.board.trail.targetBracketInsetRatio;
      const bracketLength = tileSize * legacyTuning.board.trail.targetBracketLengthRatio;
      const signalColor = cue === 'dead-end' ? colors.board.goal : colors.board.topHighlight;
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
      const headX = this.tileX(headIndexValue);
      const headY = this.tileY(headIndexValue);
      const pulseInset = tileSize * 0.14;
      this.signal.lineStyle(Math.max(1, tileSize * 0.045), colors.board.goal, 0.42 + (targetPulse * 0.26));
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
      const headX = this.tileX(headIndexValue);
      const headY = this.tileY(headIndexValue);
      const pulseInset = tileSize * 0.18;
      this.signal.lineStyle(Math.max(1, tileSize * 0.035), colors.board.topHighlight, 0.28 + (targetPulse * 0.18));
      this.signal.strokeRect(
        headX + pulseInset,
        headY + pulseInset,
        tileSize - (pulseInset * 2),
        tileSize - (pulseInset * 2)
      );
    }
  }

  public drawActor(
    index: number,
    direction: 0 | 1 | 2 | 3 | null = null,
    cue: DemoWalkerCue = 'explore',
    pulseBoost = 0
  ): void {
    if (!isRenderableLayout(this.layout)) {
      this.actor.clear();
      return;
    }

    const { tileSize } = this.layout;
    const now = normalizeAnimationTime(this.scene.time.now);
    const tileX = this.tileX(index);
    const tileY = this.tileY(index);
    const centerX = tileX + tileSize / 2;
    const centerY = tileY + tileSize / 2;
    this.drawActorAt(centerX, centerY, tileX, tileY, tileSize, direction, cue, now, pulseBoost);
  }

  public drawActorMotion(
    fromIndex: number,
    toIndex: number,
    progress: number,
    direction: 0 | 1 | 2 | 3 | null = null,
    cue: DemoWalkerCue = 'explore',
    pulseBoost = 0
  ): void {
    if (!isRenderableLayout(this.layout)) {
      this.actor.clear();
      return;
    }

    const { tileSize } = this.layout;
    const now = normalizeAnimationTime(this.scene.time.now);
    const fromTileX = this.tileX(fromIndex);
    const fromTileY = this.tileY(fromIndex);
    const toTileX = this.tileX(toIndex);
    const toTileY = this.tileY(toIndex);
    const clampedProgress = Phaser.Math.Clamp(progress, 0, 1);
    const easedProgress = clampedProgress * clampedProgress * (3 - (2 * clampedProgress));
    const centerX = Phaser.Math.Linear(fromTileX + (tileSize / 2), toTileX + (tileSize / 2), easedProgress);
    const centerY = Phaser.Math.Linear(fromTileY + (tileSize / 2), toTileY + (tileSize / 2), easedProgress);
    const tileX = Phaser.Math.Linear(fromTileX, toTileX, easedProgress);
    const tileY = Phaser.Math.Linear(fromTileY, toTileY, easedProgress);
    this.drawActorAt(centerX, centerY, tileX, tileY, tileSize, direction, cue, now, pulseBoost);
  }

  public drawActorOffset(
    index: number,
    offsetX: number,
    offsetY: number,
    direction: 0 | 1 | 2 | 3 | null = null,
    cue: DemoWalkerCue = 'dead-end',
    pulseBoost = 0
  ): void {
    if (!isRenderableLayout(this.layout)) {
      this.actor.clear();
      return;
    }

    const { tileSize } = this.layout;
    const now = normalizeAnimationTime(this.scene.time.now);
    const tileX = this.tileX(index);
    const tileY = this.tileY(index);
    const centerX = tileX + (tileSize / 2) + offsetX;
    const centerY = tileY + (tileSize / 2) + offsetY;
    this.drawActorAt(centerX, centerY, tileX + offsetX, tileY + offsetY, tileSize, direction, cue, now, pulseBoost);
  }

  private drawActorAt(
    centerX: number,
    centerY: number,
    tileX: number,
    tileY: number,
    tileSize: number,
    direction: 0 | 1 | 2 | 3 | null,
    cue: DemoWalkerCue,
    now: number,
    pulseBoost: number
  ): void {
    const actorTuning = legacyTuning.board.actor;
    const colors = this.colors;
    const actorHaloScale = this.getScale(this.theme.actorHaloAlphaScale);
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
    const actorPulse = (cue === 'goal'
      ? cuePulse * 1.06
      : cue === 'anticipate'
        ? cuePulse * 1.14
        : cue === 'reacquire'
        ? cuePulse * 1.12
          : cuePulse) + pulseBoost;
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
      ? colors.board.goal
      : cue === 'backtrack'
        ? colors.board.topHighlight
        : colors.board.player;
    const pointerColor = cue === 'goal'
      ? colors.board.goalCore
      : cue === 'backtrack'
        ? colors.board.topHighlight
        : colors.board.playerCore;

    this.actor.clear();
    this.actor.fillStyle(colors.board.player, cue === 'anticipate' ? 0.14 : 0.1);
    this.actor.fillRect(tileX + 1, tileY + 1, tileSize - 2, tileSize - 2);
    this.actor.lineStyle(Math.max(1, tileSize * 0.05), colors.board.playerHalo, (cue === 'dead-end' ? 0.62 : 0.5) * actorHaloScale);
    this.actor.strokeRect(tileX + 1.5, tileY + 1.5, tileSize - 3, tileSize - 3);
    this.actor.fillStyle(colors.board.playerShadow, actorTuning.shadowAlpha * 0.72);
    this.actor.fillCircle(
      bodyCenterX,
      bodyCenterY + tileSize * actorTuning.shadowOffsetYRatio,
      tileSize * actorTuning.shadowRadiusRatio
    );

    this.actor.fillStyle(colors.board.playerHalo, haloAlpha * 0.82 * actorHaloScale);
    this.actor.fillCircle(bodyCenterX, bodyCenterY, tileSize * actorTuning.haloRadiusRatio * actorPulse);

    this.actor.fillStyle(colors.board.player, 1);
    this.actor.fillCircle(bodyCenterX, bodyCenterY, tileSize * actorTuning.coreRadiusRatio * 1.06);
    this.actor.fillStyle(colors.board.playerCore, 1);
    this.actor.fillCircle(bodyCenterX, bodyCenterY, tileSize * actorTuning.coreRadiusRatio * 0.58);

    this.actor.lineStyle(Math.max(2, tileSize * actorTuning.ringWidthRatio), colors.board.playerHalo, cue === 'backtrack' ? 0.74 : 0.88);
    this.actor.strokeCircle(bodyCenterX, bodyCenterY, tileSize * actorTuning.ringRadiusRatio);
    this.actor.lineStyle(Math.max(1, tileSize * 0.03), ringColor, outerRingAlpha * 0.72);
    this.actor.strokeCircle(bodyCenterX, bodyCenterY, tileSize * actorTuning.outerRingRadiusRatio * actorPulse);

    this.actor.fillStyle(colors.board.playerHalo, 0.62 * actorHaloScale);
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
      this.actor.lineStyle(Math.max(1, tileSize * 0.04), colors.board.goal, 0.4 + (Math.sin(now * 0.012) * 0.14));
      this.actor.strokeRect(tileX + inset, tileY + inset, tileSize - (inset * 2), tileSize - (inset * 2));
      this.actor.lineBetween(tileX + inset, tileY + inset, tileX + tileSize - inset, tileY + tileSize - inset);
      this.actor.lineBetween(tileX + tileSize - inset, tileY + inset, tileX + inset, tileY + tileSize - inset);
    }
  }

  public startAmbientMotion(distanceX: number, distanceY: number, durationMs: number): void {
    this.ambientTween?.remove();
    this.ambientContainer.setPosition(this.baseOffsetX, this.baseOffsetY);
    if (!isRenderableLayout(this.layout)) {
      return;
    }

    const safeDuration = sanitizePositive(durationMs, 3000, 1);
    this.ambientTween = this.scene.tweens.add({
      targets: this.ambientContainer,
      x: this.baseOffsetX + (isFiniteNumber(distanceX) ? distanceX : 0),
      y: this.baseOffsetY + (isFiniteNumber(distanceY) ? distanceY : 0),
      duration: safeDuration,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  public destroy(): void {
    this.ambientTween?.remove();
    this.ambientTween = undefined;
    this.scene.tweens.killTweensOf(this.ambientContainer);
    this.chromeBack.destroy();
    this.base.destroy();
    this.grid.destroy();
    this.start.destroy();
    this.goal.destroy();
    this.signal.destroy();
    this.trail.destroy();
    this.actor.destroy();
    this.chromeFront.destroy();
    this.ambientContainer.destroy();
  }
}
