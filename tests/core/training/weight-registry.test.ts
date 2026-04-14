import { describe, expect, test } from 'vitest';
import {
  applyWeightPromotionDecision,
  createEmptyPlaybookWeightRegistry,
  createWeightDiffReport,
  evaluateWeightPromotion,
  type PromotionGateStatus
} from '../../../src/mazer-core/playbook/tuning';
import type { RuntimeEvalSuiteSummary } from '../../../src/mazer-core/eval';

const passingGates = (): PromotionGateStatus => ({
  architectureCheck: true,
  tests: true,
  build: true,
  visualProof: true,
  visualCanaries: true,
  futureRuntimeContentProof: true,
  runtimeEval: true
});

const makeEvalSummary = (
  runId: string,
  metrics: RuntimeEvalSuiteSummary['metrics']
): RuntimeEvalSuiteSummary => ({
  schemaVersion: 1,
  suiteId: 'mazer-core-deterministic-runtime-eval',
  benchmarkPackId: 'mazer-runtime-benchmark-v1',
  summaryId: `eval-summary-${runId}`,
  runId,
  generatedAt: '2026-04-14T00:00:00.000Z',
  scenarioCount: 5,
  scenarioIds: [
    'labyrinth-tutorial-trap-inference-alpha',
    'loopy-combat-capable-warden-pressure-bravo',
    'scavenger-checkpoint-item-usefulness-charlie',
    'puzzle-visibility-delta',
    'vantage-observatory-rotation-timing-echo'
  ],
  replayIntegrity: {
    verifiedScenarioCount: 5,
    failedScenarioCount: 0,
    allScenariosVerified: true
  },
  metrics,
  support: {
    rowsEvaluated: 15,
    discoverySamples: 12,
    backtrackSamples: 2,
    trapPredictedPositiveCount: 2,
    trapActualPositiveCount: 2,
    trapFalsePositiveCount: 0,
    trapFalseNegativeCount: 0,
    wardenExposureSamples: 15,
    itemPositiveSamples: 3,
    puzzlePositiveSamples: 4
  },
  metricBandValidation: {
    passedScenarioCount: 5,
    failedScenarioCount: 0,
    allScenariosWithinBands: true
  },
  scenarioSummaries: []
});

