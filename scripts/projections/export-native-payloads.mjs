import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  REPO_ROOT,
  STACK_ROOT,
  ensureDir,
  parseCliArgs,
  resolveSessionId
} from '../visual/common.mjs';
import { writeNativeProjectionArtifactSet } from '../../src/projections/index.ts';
import { resolveProofSurfaceFixtureInput } from '../../src/proof-surfaces/fixtures.ts';

const DEFAULT_OUTPUT_ROOT = resolve(STACK_ROOT, 'tmp', 'captures', 'mazer-projections');

const resolveFixture = (value) => (
  value === 'preroll'
  || value === 'building'
  || value === 'watching'
  || value === 'waiting'
  || value === 'failed'
  || value === 'retrying'
  || value === 'cleared'
    ? value
    : 'watching'
);

const main = async () => {
  const args = parseCliArgs();
  const fixture = resolveFixture(args.fixture);
  const runId = resolveSessionId(typeof args.label === 'string' ? args.label : fixture);
  const outputRoot = typeof args['output-root'] === 'string'
    ? resolve(REPO_ROOT, args['output-root'])
    : DEFAULT_OUTPUT_ROOT;
  const targetDir = resolve(outputRoot, runId);
  const input = resolveProofSurfaceFixtureInput(fixture);

  await ensureDir(targetDir);
  const manifest = await writeNativeProjectionArtifactSet(targetDir, input);
  const manifestPath = resolve(targetDir, 'manifest.json');
  const sourcePath = resolve(targetDir, 'source.json');

  await writeFile(manifestPath, `${JSON.stringify({ fixture, manifest }, null, 2)}\n`, 'utf8');
  await writeFile(sourcePath, `${JSON.stringify(input, null, 2)}\n`, 'utf8');

  process.stdout.write(`${JSON.stringify({
    fixture,
    runId,
    targetDir,
    manifestPath,
    sourcePath
  }, null, 2)}\n`);
};

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
