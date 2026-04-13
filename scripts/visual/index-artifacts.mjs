import { resolve } from 'node:path';
import { REPO_ROOT, parseCliArgs, parseIntegerArg } from './common.mjs';
import { readVisualProofConfig } from '../../tools/visual-pipeline/config.mjs';
import {
  compareLatestRunToBaseline,
  loadBaselinePointer,
  writeArtifactIndex,
  writeBaselinePointer
} from '../../tools/visual-pipeline/packets.mjs';

const parseBooleanArg = (value) => value === true || value === 'true';

const printJson = (value) => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

const main = async () => {
  const args = parseCliArgs();
  const config = await readVisualProofConfig(REPO_ROOT);
  const artifactRoot = typeof args['artifact-root'] === 'string' ? args['artifact-root'] : config.artifactRoot;
  const compareMode = parseBooleanArg(args.compare);
  const regressionsMode = parseBooleanArg(args.regressions);
  const promoteMode = parseBooleanArg(args['promote-baseline']);
  const limit = parseIntegerArg(args.limit, 10);

  const { indexPath, index, latestRunId, latestGeneratedAt } = await writeArtifactIndex(REPO_ROOT, artifactRoot);

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
