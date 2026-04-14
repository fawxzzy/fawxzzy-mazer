import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

describe('planet3d source boundary', () => {
  test('future runtime stays free of visual-proof imports', () => {
    const files = [
      'src/future-runtime/planet3d/index.ts',
      'src/future-runtime/planet3d/main.ts',
      'src/future-runtime/planet3d/render.ts',
      'src/future-runtime/planet3d/runtime.ts',
      'src/future-runtime/planet3d/types.ts',
      'src/future-runtime/planet3d/world.ts'
    ];

    for (const relativePath of files) {
      const text = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
      expect(text).not.toMatch(/visual-proof/);
      expect(text).not.toMatch(/PlanetProofManifest/);
    }
  });
});
