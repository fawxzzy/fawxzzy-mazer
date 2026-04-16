// @ts-nocheck
import { describe, expect, test } from 'vitest';
import {
  applyManualBlessing,
  buildBlessingReviewArtifacts,
  loadManualBlessingReviewPack
} from '../../../scripts/training/promote-weights.mjs';
import { resolveRuntimeBenchmarkPack } from '../../../scripts/training/common.mjs';

const makeEvalSummary = (runId: string, options: {
  benchmarkPackId: string;
  scenarioIds: string[];
  metrics: Record<string, number>;
  scenarioSummaries: Array<{
    scenarioId: string;
    districtType: string;
    replayVerified?: boolean;
    metrics: Record<string, number>;
    passed?: boolean;
  }>;
}) => ({
  schemaVersion: 1,
  suiteId: 'mazer-core-deterministic-runtime-eval',
  benchmarkPackId: options.benchmarkPackId,
  summaryId: `eval-summary-${runId}`,
  runId,
  generatedAt: '2026-04-15T00:00:00.000Z',
  scenarioCount: options.scenarioIds.length,
  scenarioIds: options.scenarioIds,
  replayIntegrity: {
    verifiedScenarioCount: options.scenarioIds.length,
    failedScenarioCount: 0,
    allScenariosVerified: true
  },
  metrics: options.metrics,
  support: {
    rowsEvaluated: 12,
    discoverySamples: 8,
    backtrackSamples: 4,
    trapPredictedPositiveCount: 1,
    trapActualPositiveCount: 1,
    trapFalsePositiveCount: 0,
    trapFalseNegativeCount: 0,
    wardenExposureSamples: 12,
    itemPositiveSamples: 4,
    puzzlePositiveSamples: 4
  },
  metricBandValidation: {
    passedScenarioCount: options.scenarioIds.length,
    failedScenarioCount: 0,
    allScenariosWithinBands: true
  },
  scenarioSummaries: options.scenarioSummaries.map((scenarioSummary) => ({
    summaryId: `scenario-${runId}-${scenarioSummary.scenarioId}`,
    runId,
    scenarioId: scenarioSummary.scenarioId,
    districtType: scenarioSummary.districtType,
    replayVerified: scenarioSummary.replayVerified !== false,
    metrics: scenarioSummary.metrics,
    metricBandValidation: {
      passed: scenarioSummary.passed !== false,
      failures: scenarioSummary.passed === false ? ['expected metric bands'] : []
    }
  }))
});

