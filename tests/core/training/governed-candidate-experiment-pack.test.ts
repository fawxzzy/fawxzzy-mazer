// @ts-nocheck
import { describe, expect, test } from 'vitest';
import {
  REQUIRED_GATE_NAMES,
  REQUIRED_GLOBAL_GATES,
  buildGovernedCandidateExperimentRegistry,
  createEmptyRegistry,
  loadGovernedCandidateExperimentPack,
  normalizeWeights
} from '../../../scripts/training/governed-candidate-experiment-pack.mjs';

const makeEvalSummary = (runId: string, options: {
  benchmarkPackId?: string;
  scenarioIds?: string[];
  replayVerified?: boolean;
  bandsGreen?: boolean;
  metricBandFailures?: string[];
}) => ({
  schemaVersion: 1,
  suiteId: 'mazer-core-deterministic-runtime-eval',
  benchmarkPackId: options.benchmarkPackId ?? 'mazer-runtime-benchmark-v4',
  summaryId: `eval-summary-${runId}`,
  runId,
  generatedAt: '2026-04-14T00:00:00.000Z',
  scenarioCount: 10,
  scenarioIds: options.scenarioIds ?? [
    'labyrinth-tutorial-trap-inference-alpha',
    'loopy-combat-capable-warden-pressure-bravo',
    'scavenger-checkpoint-item-usefulness-charlie',
    'puzzle-visibility-delta',
    'vantage-observatory-rotation-timing-echo',
    'loopy-combat-capable-trap-warden-item-foxtrot',
    'vantage-observatory-discrete-alignment-recovery-golf',
    'vantage-observatory-puzzle-rotation-hotel',
    'labyrinth-tutorial-multi-speaker-intent-india',
    'vantage-observatory-three-shell-connector-juliet'
  ],
  replayIntegrity: {
    verifiedScenarioCount: options.replayVerified === false ? 9 : 10,
    failedScenarioCount: options.replayVerified === false ? 1 : 0,
    allScenariosVerified: options.replayVerified !== false
  },
  metrics: {
    discoveryEfficiency: 0.72,
    backtrackPressure: 0.3,
    trapFalsePositiveRate: 0.08,
    trapFalseNegativeRate: 0.12,
    wardenPressureExposure: 0.24,
    itemUsefulnessScore: 0.79,
    puzzleStateClarityScore: 0.74
  },
  support: {
    rowsEvaluated: 30,
    discoverySamples: 25,
    backtrackSamples: 5,
    trapPredictedPositiveCount: 2,
    trapActualPositiveCount: 2,
    trapFalsePositiveCount: 0,
    trapFalseNegativeCount: 0,
    wardenExposureSamples: 30,
    itemPositiveSamples: 6,
    puzzlePositiveSamples: 8
  },
  metricBandValidation: {
    passedScenarioCount: options.bandsGreen === false ? 9 : 10,
    failedScenarioCount: options.bandsGreen === false ? 1 : 0,
    allScenariosWithinBands: options.bandsGreen !== false
  },
  scenarioSummaries: options.bandsGreen === false
    ? [
        {
          scenarioId: 'scavenger-checkpoint-item-usefulness-charlie',
          metricBandValidation: {
            passed: false,
            failures: options.metricBandFailures ?? [
              'itemUsefulnessScore=0.41 outside [0.6, 1]'
            ]
          }
        }
      ]
    : []
});

