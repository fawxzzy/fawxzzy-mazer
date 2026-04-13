import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { REPO_ROOT, parseCliArgs, parseIntegerArg } from './common.mjs';
import { readVisualProofConfig } from '../../tools/visual-pipeline/config.mjs';
import {
  compareLatestRunToBaseline,
  compareLatestRunToArtifactRoot,
  loadBaselinePointer,
  writeArtifactIndex,
  writeBaselinePointer
} from '../../tools/visual-pipeline/packets.mjs';
import { summarizeLegacySemanticComparison } from '../../tools/visual-pipeline/legacy.mjs';

const parseBooleanArg = (value) => value === true || value === 'true';

const printJson = (value) => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

const readJsonFile = async (path) => JSON.parse(await readFile(path, 'utf8'));

const buildLegacyComparisonReport = async ({ artifactRoot, comparison }) => {
  const packetDiagnostics = await Promise.all(comparison.packetSummaries.map(async (packet) => {
    const scorePath = resolve(REPO_ROOT, packet.current.artifacts.score);
    const metadataPath = resolve(REPO_ROOT, packet.current.artifacts.metadata);
    const [score, metadata] = await Promise.all([
      readJsonFile(scorePath),
      readJsonFile(metadataPath)
    ]);

    return {
      score,
      metadata
    };
  }));

  const semanticComparison = summarizeLegacySemanticComparison({
    packetDiagnostics,
    comparison
  });

  const summary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    current: comparison.current,
    reference: comparison.reference,
    comparison: {
      packetCount: comparison.comparisonScore.totals.packetCount,
      regressionCount: comparison.comparisonDiffSummary.regressions.length,
      averageStability: comparison.comparisonScore.totals.averageStability
    },
    semanticComparison
  };

  const totalPackets = semanticComparison.summary.totalCategories > 0
    ? comparison.comparisonScore.totals.packetCount
    : 0;
  const formatCategory = (category) => {
    const details = [];
    if (category.evidence && Object.keys(category.evidence).length > 0) {
      for (const [key, value] of Object.entries(category.evidence)) {
        if (typeof value === 'number') {
          details.push(`${key} ${value.toFixed(3)}`);
        } else if (value !== null && value !== undefined) {
          details.push(`${key} ${value}`);
        }
      }
    }

    return `${category.note ?? category.category} (${details.join(', ') || 'no numeric evidence'})`;
  };

  const improvedLines = semanticComparison.improved.length > 0
    ? semanticComparison.improved.map((category) => `- ${formatCategory(category)}`)
    : ['- none'];
  const regressedLines = semanticComparison.regressed.length > 0
    ? semanticComparison.regressed.map((category) => `- ${formatCategory(category)}`)
    : ['- none'];
  const intentionalLines = semanticComparison.intentional.length > 0
    ? semanticComparison.intentional.map((category) => `- ${formatCategory(category)}`)
    : ['- none'];

  const reportLines = [
    '# Current vs Legacy Visual Report',
    '',
    `Current run: ${comparison.current.latestRunId}`,
    `Legacy run: ${comparison.reference.latestRunId}`,
    `Compared packets: ${comparison.comparisonScore.totals.packetCount}`,
    `Artifact regressions: ${comparison.comparisonDiffSummary.regressions.length}`,
    `Semantic categories: ${semanticComparison.summary.improvedCount} improved, ${semanticComparison.summary.regressedCount} regressed, ${semanticComparison.summary.intentionalCount} intentional`,
    '',
    'Legacy remains a reference lane only. It is not a blessed baseline.',
    '',
    '## What Improved',
    ...improvedLines,
    '',
    '## What Regressed',
    ...regressedLines,
    '',
    '## What Changed Intentionally',
    ...intentionalLines,
    '',
    '## Semantic Detail',
    `Current lane evidence is measured across ${totalPackets} packets.`
  ];

  for (const category of semanticComparison.categories) {
    reportLines.push(
      `- ${category.category}: ${category.status}. ${category.note ?? 'No note provided.'}`
    );
  }

  reportLines.push(
    '',
    '## Boundary',
    'Legacy remains the shipping feel baseline reference. Do not use it to steer planet-topology decisions beyond regression checks.'
  );

  const reportPath = resolve(REPO_ROOT, artifactRoot, 'comparison-report.md');
  const summaryPath = resolve(REPO_ROOT, artifactRoot, 'comparison-report.json');
  await mkdir(resolve(REPO_ROOT, artifactRoot), { recursive: true });
  await writeFile(reportPath, `${reportLines.join('\n')}\n`, 'utf8');
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  return {
    reportPath,
    summaryPath,
    summary
  };
};

