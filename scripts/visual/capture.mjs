import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  CAPTURE_ROOT,
  DEFAULT_CAPTURE_TIMEOUT_MS,
  DEFAULT_BASE_URL,
  TARGETS,
  VISUAL_CAPTURE_CONFIG,
  ensureDir,
  normalizeBaseUrl,
  parseCliArgs,
  parseIntegerArg,
  resolveSessionId,
  resolveSessionPaths,
  round,
  writeJson,
  writeSessionPointer
} from './common.mjs';

const CAPTURE_KEY = '__MAZER_VISUAL_CAPTURE__';
const DIAGNOSTICS_KEY = '__MAZER_VISUAL_DIAGNOSTICS__';
const CENTER_TOLERANCE_PX = 6;
const FRAME_TOLERANCE_PX = 4;
const TARGET_CAPTURE_RETRIES = 3;

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const isWithinRange = (value, min, max, tolerance = 0) => (
  Number.isFinite(value)
  && Number.isFinite(min)
  && Number.isFinite(max)
  && value >= (min - tolerance)
  && value <= (max + tolerance)
);

const createCheck = (name, pass, details) => ({
  name,
  pass,
  details
});

const validateTitle = (diagnostics) => {
  if (!diagnostics.title.expected) {
    return [
      createCheck(
        'title-not-expected',
        diagnostics.title.visible === false,
        diagnostics.title.visible ? 'Title rendered when the profile should hide it.' : 'Title correctly hidden.'
      )
    ];
  }

  const frame = diagnostics.title.frame;
  const bounds = diagnostics.title.bounds;
  const textBounds = diagnostics.title.textBounds;
  const centered = bounds && frame
    ? Math.abs(bounds.centerX - frame.centerX) <= Math.max(CENTER_TOLERANCE_PX, round(frame.width * 0.03, 2))
    : false;
  const containerInside = bounds && frame
    ? isWithinRange(bounds.left, frame.left, frame.right, FRAME_TOLERANCE_PX)
      && isWithinRange(bounds.right, frame.left, frame.right, FRAME_TOLERANCE_PX)
      && isWithinRange(bounds.top, frame.top, frame.bottom, FRAME_TOLERANCE_PX)
      && isWithinRange(bounds.bottom, frame.top, frame.bottom, FRAME_TOLERANCE_PX)
    : false;
  const textInside = textBounds && frame
    ? isWithinRange(textBounds.left, frame.left, frame.right, FRAME_TOLERANCE_PX)
      && isWithinRange(textBounds.right, frame.left, frame.right, FRAME_TOLERANCE_PX)
      && isWithinRange(textBounds.top, frame.top, frame.bottom, FRAME_TOLERANCE_PX)
      && isWithinRange(textBounds.bottom, frame.top, frame.bottom, FRAME_TOLERANCE_PX)
    : false;

  return [
    createCheck(
      'title-visible',
      diagnostics.title.visible === true && Boolean(frame) && Boolean(bounds) && Boolean(textBounds),
      diagnostics.title.visible
        ? 'Title diagnostics published with frame and bounds.'
        : 'Title was expected but diagnostics did not mark it visible.'
    ),
    createCheck(
      'title-centered',
      centered,
      centered ? 'Title container remains centered in the safe title band.' : 'Title container drifted away from the safe title band center.'
    ),
    createCheck(
      'title-within-band',
      containerInside && textInside,
      containerInside && textInside
        ? 'Title lockup stays inside the helper title band.'
        : 'Title lockup overflowed the helper title band.'
    )
  ];
};

const validateInstall = (diagnostics) => {
  if (!diagnostics.install.expected) {
    return [
      createCheck(
        'install-not-expected',
        diagnostics.install.visible === false,
        diagnostics.install.visible ? 'Install CTA rendered when the profile should hide it.' : 'Install CTA correctly hidden.'
      )
    ];
  }

  const frame = diagnostics.install.frame;
  const bounds = diagnostics.install.bounds;
  const centered = bounds && frame
    ? Math.abs(bounds.centerX - frame.centerX) <= CENTER_TOLERANCE_PX
    : false;
  const insideFrame = bounds && frame
    ? isWithinRange(bounds.left, frame.left, frame.right, FRAME_TOLERANCE_PX)
      && isWithinRange(bounds.right, frame.left, frame.right, FRAME_TOLERANCE_PX)
      && isWithinRange(bounds.top, frame.top, frame.bottom, FRAME_TOLERANCE_PX)
      && isWithinRange(bounds.bottom, frame.top, frame.bottom, FRAME_TOLERANCE_PX)
    : false;

  return [
    createCheck(
      'install-visible',
      diagnostics.install.visible === true && Boolean(frame) && Boolean(bounds),
      diagnostics.install.visible
        ? 'Install CTA diagnostics published with frame and bounds.'
        : 'Install CTA was expected but diagnostics did not mark it visible.'
    ),
    createCheck(
      'install-bottom-center',
      centered && insideFrame,
      centered && insideFrame
        ? 'Install CTA stays inside the bottom-center helper lane.'
        : 'Install CTA drifted outside the bottom-center helper lane.'
    )
  ];
};

