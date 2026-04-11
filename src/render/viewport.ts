import type Phaser from 'phaser';

export const DEFAULT_VIEWPORT_WIDTH = 1280;
export const DEFAULT_VIEWPORT_HEIGHT = 720;

export interface ViewportSize {
  width: number;
  height: number;
  measured: boolean;
}

interface VisualViewportLike {
  width?: number;
  height?: number;
}

interface BrowserViewportLike {
  innerWidth?: number;
  innerHeight?: number;
  visualViewport?: VisualViewportLike | null;
  document?: {
    documentElement?: {
      clientWidth?: number;
      clientHeight?: number;
    } | null;
  } | null;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const normalizeViewportDimension = (value: unknown): number | undefined => (
  isFiniteNumber(value) && value > 0 ? Math.max(1, Math.round(value)) : undefined
);

export const sanitizeViewportDimension = (value: unknown, fallback: number): number => (
  normalizeViewportDimension(value) ?? Math.max(1, Math.round(fallback))
);

export const resolveViewportSize = (
  width: unknown,
  height: unknown,
  fallbackWidth = DEFAULT_VIEWPORT_WIDTH,
  fallbackHeight = DEFAULT_VIEWPORT_HEIGHT
): ViewportSize => {
  const measuredWidth = normalizeViewportDimension(width);
  const measuredHeight = normalizeViewportDimension(height);

  return {
    width: measuredWidth ?? Math.max(1, Math.round(fallbackWidth)),
    height: measuredHeight ?? Math.max(1, Math.round(fallbackHeight)),
    measured: measuredWidth !== undefined && measuredHeight !== undefined
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
  return resolveBrowserViewportFromRuntime(
    typeof window === 'undefined' ? undefined : window
  );
};

export const resolveBrowserViewportFromRuntime = (
  runtime: BrowserViewportLike | undefined
): ViewportSize => {
  if (!runtime) {
    return {
      width: DEFAULT_VIEWPORT_WIDTH,
      height: DEFAULT_VIEWPORT_HEIGHT,
      measured: false
    };
  }

  const documentElement = runtime.document?.documentElement;
  return resolveViewportSize(
    runtime.visualViewport?.width ?? runtime.innerWidth ?? documentElement?.clientWidth,
    runtime.visualViewport?.height ?? runtime.innerHeight ?? documentElement?.clientHeight
  );
};
