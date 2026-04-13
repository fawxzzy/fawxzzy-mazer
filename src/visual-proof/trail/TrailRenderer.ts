import type { TrailSnapshot } from './TrailModel';

export interface TrailPoint {
  x: number;
  y: number;
}

export interface TrailRenderOptions {
  testId?: string;
  liveHeadPoint?: TrailPoint | null;
  activeLookback?: number;
  headRadius?: number;
  oldNodeRadius?: number;
  anchorRadius?: number;
  activeStrokeWidth?: number;
  oldStrokeWidth?: number;
  outlineWidth?: number;
  headFill?: string;
  headStroke?: string;
  headStrokeWidth?: number;
  anchorFill?: string;
  activeStroke?: string;
  oldStroke?: string;
  outlineStroke?: string;
  opacity?: number;
}

export interface TrailGeometry {
  committedPoints: TrailPoint[];
  oldPoints: TrailPoint[];
  activePoints: TrailPoint[];
  committedHeadPoint: TrailPoint | null;
  visibleHeadPoint: TrailPoint | null;
  tetherPoints: TrailPoint[];
}

export const buildTrailPoints = (
  trail: TrailSnapshot,
  resolvePoint: (tileId: string) => TrailPoint | null | undefined
): TrailPoint[] => trail.occupancyHistory
  .map((tileId) => resolvePoint(tileId))
  .filter((point): point is TrailPoint => Boolean(point));

const serializePointList = (points: readonly TrailPoint[]): string => points
  .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
  .join(' ');

const dedupeSequentialPoints = (points: readonly TrailPoint[]): TrailPoint[] => {
  const deduped: TrailPoint[] = [];
  for (const point of points) {
    const previous = deduped.at(-1);
    if (!previous || previous.x !== point.x || previous.y !== point.y) {
      deduped.push(point);
    }
  }

  return deduped;
};

export const buildTrailGeometry = (
  trail: TrailSnapshot,
  resolvePoint: (tileId: string) => TrailPoint | null | undefined,
  options: TrailRenderOptions = {}
): TrailGeometry => {
  const committedPoints = buildTrailPoints(trail, resolvePoint);
  const committedHeadPoint = trail.trailHeadTileId
    ? resolvePoint(trail.trailHeadTileId) ?? committedPoints.at(-1) ?? null
    : committedPoints.at(-1) ?? null;
  const visibleHeadPoint = options.liveHeadPoint ?? committedHeadPoint;
  const oldPoints = committedPoints.slice(0, Math.max(0, committedPoints.length - 1));
  const lookback = Math.max(2, options.activeLookback ?? 2);
  const activeHistory = committedPoints.slice(Math.max(0, committedPoints.length - lookback));
  const activePoints = dedupeSequentialPoints(
    committedHeadPoint ? [...activeHistory.slice(0, Math.max(0, activeHistory.length - 1)), committedHeadPoint] : activeHistory
  );
  const tetherPoints = committedHeadPoint
    && visibleHeadPoint
    && (committedHeadPoint.x !== visibleHeadPoint.x || committedHeadPoint.y !== visibleHeadPoint.y)
      ? [committedHeadPoint, visibleHeadPoint]
      : [];

  return {
    committedPoints,
    oldPoints,
    activePoints,
    committedHeadPoint,
    visibleHeadPoint,
    tetherPoints
  };
};

