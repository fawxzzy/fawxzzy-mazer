import { describe, expect, test } from 'vitest';
import { CANARY_SCENARIOS } from '../../../src/visual-proof/canaryCatalog';

describe('visual canaries', () => {
  test('cover the required readability regressions', () => {
    expect(CANARY_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      'player-visibility-canary',
      'objective-visibility-canary',
      'landmark-salience-canary',
      'connector-readability-canary',
      'solution-overlay-canary',
      'trail-head-canary',
      'omniscient-target-canary'
    ]);

    expect(CANARY_SCENARIOS.map((scenario) => scenario.scenarioId)).toEqual([
      'dense-route-player-visibility',
      'bounded-progression-slice',
      'observatory-reorientation',
      'discrete-rotation-readability',
      'dense-route-player-visibility',
      'shell-connector-alignment',
      'bounded-progression-slice'
    ]);

    expect(CANARY_SCENARIOS.map((scenario) => scenario.mutation)).toEqual([
      'hide-player',
      'hide-objective',
      'hide-landmark',
      'hide-connector',
      'show-solution-overlay',
      'trail-head-mismatch',
      'omniscient-goal-target'
    ]);
  });

  test('every canary names at least one expected failing gate', () => {
    for (const scenario of CANARY_SCENARIOS) {
      expect(scenario.expectedFailures.length).toBeGreaterThan(0);
      expect(typeof scenario.label).toBe('string');
    }
  });
});