const validateTrail = (diagnostics) => {
  const render = diagnostics.trail.render;
  const hasActiveMotion = render.hasActiveMotion === true
    && diagnostics.trail.currentIndex !== diagnostics.trail.nextIndex
    && render.viewMotionProgress > 0
    && render.viewMotionProgress < 1;

  return [
    createCheck(
      'trail-no-future-preview',
      diagnostics.trail.suppressesFuturePreview === true,
      diagnostics.trail.suppressesFuturePreview
        ? 'Trail render bounds stop at the live actor.'
        : 'Trail render bounds are still previewing future path steps.'
    ),
    createCheck(
      'trail-attached',
      diagnostics.trail.attachedToActor === true && render.attachedToActor === true,
      diagnostics.trail.attachedToActor && render.attachedToActor
        ? 'Trail bridge stays attached to the actor.'
        : 'Trail diagnostics report a detached actor head.'
    ),
    createCheck(
      'trail-in-motion',
      hasActiveMotion,
      hasActiveMotion
        ? 'Capture landed during active motion, not the spawn hold.'
        : `Capture did not settle onto an active-motion frame (progress=${round(render.viewMotionProgress, 3)}).`
    ),
    createCheck(
      'trail-bridge-rendered',
      render.bridgeRendered === true,
      render.bridgeRendered
        ? 'Trail bridge segment rendered behind the actor.'
        : 'Trail bridge segment did not render for the captured motion frame.'
    )
  ];
};

const validateBoard = (diagnostics) => {
  const { bounds, safeBounds } = diagnostics.board;
  const insideSafeBounds = isWithinRange(bounds.left, safeBounds.left, safeBounds.right, FRAME_TOLERANCE_PX)
    && isWithinRange(bounds.right, safeBounds.left, safeBounds.right, FRAME_TOLERANCE_PX)
    && isWithinRange(bounds.top, safeBounds.top, safeBounds.bottom, FRAME_TOLERANCE_PX)
    && isWithinRange(bounds.bottom, safeBounds.top, safeBounds.bottom, FRAME_TOLERANCE_PX);
  const palettePasses = Array.isArray(diagnostics.paletteReadability.failures) && diagnostics.paletteReadability.failures.length === 0;
  const obsCentered = diagnostics.profile === 'obs'
    ? Math.abs(bounds.centerX - safeBounds.centerX) <= 1 && Math.abs(bounds.centerY - safeBounds.centerY) <= 1
    : true;

  return [
    createCheck(
      'board-within-safe-bounds',
      insideSafeBounds,
      insideSafeBounds ? 'Board stays inside the scene safe bounds.' : 'Board overflowed the safe bounds published by layout helpers.'
    ),
    createCheck(
      'palette-readability',
      palettePasses,
      palettePasses
        ? 'Theme readability checkpoints passed.'
        : `Theme readability failures: ${diagnostics.paletteReadability.failures.map((failure) => failure.key).join(', ')}`
    ),
    createCheck(
      'obs-centered',
      obsCentered,
      obsCentered ? 'OBS profile remains centered in frame.' : 'OBS profile drifted away from the safe frame center.'
    )
  ];
};

const validateDiagnostics = (diagnostics) => {
  const checks = [
    ...validateTitle(diagnostics),
    ...validateInstall(diagnostics),
    ...validateTrail(diagnostics),
    ...validateBoard(diagnostics)
  ];
  return {
    checks,
    passed: checks.every((check) => check.pass)
  };
};

const isDiagnosticsReady = (diagnostics) => {
  if (!diagnostics) {
    return false;
  }

  if (diagnostics.title.expected && diagnostics.title.visible !== true) {
    return false;
  }

  if (diagnostics.install.expected && diagnostics.install.visible !== true) {
    return false;
  }

  const render = diagnostics.trail?.render;
  if (!render) {
    return false;
  }

  return render.hasActiveMotion === true
    && diagnostics.trail.currentIndex !== diagnostics.trail.nextIndex
    && diagnostics.trail.limit >= 4
    && render.viewMotionProgress > 0
    && render.viewMotionProgress < 1
    && render.bridgeRendered === true;
};

