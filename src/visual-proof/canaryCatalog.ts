export interface CanaryScenario {
  id: string;
  scenarioId: string;
  label: string;
  expectedFailures: string[];
  mutation: 'hide-player' | 'hide-objective' | 'hide-landmark' | 'hide-connector' | 'omniscient-goal-target' | 'trail-head-mismatch' | 'show-solution-overlay';
}

export const CANARY_SCENARIOS: readonly CanaryScenario[] = [
  {
    id: 'player-visibility-canary',
    scenarioId: 'dense-route-player-visibility',
    label: 'Player visibility canary',
    expectedFailures: ['Player visibility'],
    mutation: 'hide-player'
  },
  {
    id: 'objective-visibility-canary',
    scenarioId: 'bounded-progression-slice',
    label: 'Objective visibility canary',
    expectedFailures: ['Objective visibility'],
    mutation: 'hide-objective'
  },
  {
    id: 'landmark-salience-canary',
    scenarioId: 'observatory-reorientation',
    label: 'Landmark salience canary',
    expectedFailures: ['Landmark salience'],
    mutation: 'hide-landmark'
  },
  {
    id: 'connector-readability-canary',
    scenarioId: 'discrete-rotation-readability',
    label: 'Connector readability canary',
    expectedFailures: ['Connector readability'],
    mutation: 'hide-connector'
  },
  {
    id: 'solution-overlay-canary',
    scenarioId: 'dense-route-player-visibility',
    label: 'Solution overlay canary',
    expectedFailures: ['No solution overlay'],
    mutation: 'show-solution-overlay'
  },
  {
    id: 'trail-head-canary',
    scenarioId: 'shell-connector-alignment',
    label: 'Trail head sync canary',
    expectedFailures: ['Trail head sync'],
    mutation: 'trail-head-mismatch'
  },
  {
    id: 'omniscient-target-canary',
    scenarioId: 'bounded-progression-slice',
    label: 'Omniscient target canary',
    expectedFailures: ['Non-omniscient start target'],
    mutation: 'omniscient-goal-target'
  }
];