const main = async () => {
  const args = parseCliArgs();
  const config = await readVisualProofConfig(REPO_ROOT);
  const artifactRoot = typeof args['artifact-root'] === 'string' ? args['artifact-root'] : config.artifactRoot;
  const compareMode = parseBooleanArg(args.compare);
  const compareLegacyMode = parseBooleanArg(args['compare-legacy']);
  const regressionsMode = parseBooleanArg(args.regressions);
  const promoteMode = parseBooleanArg(args['promote-baseline']);
  const limit = parseIntegerArg(args.limit, 10);
  const legacyArtifactRoot = typeof args['legacy-artifact-root'] === 'string'
    ? args['legacy-artifact-root']
    : 'tmp/captures/mazer-legacy-proof';

  const { indexPath, index, latestRunId, latestGeneratedAt } = await writeArtifactIndex(REPO_ROOT, artifactRoot);

  if (compareLegacyMode) {
    const comparison = await compareLatestRunToArtifactRoot(REPO_ROOT, artifactRoot, legacyArtifactRoot);
    const report = await buildLegacyComparisonReport({
      artifactRoot,
      comparison
    });
    printJson({
      mode: 'compare-legacy',
      artifactRoot,
      legacyArtifactRoot,
      current: comparison.current,
      reference: comparison.reference,
      packetCount: index.packetCount,
      referencePacketCount: comparison.reference?.packetCount ?? 0,
      comparisonPacketCount: comparison.comparisonScore.totals.packetCount,
      regressionCount: comparison.comparisonDiffSummary.regressions.length,
      topRegression: comparison.comparisonDiffSummary.regressions[0] ?? null,
      comparisonIndexPath: resolve(REPO_ROOT, artifactRoot, 'comparison-index.json'),
      comparisonScorePath: resolve(REPO_ROOT, artifactRoot, 'comparison-score.json'),
      comparisonDiffSummaryPath: resolve(REPO_ROOT, artifactRoot, 'comparison-diff-summary.json'),
      comparisonReportPath: report.reportPath,
      comparisonSummaryPath: report.summaryPath
    });
    return;
  }

  if (promoteMode) {
    const promoted = await writeBaselinePointer(REPO_ROOT, artifactRoot, index);
    const comparison = await compareLatestRunToBaseline(REPO_ROOT, artifactRoot, {
      baselinePointer: { pointer: promoted.pointer },
      requireBaseline: true
    });

    printJson({
      mode: 'promote-baseline',
      artifactRoot,
      baselinePointerPath: resolve(REPO_ROOT, 'artifacts/visual/baseline.json'),
      baseline: promoted.pointer,
      latestRunId,
      latestGeneratedAt,
      comparison: {
        latestRunId: comparison.latestRunId,
        regressionCount: comparison.aggregateDiffSummary.regressions.length,
        scorePath: resolve(REPO_ROOT, artifactRoot, 'score.json'),
        diffSummaryPath: resolve(REPO_ROOT, artifactRoot, 'diff-summary.json')
      }
    });
    return;
  }

  const baselinePointer = await loadBaselinePointer(REPO_ROOT);
  const comparison = baselinePointer
    ? await compareLatestRunToBaseline(REPO_ROOT, artifactRoot, {
        baselinePointer,
        requireBaseline: compareMode || regressionsMode
      })
    : await compareLatestRunToBaseline(REPO_ROOT, artifactRoot, {
        requireBaseline: false
      });

  if (compareMode) {
    printJson({
      mode: 'compare',
      artifactRoot,
      latestRunId: comparison.latestRunId,
      baseline: comparison.baseline,
      regressionCount: comparison.aggregateDiffSummary.regressions.length,
      topRegression: comparison.aggregateDiffSummary.regressions[0] ?? null,
      scorePath: resolve(REPO_ROOT, artifactRoot, 'score.json'),
      diffSummaryPath: resolve(REPO_ROOT, artifactRoot, 'diff-summary.json')
    });

    if (comparison.aggregateDiffSummary.regressions.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  if (regressionsMode) {
    printJson({
      mode: 'regressions',
      artifactRoot,
      latestRunId: comparison.latestRunId,
      baseline: comparison.baseline,
      limit,
      regressions: comparison.aggregateDiffSummary.regressions.slice(0, limit)
    });
    return;
  }

  printJson({
    mode: 'index',
    artifactRoot,
    packetCount: index.packetCount,
    scenarioCount: index.scenarioCount,
    latestRunId,
    latestGeneratedAt,
    baseline: baselinePointer?.pointer ?? null,
    indexPath: resolve(indexPath),
    scorePath: resolve(REPO_ROOT, artifactRoot, 'score.json'),
    diffSummaryPath: resolve(REPO_ROOT, artifactRoot, 'diff-summary.json')
  });
};

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
