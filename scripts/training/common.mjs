import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import {
  resolveLifelineBenchmarkPack,
  resolveLifelineBenchmarkScenarioById,
  resolveLifelineBenchmarkScenarioBySeed
} from '../lifeline/benchmark-pack.mjs';

/**
 * @typedef {Record<string, string | boolean>} CliArgs
 * @typedef {{ ok: boolean, stdout: string, stderr: string }} CommandResult
 * @typedef {{ command: string, args: string[] }} CommandSpec
 * @typedef {import('../../src/mazer-core/playbook/tuning').PlaybookTuningWeights} PlaybookTuningWeights
 * @typedef {import('../../src/mazer-core/eval').RuntimeEvalSuiteSummary} RuntimeEvalSuiteSummary
 * @typedef {import('../../src/mazer-core/logging/export').ReplayLinkedTrainingDataset} ReplayLinkedTrainingDataset
 */

const DEFAULT_PLAYBOOK_WEIGHT_REGISTRY_PATH = 'artifacts/training/playbook-weight-registry.json';

const clampMetric = (value) => Number(Math.min(1, Math.max(0, Number(value) || 0)).toFixed(4));

const stableSerialize = (value) => {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`);
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(String(value));
};

const hashStableValue = (value) => {
  const serialized = stableSerialize(value);
  let hash = 0x811c9dc5;

  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const defaultPriors = () => ({
  samples: 0,
  frontierValue: 0.5,
  backtrackUrgency: 0.5,
  trapSuspicion: 0.5,
  enemyRisk: 0.5,
  itemValue: 0.5,
  puzzleValue: 0.5,
  rotationTiming: 0.5
});

const createDefaultPlaybookTuningWeights = () => ({
  frontierValue: 1,
  backtrackUrgency: 1,
  trapSuspicion: 1,
  enemyRisk: 1,
  itemValue: 1,
  puzzleValue: 1,
  rotationTiming: 1
});

/** @param {string[]} [argv] @returns {CliArgs} */
const parseCliArgs = (argv = process.argv.slice(2)) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
};

const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'));

const writeJson = async (filePath, value) => {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(filePath, text, 'utf8');
};

const resolveRuntimeBenchmarkPack = () => resolveLifelineBenchmarkPack();

const resolveRuntimeBenchmarkScenarioById = (scenarioId) => resolveLifelineBenchmarkScenarioById(scenarioId);

const resolveRuntimeBenchmarkScenarioBySeed = (seed) => resolveLifelineBenchmarkScenarioBySeed(seed);

/** @param {unknown} value @returns {PlaybookTuningWeights | null} */
const resolvePlaybookTuningWeights = (value) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  if (value.weights && typeof value.weights === 'object') {
    return value.weights;
  }

  if (value.candidateRecord?.weights && typeof value.candidateRecord.weights === 'object') {
    return value.candidateRecord.weights;
  }

  return value;
};

const getCurrentBlessedWeightRecord = (registry) => (
  registry?.currentBlessedRecordId
    ? registry.blessed?.find((record) => record.recordId === registry.currentBlessedRecordId) ?? null
    : registry?.blessed?.at(-1) ?? null
);

const resolveBlessedPlaybookWeights = async (registryPath = DEFAULT_PLAYBOOK_WEIGHT_REGISTRY_PATH) => {
  const registry = await readJson(registryPath).catch(() => null);
  const blessedRecord = registry ? getCurrentBlessedWeightRecord(registry) : null;

  return {
    registryPath,
    registry,
    blessedRecord,
    weights: blessedRecord?.weights ?? createDefaultPlaybookTuningWeights()
  };
};

/** @param {string} command @param {readonly string[]} args @returns {CommandSpec} */
const resolveCommandSpec = (command, args) => (
  process.platform === 'win32'
    ? { command: 'cmd.exe', args: ['/d', '/s', '/c', `${command} ${args.join(' ')}`] }
    : { command, args }
);

/** @param {string} command @param {readonly string[]} args @param {{ cwd?: string }} [options] @returns {CommandResult} */
const runCommand = (command, args, options = {}) => {
  const commandSpec = resolveCommandSpec(command, args);

  try {
    const stdout = execFileSync(commandSpec.command, commandSpec.args, {
      cwd: options.cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });

    return {
      ok: true,
      stdout,
      stderr: ''
    };
  } catch (error) {
    return {
      ok: false,
      stdout: error?.stdout ? String(error.stdout) : '',
      stderr: error?.stderr ? String(error.stderr) : (error instanceof Error ? error.message : String(error))
    };
  }
};

/** @param {readonly number[]} values @returns {number} */
const average = (values) => (
  values.length > 0
    ? clampMetric(values.reduce((total, value) => total + value, 0) / values.length)
    : 0.5
);

/** @param {readonly ReplayLinkedTrainingDataset[]} datasets @returns {RuntimeEvalSuiteSummary['metrics']} */
const averageMetrics = (datasets) => ({
  discoveryEfficiency: average(datasets.map((dataset) => dataset.evalSummary?.metrics?.discoveryEfficiency ?? 0.5)),
  backtrackPressure: average(datasets.map((dataset) => dataset.evalSummary?.metrics?.backtrackPressure ?? 0.5)),
  trapFalsePositiveRate: average(datasets.map((dataset) => dataset.evalSummary?.metrics?.trapFalsePositiveRate ?? 0.5)),
  trapFalseNegativeRate: average(datasets.map((dataset) => dataset.evalSummary?.metrics?.trapFalseNegativeRate ?? 0.5)),
  wardenPressureExposure: average(datasets.map((dataset) => dataset.evalSummary?.metrics?.wardenPressureExposure ?? 0.5)),
  itemUsefulnessScore: average(datasets.map((dataset) => dataset.evalSummary?.metrics?.itemUsefulnessScore ?? 0.5)),
  puzzleStateClarityScore: average(datasets.map((dataset) => dataset.evalSummary?.metrics?.puzzleStateClarityScore ?? 0.5))
});

/** @param {readonly ReplayLinkedTrainingDataset[]} datasets @returns {import('../../src/mazer-core/agent/types').PolicyAdaptivePrior} */
const averagePriors = (datasets) => {
  const priors = datasets.map((dataset) => dataset.priors?.global ?? defaultPriors());

  return {
    samples: Math.round(priors.reduce((total, prior) => total + (prior.samples ?? 0), 0) / Math.max(priors.length, 1)),
    frontierValue: average(priors.map((prior) => prior.frontierValue ?? 0.5)),
    backtrackUrgency: average(priors.map((prior) => prior.backtrackUrgency ?? 0.5)),
    trapSuspicion: average(priors.map((prior) => prior.trapSuspicion ?? 0.5)),
    enemyRisk: average(priors.map((prior) => prior.enemyRisk ?? 0.5)),
    itemValue: average(priors.map((prior) => prior.itemValue ?? 0.5)),
    puzzleValue: average(priors.map((prior) => prior.puzzleValue ?? 0.5)),
    rotationTiming: average(priors.map((prior) => prior.rotationTiming ?? 0.5))
  };
};

export {
  averageMetrics,
  averagePriors,
  clampMetric,
  createDefaultPlaybookTuningWeights,
  defaultPriors,
  DEFAULT_PLAYBOOK_WEIGHT_REGISTRY_PATH,
  getCurrentBlessedWeightRecord,
  hashStableValue,
  parseCliArgs,
  readJson,
  resolveBlessedPlaybookWeights,
  resolvePlaybookTuningWeights,
  resolveRuntimeBenchmarkPack,
  resolveRuntimeBenchmarkScenarioById,
  resolveRuntimeBenchmarkScenarioBySeed,
  runCommand,
  stableSerialize,
  writeJson
};
