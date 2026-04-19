import { describe, expect, test } from 'vitest';

const loadHelpers = async () => {
  // @ts-expect-error The helper module is plain .mjs without TS declarations.
  return await import('../../scripts/visual/capture-layout-matrix.mjs');
};

const viewport = { id: 'desktop', label: 'Desktop', width: 1440, height: 900 };
const route = '/?profile=tv&theme=noir';
const url = `http://127.0.0.1:4173${route}`;

describe('layout matrix readiness', () => {
  test('accepts the minimum truthful layout contract without title or install visibility', async () => {
    const { resolveLayoutMatrixReadiness } = await loadHelpers();

    const readiness = resolveLayoutMatrixReadiness({
      route,
      url,
      viewport,
      diagnostics: {
        revision: 17,
        board: {
          bounds: { left: 180, top: 120, width: 720, height: 720 }
        },
        title: {
          expected: true,
          visible: false
        },
        install: {
          expected: true,
          visible: false
        },
        intentFeed: {
          visible: false,
          dock: 'bottom-center',
          bounds: { left: 920, top: 180, width: 360, height: 188 }
        }
      }
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.reason).toBeNull();
    expect(readiness.snapshot).toMatchObject({
      boardBoundsReady: true,
      hudBoundsReady: true,
      dockModeReady: true,
      routeMetadataReady: true,
      hudDock: 'bottom-center',
      route
    });
  }, 15_000);

  test('reports the first missing layout-specific readiness field', async () => {
    const { resolveLayoutMatrixReadiness } = await loadHelpers();

    const readiness = resolveLayoutMatrixReadiness({
      route,
      url,
      viewport,
      diagnostics: {
        revision: 18,
        board: {
          bounds: { left: 180, top: 120, width: 720, height: 720 }
        },
        intentFeed: {
          visible: true,
          bounds: { left: 920, top: 180, width: 360, height: 188 }
        }
      }
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toEqual(['hud-dock']);
    expect(readiness.reason).toBe('waiting for HUD dock mode');
    expect(readiness.snapshot).toMatchObject({
      boardBoundsReady: true,
      hudBoundsReady: true,
      dockModeReady: false
    });
  }, 15_000);
});
