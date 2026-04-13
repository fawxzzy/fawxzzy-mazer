const FAILURE_LABELS = Object.freeze({
  'player-visible': 'Player visibility',
  'objective-visible': 'Objective visibility',
  'landmark-visible': 'Landmark salience',
  'connector-visible': 'Connector readability',
  'trail-head-sync': 'Trail head sync',
  'trail-head-gap': 'Trail head tether',
  'trail-contrast': 'Trail contrast',
  'player-dominance': 'Player dominance',
  'objective-separation': 'Objective separation',
  'intent-debounce': 'Intent feed debounce',
  'world-ping-spam': 'World ping cadence',
  'feed-readability': 'Feed readability',
  'intent-stack-overlap': 'Intent stack overlap',
  'solution-overlay-hidden': 'No solution overlay',
  'start-target-limited': 'Non-omniscient start target',
  'goal-observed-after-start': 'Goal observation after step 0',
  'focus-player': 'Player focus contract',
  'focus-objective': 'Objective focus contract',
  'focus-landmark': 'Landmark focus contract',
  'focus-connector': 'Connector focus contract'
});

export const describeSemanticFailure = (failure) => {
  if (typeof failure !== 'string' || failure.length === 0) {
    return {
      gateId: 'unknown',
      label: 'Unknown gate',
      stateId: null,
      detail: String(failure)
    };
  }

  if (failure.startsWith('recovery:')) {
    return {
      gateId: 'recovery-stability',
      label: 'Recovery frame stability',
      stateId: 'recovery',
      detail: failure
    };
  }

  const separator = failure.indexOf(': ');
  if (separator === -1) {
    return {
      gateId: failure,
      label: FAILURE_LABELS[failure] ?? failure,
      stateId: null,
      detail: failure
    };
  }

  const stateId = failure.slice(0, separator);
  const gateId = failure.slice(separator + 2);
  return {
    gateId,
    label: FAILURE_LABELS[gateId] ?? gateId,
    stateId,
    detail: failure
  };
};

export const describeSemanticFailures = (failures = []) => failures.map((failure) => describeSemanticFailure(failure));

export const buildProofPacketReport = ({ report, semanticScore, expectedFailures = [] }) => {
  const failingGates = describeSemanticFailures(semanticScore?.failures ?? []);
  const lines = [
    `what changed: ${report.changed}`,
    `what regressed: ${report.regressed}`,
    `what looked better: ${report.better}`,
    `what looked worse: ${report.worse}`,
    `what needs human judgment: ${report.humanJudgment}`,
    '',
    `semantic pass: ${semanticScore?.summary?.passed === true ? 'yes' : 'no'}`,
    `semantic gates: ${semanticScore?.summary?.passedGateCount ?? 0}/${semanticScore?.summary?.totalGateCount ?? 0}`
  ];

  if (failingGates.length > 0) {
    lines.push(`failing gates: ${failingGates.map((gate) => `${gate.label}${gate.stateId ? ` @ ${gate.stateId}` : ''}`).join(', ')}`);
  } else {
    lines.push('failing gates: none');
  }

  if (expectedFailures.length > 0) {
    lines.push(`expected canary failures: ${expectedFailures.join(', ')}`);
  }

  return `${lines.join('\n')}\n`;
};

export const buildCanaryAggregateReport = ({ controlRunId, canaryRunId, expectedFailures = [], actualFailures = [], regressionCount = 0 }) => {
  const lines = [
    `control run: ${controlRunId}`,
    `canary run: ${canaryRunId}`,
    `expected failures: ${expectedFailures.join(', ') || 'none'}`,
    `actual failures: ${actualFailures.join(', ') || 'none'}`,
    `regression count: ${regressionCount}`
  ];

  return `${lines.join('\n')}\n`;
};
