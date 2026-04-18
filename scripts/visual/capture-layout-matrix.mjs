import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { renderContactSheet } from '../../tools/visual-pipeline/contactSheet.mjs';
import {
  DEFAULT_BASE_URL,
  DEFAULT_CAPTURE_TIMEOUT_MS,
  DEFAULT_PREVIEW_TIMEOUT_MS,
  REPO_ROOT,
  STACK_ROOT,
  ensureDir,
  normalizeBaseUrl,
  parseCliArgs,
  parseIntegerArg,
  resolveSessionId
} from './common.mjs';
import { resolveLayoutMatrixRoute, resolveLayoutMatrixViewports } from './layout-matrix.config.mjs';
import { launchPreviewServer, stopPreviewServer } from './preview-server.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH;
const VISUAL_CAPTURE_KEY = '__MAZER_VISUAL_CAPTURE__';
const VISUAL_DIAGNOSTICS_KEY = '__MAZER_VISUAL_DIAGNOSTICS__';
const LAYOUT_MATRIX_ROOT = resolve(STACK_ROOT, 'tmp', 'captures', 'mazer-layout-matrix');
const DEFAULT_ROUTE = '/';
const CAPTURE_RETRIES = 3;
const LAYOUT_MATRIX_CAPTURE_CONFIG = Object.freeze({
  enabled: true,
  forceInstallMode: 'available'
});

const round = (value, digits = 2) => {
  if (!Number.isFinite(value)) {
    return value;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const runNpmCommand = (args) => {
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/s', '/c', ['npm', ...args].join(' ')], {
      cwd: REPO_ROOT,
      stdio: 'inherit'
    });
    return;
  }

  execFileSync('npm', args, {
    cwd: REPO_ROOT,
    stdio: 'inherit'
  });
};

const normalizeRoute = (value) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return DEFAULT_ROUTE;
  }

  const trimmed = value.trim();
  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  return `/${trimmed}`;
};

const isBaseUrlReady = async (baseUrl) => {
  try {
    const response = await fetch(normalizeBaseUrl(baseUrl), { redirect: 'manual' });
    return response.ok;
  } catch {
    return false;
  }
};

const toClip = (bounds, viewport) => {
  if (!bounds) {
    throw new Error('Layout matrix could not resolve gameplay bounds for clip capture.');
  }

  const left = Math.max(0, Math.min(bounds.left, viewport.width - 1));
  const top = Math.max(0, Math.min(bounds.top, viewport.height - 1));
  const width = Math.max(1, Math.min(bounds.width, viewport.width - left));
  const height = Math.max(1, Math.min(bounds.height, viewport.height - top));

  return {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(width),
    height: Math.round(height)
  };
};

const waitForLayoutDiagnostics = async (page, timeoutMs) => {
  const startedAt = Date.now();
  let lastDiagnostics = null;

  while ((Date.now() - startedAt) < timeoutMs) {
    lastDiagnostics = await page.evaluate((diagnosticsKey) => window[diagnosticsKey] ?? null, VISUAL_DIAGNOSTICS_KEY);
    const ready = Boolean(
      lastDiagnostics
      && lastDiagnostics.board?.bounds
      && lastDiagnostics.board?.safeBounds
      && lastDiagnostics.intentFeed
      && lastDiagnostics.intentFeed.visible === true
      && (!lastDiagnostics.title?.expected || lastDiagnostics.title?.visible === true)
      && (!lastDiagnostics.install?.expected || lastDiagnostics.install?.visible === true)
    );
    if (ready) {
      return lastDiagnostics;
    }

    await page.waitForTimeout(200);
  }

  const error = new Error('Timed out waiting for layout matrix diagnostics to become ready.');
  error.lastDiagnostics = lastDiagnostics;
  throw error;
};

const relativeToRun = (runDir, filePath) => relative(runDir, filePath).replace(/\\/g, '/');

const formatBounds = (bounds) => (
  bounds
    ? `${Math.round(bounds.left)},${Math.round(bounds.top)} ${Math.round(bounds.width)}x${Math.round(bounds.height)}`
    : '-'
);

