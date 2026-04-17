import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
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
const RUNTIME_DIAGNOSTICS_KEY = '__MAZER_RUNTIME_DIAGNOSTICS__';
const DEFAULT_ARTIFACT_ROOT = resolve(STACK_ROOT, 'tmp', 'captures', 'mazer-runtime-soak');
const DEFAULT_CAPTURE_TIMEOUT_MS = 30_000;
const DEFAULT_DURATION_SECONDS = 60;
const DEFAULT_SAMPLE_INTERVAL_MS = 1_000;
const DEFAULT_RESTART_CYCLES = 0;
const DEFAULT_HIDDEN_WINDOW_MS = 0;
const DEFAULT_VIEWPORT = Object.freeze({ width: 1440, height: 1024 });
const RESTART_VIEWPORT = Object.freeze({ width: 1280, height: 720 });

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

const round = (value, digits = 3) => {
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

  execFileSync('npm', args, { cwd: REPO_ROOT, stdio: 'inherit' });
};

const getCommitSha = () => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};

const waitForRuntimeDiagnostics = async (page, timeoutMs) => {
  await page.waitForFunction((diagnosticsKey) => {
    const diagnostics = window[diagnosticsKey];
    return Boolean(
      diagnostics
      && diagnostics.sceneInstanceId
      && diagnostics.performance
      && diagnostics.resources
    );
  }, RUNTIME_DIAGNOSTICS_KEY, { timeout: timeoutMs });
};

