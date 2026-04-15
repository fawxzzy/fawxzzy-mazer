import {
  hashStableValue,
  parseCliArgs,
  readJson,
  resolveRuntimeBenchmarkPack,
  resolveRuntimeBenchmarkScenarioById,
  resolveRuntimeBenchmarkScenarioBySeed,
  writeJson
} from './common.mjs';

/**
 * @typedef {import('../../src/mazer-core/logging').RuntimeEpisodeLog} RuntimeEpisodeLog
 * @typedef {import('../../src/mazer-core/logging/export').ReplayEvalSummaryReference} ReplayEvalSummaryReference
 * @typedef {import('../../src/mazer-core/logging/export').ReplayLinkedTrainingDataset} ReplayLinkedTrainingDataset
 */

/** @param {RuntimeEpisodeLog} log */
const collectEpisodes = (log) => (
  (log.entries ?? [])
    .map((entry) => entry?.episodes?.latestEpisode ?? null)
    .filter(Boolean)
);

/** @param {readonly import('../../src/mazer-core/agent/types').PolicyEpisode[]} episodes */
const summarizePriors = (episodes) => {
  const priors = {
    samples: episodes.length,
    frontierValue: 0.5,
    backtrackUrgency: 0.5,
    trapSuspicion: 0.5,
    enemyRisk: 0.5,
    itemValue: 0.5,
    puzzleValue: 0.5,
    rotationTiming: 0.5
  };

  if (episodes.length === 0) {
    return {
      totalEpisodes: 0,
      global: priors,
      byTileId: {}
    };
  }

  const outcomes = episodes.map((episode) => episode.outcome).filter(Boolean);
  const average = (values) => Number((values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1)).toFixed(4));

  return {
    totalEpisodes: episodes.length,
    global: {
      samples: episodes.length,
      frontierValue: average(outcomes.map((outcome) => 0.5 + Math.min(outcome.discoveredTilesDelta ?? 0, 2) * 0.12)),
      backtrackUrgency: average(outcomes.map((outcome) => 0.5 + Math.min(outcome.backtrackDelta ?? 0, 2) * 0.16)),
      trapSuspicion: average(outcomes.map((outcome) => 0.5 + Math.min(outcome.trapCueCount ?? 0, 2) * 0.15)),
      enemyRisk: average(outcomes.map((outcome) => 0.5 + Math.min(outcome.enemyCueCount ?? 0, 2) * 0.15)),
      itemValue: average(outcomes.map((outcome) => 0.5 + Math.min(outcome.itemCueCount ?? 0, 2) * 0.14)),
      puzzleValue: average(outcomes.map((outcome) => 0.5 + Math.min(outcome.puzzleCueCount ?? 0, 2) * 0.14)),
      rotationTiming: average(outcomes.map((outcome) => 0.5 + Math.min(outcome.timingCueCount ?? 0, 2) * 0.14))
    },
    byTileId: {}
  };
};

/** @param {{ log: RuntimeEpisodeLog; evalSummary: ReplayEvalSummaryReference | null; scenarioId: string | null }} params */
const resolveBenchmarkScenario = ({ log, evalSummary, scenarioId }) => {
  if (typeof scenarioId === 'string' && scenarioId.length > 0) {
    return resolveRuntimeBenchmarkScenarioById(scenarioId);
  }

  const evalScenarioId = evalSummary?.scenarioId ?? null;
  if (typeof evalScenarioId === 'string' && evalScenarioId.length > 0) {
    return resolveRuntimeBenchmarkScenarioById(evalScenarioId);
  }

  return resolveRuntimeBenchmarkScenarioBySeed(log.source.seed);
};

/** @param {{ evalSummary: ReplayEvalSummaryReference | null; benchmarkScenario: ReturnType<typeof resolveRuntimeBenchmarkScenarioById> | ReturnType<typeof resolveRuntimeBenchmarkScenarioBySeed> | null; log: RuntimeEpisodeLog }} params */
const resolveEvalSummaryReference = ({ evalSummary, benchmarkScenario, log }) => {
  if (!evalSummary) {
    return null;
  }

  if (Array.isArray(evalSummary.scenarioSummaries)) {
    const resolvedScenario = (
      benchmarkScenario
        ? evalSummary.scenarioSummaries.find((scenario) => scenario.scenarioId === benchmarkScenario.id)
        : evalSummary.scenarioSummaries.find((scenario) => scenario.seed === log.source.seed)
    ) ?? null;

    return resolvedScenario
      ? {
          schemaVersion: 1,
          summaryId: resolvedScenario.summaryId,
          runId: resolvedScenario.runId,
          seed: resolvedScenario.seed,
          metrics: resolvedScenario.metrics
        }
      : null;
  }

  return evalSummary;
};

/** @param {RuntimeEpisodeLog} log @param {ReplayEvalSummaryReference | null} [evalSummary] @param {ReturnType<typeof resolveRuntimeBenchmarkScenarioById> | ReturnType<typeof resolveRuntimeBenchmarkScenarioBySeed> | null} [benchmarkScenario] @returns {ReplayLinkedTrainingDataset} */
const buildDataset = (log, evalSummary = null, benchmarkScenario = null) => {
  const benchmarkPack = resolveRuntimeBenchmarkPack();
  const episodes = collectEpisodes(log);
  return {
    schemaVersion: 1,
    exportedAt: log.generatedAt,
    lane: 'offline',
    benchmark: benchmarkScenario
      ? {
          packId: benchmarkPack.packId,
          scenarioId: benchmarkScenario.id,
          districtType: benchmarkScenario.districtType,
          shellCount: benchmarkScenario.shellCount,
          seed: benchmarkScenario.seed,
          expectedMetricBands: Object.fromEntries(
            Object.entries(benchmarkScenario.expectedMetricBands ?? {}).map(([metricName, band]) => [
              metricName,
              band ? { ...band } : band
            ])
          )
        }
      : null,
    replayLink: {
      seed: log.source.seed,
      startTileId: log.source.startTileId,
      startHeading: log.source.startHeading ?? null,
      intentCanary: log.source.intentCanary ?? null,
      stepCount: log.stepCount,
      episodeCount: episodes.length,
      logDigest: hashStableValue({
        source: log.source,
        stepCount: log.stepCount,
        entries: log.entries
      })
    },
    priors: summarizePriors(episodes),
    evalSummary,
    episodes
  };
};

const main = async () => {
  const args = parseCliArgs();
  const logPath = typeof args.log === 'string' ? args.log : null;
  if (!logPath) {
    throw new Error('Expected --log <runtime-episode-log.json>.');
  }

  const log = await readJson(logPath);
  const rawEvalSummary = typeof args.eval === 'string' ? await readJson(args.eval) : null;
  const benchmarkScenario = resolveBenchmarkScenario({
    log,
    evalSummary: rawEvalSummary,
    scenarioId: typeof args.scenario === 'string' ? args.scenario : null
  });
  const evalSummary = resolveEvalSummaryReference({
    evalSummary: rawEvalSummary,
    benchmarkScenario,
    log
  });
  const dataset = buildDataset(log, evalSummary, benchmarkScenario);

  if (typeof args.output === 'string') {
    await writeJson(args.output, dataset);
  } else {
    process.stdout.write(`${JSON.stringify(dataset, null, 2)}\n`);
  }
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