const waitForDiagnostics = async (page, timeoutMs) => {
  const startedAt = Date.now();
  let lastDiagnostics = null;

  while ((Date.now() - startedAt) < timeoutMs) {
    lastDiagnostics = await page.evaluate((diagnosticsKey) => window[diagnosticsKey] ?? null, DIAGNOSTICS_KEY);
    if (isDiagnosticsReady(lastDiagnostics)) {
      return lastDiagnostics;
    }

    await page.waitForTimeout(250);
  }

  const lastProgress = lastDiagnostics?.trail?.render?.viewMotionProgress;
  const error = new Error(
    `Timed out waiting for visual diagnostics readiness. Last revision=${lastDiagnostics?.revision ?? 'none'}, progress=${round(lastProgress ?? NaN, 3)}.`
  );
  error.lastDiagnostics = lastDiagnostics;
  throw error;
};

const captureTargetAttempt = async (browser, baseUrl, target, outputDir, metricsDir, timeoutMs, attempt) => {
  const context = await browser.newContext({
    viewport: target.viewport,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    colorScheme: 'dark'
  });

  await context.addInitScript(
    ({ key, value }) => {
      window[key] = value;
    },
    {
      key: CAPTURE_KEY,
      value: VISUAL_CAPTURE_CONFIG
    }
  );

  const page = await context.newPage();
  const consoleMessages = [];

  page.on('console', (message) => {
    consoleMessages.push({
      type: message.type(),
      text: message.text()
    });
  });

  const url = `${baseUrl}${target.path}`;
  const screenshotPath = resolve(outputDir, `${target.id}.png`);
  const metricsPath = resolve(metricsDir, `${target.id}.json`);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const diagnostics = await waitForDiagnostics(page, timeoutMs);
    const validation = validateDiagnostics(diagnostics);
    await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });

    const record = {
      target,
      url,
      attempt,
      screenshotPath,
      diagnostics,
      consoleMessages,
      ...validation
    };
    await writeJson(metricsPath, record);
    return record;
  } finally {
    await context.close();
  }
};

const captureTarget = async (browser, baseUrl, target, outputDir, metricsDir, timeoutMs) => {
  let lastError;

  for (let attempt = 1; attempt <= TARGET_CAPTURE_RETRIES; attempt += 1) {
    try {
      return await captureTargetAttempt(browser, baseUrl, target, outputDir, metricsDir, timeoutMs, attempt);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

export const captureVisualSet = async ({
  baseUrl = DEFAULT_BASE_URL,
  label = 'capture',
  sessionId,
  timeoutMs = DEFAULT_CAPTURE_TIMEOUT_MS
} = {}) => {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const resolvedSessionId = resolveSessionId(sessionId);
  const sessionPaths = resolveSessionPaths(resolvedSessionId, label);

  await ensureDir(CAPTURE_ROOT);
  await ensureDir(sessionPaths.sessionDir);
  await ensureDir(sessionPaths.captureDir);
  await ensureDir(sessionPaths.metricsDir);
  await writeSessionPointer(resolvedSessionId);

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=swiftshader']
  });
  const records = [];

  try {
    for (const target of TARGETS) {
      const record = await captureTarget(
        browser,
        normalizedBaseUrl,
        target,
        sessionPaths.captureDir,
        sessionPaths.metricsDir,
        timeoutMs
      );
      records.push(record);
    }
  } finally {
    await browser.close();
  }

  const summary = {
    sessionId: resolvedSessionId,
    label,
    baseUrl: normalizedBaseUrl,
    captureRoot: sessionPaths.captureDir,
    metricsRoot: sessionPaths.metricsDir,
    passed: records.every((record) => record.passed),
    targets: records.map((record) => ({
      id: record.target.id,
      url: record.url,
      screenshotPath: record.screenshotPath,
      passed: record.passed,
      failedChecks: record.checks.filter((check) => !check.pass)
    }))
  };

  await writeJson(sessionPaths.summaryPath, summary);

  if (!summary.passed) {
    const failures = summary.targets
      .filter((target) => target.passed === false)
      .map((target) => `${target.id}: ${target.failedChecks.map((check) => check.name).join(', ')}`)
      .join('; ');
    const error = new Error(`Visual capture validation failed for ${failures}`);
    error.summary = summary;
    throw error;
  }

  return summary;
};

const main = async () => {
  const args = parseCliArgs();
  const summary = await captureVisualSet({
    baseUrl: args['base-url'] ?? process.env.MAZER_VISUAL_BASE_URL ?? DEFAULT_BASE_URL,
    label: typeof args.label === 'string' ? args.label : 'capture',
    sessionId: typeof args.session === 'string' ? args.session : process.env.MAZER_VISUAL_SESSION,
    timeoutMs: parseIntegerArg(args.timeout, DEFAULT_CAPTURE_TIMEOUT_MS)
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
