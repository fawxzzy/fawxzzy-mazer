import { describe, expect, test } from 'vitest';

const loadConfig = async () => {
  // @ts-expect-error The helper module is plain .mjs without TS declarations.
  return await import('../../scripts/visual/layout-matrix.config.mjs');
};

describe('layout matrix config', () => {
  test('keeps the shipping core viewport set stable', async () => {
    const { resolveLayoutMatrixViewports } = await loadConfig();

    expect(resolveLayoutMatrixViewports('core')).toEqual([
      { id: 'phone-portrait', label: 'Phone Portrait', width: 390, height: 844 },
      { id: 'phone-tall', label: 'Phone Tall', width: 430, height: 932 },
      { id: 'phone-landscape', label: 'Phone Landscape', width: 844, height: 390 },
      { id: 'tablet-portrait', label: 'Tablet Portrait', width: 768, height: 1024 },
      { id: 'tablet-landscape', label: 'Tablet Landscape', width: 1024, height: 768 },
      { id: 'laptop', label: 'Laptop', width: 1366, height: 768 },
      { id: 'desktop', label: 'Desktop', width: 1440, height: 900 },
      { id: 'desktop-wide', label: 'Desktop Wide', width: 1920, height: 1080 }
    ]);
  });

  test('supports extended and all viewport groups without duplicating ids', async () => {
    const { resolveLayoutMatrixRoute, resolveLayoutMatrixViewports } = await loadConfig();

    const extended = resolveLayoutMatrixViewports('extended');
    const all = resolveLayoutMatrixViewports('all');

    expect(extended).toEqual([
      { id: 'ultrawide', label: 'Ultrawide', width: 2560, height: 1080 },
      { id: 'short-desktop', label: 'Short Desktop', width: 1280, height: 720 }
    ]);
    expect(new Set(all.map((viewport: { id: string }) => viewport.id)).size).toBe(all.length);
    expect(all).toHaveLength(10);
    expect(resolveLayoutMatrixRoute(all[0])).toBe('/?profile=mobile&theme=aurora');
    expect(resolveLayoutMatrixRoute(all[7])).toBe('/?profile=tv&theme=noir');
    expect(resolveLayoutMatrixRoute(all[5], '/?theme=ember')).toBe('/?theme=ember');
  });
});
