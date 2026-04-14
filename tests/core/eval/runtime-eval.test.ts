import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';
import { runDeterministicRuntimeEvalSuite } from '../../../src/mazer-core/eval';

describe('runtime eval harness', () => {
  test('produces a stable suite summary with the requested metric contract', () => {
    const summary = runDeterministicRuntimeEvalSuite();

    expect(summary.schemaVersion).toBe(1);
    expect(summary.suiteId).toBe('mazer-core-deterministic-runtime-eval');
    expect(summary.summaryId).toMatch(/^eval-/);
    expect(summary.runId).toMatch(/^eval-/);
    expect(summary.scenarioCount).toBe(4);
    expect(summary.replayIntegrity.allScenariosVerified).toBe(true);
    expect(summary.replayIntegrity.failedScenarioCount).toBe(0);
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
    expect(summary.metrics.trapFalsePositiveRate).toBeGreaterThan(0);
    expect(summary.metrics.trapFalseNegativeRate).toBeGreaterThan(0);
    expect(summary.metrics.wardenPressureExposure).toBeGreaterThan(0);
    expect(summary.metrics.itemUsefulnessScore).toBeGreaterThan(0);
    expect(summary.metrics.puzzleStateClarityScore).toBeGreaterThan(0);
    expect(summary.scenarioSummaries).toHaveLength(4);
    expect(summary.scenarioSummaries.every((scenario) => (
      typeof scenario.summaryId === 'string'
      && typeof scenario.runId === 'string'
      && typeof scenario.seed === 'string'
      && Object.keys(scenario.metrics).length === 7
      && scenario.replayVerified
    ))).toBe(true);
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
      expect(cliSummary.scenarioSummaries).toHaveLength(4);
      expect(fileSummary.summaryId).toMatch(/^eval-/);
      expect(JSON.stringify(fileSummary)).not.toMatch(/manifest|PlanetProofManifest|objectiveNodeId/i);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