describe('governed candidate experiment pack', () => {
  test('declares the three narrowed v5 advisory profiles and required gate policy', async () => {
    const pack = await loadGovernedCandidateExperimentPack();

    expect(pack.packId).toBe('governed-candidate-experiment-pack-v5');
    expect(pack.promotionBlockedUntil).toEqual([
      'architectureCheck',
      'tests',
      'build',
      'visualProof',
      'visualCanaries',
      'contentProof',
      'twoShellProof',
      'threeShellProof',
      'runtimeEvalBands'
    ]);
    expect(REQUIRED_GLOBAL_GATES).toEqual([
      'architectureCheck',
      'tests',
      'build',
      'visualProof',
      'visualCanaries',
      'contentProof',
      'twoShellProof',
      'threeShellProof'
    ]);
    expect(REQUIRED_GATE_NAMES).toEqual([
      'architectureCheck',
      'tests',
      'build',
      'visualProof',
      'visualCanaries',
      'contentProof',
      'twoShellProof',
      'threeShellProof',
      'runtimeEval'
    ]);
    expect(pack.candidates.map((candidate: { candidateId: string }) => candidate.candidateId)).toEqual([
      'connector-recovery-biased',
      'item-puzzle-clarity-biased',
      'warden-cautious-biased'
    ]);
    expect(
      pack.candidates.every((candidate: { weights: Record<string, number> }) => (
        Object.values(candidate.weights).some((value: number) => value !== 1)
      ))
    ).toBe(true);
    expect(normalizeWeights({ frontierValue: 2, itemValue: 0.1 }).frontierValue).toBe(1.6);
  });

  test('records accept and reject reasons without auto-blessing', () => {
    const pack = {
      schemaVersion: 1,
      packId: 'governed-candidate-experiment-pack-v5',
      seedPackId: 'mazer-runtime-benchmark-v4',
      benchmarkPackId: 'mazer-runtime-benchmark-v4',
      promotionBlockedUntil: [
        'architectureCheck',
        'tests',
        'build',
        'visualProof',
        'visualCanaries',
        'contentProof',
        'twoShellProof',
        'threeShellProof',
        'runtimeEvalBands'
      ],
      candidates: [
        {
          candidateId: 'connector-recovery-biased',
          label: 'Connector Recovery Biased',
          weights: {
            frontierValue: 0.92,
            backtrackUrgency: 1.08,
            trapSuspicion: 1.28,
            enemyRisk: 1.22,
            itemValue: 0.96,
            puzzleValue: 0.94,
            rotationTiming: 0.9
          }
        },
        {
          candidateId: 'warden-cautious-biased',
          label: 'Warden Cautious Biased',
          weights: {
            frontierValue: 0.6,
            backtrackUrgency: 1.6,
            trapSuspicion: 1.6,
            enemyRisk: 1.6,
            itemValue: 0.9,
            puzzleValue: 0.9,
            rotationTiming: 0.9
          }
        }
      ]
    };
    const registry = {
      ...createEmptyRegistry(),
      currentBlessedRecordId: 'mazer-runtime-benchmark-v4:eval-current',
      blessed: [
        {
          schemaVersion: 1,
          recordId: 'mazer-runtime-benchmark-v4:eval-current',
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
            seedPackId: 'mazer-runtime-benchmark-v4',
            createdAt: '2026-04-14T00:00:00.000Z',
            runId: 'eval-current',
            date: '2026-04-14',
            evalSummary: {
              summaryId: 'eval-summary-current',
              runId: 'eval-current',
              scenarioIds: [
                'labyrinth-tutorial-trap-inference-alpha',
                'loopy-combat-capable-warden-pressure-bravo',
                'scavenger-checkpoint-item-usefulness-charlie',
                'puzzle-visibility-delta',
                'vantage-observatory-rotation-timing-echo',
                'loopy-combat-capable-trap-warden-item-foxtrot',
                'vantage-observatory-discrete-alignment-recovery-golf',
                'vantage-observatory-puzzle-rotation-hotel',
                'labyrinth-tutorial-multi-speaker-intent-india',
                'vantage-observatory-three-shell-connector-juliet'
              ],
              metrics: {
                discoveryEfficiency: 0.71,
                backtrackPressure: 0.31,
                trapFalsePositiveRate: 0.08,
                trapFalseNegativeRate: 0.1,
                wardenPressureExposure: 0.24,
                itemUsefulnessScore: 0.78,
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
    const gateStatus = {
      architectureCheck: true,
      tests: true,
      build: true,
      visualProof: true,
      visualCanaries: true,
      contentProof: true,
      twoShellProof: true,
      threeShellProof: true
    };
    const gateEvidence = {
      visualProof: {
        schemaVersion: 1,
        ok: true,
        runId: 'visual-proof-run',
        artifactRoot: 'tmp/captures/mazer-visual-proof',
        packetCount: 25,
        indexPath: 'tmp/captures/mazer-visual-proof/index.json',
        failureCount: 0,
        failures: [],
        sourceFilePath: 'scripts/visual/mazer-run.mjs'
      }
    };
    const evaluationResults = {
      'connector-recovery-biased': {
        evalSummary: makeEvalSummary('eval-frontier', {
          bandsGreen: true
        }),
        artifactPaths: {
          weightsPath: 'C:/ATLAS/repos/fawxzzy-mazer/tmp/training/governed-candidate-experiment-pack/connector-recovery-biased/weights.json',
          evalSummaryPath: 'C:/ATLAS/repos/fawxzzy-mazer/tmp/eval/governed-candidate-experiment-pack/connector-recovery-biased/runtime-eval-summary.json'
        }
      },
      'warden-cautious-biased': {
        evalSummary: makeEvalSummary('eval-caution', {
          bandsGreen: false,
          metricBandFailures: [
            'trapFalsePositiveRate=0.31 outside [0, 0.2]'
          ]
        }),
        artifactPaths: {
          weightsPath: 'C:/ATLAS/repos/fawxzzy-mazer/tmp/training/governed-candidate-experiment-pack/warden-cautious-biased/weights.json',
          evalSummaryPath: 'C:/ATLAS/repos/fawxzzy-mazer/tmp/eval/governed-candidate-experiment-pack/warden-cautious-biased/runtime-eval-summary.json'
        }
      }
    };

    const { registry: nextRegistry, candidateRecords } = buildGovernedCandidateExperimentRegistry({
      pack,
      registry,
      gateStatus,
      gateEvidence,
      evalSummaries: evaluationResults,
      createdAt: '2026-04-14T01:00:00.000Z',
      governedRunId: 'governed-fnv1a-test'
    });

    expect(candidateRecords).toHaveLength(2);
    expect(nextRegistry.blessed).toHaveLength(1);
    expect(nextRegistry.currentBlessedRecordId).toBe('mazer-runtime-benchmark-v4:eval-current');

    const acceptedRecord = candidateRecords.find((record: { metadata: { candidateId: string } }) => record.metadata.candidateId === 'connector-recovery-biased');
    const rejectedRecord = candidateRecords.find((record: { metadata: { candidateId: string } }) => record.metadata.candidateId === 'warden-cautious-biased');

    expect(acceptedRecord?.governanceDecision).toBe('accepted');
    expect(acceptedRecord?.status).toBe('candidate');
    expect(acceptedRecord?.notes.join(' | ')).toContain('accepted: all required promotion gates green');
    expect(acceptedRecord?.notes.join(' | ')).toContain('promotion blocked: manual blessing required');
    expect(acceptedRecord?.notes.join(' | ')).toContain('governedRunId: governed-fnv1a-test');
    expect(acceptedRecord?.notes.join(' | ')).toContain('visualProofRunId: visual-proof-run');
    expect(acceptedRecord?.notes.join(' | ')).toContain('visualProofSource: scripts/visual/mazer-run.mjs');
    expect(acceptedRecord?.metadata.gates.runtimeEval).toBe(true);
    expect(acceptedRecord?.metadata.governedRunId).toBe('governed-fnv1a-test');
    expect(acceptedRecord?.metadata.gateEvidence.visualProof).toEqual(gateEvidence.visualProof);

    expect(rejectedRecord?.governanceDecision).toBe('rejected');
    expect(rejectedRecord?.status).toBe('rejected');
    expect(rejectedRecord?.notes.join(' | ')).toContain('metric-band failures: scavenger-checkpoint-item-usefulness-charlie: trapFalsePositiveRate=0.31 outside [0, 0.2]');
    expect(rejectedRecord?.notes.join(' | ')).toContain('warden-cautious-biased/weights.json');
    expect(rejectedRecord?.metadata.gateEvidence.visualProof).toEqual(gateEvidence.visualProof);
    expect(rejectedRecord?.metadata.gates.runtimeEval).toBe(false);
  });
});
