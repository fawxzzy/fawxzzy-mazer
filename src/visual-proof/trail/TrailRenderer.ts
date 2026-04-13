import type { TrailSnapshot } from './TrailModel';

export interface TrailPoint {
  x: number;
  y: number;
}

export interface TrailRenderOptions {
  headRadius?: number;
  tailRadius?: number;
  strokeWidth?: number;
  headFill?: string;
  tailFill?: string;
  stroke?: string;
  opacity?: number;
}

export const buildTrailPoints = (
  trail: TrailSnapshot,
  resolvePoint: (tileId: string) => TrailPoint | null | undefined
): TrailPoint[] => trail.occupancyHistory
  .map((tileId) => resolvePoint(tileId))
  .filter((point): point is TrailPoint => Boolean(point));

export const renderTrailMarkup = (
  trail: TrailSnapshot,
  resolvePoint: (tileId: string) => TrailPoint | null | undefined,
  options: TrailRenderOptions = {}
): string => {
  const points = buildTrailPoints(trail, resolvePoint);
  if (points.length === 0) {
    return '';
  }

  const head = points[points.length - 1];
  const tail = points.slice(0, Math.max(0, points.length - 1));
  const strokeWidth = options.strokeWidth ?? 6;
  const headRadius = options.headRadius ?? 12;
  const tailRadius = options.tailRadius ?? 8;
  const stroke = options.stroke ?? '#81edff';
  const headFill = options.headFill ?? '#f8fbff';
  const tailFill = options.tailFill ?? 'rgba(129, 237, 255, 0.42)';
  const opacity = options.opacity ?? 0.96;
  const polylinePoints = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');

  return `
    <g data-trail-head-tile-id="${trail.trailHeadTileId ?? ''}" data-trail-length="${points.length}">
      <polyline
        points="${polylinePoints}"
        fill="none"
        stroke="${stroke}"
        stroke-width="${strokeWidth}"
        stroke-linecap="round"
        stroke-linejoin="round"
        opacity="${opacity}"
      />
      ${tail.map((point) => `
        <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="${tailRadius}" fill="${tailFill}" opacity="${opacity}" />
      `).join('')}
      <circle cx="${head.x.toFixed(2)}" cy="${head.y.toFixed(2)}" r="${headRadius}" fill="${headFill}" opacity="${opacity}" />
    </g>
  `;
};