const buildMarkdownSummary = ({ runId, sourceMode, baseUrl, presetGroup, captures, contactSheetPath }) => {
  const lines = [
    '# Mazer Layout Matrix',
    '',
    `- Run: ${runId}`,
    `- Source: ${sourceMode}`,
    `- Base URL: ${baseUrl}`,
    `- Presets: ${presetGroup}`,
    `- Contact sheet: ${contactSheetPath ? contactSheetPath : 'not generated'}`,
    '',
    '| Viewport | Route | Size | Safe Bounds | Board Bounds | HUD Bounds | Full Frame | Gameplay |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |'
  ];

  for (const capture of captures) {
    lines.push(
      `| ${capture.viewport.id} | ${capture.route} | ${capture.viewport.width}x${capture.viewport.height} | ${formatBounds(capture.board.safeBounds)} | ${formatBounds(capture.board.bounds)} | ${formatBounds(capture.intentFeed.bounds)} | ${capture.files.full} | ${capture.files.gameplay} |`
    );
  }

  lines.push('', '## Notes', '', '- Full frame uses the viewport screenshot.', '- Gameplay uses the published board bounds clip.', '- HUD bounds come from the runtime diagnostics published by `MenuScene`.');
  return `${lines.join('\n')}\n`;
};

const captureViewport = async ({
  browser,
  baseUrl,
  route,
  viewport,
  runDir,
  fullDir,
  gameplayDir,
  metadataDir,
  timeoutMs
}) => {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'reduce'
  });

  await context.addInitScript(({ key, value }) => {
    window[key] = value;
  }, {
    key: VISUAL_CAPTURE_KEY,
    value: LAYOUT_MATRIX_CAPTURE_CONFIG
  });

  const page = await context.newPage();
  const consoleMessages = [];
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

  const url = `${normalizeBaseUrl(baseUrl)}${route}`;
  const fullPath = resolve(fullDir, `${viewport.id}.png`);
  const gameplayPath = resolve(gameplayDir, `${viewport.id}.png`);
  const metadataPath = resolve(metadataDir, `${viewport.id}.json`);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const diagnostics = await waitForLayoutDiagnostics(page, timeoutMs);
    await page.screenshot({
      path: fullPath,
      fullPage: false,
      animations: 'disabled'
    });
    await page.screenshot({
      path: gameplayPath,
      clip: toClip(diagnostics.board.bounds, viewport),
      animations: 'disabled'
    });

    const record = {
      viewport,
      route,
      url,
      diagnostics,
      files: {
        full: relativeToRun(runDir, fullPath),
        gameplay: relativeToRun(runDir, gameplayPath),
        metadata: relativeToRun(runDir, metadataPath)
      },
      consoleMessages
    };
    await writeFile(metadataPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    return record;
  } finally {
    await context.close();
  }
};

