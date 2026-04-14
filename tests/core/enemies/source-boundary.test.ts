import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

describe('enemy source boundary', () => {
  test('stays runtime-agnostic and bounded to mazer-core surfaces', () => {
    const files = [
      '../../../src/mazer-core/enemies/index.ts',
      '../../../src/mazer-core/enemies/types.ts',
      '../../../src/mazer-core/enemies/WardenGraphAgent.ts'
    ];

    for (const relativePath of files) {
      const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
      expect(source).not.toMatch(/from\s+['"][^'"]*(visual-proof|future-runtime|proofRuntime|scenarioLibrary|manifestLoader|manifestTypes)/);
      expect(source).not.toMatch(/\bDOM\b|\bCSS\b|\bwindow\b|\bdocument\b/);
      expect(source).not.toMatch(/\bMath\.random\b/);
    }
  });
});
