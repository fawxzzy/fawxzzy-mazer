import { averageMetrics, averagePriors, parseCliArgs, readJson, writeJson } from './common.mjs';

/**
 * @typedef {import('../../src/mazer-core/logging/export').ReplayLinkedTrainingDataset} ReplayLinkedTrainingDataset
 * @typedef {{
 *   schemaVersion: 1;
 *   advisoryOnly: true;
 *   datasetCount: number;
 *   episodeCount: number;
 *   weights: import('../../src/mazer-core/playbook/tuning').PlaybookTuningWeights;
 * }} TuneScorerOutput
 */

const clampWeight = (value) => Number(Math.min(1.6, Math.max(0.4, value)).toFixed(4));

/** @param {readonly ReplayLinkedTrainingDataset[]} datasets */
const deriveWeights = (datasets) => {
  const metrics = averageMetrics(datasets);
  const priors = averagePriors(datasets);

  return {
    frontierValue: clampWeight(1 + ((metrics.discoveryEfficiency - 0.5) * 0.7) - ((metrics.backtrackPressure - 0.5) * 0.2)),
    backtrackUrgency: clampWeight(1 + ((metrics.backtrackPressure - 0.5) * 0.75) + ((priors.backtrackUrgency - 0.5) * 0.25)),
    trapSuspicion: clampWeight(1 + ((metrics.trapFalseNegativeRate - metrics.trapFalsePositiveRate) * 0.85) + ((priors.trapSuspicion - 0.5) * 0.1)),
    enemyRisk: clampWeight(1 + ((metrics.wardenPressureExposure - 0.5) * 0.8) + ((priors.enemyRisk - 0.5) * 0.2)),
    itemValue: clampWeight(1 + ((metrics.itemUsefulnessScore - 0.5) * 0.8) + ((priors.itemValue - 0.5) * 0.25)),
    puzzleValue: clampWeight(1 + ((metrics.puzzleStateClarityScore - 0.5) * 0.7) + ((priors.puzzleValue - 0.5) * 0.2)),
    rotationTiming: clampWeight(1 + (((metrics.discoveryEfficiency - metrics.backtrackPressure)) * 0.35) + ((priors.rotationTiming - 0.5) * 0.25))
  };
};

const main = async () => {
  const args = parseCliArgs();
  const datasetArg = typeof args.dataset === 'string' ? args.dataset : null;
  if (!datasetArg) {
    throw new Error('Expected --dataset <dataset.json[,dataset-2.json,...]>.');
  }

  const datasetPaths = datasetArg.split(',').map((value) => value.trim()).filter(Boolean);
  const datasets = await Promise.all(datasetPaths.map((filePath) => readJson(filePath)));
  /** @type {TuneScorerOutput} */
  const output = {
    schemaVersion: 1,
    advisoryOnly: true,
    datasetCount: datasets.length,
    episodeCount: datasets.reduce((total, dataset) => total + (dataset.episodes?.length ?? 0), 0),
    weights: deriveWeights(datasets)
  };

  if (typeof args.output === 'string') {
    await writeJson(args.output, output);
  } else {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  }
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
