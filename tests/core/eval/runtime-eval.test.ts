import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';
import { runDeterministicRuntimeEvalSuite } from '../../../src/mazer-core/eval';

const CLI_RUNTIME_EVAL_TIMEOUT_MS = 30_000;

describe('runtime eval harness', () => {
  test('produces a stable suite summary with the requested metric contract', () => {
    const summary = runDeterministicRuntimeEvalSuite();
    const repeat = runDeterministicRuntimeEvalSuite();

    expect(summary.schemaVersion).toBe(1);
    expect(summary.suiteId).toBe('mazer-core-deterministic-runtime-eval');
    expect(summary.benchmarkPackId).toBe('mazer-runtime-benchmark-v4');
    expect(summary.summaryId).toMatch(/^eval-/);
    expect(summary.runId).toMatch(/^eval-/);
    expect(summary.scenarioCount).toBe(10);
    expect(summary.scenarioIds).toEqual([
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
    ]);
    expect(summary.replayIntegrity.allScenariosVerified).toBe(true);
    expect(summary.replayIntegrity.failedScenarioCount).toBe(0);
    expect(summary.metricBandValidation.allScenariosWithinBands).toBe(true);
    expect(summary.metricBandValidation.failedScenarioCount).toBe(0);
    expect(Object.keys(summary.metrics)).toEqual([
      'discoveryEfficiency',
      'backtrackPressure',
      'trapFalsePositiveRate',
      'trapFalseNegativeRate',
      'wardenPressureExposure',
      'itemUsefulnessScore',
      'puzzleStateClarityScore'
    ]);
    expect(summary.metrics.discoveryEfficiency).toBeGreaterThan(0);
    expect(summary.metrics.backtrackPressure).toBeGreaterThan(0);
    expect(summary.metrics.trapFalsePositiveRate).toBeGreaterThanOrEqual(0);
    expect(summary.metrics.trapFalseNegativeRate).toBeGreaterThanOrEqual(0);
    expect(summary.metrics.wardenPressureExposure).toBeGreaterThan(0);
    expect(summary.metrics.itemUsefulnessScore).toBeGreaterThan(0);
    expect(summary.metrics.puzzleStateClarityScore).toBeGreaterThan(0);
    expect(summary.scenarioSummaries).toHaveLength(10);
    expect(summary.scenarioSummaries.every((scenario) => (
      typeof scenario.summaryId === 'string'
      && typeof scenario.runId === 'string'
      && typeof scenario.seed === 'string'
      && typeof scenario.scenarioLabel === 'string'
      && typeof scenario.districtType === 'string'
      && typeof scenario.shellCount === 'number'
      && typeof scenario.variant === 'string'
      && typeof scenario.decisionSignature === 'string'
      && Object.keys(scenario.metrics).length === 7
      && scenario.replayVerified
      && scenario.metricBandValidation.passed
    ))).toBe(true);
    expect(summary.scenarioSummaries.map((scenario) => scenario.scenarioId)).toEqual(summary.scenarioIds);
    expect(summary.scenarioSummaries.map((scenario) => scenario.runId)).toEqual(
      repeat.scenarioSummaries.map((scenario) => scenario.runId)
    );
    expect(summary.scenarioSummaries.map((scenario) => scenario.summaryId)).toEqual(
      repeat.scenarioSummaries.map((scenario) => scenario.summaryId)
    );
    expect(JSON.stringify(summary)).not.toMatch(/manifest|PlanetProofManifest|objectiveNodeId/i);
  });

  test('emits the same machine-readable summary from the CLI runner', () => {
    const repoRoot = resolve(process.cwd());
    const tempDir = mkdtempSync(join(tmpdir(), 'mazer-runtime-eval-'));
    const outputPath = join(tempDir, 'summary.json');
    const scriptPath = resolve(repoRoot, 'scripts/eval/run-eval.mjs');

    try {
      const stdout = execFileSync('node', [scriptPath, '--out', outputPath], {
        cwd: repoRoot,
        encoding: 'utf8'
      });
      const cliSummary = JSON.parse(stdout);
      const fileSummary = JSON.parse(readFileSync(outputPath, 'utf8'));

      expect(cliSummary.summaryId).toBe(fileSummary.summaryId);
      expect(cliSummary.runId).toBe(fileSummary.runId);
      expect(cliSummary.metrics).toEqual(fileSummary.metrics);
      expect(cliSummary.benchmarkPackId).toBe('mazer-runtime-benchmark-v4');
      expect(cliSummary.scenarioSummaries).toHaveLength(10);
      expect(cliSummary.scenarioIds).toEqual(fileSummary.scenarioIds);
      expect(fileSummary.summaryId).toMatch(/^eval-/);
      expect(JSON.stringify(fileSummary)).not.toMatch(/manifest|PlanetProofManifest|objectiveNodeId/i);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }, CLI_RUNTIME_EVAL_TIMEOUT_MS);

  test('separates advisory candidate outcomes under the v5 candidate pack', () => {
    const candidateWeights = {
      'connector-recovery-biased': {
        frontierValue: 0.92,
        backtrackUrgency: 1.08,
        trapSuspicion: 1.28,
        enemyRisk: 1.22,
        itemValue: 0.96,
        puzzleValue: 0.94,
        rotationTiming: 0.9
      },
      'item-puzzle-clarity-biased': {
        frontierValue: 0.94,
        backtrackUrgency: 0.96,
        trapSuspicion: 0.96,
        enemyRisk: 1.02,
        itemValue: 1.28,
        puzzleValue: 1.18,
        rotationTiming: 1.04
      },
      'warden-cautious-biased': {
        frontierValue: 0.6,
        backtrackUrgency: 1.6,
        trapSuspicion: 1.6,
        enemyRisk: 1.6,
        itemValue: 0.9,
        puzzleValue: 0.9,
        rotationTiming: 0.9
      }
    } as const;

    const summaries = Object.fromEntries(
      Object.entries(candidateWeights).map(([candidateId, tuningWeights]) => [
        candidateId,
        runDeterministicRuntimeEvalSuite({ tuningWeights })
      ])
    );

    const decisionFingerprints = new Set(
      Object.values(summaries).map((summary) => JSON.stringify(
        summary.scenarioSummaries.map((scenario) => ({
          scenarioId: scenario.scenarioId,
          firstTargetTileId: scenario.firstTargetTileId,
          decisionSignature: scenario.decisionSignature
        }))
      ))
    );

    expect(decisionFingerprints.size).toBeGreaterThanOrEqual(3);

    const itemScenarioChoices = Object.fromEntries(
      Object.entries(summaries).map(([candidateId, summary]) => [
        candidateId,
        summary.scenarioSummaries.find((scenario) => (
          scenario.scenarioId === 'scavenger-checkpoint-item-usefulness-charlie'
        ))?.firstTargetTileId
      ])
    );
    expect(itemScenarioChoices['item-puzzle-clarity-biased']).toBe('item-mid');
    expect(itemScenarioChoices['connector-recovery-biased']).toBe('item-spur');

    const multiSpeakerChoices = Object.fromEntries(
      Object.entries(summaries).map(([candidateId, summary]) => [
        candidateId,
        summary.scenarioSummaries.find((scenario) => (
          scenario.scenarioId === 'labyrinth-tutorial-multi-speaker-intent-india'
        ))?.firstTargetTileId
      ])
    );
    expect(multiSpeakerChoices['item-puzzle-clarity-biased']).toBe('intent-brief');
    expect(multiSpeakerChoices['connector-recovery-biased']).toBe('intent-quiet');

    const connectorChoices = Object.fromEntries(
      Object.entries(summaries).map(([candidateId, summary]) => [
        candidateId,
        summary.scenarioSummaries.find((scenario) => (
          scenario.scenarioId === 'vantage-observatory-three-shell-connector-juliet'
        ))?.firstTargetTileId
      ])
    );
    expect(connectorChoices['connector-recovery-biased']).toBe('outer-detour');
    expect(connectorChoices['item-puzzle-clarity-biased']).toBe('middle-latch');

    const wardenRecoveryChoices = Object.fromEntries(
      Object.entries(summaries).map(([candidateId, summary]) => [
        candidateId,
        summary.scenarioSummaries.find((scenario) => (
          scenario.scenarioId === 'loopy-combat-capable-trap-warden-item-foxtrot'
        ))?.firstTargetTileId
      ])
    );
    expect(wardenRecoveryChoices['warden-cautious-biased']).toBe('pressure-cache');
    expect(wardenRecoveryChoices['connector-recovery-biased']).toBe('pressure-gauntlet');
  });
});