export const renderTrailMarkup = (
  trail: TrailSnapshot,
  resolvePoint: (tileId: string) => TrailPoint | null | undefined,
  options: TrailRenderOptions = {}
): string => {
  const geometry = buildTrailGeometry(trail, resolvePoint, options);
  if (geometry.committedPoints.length === 0) {
    return '';
  }

  const testId = options.testId ? `data-testid="${options.testId}"` : '';
  const oldStrokeWidth = options.oldStrokeWidth ?? 5;
  const activeStrokeWidth = options.activeStrokeWidth ?? 8;
  const outlineWidth = options.outlineWidth ?? 3;
  const headRadius = options.headRadius ?? 12;
  const oldNodeRadius = options.oldNodeRadius ?? 7;
  const anchorRadius = options.anchorRadius ?? 6;
  const activeStroke = options.activeStroke ?? '#1BCFEA';
  const oldStroke = options.oldStroke ?? 'rgba(27, 207, 234, 0.28)';
  const outlineStroke = options.outlineStroke ?? '#03141A';
  const headFill = options.headFill ?? '#f8fbff';
  const headStroke = options.headStroke ?? outlineStroke;
  const headStrokeWidth = options.headStrokeWidth ?? outlineWidth;
  const anchorFill = options.anchorFill ?? activeStroke;
  const opacity = options.opacity ?? 0.96;

  return `
    <g
      ${testId}
      data-trail-head-tile-id="${trail.trailHeadTileId ?? ''}"
      data-trail-length="${geometry.committedPoints.length}"
      data-trail-visible-head-x="${geometry.visibleHeadPoint?.x.toFixed(2) ?? ''}"
      data-trail-visible-head-y="${geometry.visibleHeadPoint?.y.toFixed(2) ?? ''}"
    >
      ${geometry.oldPoints.length >= 2 ? `
        <polyline
          points="${serializePointList(geometry.oldPoints)}"
          fill="none"
          stroke="${oldStroke}"
          stroke-width="${oldStrokeWidth}"
          stroke-linecap="round"
          stroke-linejoin="round"
          opacity="${opacity}"
        />
      ` : ''}
      ${geometry.activePoints.length >= 2 ? `
        <polyline
          points="${serializePointList(geometry.activePoints)}"
          fill="none"
          stroke="${outlineStroke}"
          stroke-width="${activeStrokeWidth + outlineWidth}"
          stroke-linecap="round"
          stroke-linejoin="round"
          opacity="${opacity}"
        />
        <polyline
          points="${serializePointList(geometry.activePoints)}"
          fill="none"
          stroke="${activeStroke}"
          stroke-width="${activeStrokeWidth}"
          stroke-linecap="round"
          stroke-linejoin="round"
          opacity="${opacity}"
        />
      ` : ''}
      ${geometry.tetherPoints.length === 2 ? `
        <line
          x1="${geometry.tetherPoints[0].x.toFixed(2)}"
          y1="${geometry.tetherPoints[0].y.toFixed(2)}"
          x2="${geometry.tetherPoints[1].x.toFixed(2)}"
          y2="${geometry.tetherPoints[1].y.toFixed(2)}"
          stroke="${outlineStroke}"
          stroke-width="${activeStrokeWidth + outlineWidth}"
          stroke-linecap="round"
          opacity="${opacity}"
        />
        <line
          x1="${geometry.tetherPoints[0].x.toFixed(2)}"
          y1="${geometry.tetherPoints[0].y.toFixed(2)}"
          x2="${geometry.tetherPoints[1].x.toFixed(2)}"
          y2="${geometry.tetherPoints[1].y.toFixed(2)}"
          stroke="${activeStroke}"
          stroke-width="${activeStrokeWidth}"
          stroke-linecap="round"
          opacity="${opacity}"
        />
      ` : ''}
      ${geometry.oldPoints.map((point) => `
        <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${oldNodeRadius}" fill="${oldStroke}" opacity="${opacity}" />
      `).join('')}
      ${geometry.committedHeadPoint ? `
        <circle
          cx="${geometry.committedHeadPoint.x.toFixed(2)}"
          cy="${geometry.committedHeadPoint.y.toFixed(2)}"
          r="${anchorRadius}"
          fill="${anchorFill}"
          stroke="${outlineStroke}"
          stroke-width="${Math.max(1, outlineWidth - 1)}"
          opacity="${opacity}"
        />
      ` : ''}
      ${geometry.visibleHeadPoint ? `
        <circle
          cx="${geometry.visibleHeadPoint.x.toFixed(2)}"
          cy="${geometry.visibleHeadPoint.y.toFixed(2)}"
          r="${headRadius}"
          fill="${headFill}"
          stroke="${headStroke}"
          stroke-width="${headStrokeWidth}"
          opacity="${opacity}"
        />
      ` : ''}
    </g>
  `;
};
