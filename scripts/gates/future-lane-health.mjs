import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const DEFAULT_SUMMARY_PATH = resolve(REPO_ROOT, 'tmp', 'gates', 'future-lane-health-summary.json');
const DEFAULT_RUNTIME_EVAL_PATH = resolve(REPO_ROOT, 'tmp', 'eval', 'future-lane-health-summary.json');
const DEFAULT_HEADLESS_SMOKE_SCENARIO = 'labyrinth-tutorial-trap-inference-alpha';
const DEFAULT_HEADLESS_SMOKE_OUTPUT_ROOT = 'tmp/lifeline/headless-runner/gate-pack-headless-smoke';

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

const resolveCommandSpec = (command, args) => (
  process.platform === 'win32'
    ? { command: 'cmd.exe', args: ['/d', '/s', '/c', `${command} ${args.join(' ')}`] }
    : { command, args }
);

const runStep = ({ key, label, command, args }) => {
  process.stdout.write(`\n==> ${label}\n`);
  const commandSpec = resolveCommandSpec(command, args);
  const result = spawnSync(commandSpec.command, commandSpec.args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  return {
    key,
    label,
    ok: result.status === 0,
    exitCode: result.status ?? 1
  };
};

const main = async () => {
  const args = parseCliArgs();
  const runHeadlessSmoke = args['with-headless-smoke'] === true || args['with-headless-smoke'] === 'true';
  const summaryPath = typeof args.summary === 'string'
    ? resolve(REPO_ROOT, args.summary)
    : DEFAULT_SUMMARY_PATH;
  const runtimeEvalPath = typeof args['runtime-eval-out'] === 'string'
    ? resolve(REPO_ROOT, args['runtime-eval-out'])
    : DEFAULT_RUNTIME_EVAL_PATH;
  const headlessSmokeScenario = typeof args.scenario === 'string'
    ? args.scenario
    : DEFAULT_HEADLESS_SMOKE_SCENARIO;

  const steps = [
    {
      key: 'architectureCheck',
      label: 'Gate 1/9: architecture check',
      command: 'npm',
      args: ['run', 'architecture:check']
    },
    {
      key: 'tests',
      label: 'Gate 2/9: tests',
      command: 'npm',
      args: ['test']
    },
    {
      key: 'build',
      label: 'Gate 3/9: build',
      command: 'npm',
      args: ['run', 'build']
    },
    {
      key: 'visualProof',
      label: 'Gate 4/9: visual proof',
      command: 'node',
      args: ['scripts/visual/mazer-run.mjs', '--skip-build', 'true']
    },
    {
      key: 'visualCanaries',
      label: 'Gate 5/9: visual canaries',
      command: 'node',
      args: ['scripts/visual/run-canaries.mjs', '--skip-build', 'true']
    },
    {
      key: 'futureRuntimeContentProof',
      label: 'Gate 6/9: future-runtime content-proof',
      command: 'node',
      args: ['scripts/visual/future-runtime-run.mjs', '--run', 'content-proof', '--skip-build', 'true']
    },
    {
      key: 'futureRuntimeTwoShellProof',
      label: 'Gate 7/9: future-runtime two-shell-proof',
      command: 'node',
      args: ['scripts/visual/future-runtime-run.mjs', '--run', 'two-shell-proof', '--skip-build', 'true']
    },
    {
      key: 'futureRuntimeThreeShellProof',
      label: 'Gate 8/9: future-runtime three-shell-proof',
      command: 'node',
      args: ['scripts/visual/future-runtime-run.mjs', '--run', 'three-shell-proof', '--skip-build', 'true']
    },
    {
      key: 'runtimeEval',
      label: 'Gate 9/9: runtime eval summary',
      command: 'node',
      args: ['scripts/eval/run-eval.mjs', '--out', runtimeEvalPath]
    }
  ];

  if (runHeadlessSmoke) {
    steps.push({
      key: 'headlessSmoke',
      label: 'Optional: headless smoke',
      command: 'node',
      args: [
        'scripts/lifeline/headless-runner.mjs',
        '--scenario',
        headlessSmokeScenario,
        '--run',
        'gate-pack-headless-smoke',
        '--output-root',
        DEFAULT_HEADLESS_SMOKE_OUTPUT_ROOT,
        '--blessed',
        'true'
      ]
    });
  }

  const results = [];
  let failedGate = null;

  for (const step of steps) {
    const result = runStep(step);
    results.push(result);

    if (!result.ok) {
      failedGate = result;
      break;
    }
  }

  const summary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    headlessSmokeEnabled: runHeadlessSmoke,
    runtimeEvalPath: runtimeEvalPath.replace(/\\/g, '/'),
    failedGate: failedGate
      ? {
          key: failedGate.key,
          label: failedGate.label,
          exitCode: failedGate.exitCode
        }
      : null,
    results: results.map((result) => ({
      key: result.key,
      label: result.label,
      ok: result.ok,
      exitCode: result.exitCode
    }))
  };

  await mkdir(dirname(summaryPath), { recursive: true });
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  if (failedGate) {
    process.stderr.write(
      `\nGate pack failed at ${failedGate.key} (${failedGate.label}) with exit code ${failedGate.exitCode}.\n`
    );
    process.stderr.write(`Summary: ${summaryPath.replace(/\\/g, '/')}\n`);
    process.exitCode = failedGate.exitCode;
    return;
  }

  process.stdout.write(
    `\nFuture-lane health pack passed${runHeadlessSmoke ? ' with headless smoke' : ''}.\n`
  );
  process.stdout.write(`Summary: ${summaryPath.replace(/\\/g, '/')}\n`);
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