describe('manual blessing review pack', () => {
  test('loads the governed v5 candidate review pack', async () => {
    const pack = await loadManualBlessingReviewPack();

    expect(pack.reviewPackId).toBe('manual-blessing-review-pack-v5');
    expect(pack.sourcePackId).toBe('governed-candidate-experiment-pack-v5');
    expect(pack.scenarioIds).toEqual(resolveRuntimeBenchmarkPack().scenarios.map((scenario) => scenario.id));
    expect(pack.requiredReviewSurfaces).toEqual([
      'runtimeEvalBands',
      'visualProof',
      'visualCanaries',
      'contentProof',
      'twoShellProof',
      'threeShellProof'
    ]);
    expect(pack.candidateIds).toEqual([
      'connector-recovery-biased',
      'item-puzzle-clarity-biased',
      'warden-cautious-biased'
    ]);
  });

  test('builds dry-run review artifacts without mutating the blessed id', () => {
    const reviewPack = {
      reviewPackId: 'manual-blessing-review-pack-v5',
      sourcePackId: 'governed-candidate-experiment-pack-v5',
      benchmarkPackId: 'mazer-runtime-benchmark-v4',
      scenarioIds: resolveRuntimeBenchmarkPack().scenarios.map((scenario) => scenario.id),
      candidateIds: ['connector-recovery-biased']
    };
    const registry = {
      schemaVersion: 1,
      updatedAt: '2026-04-15T00:00:00.000Z',
      currentBlessedRecordId: 'mazer-runtime-benchmark-v1:eval-current',
      candidates: [
        {
          schemaVersion: 1,
          recordId: 'governed-candidate-experiment-pack-v5:connector-recovery-biased:fnv1a-test',
          advisoryOnly: true,
          status: 'candidate',
          governanceDecision: 'accepted',
          weights: {
            frontierValue: 1.3,
            backtrackUrgency: 0.9,
            trapSuspicion: 0.95,
            enemyRisk: 0.92,
            itemValue: 1.05,
            puzzleValue: 1,
            rotationTiming: 1.08
          },
          metadata: {
            seedPackId: 'mazer-runtime-benchmark-v4',
            packId: 'governed-candidate-experiment-pack-v5',
            candidateId: 'connector-recovery-biased',
            label: 'Connector Recovery Biased',
            createdAt: '2026-04-15T00:00:00.000Z',
            runId: 'eval-frontier',
            evalSummary: {
              summaryId: 'eval-summary-frontier',
              runId: 'eval-frontier',
              scenarioIds: [
                'labyrinth-tutorial-trap-inference-alpha',
                'vantage-observatory-three-shell-connector-juliet'
              ],
              metrics: {
                discoveryEfficiency: 0.82,
                backtrackPressure: 0.22,
                trapFalsePositiveRate: 0,
                trapFalseNegativeRate: 0,
                wardenPressureExposure: 0.26,
                itemUsefulnessScore: 0.7,
                puzzleStateClarityScore: 0.73
              },
              path: 'tmp/eval/governed-candidate-experiment-pack/connector-recovery-biased/runtime-eval-summary.json'
            },
            gates: {
              architectureCheck: true,
              tests: true,
              build: true,
              visualProof: true,
              visualCanaries: true,
              contentProof: true,
              twoShellProof: true,
              threeShellProof: true,
              runtimeEval: true
            },
            artifactPaths: {
              evalSummaryPath: 'tmp/eval/governed-candidate-experiment-pack/connector-recovery-biased/runtime-eval-summary.json'
            }
          },
          diff: {
            frontierValue: { previous: 1, next: 1.3, delta: 0.3 },
            backtrackUrgency: { previous: 1, next: 0.9, delta: -0.1 },
            trapSuspicion: { previous: 1, next: 0.95, delta: -0.05 },
            enemyRisk: { previous: 1, next: 0.92, delta: -0.08 },
            itemValue: { previous: 1, next: 1.05, delta: 0.05 },
            puzzleValue: { previous: 1, next: 1, delta: 0 },
            rotationTiming: { previous: 1, next: 1.08, delta: 0.08 }
          },
          notes: [
            'accepted: all required promotion gates green',
            'promotion blocked: manual blessing required'
          ]
        }
      ],
      blessed: [
        {
          schemaVersion: 1,
          recordId: 'mazer-runtime-benchmark-v1:eval-current',
          advisoryOnly: true,
          status: 'blessed',
          weights: {
            frontierValue: 1,
            backtrackUrgency: 1,
            trapSuspicion: 1,
            enemyRisk: 1,
            itemValue: 1,
            puzzleValue: 1,
            rotationTiming: 1
          },
          metadata: {
            seedPackId: 'mazer-runtime-benchmark-v1',
            createdAt: '2026-04-14T00:00:00.000Z',
            runId: 'eval-current',
            evalSummary: {
              summaryId: 'eval-summary-current',
              runId: 'eval-current',
              scenarioIds: ['labyrinth-tutorial-trap-inference-alpha'],
              metrics: {
                discoveryEfficiency: 0.74,
                backtrackPressure: 0.28,
                trapFalsePositiveRate: 0,
                trapFalseNegativeRate: 0,
                wardenPressureExposure: 0.22,
                itemUsefulnessScore: 0.79,
                puzzleStateClarityScore: 0.77
              },
              path: 'tmp/eval/runtime-eval-summary.json'
            },
            gates: {
              architectureCheck: true,
              tests: true,
              build: true,
              visualProof: true,
              visualCanaries: true,
              futureRuntimeContentProof: true,
              runtimeEval: true
            }
          },
          diff: {
            frontierValue: { previous: 1, next: 1, delta: 0 },
            backtrackUrgency: { previous: 1, next: 1, delta: 0 },
            trapSuspicion: { previous: 1, next: 1, delta: 0 },
            enemyRisk: { previous: 1, next: 1, delta: 0 },
            itemValue: { previous: 1, next: 1, delta: 0 },
            puzzleValue: { previous: 1, next: 1, delta: 0 },
            rotationTiming: { previous: 1, next: 1, delta: 0 }
          },
          notes: []
        }
      ]
    };
    const baselineEvalSummary = makeEvalSummary('baseline', {
      benchmarkPackId: 'mazer-runtime-benchmark-v1',
      scenarioIds: ['labyrinth-tutorial-trap-inference-alpha'],
      metrics: {
        discoveryEfficiency: 0.74,
        backtrackPressure: 0.28,
        trapFalsePositiveRate: 0,
        trapFalseNegativeRate: 0,
        wardenPressureExposure: 0.22,
        itemUsefulnessScore: 0.79,
        puzzleStateClarityScore: 0.77
      },
      scenarioSummaries: [
        {
          scenarioId: 'labyrinth-tutorial-trap-inference-alpha',
          districtType: 'labyrinth-tutorial',
          metrics: {
            discoveryEfficiency: 0.74,
            backtrackPressure: 0.28,
            trapFalsePositiveRate: 0,
            trapFalseNegativeRate: 0,
            wardenPressureExposure: 0.22,
            itemUsefulnessScore: 0.79,
            puzzleStateClarityScore: 0.77
          }
        }
      ]
    });
    const candidateEvalSummary = makeEvalSummary('candidate', {
      benchmarkPackId: 'mazer-runtime-benchmark-v4',
      scenarioIds: [
        'labyrinth-tutorial-trap-inference-alpha',
        'vantage-observatory-three-shell-connector-juliet'
      ],
      metrics: {
        discoveryEfficiency: 0.82,
        backtrackPressure: 0.22,
        trapFalsePositiveRate: 0,
        trapFalseNegativeRate: 0,
        wardenPressureExposure: 0.26,
        itemUsefulnessScore: 0.7,
        puzzleStateClarityScore: 0.73
      },
      scenarioSummaries: [
        {
          scenarioId: 'labyrinth-tutorial-trap-inference-alpha',
          districtType: 'labyrinth-tutorial',
          metrics: {
            discoveryEfficiency: 0.82,
            backtrackPressure: 0.22,
            trapFalsePositiveRate: 0,
            trapFalseNegativeRate: 0,
            wardenPressureExposure: 0.26,
            itemUsefulnessScore: 0.7,
            puzzleStateClarityScore: 0.73
          }
        },
        {
          scenarioId: 'vantage-observatory-three-shell-connector-juliet',
          districtType: 'vantage-observatory',
          metrics: {
            discoveryEfficiency: 1,
            backtrackPressure: 0,
            trapFalsePositiveRate: 0,
            trapFalseNegativeRate: 0,
            wardenPressureExposure: 0.06,
            itemUsefulnessScore: 0,
            puzzleStateClarityScore: 0.79
          }
        }
      ]
    });

    const artifacts = buildBlessingReviewArtifacts({
      reviewPack,
      registry,
      baselineEvalSummary,
      candidateEvalSummaries: new Map([
        ['governed-candidate-experiment-pack-v5:connector-recovery-biased:fnv1a-test', candidateEvalSummary]
      ]),
      createdAt: '2026-04-15T01:00:00.000Z',
      blessRequested: false
    });

    expect(artifacts).toHaveLength(1);
    expect(registry.currentBlessedRecordId).toBe('mazer-runtime-benchmark-v1:eval-current');

    const artifact = artifacts[0];
    expect(artifact.manualBlessingReady).toBe(true);
    expect(artifact.recommendation).toBe('ready-for-manual-blessing');
    expect(artifact.keptGreen).toEqual(expect.arrayContaining([
      'runtimeEvalBands',
      'visualProof',
      'visualCanaries',
      'contentProof',
      'twoShellProof',
      'threeShellProof'
    ]));
    expect(artifact.improved).toEqual(expect.arrayContaining([
      'metric:discoveryEfficiency',
      'metric:backtrackPressure'
    ]));
    expect(artifact.worsened).toEqual(expect.arrayContaining([
      'metric:wardenPressureExposure',
      'metric:itemUsefulnessScore',
      'metric:puzzleStateClarityScore'
    ]));
    expect(artifact.blockedReasons).toEqual([]);
    expect(artifact.dryRunNote).toContain('Review-only run.');
    expect(artifact.humanReadableScenarioDeltas.join(' | ')).toContain('new mazer-runtime-benchmark-v4 coverage kept green');
  });

  test('applies an explicit manual blessing by updating only the blessed record pointer', () => {
    const registry = {
      schemaVersion: 1,
      updatedAt: '2026-04-15T00:00:00.000Z',
      currentBlessedRecordId: 'baseline-record',
      candidates: [
        {
          schemaVersion: 1,
          recordId: 'candidate-record',
          advisoryOnly: true,
          status: 'candidate',
          weights: {
            frontierValue: 1.3,
            backtrackUrgency: 0.9,
            trapSuspicion: 0.95,
            enemyRisk: 0.92,
            itemValue: 1.05,
            puzzleValue: 1,
            rotationTiming: 1.08
          },
          metadata: {
            seedPackId: 'mazer-runtime-benchmark-v4',
            runId: 'eval-frontier',
            evalSummary: {
              summaryId: 'eval-summary-frontier',
              runId: 'eval-frontier',
              scenarioIds: ['labyrinth-tutorial-trap-inference-alpha'],
              metrics: {
                discoveryEfficiency: 0.82,
                backtrackPressure: 0.22,
                trapFalsePositiveRate: 0,
                trapFalseNegativeRate: 0,
                wardenPressureExposure: 0.26,
                itemUsefulnessScore: 0.7,
                puzzleStateClarityScore: 0.73
              }
            },
            gates: {
              architectureCheck: true,
              tests: true,
              build: true,
              visualProof: true,
              visualCanaries: true,
              contentProof: true,
              twoShellProof: true,
              threeShellProof: true,
              runtimeEval: true
            }
          },
          diff: {
            frontierValue: { previous: 1, next: 1.3, delta: 0.3 },
            backtrackUrgency: { previous: 1, next: 0.9, delta: -0.1 },
            trapSuspicion: { previous: 1, next: 0.95, delta: -0.05 },
            enemyRisk: { previous: 1, next: 0.92, delta: -0.08 },
            itemValue: { previous: 1, next: 1.05, delta: 0.05 },
            puzzleValue: { previous: 1, next: 1, delta: 0 },
            rotationTiming: { previous: 1, next: 1.08, delta: 0.08 }
          },
          notes: []
        }
      ],
      blessed: [
        {
          schemaVersion: 1,
          recordId: 'baseline-record',
          advisoryOnly: true,
          status: 'blessed',
          weights: {
            frontierValue: 1,
            backtrackUrgency: 1,
            trapSuspicion: 1,
            enemyRisk: 1,
            itemValue: 1,
            puzzleValue: 1,
            rotationTiming: 1
          },
          metadata: {
            seedPackId: 'mazer-runtime-benchmark-v1',
            runId: 'eval-current',
            evalSummary: {
              summaryId: 'eval-summary-current',
              runId: 'eval-current',
              scenarioIds: ['labyrinth-tutorial-trap-inference-alpha'],
              metrics: {
                discoveryEfficiency: 0.74,
                backtrackPressure: 0.28,
                trapFalsePositiveRate: 0,
                trapFalseNegativeRate: 0,
                wardenPressureExposure: 0.22,
                itemUsefulnessScore: 0.79,
                puzzleStateClarityScore: 0.77
              }
            },
            gates: {
              architectureCheck: true,
              tests: true,
              build: true,
              visualProof: true,
              visualCanaries: true,
              futureRuntimeContentProof: true,
              runtimeEval: true
            }
          },
          diff: {
            frontierValue: { previous: 1, next: 1, delta: 0 },
            backtrackUrgency: { previous: 1, next: 1, delta: 0 },
            trapSuspicion: { previous: 1, next: 1, delta: 0 },
            enemyRisk: { previous: 1, next: 1, delta: 0 },
            itemValue: { previous: 1, next: 1, delta: 0 },
            puzzleValue: { previous: 1, next: 1, delta: 0 },
            rotationTiming: { previous: 1, next: 1, delta: 0 }
          },
          notes: []
        }
      ]
    };

    const nextRegistry = applyManualBlessing({
      registry,
      candidateRecord: registry.candidates[0],
      reviewArtifactPath: 'C:/ATLAS/repos/fawxzzy-mazer/tmp/training/manual-blessing-review-pack-v5/connector-recovery-biased.review.json',
      updatedAt: '2026-04-15T02:00:00.000Z'
    });

    expect(nextRegistry.currentBlessedRecordId).toBe('candidate-record');
    expect(nextRegistry.blessed.at(-1)?.status).toBe('blessed');
    expect(nextRegistry.candidates).toHaveLength(1);
    expect(nextRegistry.blessed.at(-1)?.notes.join(' | ')).toContain('manual-blessing-review-pack-v5/connector-recovery-biased.review.json');
  });
});
