import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, DEFAULT_BASE_URL, DEFAULT_CAPTURE_TIMEOUT_MS, DEFAULT_PREVIEW_TIMEOUT_MS, normalizeBaseUrl, parseCliArgs, parseIntegerArg } from './common.mjs';
import { runVisualProofSuite } from './mazer-run.mjs';
import { readVisualProofConfig } from '../../tools/visual-pipeline/config.mjs';
import { buildCanaryAggregateReport } from '../../tools/visual-pipeline/canaryReport.mjs';
import { compareLatestRunToBaseline } from '../../tools/visual-pipeline/packets.mjs';
import { CANARY_SCENARIOS } from '../../src/visual-proof/canaryCatalog.ts';

const CANARY_ARTIFACT_ROOT = 'tmp/captures/mazer-visual-proof-canaries';
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const buildCanaryConfig = async (mutated) => {
  const baseConfig = await readVisualProofConfig(REPO_ROOT);
  const viewport = baseConfig.viewports.find((entry) => entry.id === 'desktop-wide') ?? baseConfig.viewports[0];
  const scenarios = CANARY_SCENARIOS.map((scenario) => {
    const baseScenario = baseConfig.scenarios.find((entry) => entry.id === scenario.id);
    if (!baseScenario) {
      throw new Error(`Missing base visual proof scenario ${scenario.id}.`);
    }

    const manifestRoute = `/visual-proof.html?manifest=/topology-proof/manifests/${scenario.id}.json${mutated ? `&canary=${scenario.mutation}` : ''}`;
    return {
      ...baseScenario,
      label: scenario.label,
      route: manifestRoute,
      expectedFailures: mutated ? scenario.expectedFailures : []
    };
  });

  return {
    artifactRoot: CANARY_ARTIFACT_ROOT,
    selectors: baseConfig.selectors,
    viewports: [viewport],
    scenarios
  };
};

const buildSyntheticBaselinePointer = (artifactRoot, runId) => ({
  pointer: {
    runId,
    artifactRoot,
    indexPath: `${artifactRoot}/index.json`
  }
});

const main = async () => {
  const args = parseCliArgs();
  const baseUrl = normalizeBaseUrl(args['base-url'] ?? process.env.MAZER_VISUAL_BASE_URL ?? DEFAULT_BASE_URL);
  const previewTimeoutMs = parseIntegerArg(args['preview-timeout'], DEFAULT_PREVIEW_TIMEOUT_MS);
  const captureTimeoutMs = parseIntegerArg(args.timeout, DEFAULT_CAPTURE_TIMEOUT_MS);
  const controlConfig = await buildCanaryConfig(false);
  const canaryConfig = await buildCanaryConfig(true);

  const controlSummary = await runVisualProofSuite({
    baseUrl,
    config: controlConfig,
    artifactRoot: CANARY_ARTIFACT_ROOT,
    previewTimeoutMs,
    captureTimeoutMs,
    skipBuild: args['skip-build'] === true || args['skip-build'] === 'true',
    runId: typeof args['control-run'] === 'string' ? args['control-run'] : undefined,
    allowFailures: false
  });

  const canarySummary = await runVisualProofSuite({
    baseUrl,
    config: canaryConfig,
    artifactRoot: CANARY_ARTIFACT_ROOT,
    previewTimeoutMs,
    captureTimeoutMs,
    skipBuild: true,
    runId: typeof args['canary-run'] === 'string' ? args['canary-run'] : undefined,
    allowFailures: true
  });

  const comparison = await compareLatestRunToBaseline(REPO_ROOT, CANARY_ARTIFACT_ROOT, {
    baselinePointer: buildSyntheticBaselinePointer(CANARY_ARTIFACT_ROOT, controlSummary.runId),
    requireBaseline: true,
    runId: canarySummary.runId
  });

  const missingExpectations = [];
  for (const packet of canarySummary.packets) {
    const expected = CANARY_SCENARIOS.find((entry) => entry.id === packet.metadata.scenario.id)?.expectedFailures ?? [];
    const actual = packet.semanticScore.failingGates.map((gate) => gate.label);
    for (const label of expected) {
      if (!actual.includes(label)) {
        missingExpectations.push(`${packet.metadata.scenario.id}/${packet.metadata.viewport.id}: missing ${label}`);
      }
    }
  }

  if (canarySummary.failures.length === 0) {
    throw new Error('Canary run unexpectedly passed; no failures were detected.');
  }

  if (comparison.aggregateDiffSummary.regressions.length === 0) {
    throw new Error('Canary compare produced zero regressions; detector sensitivity did not move.');
  }

  if (missingExpectations.length > 0) {
    throw new Error(`Canary failures did not match expectations: ${missingExpectations.join('; ')}`);
  }

  const reportPath = resolve(REPO_ROOT, CANARY_ARTIFACT_ROOT, 'CANARY-REPORT.md');
  await mkdir(resolve(REPO_ROOT, CANARY_ARTIFACT_ROOT), { recursive: true });
  await writeFile(reportPath, buildCanaryAggregateReport({
    controlRunId: controlSummary.runId,
    canaryRunId: canarySummary.runId,
    expectedFailures: CANARY_SCENARIOS.flatMap((entry) => entry.expectedFailures),
    actualFailures: canarySummary.failures.flatMap((entry) => entry.failures),
    regressionCount: comparison.aggregateDiffSummary.regressions.length
  }), 'utf8');

  process.stdout.write(`${JSON.stringify({
    artifactRoot: CANARY_ARTIFACT_ROOT,
    controlRunId: controlSummary.runId,
    canaryRunId: canarySummary.runId,
    failureCount: canarySummary.failures.length,
    regressionCount: comparison.aggregateDiffSummary.regressions.length,
    reportPath
  }, null, 2)}\n`);
};

if (isDirectRun) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
