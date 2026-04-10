import type Phaser from 'phaser';

export const DEFAULT_VIEWPORT_WIDTH = 1280;
export const DEFAULT_VIEWPORT_HEIGHT = 720;

export interface ViewportSize {
  width: number;
  height: number;
  measured: boolean;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export const sanitizeViewportDimension = (value: unknown, fallback: number): number => (
  isFiniteNumber(value) && value > 0 ? value : fallback
);

export const resolveViewportSize = (
  width: unknown,
  height: unknown,
  fallbackWidth = DEFAULT_VIEWPORT_WIDTH,
  fallbackHeight = DEFAULT_VIEWPORT_HEIGHT
): ViewportSize => {
  const measuredWidth = isFiniteNumber(width) && width > 0;
  const measuredHeight = isFiniteNumber(height) && height > 0;

  return {
    width: measuredWidth ? width : fallbackWidth,
    height: measuredHeight ? height : fallbackHeight,
    measured: measuredWidth && measuredHeight
  };
};

export const resolveSceneViewport = (
  scene: Pick<Phaser.Scene, 'scale' | 'cameras'>
): ViewportSize => {
  const fallbackWidth = sanitizeViewportDimension(scene.cameras.main?.width, DEFAULT_VIEWPORT_WIDTH);
  const fallbackHeight = sanitizeViewportDimension(scene.cameras.main?.height, DEFAULT_VIEWPORT_HEIGHT);

  return resolveViewportSize(scene.scale.width, scene.scale.height, fallbackWidth, fallbackHeight);
};

export const resolveBrowserViewport = (): ViewportSize => {
  if (typeof window === 'undefined') {
    return {
      width: DEFAULT_VIEWPORT_WIDTH,
      height: DEFAULT_VIEWPORT_HEIGHT,
      measured: false
    };
  }

  const documentElement = window.document?.documentElement;
  return resolveViewportSize(
    window.innerWidth || documentElement?.clientWidth,
    window.innerHeight || documentElement?.clientHeight
  );
};