describe('weight registry governance', () => {
  test('emits the required weight diff fields', () => {
    const diff = createWeightDiffReport({
      frontierValue: 1,
      backtrackUrgency: 1,
      trapSuspicion: 1,
      enemyRisk: 1,
      itemValue: 1,
      puzzleValue: 1,
      rotationTiming: 1
    }, {
      frontierValue: 1.1,
      backtrackUrgency: 0.9,
      trapSuspicion: 1.05,
      enemyRisk: 0.95,
      itemValue: 1.08,
      puzzleValue: 1,
      rotationTiming: 1.12
    });

    expect(diff.frontierValue.delta).toBe(0.1);
    expect(diff.backtrackUrgency.delta).toBe(-0.1);
    expect(diff.trapSuspicion.delta).toBe(0.05);
    expect(diff.enemyRisk.delta).toBe(-0.05);
    expect(diff.itemValue.delta).toBe(0.08);
    expect(diff.rotationTiming.delta).toBe(0.12);
  });

  test('rejects a candidate when any governed lane regresses', () => {
    const baselineSummary = makeEvalSummary('baseline-run', {
      discoveryEfficiency: 0.72,
      backtrackPressure: 0.22,
      trapFalsePositiveRate: 0.08,
      trapFalseNegativeRate: 0.1,
      wardenPressureExposure: 0.25,
      itemUsefulnessScore: 0.8,
      puzzleStateClarityScore: 0.78
    });
    const registry = applyWeightPromotionDecision(
      createEmptyPlaybookWeightRegistry(),
      evaluateWeightPromotion({
        registry: createEmptyPlaybookWeightRegistry(),
        seedPackId: 'mazer-runtime-benchmark-v1',
        weights: {
          frontierValue: 1.04,
          backtrackUrgency: 0.96,
          trapSuspicion: 1.02,
          enemyRisk: 0.98,
          itemValue: 1.06,
          puzzleValue: 1,
          rotationTiming: 1.02
        },
        evalSummary: baselineSummary,
        gates: passingGates()
      }),
      '2026-04-14T00:00:00.000Z'
    );
    const candidateSummary = makeEvalSummary('candidate-run', {
      discoveryEfficiency: 0.71,
      backtrackPressure: 0.24,
      trapFalsePositiveRate: 0.08,
      trapFalseNegativeRate: 0.1,
      wardenPressureExposure: 0.25,
      itemUsefulnessScore: 0.82,
      puzzleStateClarityScore: 0.79
    });
    const decision = evaluateWeightPromotion({
      registry,
      seedPackId: 'mazer-runtime-benchmark-v1',
      weights: {
        frontierValue: 1.1,
        backtrackUrgency: 1.02,
        trapSuspicion: 0.98,
        enemyRisk: 0.96,
        itemValue: 1.08,
        puzzleValue: 1,
        rotationTiming: 1.1
      },
      evalSummary: candidateSummary,
      gates: {
        ...passingGates(),
        visualCanaries: false
      }
    });

    expect(decision.accepted).toBe(false);
    expect(decision.reasons.join(' | ')).toMatch(/failed gates/);
    expect(decision.reasons.join(' | ')).toMatch(/metric regressions/);
    expect(decision.metricComparison.regressed).toContain('discoveryEfficiency');
  });

  test('blesses a candidate only when metrics improve without regressions', () => {
    const baselineSummary = makeEvalSummary('baseline-run', {
      discoveryEfficiency: 0.68,
      backtrackPressure: 0.28,
      trapFalsePositiveRate: 0.12,
      trapFalseNegativeRate: 0.14,
      wardenPressureExposure: 0.32,
      itemUsefulnessScore: 0.74,
      puzzleStateClarityScore: 0.7
    });
    const baselineRegistry = applyWeightPromotionDecision(
      createEmptyPlaybookWeightRegistry(),
      evaluateWeightPromotion({
        registry: createEmptyPlaybookWeightRegistry(),
        seedPackId: 'mazer-runtime-benchmark-v1',
        weights: null,
        evalSummary: baselineSummary,
        gates: passingGates()
      }),
      '2026-04-14T00:00:00.000Z'
    );
    const improvedSummary = makeEvalSummary('candidate-run', {
      discoveryEfficiency: 0.72,
      backtrackPressure: 0.24,
      trapFalsePositiveRate: 0.1,
      trapFalseNegativeRate: 0.1,
      wardenPressureExposure: 0.28,
      itemUsefulnessScore: 0.8,
      puzzleStateClarityScore: 0.76
    });
    const decision = evaluateWeightPromotion({
      registry: baselineRegistry,
      seedPackId: 'mazer-runtime-benchmark-v1',
      weights: {
        frontierValue: 1.1,
        backtrackUrgency: 0.94,
        trapSuspicion: 0.92,
        enemyRisk: 0.94,
        itemValue: 1.08,
        puzzleValue: 1,
        rotationTiming: 1.06
      },
      evalSummary: improvedSummary,
      gates: passingGates()
    });
    const promotedRegistry = applyWeightPromotionDecision(
      baselineRegistry,
      decision,
      '2026-04-14T01:00:00.000Z'
    );

    expect(decision.accepted).toBe(true);
    expect(decision.metricComparison.regressed).toEqual([]);
    expect(decision.metricComparison.improved.length).toBeGreaterThan(0);
    expect(promotedRegistry.currentBlessedRecordId).toBe(decision.candidateRecord.recordId);
    expect(promotedRegistry.blessed.at(-1)?.status).toBe('blessed');
  });
});
