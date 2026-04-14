import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const TS_ENTRY = resolve(SCRIPT_DIR, 'burn-in-cli.ts');

const resolveCommandSpec = (command, args) => (
  process.platform === 'win32'
    ? { command: 'cmd.exe', args: ['/d', '/s', '/c', `${command} ${args.join(' ')}`] }
    : { command, args }
);

const main = () => {
  const commandSpec = resolveCommandSpec('npm', ['exec', 'vite-node', '--', TS_ENTRY, ...process.argv.slice(2)]);
  const output = execFileSync(commandSpec.command, commandSpec.args, {
    cwd: REPO_ROOT,
    encoding: 'utf8'
  });

  process.stdout.write(output);
};

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
