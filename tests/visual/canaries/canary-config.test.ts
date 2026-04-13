import { describe, expect, test } from 'vitest';
import { CANARY_SCENARIOS } from '../../../src/visual-proof/canaryCatalog';

describe('visual canaries', () => {
  test('cover the required readability regressions', () => {
    expect(CANARY_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      'dense-route-player-visibility',
      'bounded-progression-slice',
      'observatory-reorientation',
      'discrete-rotation-readability'
    ]);

    expect(CANARY_SCENARIOS.map((scenario) => scenario.mutation)).toEqual([
      'hide-player',
      'hide-objective',
      'hide-landmark',
      'hide-connector'
    ]);
  });

  test('every canary names at least one expected failing gate', () => {
    for (const scenario of CANARY_SCENARIOS) {
      expect(scenario.expectedFailures.length).toBeGreaterThan(0);
      expect(typeof scenario.label).toBe('string');
    }
  });
});