const setSimulatedVisibility = async (page, hidden) => {
  await page.evaluate((value) => {
    window.__MAZER_SIMULATED_HIDDEN__ = value;
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
};

const createMetricWindow = (samples, selector, fallback = 0) => {
  if (samples.length === 0) {
    return {
      start: fallback,
      end: fallback,
      max: fallback,
      min: fallback
    };
  }

  const windowSize = Math.max(1, Math.floor(samples.length * 0.2));
  const startWindow = samples.slice(0, windowSize).map(selector);
  const endWindow = samples.slice(-windowSize).map(selector);
  const allValues = samples.map(selector);

  return {
    start: round(startWindow.reduce((total, value) => total + value, 0) / startWindow.length),
    end: round(endWindow.reduce((total, value) => total + value, 0) / endWindow.length),
    max: round(Math.max(...allValues)),
    min: round(Math.min(...allValues))
  };
};

const buildSummary = ({ samples, durationSeconds, lowPower, restartCycles, hiddenWindowMs }) => {
  const first = samples[0] ?? null;
  const last = samples.at(-1) ?? null;
  const sceneInstanceIds = [...new Set(samples.map((sample) => sample.sceneInstanceId))];
  const steadyStateStartIndex = samples.length > 0
    ? Math.min(samples.length - 1, Math.max(0, Math.floor(samples.length * 0.25)))
    : 0;
  const steadyStateSamples = samples.slice(steadyStateStartIndex);
  const frameWindow = createMetricWindow(samples, (sample) => sample.performance.recentAverageFrameMs);
  const tweenWindow = createMetricWindow(steadyStateSamples, (sample) => sample.resources.activeTweens);
  const timerWindow = createMetricWindow(steadyStateSamples, (sample) => sample.resources.activeTimers);
  const listenerWindow = createMetricWindow(steadyStateSamples, (sample) => sample.resources.listenerCount);
  const trailWindow = createMetricWindow(samples, (sample) => sample.resources.trailSegmentCount);
  const intentWindow = createMetricWindow(samples, (sample) => sample.resources.intentEntryCount);
  const movingWindow = createMetricWindow(samples, (sample) => sample.resources.background.moving);
  const heapValues = samples
    .map((sample) => sample.resources.jsHeap?.usedBytes)
    .filter((value) => Number.isFinite(value));
  const heapSummary = heapValues.length > 0
    ? {
        startUsedBytes: heapValues[0],
        endUsedBytes: heapValues.at(-1),
        peakUsedBytes: Math.max(...heapValues),
        pass: heapValues.at(-1) <= Math.max(...heapValues)
      }
    : null;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    durationSeconds,
    lowPower,
    restartCycles,
    hiddenWindowMs,
    sampleCount: samples.length,
    sceneInstanceIds,
    frame: {
      startAverageMs: frameWindow.start,
      endAverageMs: frameWindow.end,
      worstFrameMs: round(Math.max(...samples.map((sample) => sample.performance.worstFrameMs), 0)),
      spikeCount: Math.max(...samples.map((sample) => sample.performance.spikeCount), 0),
      estimatedFpsEnd: last?.performance.estimatedFps ?? 0,
      pass: frameWindow.end <= Math.max(frameWindow.start + 4, frameWindow.start * 1.35, 24)
    },
    growth: {
      tweens: {
        startAverage: tweenWindow.start,
        endAverage: tweenWindow.end,
        max: tweenWindow.max,
        pass: tweenWindow.end <= tweenWindow.start + 2
      },
      timers: {
        startAverage: timerWindow.start,
        endAverage: timerWindow.end,
        max: timerWindow.max,
        pass: timerWindow.end <= timerWindow.start + 2
      },
      listeners: {
        startAverage: listenerWindow.start,
        endAverage: listenerWindow.end,
        max: listenerWindow.max,
        pass: listenerWindow.end <= listenerWindow.start + 1
      }
    },
    caps: {
      trail: {
        maxSeen: trailWindow.max,
        cap: Math.max(...samples.map((sample) => sample.resources.trailSegmentCap), 0),
        pass: samples.every((sample) => sample.resources.trailSegmentCount <= sample.resources.trailSegmentCap)
      },
      intent: {
        maxSeen: intentWindow.max,
        cap: Math.max(...samples.map((sample) => sample.resources.intentEntryCap), 0),
        pass: samples.every((sample) => sample.resources.intentEntryCount <= sample.resources.intentEntryCap)
      },
      backgroundMoving: {
        maxSeen: movingWindow.max,
        cap: Math.max(...samples.map((sample) => sample.resources.background.movingCap), 0),
        pass: samples.every((sample) => sample.resources.background.moving <= sample.resources.background.movingCap)
      }
    },
    visibility: {
      hiddenSampleCount: samples.filter((sample) => sample.visibility.hidden).length,
      changeCount: last?.visibility.changeCount ?? 0,
      suspendCount: last?.visibility.suspendCount ?? 0
    },
    heap: heapSummary,
    final: last,
    initial: first
  };
};

const captureRuntimeSoak = async ({
  baseUrl,
  timeoutMs,
  durationSeconds,
  sampleIntervalMs,
  lowPower,
  restartCycles,
  hiddenWindowMs
}) => {
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
  const page = await browser.newPage({
    viewport: DEFAULT_VIEWPORT,
    colorScheme: 'dark',
    reducedMotion: 'reduce'
  });
  const consoleMessages = [];

  await page.addInitScript(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => Boolean(window.__MAZER_SIMULATED_HIDDEN__)
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => window.__MAZER_SIMULATED_HIDDEN__ ? 'hidden' : 'visible'
    });
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

  const params = new URLSearchParams({
    runtimeDiagnostics: '1'
  });
  if (lowPower) {
    params.set('lowPower', '1');
  }

  const url = `${normalizeBaseUrl(baseUrl)}/?${params.toString()}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await waitForRuntimeDiagnostics(page, timeoutMs);

  const samples = [];
  const startedAt = Date.now();
  const finishedAt = startedAt + (durationSeconds * 1000);
  const restartIntervalMs = restartCycles > 0
    ? Math.max(sampleIntervalMs, Math.floor((durationSeconds * 1000) / restartCycles))
    : Number.POSITIVE_INFINITY;
  let nextRestartAt = startedAt + restartIntervalMs;
  let restartCount = 0;
  let usingAltViewport = false;
  let hiddenApplied = false;
  let hiddenReleased = false;
  const hiddenStartAt = hiddenWindowMs > 0
    ? startedAt + Math.max(sampleIntervalMs, Math.floor(((durationSeconds * 1000) - hiddenWindowMs) / 2))
    : Number.POSITIVE_INFINITY;
  const hiddenEndAt = hiddenStartAt + hiddenWindowMs;

  while (Date.now() < finishedAt) {
    const now = Date.now();

    if (restartCount < restartCycles && now >= nextRestartAt) {
      usingAltViewport = !usingAltViewport;
      await page.setViewportSize(usingAltViewport ? RESTART_VIEWPORT : DEFAULT_VIEWPORT);
      await page.evaluate(() => {
        window.dispatchEvent(new Event('resize'));
      });
      restartCount += 1;
      nextRestartAt += restartIntervalMs;
      await page.waitForTimeout(500);
    }

    if (!hiddenApplied && hiddenWindowMs > 0 && now >= hiddenStartAt) {
      await setSimulatedVisibility(page, true);
      hiddenApplied = true;
    }

    if (hiddenApplied && !hiddenReleased && now >= hiddenEndAt) {
      await setSimulatedVisibility(page, false);
      hiddenReleased = true;
    }

    const diagnostics = await page.evaluate((diagnosticsKey) => window[diagnosticsKey], RUNTIME_DIAGNOSTICS_KEY);
    if (diagnostics) {
      samples.push({
        capturedAt: new Date().toISOString(),
        ...diagnostics
      });
    }

    await sleep(sampleIntervalMs);
  }

  if (hiddenApplied && !hiddenReleased) {
    await setSimulatedVisibility(page, false);
  }

  await browser.close();

  return {
    url,
    consoleMessages,
    samples
  };
};

export const runRuntimeSoakCapture = async ({
  baseUrl = DEFAULT_BASE_URL,
  previewTimeoutMs = DEFAULT_PREVIEW_TIMEOUT_MS,
  timeoutMs = DEFAULT_CAPTURE_TIMEOUT_MS,
  artifactRoot = DEFAULT_ARTIFACT_ROOT,
  label = 'latest',
  durationSeconds = DEFAULT_DURATION_SECONDS,
  sampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
  lowPower = false,
  restartCycles = DEFAULT_RESTART_CYCLES,
  hiddenWindowMs = DEFAULT_HIDDEN_WINDOW_MS,
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
    const capture = await captureRuntimeSoak({
      baseUrl: preview.baseUrl,
      timeoutMs,
      durationSeconds,
      sampleIntervalMs,
      lowPower,
      restartCycles,
      hiddenWindowMs
    });
    const summary = buildSummary({
      samples: capture.samples,
      durationSeconds,
      lowPower,
      restartCycles,
      hiddenWindowMs
    });
    const samplesPath = resolve(artifactRoot, `${label}.samples.json`);
    const summaryPath = resolve(artifactRoot, `${label}.summary.json`);
    const artifact = {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      commitSha: getCommitSha(),
      url: capture.url,
      durationSeconds,
      sampleIntervalMs,
      lowPower,
      restartCycles,
      hiddenWindowMs,
      consoleMessages: capture.consoleMessages,
      samples: capture.samples
    };

    await writeFile(samplesPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

    return {
      samplesPath,
      summaryPath,
      summary
    };
  } finally {
    await stopPreviewServer(preview.child);
  }
};

const main = async () => {
  const args = parseCliArgs();
  const result = await runRuntimeSoakCapture({
    baseUrl: args['base-url'] ?? DEFAULT_BASE_URL,
    previewTimeoutMs: parseIntegerArg(args['preview-timeout'], DEFAULT_PREVIEW_TIMEOUT_MS),
    timeoutMs: parseIntegerArg(args.timeout, DEFAULT_CAPTURE_TIMEOUT_MS),
    artifactRoot: typeof args['artifact-root'] === 'string' ? resolve(REPO_ROOT, args['artifact-root']) : DEFAULT_ARTIFACT_ROOT,
    label: typeof args.label === 'string' ? args.label : 'latest',
    durationSeconds: parseIntegerArg(args['duration-seconds'], DEFAULT_DURATION_SECONDS),
    sampleIntervalMs: parseIntegerArg(args['sample-interval-ms'], DEFAULT_SAMPLE_INTERVAL_MS),
    lowPower: args['low-power'] === true || args['low-power'] === 'true',
    restartCycles: parseIntegerArg(args['restart-cycles'], DEFAULT_RESTART_CYCLES),
    hiddenWindowMs: parseIntegerArg(args['hidden-window-ms'], DEFAULT_HIDDEN_WINDOW_MS),
    skipBuild: args['skip-build'] === true || args['skip-build'] === 'true'
  });

  process.stdout.write(`${JSON.stringify({
    summaryPath: result.summaryPath,
    samplesPath: result.samplesPath,
    sceneInstanceIds: result.summary.sceneInstanceIds,
    sampleCount: result.summary.sampleCount,
    framePass: result.summary.frame.pass,
    growth: result.summary.growth,
    caps: result.summary.caps
  }, null, 2)}\n`);
};

if (isDirectRun) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
