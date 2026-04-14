import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

describe('mazer-core boundary', () => {
  test('core source tree is free of visual-proof imports', () => {
    const files = [
      '../../src/mazer-core/index.ts',
      '../../src/mazer-core/agent/index.ts',
      '../../src/mazer-core/agent/ExplorerAgent.ts',
      '../../src/mazer-core/agent/FrontierPlanner.ts',
      '../../src/mazer-core/agent/PolicyScorer.ts',
      '../../src/mazer-core/agent/BeliefGraph.ts',
      '../../src/mazer-core/agent/types.ts',
      '../../src/mazer-core/enemies/index.ts',
      '../../src/mazer-core/enemies/types.ts',
      '../../src/mazer-core/enemies/WardenGraphAgent.ts',
      '../../src/mazer-core/adapters/index.ts',
      '../../src/mazer-core/adapters/types.ts',
      '../../src/mazer-core/adapters/TrailTracker.ts',
      '../../src/mazer-core/adapters/RuntimeAdapterBridge.ts',
      '../../src/mazer-core/items/index.ts',
      '../../src/mazer-core/items/types.ts',
      '../../src/mazer-core/items/ItemTopologyLedger.ts',
      '../../src/mazer-core/intent/index.ts',
      '../../src/mazer-core/intent/IntentEvent.ts',
      '../../src/mazer-core/intent/IntentBus.ts',
      '../../src/mazer-core/puzzles/index.ts',
      '../../src/mazer-core/puzzles/types.ts',
      '../../src/mazer-core/puzzles/PuzzleTopologyState.ts',
      '../../src/mazer-core/signals/index.ts',
      '../../src/mazer-core/signals/TopologySignalBridge.ts',
      '../../src/mazer-core/traps/index.ts',
      '../../src/mazer-core/traps/types.ts',
      '../../src/mazer-core/traps/TrapTopologySystem.ts'
    ];

    for (const relativePath of files) {
      const text = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
      expect(text).not.toMatch(/from\s+['"][^'"]*visual-proof/);
      expect(text).not.toMatch(/\bDOM\b|\bCSS\b/);
    }
  });
});
