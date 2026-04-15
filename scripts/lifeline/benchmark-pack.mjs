import runtimeBenchmarkPack from '../../src/mazer-core/eval/runtime-benchmark-pack.json' with { type: 'json' };

const clone = (value) => structuredClone(value);

const toFocus = (variant) => {
  switch (variant) {
    case 'trap-inference':
      return 'trap';
    case 'warden-pressure':
      return 'warden';
    case 'item-usefulness':
      return 'item';
    case 'puzzle-visibility':
      return 'puzzle';
    case 'rotation-timing':
      return 'rotation';
    default:
      return 'puzzle';
  }
};

const toCandidateSignals = (candidates) => (
  Object.fromEntries(
    candidates.map((candidate) => [
      candidate.tileId,
      {
        trapRisk: candidate.trapRisk,
        enemyPressure: candidate.enemyPressure,
        itemOpportunity: candidate.itemOpportunity,
        puzzleOpportunity: candidate.puzzleOpportunity,
        timingWindow: candidate.timingWindow
      }
    ])
  )
);

const toStepSpec = (scenario, step, index) => ({
  tileId: step.tileId,
  label: step.label,
  heading: step.heading,
  traversableTileIds: [...step.traversableTileIds],
  localCues: [...step.localCues],
  visibleLandmarks: step.visibleLandmarks.map((landmark) => ({ ...landmark })),
  goal: { ...step.goal },
  candidateSignals: toCandidateSignals(step.candidates),
  moveToTileId: step.moveToTileId ?? null,
  traversedConnectorId: step.moveToTileId ? `${step.tileId}::${step.moveToTileId}` : null,
  traversedConnectorLabel: step.moveToTileId
    ? `${step.label} to ${scenario.steps[index + 1]?.label ?? step.moveToTileId}`
    : null
});

const toTerminalStepSpec = (scenario) => {
  const lastStep = scenario.steps.at(-1);
  if (!lastStep || !lastStep.moveToTileId) {
    return null;
  }

  const terminalOutcome = lastStep.candidates.find((candidate) => candidate.tileId === lastStep.moveToTileId)?.outcome ?? null;

  return {
    tileId: lastStep.moveToTileId,
    label: `Terminal ${lastStep.moveToTileId}`,
    heading: lastStep.heading,
    traversableTileIds: [],
    localCues: terminalOutcome?.localCues ? [...terminalOutcome.localCues] : [...lastStep.localCues],
    visibleLandmarks: lastStep.visibleLandmarks.map((landmark) => ({ ...landmark })),
    goal: { ...lastStep.goal },
    candidateSignals: {},
    moveToTileId: null,
    traversedConnectorId: null,
    traversedConnectorLabel: null
  };
};

const toScenarioSpec = (scenario) => ({
  id: scenario.id,
  label: scenario.label,
  focus: toFocus(scenario.variant),
  districtType: scenario.districtType,
  shellCount: scenario.shellCount,
  seed: scenario.seed,
  variant: scenario.variant,
  expectedMetricBands: Object.fromEntries(
    Object.entries(scenario.expectedMetricBands ?? {}).map(([metricName, band]) => [
      metricName,
      band ? { ...band } : band
    ])
  ),
  startTileId: scenario.steps[0]?.tileId ?? 'start',
  startHeading: scenario.steps[0]?.heading ?? 'north',
  preferredNextTileIds: [...scenario.steps.map((step) => step.moveToTileId ?? null), null],
  steps: [
    ...scenario.steps.map((step, index) => toStepSpec(scenario, step, index)),
    ...(() => {
      const terminalStep = toTerminalStepSpec(scenario);
      return terminalStep ? [terminalStep] : [];
    })()
  ]
});

const benchmarkPack = Object.freeze({
  schemaVersion: 1,
  packId: runtimeBenchmarkPack.packId,
  label: runtimeBenchmarkPack.label,
  scenarios: runtimeBenchmarkPack.scenarios.map((scenario) => toScenarioSpec(scenario))
});

const resolveLifelineBenchmarkPack = () => clone(benchmarkPack);

const resolveLifelineBenchmarkScenarioById = (scenarioId) => (
  benchmarkPack.scenarios.find((scenario) => scenario.id === scenarioId) ?? null
);

const resolveLifelineBenchmarkScenarioBySeed = (seed) => (
  benchmarkPack.scenarios.find((scenario) => scenario.seed === seed) ?? null
);

export {
  benchmarkPack,
  resolveLifelineBenchmarkPack,
  resolveLifelineBenchmarkScenarioById,
  resolveLifelineBenchmarkScenarioBySeed
};
