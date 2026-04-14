import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCliArgs, hashStableValue } from './common.mjs';
import { runLifelineBenchmarkSuite } from './runtime-eval.ts';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const DEFAULT_OUTPUT_ROOT = resolve(REPO_ROOT, 'tmp', 'lifeline', 'headless-runner');

const relativeFromRepo = (absolutePath: string) => absolutePath.startsWith(REPO_ROOT)
  ? absolutePath.slice(REPO_ROOT.length + 1).replace(/\\/g, '/')
  : absolutePath.replace(/\\/g, '/');

const pathExists = async (filePath: string) => {
  try {
    await readFile(filePath, 'utf8');
    return true;
  } catch {
    return false;
  }
};

const resolveRunId = (seed: unknown) => hashStableValue(seed);

const writeJson = async (filePath: string, value: unknown) => {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const main = async () => {
  const args = parseCliArgs();
  const scenarioIds = typeof args.scenario === 'string'
    ? args.scenario.split(',').map((entry) => entry.trim()).filter(Boolean)
    : null;
  const runId = typeof args.run === 'string'
    ? args.run
    : resolveRunId({
        pack: 'mazer-lifeline-benchmark-pack',
        scenarioIds: scenarioIds ?? 'all'
      });
  const outputRoot = typeof args['output-root'] === 'string'
    ? resolve(REPO_ROOT, args['output-root'])
    : resolve(DEFAULT_OUTPUT_ROOT, runId);
  const manifestPath = resolve(outputRoot, 'manifest.json');
  const resume = args.resume !== 'false';
  const existingManifest = resume && await pathExists(manifestPath)
    ? JSON.parse(await readFile(manifestPath, 'utf8'))
    : null;

  if (existingManifest?.completedAt) {
    process.stdout.write(`${JSON.stringify(existingManifest, null, 2)}\n`);
    return;
  }

  const suite = runLifelineBenchmarkSuite({ scenarioIds });
  const scenarioManifests = [];

  for (const scenario of suite.scenarioSummaries) {
    const scenarioDir = resolve(outputRoot, 'scenarios', scenario.scenarioId);
    const logPath = resolve(scenarioDir, 'runtime-episode-log.json');
    const replayLogPath = resolve(scenarioDir, 'replay-runtime-episode-log.json');
    const evalPath = resolve(scenarioDir, 'runtime-eval-summary.json');
    const datasetPath = resolve(scenarioDir, 'replay-linked-dataset.json');
    const tuningPath = resolve(scenarioDir, 'tuning-prep.json');
    const scenarioPath = resolve(scenarioDir, 'scenario-manifest.json');

    await mkdir(scenarioDir, { recursive: true });
    await writeJson(logPath, scenario.log);
    await writeJson(replayLogPath, scenario.replayLog);
    await writeJson(evalPath, scenario.evaluation);
    await writeJson(datasetPath, scenario.dataset);
    await writeJson(tuningPath, scenario.tuning);
    await writeJson(scenarioPath, {
      schemaVersion: 1,
      scenarioId: scenario.scenarioId,
      seed: scenario.seed,
      runId,
      logPath: relativeFromRepo(logPath),
      replayLogPath: relativeFromRepo(replayLogPath),
      evalPath: relativeFromRepo(evalPath),
      datasetPath: relativeFromRepo(datasetPath),
      tuningPath: relativeFromRepo(tuningPath)
    });

    scenarioManifests.push({
      scenarioId: scenario.scenarioId,
      seed: scenario.seed,
      paths: {
        logPath: relativeFromRepo(logPath),
        replayLogPath: relativeFromRepo(replayLogPath),
        evalPath: relativeFromRepo(evalPath),
        datasetPath: relativeFromRepo(datasetPath),
        tuningPath: relativeFromRepo(tuningPath)
      }
    });
  }

  const manifest = {
    schemaVersion: 1,
    runId,
    benchmarkPackId: suite.benchmarkPackId,
    generatedAt: suite.generatedAt,
    completedAt: new Date().toISOString(),
    scenarioCount: suite.scenarioCount,
    scenarioIds: suite.scenarioIds,
    replayIntegrity: suite.replayIntegrity,
    metrics: suite.metrics,
    support: suite.support,
    artifacts: {
      summary: relativeFromRepo(resolve(outputRoot, 'suite-summary.json')),
      manifest: relativeFromRepo(manifestPath)
    },
    scenarios: scenarioManifests
  };

  await writeJson(resolve(outputRoot, 'suite-summary.json'), suite);
  await writeJson(manifestPath, manifest);

  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
