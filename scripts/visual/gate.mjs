import { createWriteStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_BASE_URL,
  DEFAULT_CAPTURE_TIMEOUT_MS,
  DEFAULT_PREVIEW_TIMEOUT_MS,
  REPO_ROOT,
  ensureDir,
  normalizeBaseUrl,
  parseCliArgs,
  parseIntegerArg,
  resolveSessionId,
  resolveSessionPaths
} from './common.mjs';
import { launchPreviewServer, stopPreviewServer } from './preview-server.mjs';
import { captureVisualSet } from './capture.mjs';

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const resolveCommandSpec = (command, args) => (
  process.platform === 'win32'
    ? {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', `${command} ${args.join(' ')}`]
    }
    : {
      command,
      args
    }
);

const runCommand = (command, args, options = {}) => new Promise((resolvePromise, rejectPromise) => {
  const commandSpec = resolveCommandSpec(command, args);
  const child = spawn(commandSpec.command, commandSpec.args, {
    cwd: REPO_ROOT,
    shell: false,
    stdio: options.stdio ?? 'inherit'
  });

  child.on('error', rejectPromise);
  child.on('exit', (code) => {
    if (code === 0) {
      resolvePromise();
      return;
    }

    rejectPromise(new Error(`${commandSpec.command} ${commandSpec.args.join(' ')} exited with code ${code ?? 'unknown'}.`));
  });
});

export const runVisualGate = async ({
  baseUrl = DEFAULT_BASE_URL,
  label = 'capture',
  sessionId,
  previewTimeoutMs = DEFAULT_PREVIEW_TIMEOUT_MS,
  captureTimeoutMs = DEFAULT_CAPTURE_TIMEOUT_MS,
  skipBuild = false
} = {}) => {
  const requestedBaseUrl = normalizeBaseUrl(baseUrl);
  const resolvedSessionId = resolveSessionId(sessionId);
  const sessionPaths = resolveSessionPaths(resolvedSessionId, label);

  await ensureDir(sessionPaths.sessionDir);
  const previewLog = createWriteStream(sessionPaths.previewLogPath, { flags: 'a' });

  if (!skipBuild) {
    await runCommand('npm', ['run', 'build']);
  } else {
    await access(resolve(REPO_ROOT, 'dist'));
  }

  const preview = await launchPreviewServer({
    requestedBaseUrl,
    previewTimeoutMs,
    previewLog
  });

  try {
    return await captureVisualSet({
      baseUrl: preview.baseUrl,
      label,
      sessionId: resolvedSessionId,
      timeoutMs: captureTimeoutMs
    });
  } finally {
    await stopPreviewServer(preview.child);
    previewLog.end();
  }
};

const main = async () => {
  const args = parseCliArgs();
  const summary = await runVisualGate({
    baseUrl: args['base-url'] ?? process.env.MAZER_VISUAL_BASE_URL ?? DEFAULT_BASE_URL,
    label: typeof args.label === 'string' ? args.label : 'capture',
    sessionId: typeof args.session === 'string' ? args.session : process.env.MAZER_VISUAL_SESSION,
    previewTimeoutMs: parseIntegerArg(args['preview-timeout'], DEFAULT_PREVIEW_TIMEOUT_MS),
    captureTimeoutMs: parseIntegerArg(args.timeout, DEFAULT_CAPTURE_TIMEOUT_MS),
    skipBuild: args['skip-build'] === true || args['skip-build'] === 'true'
  });

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
};

if (isDirectRun) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
