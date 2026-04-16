import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  DEFAULT_BASE_URL,
  DEFAULT_PREVIEW_TIMEOUT_MS,
  REPO_ROOT,
  STACK_ROOT,
  ensureDir,
  normalizeBaseUrl,
  parseCliArgs,
  parseIntegerArg
} from '../visual/common.mjs';
import { launchPreviewServer, stopPreviewServer } from '../visual/preview-server.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH;
const DEFAULT_ARTIFACT_ROOT = resolve(STACK_ROOT, 'tmp', 'captures', 'mazer-boot-timing');
const DEFAULT_CAPTURE_TIMEOUT_MS = 30_000;
const DEFAULT_VIEWPORT = Object.freeze({ width: 1440, height: 1024 });
const METRIC_LABELS = Object.freeze({
  preloadStart: 'boot-scene:preload-start',
  createCoreReady: 'menu-scene:create-core-ready',
  deferredVisualSetup: 'menu-scene:deferred-visual-setup',
  firstInteractiveFrame: 'menu-scene:first-interactive-frame'
});

const getCommitSha = () => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};

const runNpmCommand = (args) => {
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/s', '/c', ['npm', ...args].join(' ')], {
      cwd: REPO_ROOT,
      stdio: 'inherit'
    });
    return;
  }

  execFileSync('npm', args, { cwd: REPO_ROOT, stdio: 'inherit' });
};

const resolveMetricMap = (report) => Object.fromEntries(
  Object.entries(METRIC_LABELS).map(([key, label]) => {
    const checkpoint = report?.checkpoints?.find((entry) => entry.label === label) ?? null;
    return [key, checkpoint];
  })
);

const createArtifact = ({ report, url, consoleMessages, commitSha }) => ({
  schemaVersion: 1,
  capturedAt: new Date().toISOString(),
  commitSha,
  url,
  totalMs: report.totalMs,
  summary: report.summary,
  metrics: resolveMetricMap(report),
  checkpoints: report.checkpoints,
  consoleMessages
});

const createDiff = (before, after) => ({
  schemaVersion: 1,
  comparedAt: new Date().toISOString(),
  before: {
    capturedAt: before.capturedAt,
    totalMs: before.totalMs
  },
  after: {
    capturedAt: after.capturedAt,
    totalMs: after.totalMs
  },
  totalMsDelta: Number((after.totalMs - before.totalMs).toFixed(1)),
  metrics: Object.fromEntries(
    Object.keys(METRIC_LABELS).map((key) => {
      const beforeMetric = before.metrics[key];
      const afterMetric = after.metrics[key];
      return [key, {
        beforeElapsedMs: beforeMetric?.elapsedMs ?? null,
        afterElapsedMs: afterMetric?.elapsedMs ?? null,
        deltaMs: beforeMetric && afterMetric
          ? Number((afterMetric.elapsedMs - beforeMetric.elapsedMs).toFixed(1))
          : null
      }];
    })
  )
});

const waitForBootTiming = async (page, timeoutMs) => {
  await page.waitForFunction((labels) => {
    const report = window.__MAZER_BOOT_TIMING__;
    if (!report?.checkpoints?.length) {
      return false;
    }

    return Object.values(labels).every((label) => (
      report.checkpoints.some((checkpoint) => checkpoint.label === label)
    ));
  }, METRIC_LABELS, { timeout: timeoutMs });
};

const captureBootTiming = async ({ baseUrl, timeoutMs }) => {
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
  const page = await browser.newPage({
    viewport: DEFAULT_VIEWPORT,
    colorScheme: 'dark',
    reducedMotion: 'reduce'
  });
  const consoleMessages = [];

  await page.addInitScript(() => {
    Object.defineProperty(window, 'WebGLRenderingContext', { value: undefined, configurable: true });
    Object.defineProperty(window, 'WebGL2RenderingContext', { value: undefined, configurable: true });
  });

  page.on('console', (message) => {
    consoleMessages.push({
      type: message.type(),
      text: message.text()
    });
  });
  page.on('pageerror', (error) => {
    consoleMessages.push({
      type: 'pageerror',
      text: error.message
    });
  });

  const url = `${normalizeBaseUrl(baseUrl)}/?bootTiming=1`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await waitForBootTiming(page, timeoutMs);
  const report = await page.evaluate(() => window.__MAZER_BOOT_TIMING__);
  await browser.close();

  if (!report) {
    throw new Error('Boot timing report was not published on the shipping surface.');
  }

  return { report, url, consoleMessages };
};

export const runBootTimingCapture = async ({
  baseUrl = DEFAULT_BASE_URL,
  previewTimeoutMs = DEFAULT_PREVIEW_TIMEOUT_MS,
  timeoutMs = DEFAULT_CAPTURE_TIMEOUT_MS,
  artifactRoot = DEFAULT_ARTIFACT_ROOT,
  label = 'latest',
  baselinePath,
  skipBuild = false
} = {}) => {
  await ensureDir(artifactRoot);
  if (!skipBuild) {
    runNpmCommand(['run', 'build']);
  }
  const preview = await launchPreviewServer({
    requestedBaseUrl: baseUrl,
    previewTimeoutMs
  });

  try {
    const capture = await captureBootTiming({ baseUrl: preview.baseUrl, timeoutMs });
    const artifact = createArtifact({
      ...capture,
      commitSha: getCommitSha()
    });
    const artifactPath = resolve(artifactRoot, `${label}.json`);
    await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

    let diffPath = null;
    if (baselinePath) {
      const before = JSON.parse(await readFile(resolve(REPO_ROOT, baselinePath), 'utf8'));
      const diff = createDiff(before, artifact);
      diffPath = resolve(artifactRoot, `${label}.diff.json`);
      await writeFile(diffPath, `${JSON.stringify(diff, null, 2)}\n`, 'utf8');
    }

    return {
      artifactPath,
      diffPath,
      artifact
    };
  } finally {
    await stopPreviewServer(preview.child);
  }
};

const main = async () => {
  const args = parseCliArgs();
  const result = await runBootTimingCapture({
    baseUrl: args['base-url'] ?? DEFAULT_BASE_URL,
    previewTimeoutMs: parseIntegerArg(args['preview-timeout'], DEFAULT_PREVIEW_TIMEOUT_MS),
    timeoutMs: parseIntegerArg(args.timeout, DEFAULT_CAPTURE_TIMEOUT_MS),
    artifactRoot: typeof args['artifact-root'] === 'string' ? resolve(REPO_ROOT, args['artifact-root']) : DEFAULT_ARTIFACT_ROOT,
    label: typeof args.label === 'string' ? args.label : 'latest',
    baselinePath: typeof args.baseline === 'string' ? args.baseline : undefined,
    skipBuild: args['skip-build'] === true || args['skip-build'] === 'true'
  });

  process.stdout.write(`${JSON.stringify({
    artifactPath: result.artifactPath,
    diffPath: result.diffPath,
    totalMs: result.artifact.totalMs,
    metrics: Object.fromEntries(
      Object.entries(result.artifact.metrics).map(([key, checkpoint]) => [key, checkpoint?.elapsedMs ?? null])
    )
  }, null, 2)}\n`);
};

if (isDirectRun) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
