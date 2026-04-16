import Phaser from 'phaser';
import '../styles/base.css';
import { startBootTiming } from './bootTiming';
import { initializeInstallSurface } from './installSurface';
import { phaserConfig } from './phaserConfig';
import { resolveBrowserViewport } from '../render/viewport';

const isLocalhost =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname === '[::1]';

const VIEWPORT_WIDTH_CSS_VAR = '--mazer-viewport-width';
const VIEWPORT_HEIGHT_CSS_VAR = '--mazer-viewport-height';

const applyViewportSurface = (game?: Phaser.Game): void => {
  const viewport = resolveBrowserViewport();
  document.documentElement.style.setProperty(VIEWPORT_WIDTH_CSS_VAR, `${viewport.width}px`);
  document.documentElement.style.setProperty(VIEWPORT_HEIGHT_CSS_VAR, `${viewport.height}px`);

  if (game) {
    game.scale.setParentSize(viewport.width, viewport.height);
    game.scale.refresh();
  }
};

const installViewportSurfaceSync = (game: Phaser.Game): (() => void) => {
  let animationFrame = 0;
  let lastViewportKey = '';

  const sync = (): void => {
    animationFrame = 0;
    const viewport = resolveBrowserViewport();
    const nextViewportKey = `${viewport.width}x${viewport.height}`;
    if (nextViewportKey === lastViewportKey) {
      return;
    }

    lastViewportKey = nextViewportKey;
    document.documentElement.style.setProperty(VIEWPORT_WIDTH_CSS_VAR, `${viewport.width}px`);
    document.documentElement.style.setProperty(VIEWPORT_HEIGHT_CSS_VAR, `${viewport.height}px`);
    game.scale.setParentSize(viewport.width, viewport.height);
    game.scale.refresh();
  };

  const requestSync = (): void => {
    if (animationFrame !== 0) {
      return;
    }

    animationFrame = window.requestAnimationFrame(sync);
  };

  requestSync();
  window.addEventListener('resize', requestSync);
  window.visualViewport?.addEventListener('resize', requestSync);

  return () => {
    if (animationFrame !== 0) {
      window.cancelAnimationFrame(animationFrame);
    }
    window.removeEventListener('resize', requestSync);
    window.visualViewport?.removeEventListener('resize', requestSync);
  };
};

startBootTiming('boot:main-start');

if ('serviceWorker' in navigator && isLocalhost) {
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    .catch(() => {
      // no-op: we explicitly avoid stale local SW state during development
    });
}

applyViewportSurface();
initializeInstallSurface();
const game = new Phaser.Game(phaserConfig);
const removeViewportSurfaceSync = installViewportSurfaceSync(game);
const hot = (import.meta as ImportMeta & { hot?: { dispose(callback: () => void): void } }).hot;

if (hot) {
  hot.dispose(() => {
    removeViewportSurfaceSync();
  });
}
