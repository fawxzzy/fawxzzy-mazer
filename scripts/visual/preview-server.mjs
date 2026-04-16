import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { DEFAULT_BASE_URL, DEFAULT_PREVIEW_TIMEOUT_MS, REPO_ROOT, normalizeBaseUrl } from './common.mjs';

const PREVIEW_POLL_INTERVAL_MS = 500;

const resolveCommandSpec = (command, args) => (
  process.platform === 'win32'
    ? { command: 'cmd.exe', args: ['/d', '/s', '/c', `${command} ${args.join(' ')}`] }
    : { command, args }
);

const closeServer = (server) => new Promise((resolvePromise, rejectPromise) => {
  server.close((error) => {
    if (error) {
      rejectPromise(error);
      return;
    }

    resolvePromise();
  });
});

const reservePort = (port, host) => new Promise((resolvePromise, rejectPromise) => {
  const server = createServer();
  server.unref();
  server.once('error', rejectPromise);
  server.listen(port, host, () => {
    server.removeListener('error', rejectPromise);
    resolvePromise(server);
  });
});

const waitForPreview = async (baseUrl, timeoutMs, child) => {
  const startedAt = Date.now();

  while ((Date.now() - startedAt) < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`Preview process exited before ${baseUrl} became ready.`);
    }

    try {
      const response = await fetch(baseUrl, { redirect: 'manual' });
      if (response.ok) {
        return;
      }
    } catch {
      // Preview is still starting.
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, PREVIEW_POLL_INTERVAL_MS));
  }

  throw new Error(`Timed out waiting for preview at ${baseUrl}.`);
};

export const stopPreviewServer = async (child) => {
  if (!child || child.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    const commandSpec = resolveCommandSpec('taskkill', ['/pid', String(child.pid), '/t', '/f']);
    await new Promise((resolvePromise) => {
      const killer = spawn(commandSpec.command, commandSpec.args, {
        cwd: REPO_ROOT,
        shell: false,
        stdio: 'ignore'
      });
      killer.on('error', () => resolvePromise());
      killer.on('exit', () => resolvePromise());
    });
    return;
  }

  child.kill('SIGTERM');
  await new Promise((resolvePromise) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolvePromise();
    }, 5_000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolvePromise();
    });
  });
};

export const acquirePreviewPort = async ({ requestedBaseUrl = DEFAULT_BASE_URL } = {}) => {
  const preferredUrl = new URL(normalizeBaseUrl(requestedBaseUrl));
  const preferredPort = Number.parseInt(
    preferredUrl.port || (preferredUrl.protocol === 'https:' ? '443' : '80'),
    10
  );

  let reservation;
  try {
    reservation = await reservePort(preferredPort, preferredUrl.hostname);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EADDRINUSE') {
      throw error;
    }

    reservation = await reservePort(0, preferredUrl.hostname);
  }

  const address = reservation.address();
  if (!address || typeof address === 'string') {
    await closeServer(reservation);
    throw new Error('Could not resolve a reserved preview port.');
  }

  const resolvedUrl = new URL(preferredUrl.toString());
  resolvedUrl.port = String(address.port);

  return {
    preferredPort,
    port: address.port,
    baseUrl: normalizeBaseUrl(resolvedUrl.toString()),
    usedFallbackPort: address.port !== preferredPort,
    release: async () => closeServer(reservation)
  };
};

export const launchPreviewServer = async ({
  requestedBaseUrl = DEFAULT_BASE_URL,
  previewTimeoutMs = DEFAULT_PREVIEW_TIMEOUT_MS,
  previewLog
} = {}) => {
  const reservation = await acquirePreviewPort({ requestedBaseUrl });
  const resolvedUrl = new URL(reservation.baseUrl);
  const notice = reservation.usedFallbackPort
    ? `[health-preview] port ${reservation.preferredPort} was busy; using ${reservation.port} with strictPort.\n`
    : `[health-preview] using port ${reservation.port} with strictPort.\n`;

  previewLog?.write(notice);
  process.stdout.write(notice);

  await reservation.release();

  const previewCommand = resolveCommandSpec('npm', [
    'run',
    'preview:health',
    '--',
    '--host',
    resolvedUrl.hostname,
    '--port',
    String(reservation.port)
  ]);
  const previewChild = spawn(previewCommand.command, previewCommand.args, {
    cwd: REPO_ROOT,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  previewChild.stdout?.on('data', (chunk) => {
    previewLog?.write(chunk);
    process.stdout.write(String(chunk));
  });
  previewChild.stderr?.on('data', (chunk) => {
    previewLog?.write(chunk);
    process.stderr.write(String(chunk));
  });

  try {
    await waitForPreview(reservation.baseUrl, previewTimeoutMs, previewChild);
  } catch (error) {
    await stopPreviewServer(previewChild);
    throw error;
  }

  return {
    child: previewChild,
    baseUrl: reservation.baseUrl,
    port: reservation.port,
    preferredPort: reservation.preferredPort,
    usedFallbackPort: reservation.usedFallbackPort
  };
};
