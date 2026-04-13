import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateAllProofManifests } from '../../src/topology-proof/index.ts';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const DEFAULT_OUTPUT_DIR = resolve(REPO_ROOT, 'public', 'topology-proof', 'manifests');

const parseArgs = (argv = process.argv.slice(2)) => {
  const args = {};

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
  const outputDir = typeof args.out === 'string'
    ? resolve(REPO_ROOT, args.out)
    : DEFAULT_OUTPUT_DIR;

  await mkdir(outputDir, { recursive: true });

  const manifests = generateAllProofManifests();
  const files = [];

  for (const manifest of manifests) {
    const filePath = resolve(outputDir, `${manifest.scenarioId}.json`);
    await writeFile(filePath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    files.push({
      scenarioId: manifest.scenarioId,
      seed: manifest.seed,
      districtType: manifest.districtType,
      filePath
    });
  }

  process.stdout.write(`${JSON.stringify({
    outputDir,
    manifestCount: files.length,
    files
  }, null, 2)}\n`);
};

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
