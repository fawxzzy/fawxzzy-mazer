import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

describe('puzzle source boundary', () => {
  test('stays runtime-agnostic and bounded to mazer-core surfaces', () => {
    const files = [
      '../../../src/mazer-core/puzzles/index.ts',
      '../../../src/mazer-core/puzzles/types.ts',
      '../../../src/mazer-core/puzzles/PuzzleTopologyState.ts'
    ];

    for (const relativePath of files) {
      const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
      expect(source).not.toMatch(/from\s+['"][^'"]*(visual-proof|future-runtime|proofRuntime|scenarioLibrary|manifestLoader|manifestTypes)/);
      expect(source).not.toMatch(/\bDOM\b|\bCSS\b|\bwindow\b|\bdocument\b/);
      expect(source).not.toMatch(/\bMath\.random\b/);
    }
  });
});
