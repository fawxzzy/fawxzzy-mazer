import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDeterministicRuntimeEvalSuite } from '../../src/mazer-core/eval';
import { resolveBlessedPlaybookWeights, resolvePlaybookTuningWeights } from '../training/common.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const DEFAULT_OUTPUT_PATH = resolve(REPO_ROOT, 'tmp', 'eval', 'runtime-eval-summary.json');

const parseArgs = (argv = process.argv.slice(2)) => {
  const args: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (!entry.startsWith('--')) {
      continue;
    }

    const body = entry.slice(2);
    const equalsIndex = body.indexOf('=');
    if (equalsIndex >= 0) {
      args[body.slice(0, equalsIndex)] = body.slice(equalsIndex + 1);
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[body] = next;
      index += 1;
      continue;
    }

    args[body] = true;
  }

  return args;
};

const main = async () => {
  const args = parseArgs();
  const outputPath = typeof args.out === 'string'
    ? resolve(REPO_ROOT, args.out)
    : DEFAULT_OUTPUT_PATH;
  const tuningWeights = typeof args.weights === 'string'
    ? resolvePlaybookTuningWeights(JSON.parse(await readFile(resolve(REPO_ROOT, args.weights), 'utf8')))
    : args.blessed === true || args.blessed === 'true'
      ? (
          await resolveBlessedPlaybookWeights(
            typeof args.registry === 'string'
              ? resolve(REPO_ROOT, args.registry)
              : undefined
          )
        ).weights
      : null;
  const scenarioIds = typeof args.scenario === 'string'
    ? args.scenario.split(',').map((entry) => entry.trim()).filter(Boolean)
    : null;
  const summary = runDeterministicRuntimeEvalSuite({
    scenarioIds,
    tuningWeights
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
};

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
