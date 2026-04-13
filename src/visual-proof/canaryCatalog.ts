export interface CanaryScenario {
  id: string;
  label: string;
  expectedFailures: string[];
  mutation: 'hide-player' | 'hide-objective' | 'hide-landmark' | 'hide-connector';
}

export const CANARY_SCENARIOS: readonly CanaryScenario[] = [
  {
    id: 'dense-route-player-visibility',
    label: 'Player visibility canary',
    expectedFailures: ['Player visibility'],
    mutation: 'hide-player'
  },
  {
    id: 'bounded-progression-slice',
    label: 'Objective visibility canary',
    expectedFailures: ['Objective visibility'],
    mutation: 'hide-objective'
  },
  {
    id: 'observatory-reorientation',
    label: 'Landmark salience canary',
    expectedFailures: ['Landmark salience'],
    mutation: 'hide-landmark'
  },
  {
    id: 'discrete-rotation-readability',
    label: 'Connector readability canary',
    expectedFailures: ['Connector readability'],
    mutation: 'hide-connector'
  }
];
