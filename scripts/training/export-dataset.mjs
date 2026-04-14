import { parseCliArgs, readJson, hashStableValue, writeJson } from './common.mjs';

const collectEpisodes = (log) => (
  (log.entries ?? [])
    .map((entry) => entry?.episodes?.latestEpisode ?? null)
    .filter(Boolean)
);

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

const buildDataset = (log, evalSummary = null) => {
  const episodes = collectEpisodes(log);
  return {
    schemaVersion: 1,
    exportedAt: log.generatedAt,
    lane: 'offline',
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
  const evalSummary = typeof args.eval === 'string' ? await readJson(args.eval) : null;
  const dataset = buildDataset(log, evalSummary);

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