const captureViewportWithRetries = async (options) => {
  let lastError;

  for (let attempt = 1; attempt <= CAPTURE_RETRIES; attempt += 1) {
    try {
      return await captureViewport(options);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

export const captureLayoutMatrix = async ({
  baseUrl = DEFAULT_BASE_URL,
  route,
  presetGroup = 'core',
  runId,
  timeoutMs = DEFAULT_CAPTURE_TIMEOUT_MS,
  previewTimeoutMs = DEFAULT_PREVIEW_TIMEOUT_MS,
  skipBuild = false,
  useExistingUrl = false
} = {}) => {
  const resolvedRunId = resolveSessionId(runId);
  const runDir = resolve(LAYOUT_MATRIX_ROOT, resolvedRunId);
  const fullDir = resolve(runDir, 'full');
  const gameplayDir = resolve(runDir, 'gameplay');
  const metadataDir = resolve(runDir, 'metadata');
  const summaryPath = resolve(runDir, 'summary.json');
  const markdownPath = resolve(runDir, 'summary.md');
  const contactSheetPath = resolve(runDir, 'contact-sheet.png');

  await ensureDir(LAYOUT_MATRIX_ROOT);
  await ensureDir(runDir);
  await ensureDir(fullDir);
  await ensureDir(gameplayDir);
  await ensureDir(metadataDir);

  const hasExplicitRoute = typeof route === 'string' && route.trim().length > 0;
  const reuseExistingPreview = !useExistingUrl && await isBaseUrlReady(baseUrl);
  const sourceMode = useExistingUrl
    ? 'external-url'
    : reuseExistingPreview
      ? 'existing-preview'
      : 'local-preview';
  const preview = useExistingUrl || reuseExistingPreview
    ? null
    : await (async () => {
      if (!skipBuild) {
        runNpmCommand(['run', 'build']);
      }

      return launchPreviewServer({
        requestedBaseUrl: baseUrl,
        previewTimeoutMs
      });
    })();
  const resolvedBaseUrl = normalizeBaseUrl(preview?.baseUrl ?? baseUrl);
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader'] });

  try {
    const viewports = resolveLayoutMatrixViewports(presetGroup);
    const captures = [];

    for (const viewport of viewports) {
      const resolvedRoute = normalizeRoute(resolveLayoutMatrixRoute(viewport, hasExplicitRoute ? route : undefined));
      captures.push(await captureViewportWithRetries({
        browser,
        baseUrl: resolvedBaseUrl,
        route: resolvedRoute,
        viewport,
        runDir,
        fullDir,
        gameplayDir,
        metadataDir,
        timeoutMs
      }));
    }

    await renderContactSheet(browser, {
      frames: captures.map((capture) => ({
        label: `${capture.viewport.id} ${capture.viewport.width}x${capture.viewport.height}`,
        path: resolve(runDir, capture.files.full)
      })),
      outputPath: contactSheetPath,
      title: `Mazer Layout Matrix :: ${presetGroup}`
    });

    const summary = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      runId: resolvedRunId,
      source: {
        mode: sourceMode,
        baseUrl: resolvedBaseUrl
      },
      presetGroup,
      artifactRoot: runDir,
      files: {
        markdown: relativeToRun(runDir, markdownPath),
        contactSheet: relativeToRun(runDir, contactSheetPath)
      },
      captures: captures.map((capture) => ({
        viewport: capture.viewport,
        route: capture.route,
        url: capture.url,
        files: capture.files,
        board: {
          safeBounds: capture.diagnostics.board.safeBounds,
          bounds: capture.diagnostics.board.bounds,
          tileSize: capture.diagnostics.board.tileSize
        },
        intentFeed: capture.diagnostics.intentFeed,
        title: capture.diagnostics.title,
        install: capture.diagnostics.install,
        consoleMessageCount: capture.consoleMessages.length
      }))
    };

    const markdown = buildMarkdownSummary({
      runId: resolvedRunId,
      sourceMode,
      baseUrl: resolvedBaseUrl,
      presetGroup,
      captures: summary.captures,
      contactSheetPath: summary.files.contactSheet
    });

    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    await writeFile(markdownPath, markdown, 'utf8');

    return {
      runDir,
      summaryPath,
      markdownPath,
      contactSheetPath,
      summary
    };
  } finally {
    await browser.close();
    if (preview) {
      await stopPreviewServer(preview.child);
    }
  }
};

const main = async () => {
  const args = parseCliArgs();
  const externalUrl = typeof args.url === 'string' ? args.url : null;
  const result = await captureLayoutMatrix({
    baseUrl: externalUrl ?? args['base-url'] ?? DEFAULT_BASE_URL,
    route: typeof args.route === 'string' ? args.route : undefined,
    presetGroup: typeof args.preset === 'string' ? args.preset : 'core',
    runId: typeof args.run === 'string' ? args.run : undefined,
    timeoutMs: parseIntegerArg(args.timeout, DEFAULT_CAPTURE_TIMEOUT_MS),
    previewTimeoutMs: parseIntegerArg(args['preview-timeout'], DEFAULT_PREVIEW_TIMEOUT_MS),
    skipBuild: args['skip-build'] === true || args['skip-build'] === 'true',
    useExistingUrl: Boolean(externalUrl)
  });

  process.stdout.write(`${JSON.stringify({
    runDir: result.runDir,
    summaryPath: result.summaryPath,
    markdownPath: result.markdownPath,
    contactSheetPath: result.contactSheetPath,
    captureCount: result.summary.captures.length
  }, null, 2)}\n`);
};

if (isDirectRun) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
