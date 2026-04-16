// @ts-nocheck
import { describe, expect, test } from 'vitest';
import {
  buildCandidateDiagnosticsReport,
  loadCandidateDiagnosticsPack,
  renderCandidateDiagnosticsMarkdown,
  resolveCandidateRecords
} from '../../../scripts/training/candidate-diagnostics.mjs';

const makeScenarioSummary = (
  scenarioId: string,
  decisionSignature: string,
  firstTargetTileId: string,
  metrics: Record<string, number>
) => ({
  scenarioId,
  scenarioLabel: scenarioId,
  districtType: 'test-district',
  decisionSignature,
  firstTargetTileId,
  metrics
});

describe('candidate diagnostics', () => {
  test('loads the diagnostics pack with required family groups', async () => {
    const pack = await loadCandidateDiagnosticsPack();

    expect(pack.diagnosticsPackId).toBe('candidate-diagnostics-v5');
    expect(pack.sourcePackId).toBe('governed-candidate-experiment-pack-v4');
    expect(pack.candidateIds).toEqual([
      'frontier-biased',
      'caution-biased',
      'pursuit-avoidance-biased',
      'item-priority-biased'
    ]);
    expect(pack.familyGroups.map((family: { familyId: string }) => family.familyId)).toEqual([
      'warden-pressure-exposure',
      'item-usefulness',
      'puzzle-state-clarity',
      'multi-speaker-intent-load',
      'three-shell-connector-recovery'
    ]);
  });

  test('reports collapse, narrow divergence, and smaller v5 profile hints', () => {
    const diagnosticsPack = {
      diagnosticsPackId: 'candidate-diagnostics-v5',
      sourcePackId: 'governed-candidate-experiment-pack-v4',
      benchmarkPackId: 'mazer-runtime-benchmark-v4',
      scenarioIds: [
        'loopy-combat-capable-warden-pressure-bravo',
        'labyrinth-tutorial-multi-speaker-intent-india',
        'vantage-observatory-three-shell-connector-juliet'
      ],
      candidateIds: [
        'frontier-biased',
        'caution-biased',
        'pursuit-avoidance-biased',
        'item-priority-biased'
      ],
      familyGroups: [
        {
          familyId: 'warden-pressure-exposure',
          label: 'Warden pressure exposure',
          metricKeys: ['wardenPressureExposure'],
          scenarioIds: [
            'loopy-combat-capable-warden-pressure-bravo',
            'labyrinth-tutorial-multi-speaker-intent-india'
          ]
        },
        {
          familyId: 'item-usefulness',
          label: 'Item usefulness',
          metricKeys: ['itemUsefulnessScore'],
          scenarioIds: ['labyrinth-tutorial-multi-speaker-intent-india']
        },
        {
          familyId: 'puzzle-state-clarity',
          label: 'Puzzle-state clarity',
          metricKeys: ['puzzleStateClarityScore'],
          scenarioIds: ['labyrinth-tutorial-multi-speaker-intent-india']
        },
        {
          familyId: 'multi-speaker-intent-load',
          label: 'Multi-speaker intent load',
          metricKeys: [
            'wardenPressureExposure',
            'itemUsefulnessScore',
            'puzzleStateClarityScore'
          ],
          scenarioIds: ['labyrinth-tutorial-multi-speaker-intent-india']
        },
        {
          familyId: 'three-shell-connector-recovery',
          label: 'Three-shell connector recovery',
          metricKeys: [
            'puzzleStateClarityScore',
            'wardenPressureExposure'
          ],
          scenarioIds: ['vantage-observatory-three-shell-connector-juliet']
        }
      ]
    };
    const registry = {
      currentBlessedRecordId: 'mazer-runtime-benchmark-v1:eval-1e876219'
    };
    const baselineRecord = {
      recordId: 'mazer-runtime-benchmark-v1:eval-1e876219'
    };
    const baselineSummary = {
      runId: 'eval-baseline-v4',
      benchmarkPackId: 'mazer-runtime-benchmark-v4',
      scenarioIds: [...diagnosticsPack.scenarioIds],
      scenarioSummaries: [
        makeScenarioSummary(
          'loopy-combat-capable-warden-pressure-bravo',
          'warden-mid>warden-entry>warden-spur',
          'warden-mid',
          {
            discoveryEfficiency: 0.6667,
            backtrackPressure: 0.3333,
            trapFalsePositiveRate: 0,
            trapFalseNegativeRate: 0,
            wardenPressureExposure: 0.74,
            itemUsefulnessScore: 0,
            puzzleStateClarityScore: 0
          }
        ),
        makeScenarioSummary(
          'labyrinth-tutorial-multi-speaker-intent-india',
          'intent-quiet>intent-relay>intent-goal',
          'intent-quiet',
          {
            discoveryEfficiency: 1,
            backtrackPressure: 0,
            trapFalsePositiveRate: 0,
            trapFalseNegativeRate: 0,
            wardenPressureExposure: 0.18,
            itemUsefulnessScore: 0.4533,
            puzzleStateClarityScore: 0.57
          }
        ),
        makeScenarioSummary(
          'vantage-observatory-three-shell-connector-juliet',
          'middle-latch>inner-bridge>inner-core',
          'middle-latch',
          {
            discoveryEfficiency: 1,
            backtrackPressure: 0,
            trapFalsePositiveRate: 0,
            trapFalseNegativeRate: 0,
            wardenPressureExposure: 0.0633,
            itemUsefulnessScore: 0,
            puzzleStateClarityScore: 0.88
          }
        )
      ]
    };
    const candidateRecords = [
      {
        recordId: 'frontier-record',
        status: 'rejected',
        metadata: {
          candidateId: 'frontier-biased',
          packId: 'governed-candidate-experiment-pack-v4',
          gates: { visualProof: false }
        },
        notes: ['failed gates: visualProof']
      },
      {
        recordId: 'caution-record',
        status: 'rejected',
        metadata: {
          candidateId: 'caution-biased',
          packId: 'governed-candidate-experiment-pack-v4',
          gates: { visualProof: false }
        },
        notes: ['failed gates: visualProof']
      },
      {
        recordId: 'pursuit-record',
        status: 'rejected',
        metadata: {
          candidateId: 'pursuit-avoidance-biased',
          packId: 'governed-candidate-experiment-pack-v4',
          gates: { visualProof: false }
        },
        notes: ['failed gates: visualProof']
      },
      {
        recordId: 'item-record',
        status: 'rejected',
        metadata: {
          candidateId: 'item-priority-biased',
          packId: 'governed-candidate-experiment-pack-v4',
          gates: { visualProof: false }
        },
        notes: ['failed gates: visualProof']
      }
    ];
    const candidateEvalSummaries = new Map([
      [
        'frontier-record',
        {
          scenarioSummaries: [...baselineSummary.scenarioSummaries]
        }
      ],
      [
        'caution-record',
        {
          scenarioSummaries: [
            ...baselineSummary.scenarioSummaries.slice(0, 2),
            makeScenarioSummary(
              'vantage-observatory-three-shell-connector-juliet',
              'outer-detour>inner-bridge>inner-core',
              'outer-detour',
              {
                discoveryEfficiency: 1,
                backtrackPressure: 0,
                trapFalsePositiveRate: 0,
                trapFalseNegativeRate: 0,
                wardenPressureExposure: 0.04,
                itemUsefulnessScore: 0,
                puzzleStateClarityScore: 0.6133
              }
            )
          ]
        }
      ],
      [
        'pursuit-record',
        {
          scenarioSummaries: [...baselineSummary.scenarioSummaries]
        }
      ],
      [
        'item-record',
        {
          scenarioSummaries: [
            baselineSummary.scenarioSummaries[0],
            makeScenarioSummary(
              'labyrinth-tutorial-multi-speaker-intent-india',
              'intent-brief>intent-relay>intent-goal',
              'intent-brief',
              {
                discoveryEfficiency: 1,
                backtrackPressure: 0,
                trapFalsePositiveRate: 0,
                trapFalseNegativeRate: 0,
                wardenPressureExposure: 0.5,
                itemUsefulnessScore: 0.7133,
                puzzleStateClarityScore: 0.81
              }
            ),
            baselineSummary.scenarioSummaries[2]
          ]
        }
      ]
    ]);

    const report = buildCandidateDiagnosticsReport({
      diagnosticsPack,
      registry,
      baselineRecord,
      baselineSummary,
      candidateRecords,
      candidateEvalSummaries,
      baselineEvalSummaryPath: 'C:/ATLAS/repos/fawxzzy-mazer/tmp/eval/candidate-diagnostics/current-blessed/runtime-eval-summary.json',
      createdAt: '2026-04-16T01:00:00.000Z'
    });
    const markdown = renderCandidateDiagnosticsMarkdown(report);

    expect(report.sharedGateBlockers).toEqual([
      {
        gateKey: 'visualProof',
        affectedCandidates: [
          'frontier-biased',
          'caution-biased',
          'pursuit-avoidance-biased',
          'item-priority-biased'
        ],
        affectsAllCandidates: true
      }
    ]);
    expect(report.candidateSummaries.find((candidate: { candidateId: string }) => candidate.candidateId === 'frontier-biased')?.traceCollapse.fullyCollapsed).toBe(true);
    expect(report.candidateSummaries.find((candidate: { candidateId: string }) => candidate.candidateId === 'pursuit-avoidance-biased')?.traceCollapse.fullyCollapsed).toBe(true);
    expect(report.familySummaries.find((family: { familyId: string }) => family.familyId === 'three-shell-connector-recovery')?.divergentCandidateIds).toEqual([
      'caution-biased'
    ]);
    expect(report.familySummaries.find((family: { familyId: string }) => family.familyId === 'multi-speaker-intent-load')?.divergentCandidateIds).toEqual([
      'item-priority-biased'
    ]);
    expect(report.nextCandidateSetHint.dropOrMergeCandidateIds).toEqual([
      'frontier-biased',
      'pursuit-avoidance-biased'
    ]);
    expect(report.nextCandidateSetHint.suggestedProfiles).toEqual([
      'connector-recovery biased',
      'item/puzzle-clarity biased',
      'warden-cautious biased'
    ]);
    expect(markdown).toContain('Drop or merge: frontier-biased, pursuit-avoidance-biased');
    expect(markdown).toContain('Three-shell connector recovery');
  });

  test('resolves the latest governed candidate records in configured order', () => {
    const diagnosticsPack = {
      sourcePackId: 'governed-candidate-experiment-pack-v4',
      candidateIds: ['frontier-biased', 'item-priority-biased']
    };
    const registry = {
      candidates: [
        {
          recordId: 'old-frontier',
          metadata: {
            packId: 'governed-candidate-experiment-pack-v4',
            candidateId: 'frontier-biased'
          }
        },
        {
          recordId: 'new-frontier',
          metadata: {
            packId: 'governed-candidate-experiment-pack-v4',
            candidateId: 'frontier-biased'
          }
        },
        {
          recordId: 'item-record',
          metadata: {
            packId: 'governed-candidate-experiment-pack-v4',
            candidateId: 'item-priority-biased'
          }
        }
      ]
    };

    expect(resolveCandidateRecords(registry, diagnosticsPack).map((record: { recordId: string }) => record.recordId)).toEqual([
      'new-frontier',
      'item-record'
    ]);
  });
});
