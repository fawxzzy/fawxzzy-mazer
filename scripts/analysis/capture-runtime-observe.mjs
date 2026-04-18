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
import { buildVisibilityRollup } from './runtime-visibility-rollup.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH;
const RUNTIME_DIAGNOSTICS_KEY = '__MAZER_RUNTIME_DIAGNOSTICS__';
const DEFAULT_ARTIFACT_ROOT = resolve(STACK_ROOT, 'tmp', 'captures', 'mazer-runtime-observe');
const DEFAULT_CAPTURE_TIMEOUT_MS = 30_000;
const DEFAULT_DURATION_SECONDS = 90;
const DEFAULT_SAMPLE_INTERVAL_MS = 1_000;
const DEFAULT_SCREENSHOT_COUNT = 2;
const DEFAULT_CAPTURE_SCREENSHOTS = false;
const DEFAULT_VIEWPORT = Object.freeze({ width: 1440, height: 1024 });

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

const round = (value, digits = 3) => {
  if (!Number.isFinite(value)) {
    return value;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const maxOrFallback = (values, fallback = 0) => (
  values.length > 0 ? Math.max(...values) : fallback
);

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

const isWorktreeDirty = () => {
  try {
    return execFileSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim().length > 0;
  } catch {
    return false;
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

const createMetricWindow = (samples, selector, fallback = 0) => {
  if (samples.length === 0) {
    return {
      start: fallback,
      end: fallback,
      min: fallback,
      max: fallback
    };
  }

  const windowSize = Math.max(1, Math.floor(samples.length * 0.2));
  const startWindow = samples.slice(0, windowSize).map(selector);
  const endWindow = samples.slice(-windowSize).map(selector);
  const allValues = samples.map(selector);

  return {
    start: round(startWindow.reduce((total, value) => total + value, 0) / startWindow.length),
    end: round(endWindow.reduce((total, value) => total + value, 0) / endWindow.length),
    min: round(Math.min(...allValues)),
    max: round(Math.max(...allValues))
  };
};

export const buildRuntimeSummary = (samples) => {
  const first = samples[0] ?? null;
  const last = samples.at(-1) ?? null;
  const sceneInstanceIds = [...new Set(samples.map((sample) => sample.sceneInstanceId))];
  const restartEpochs = [...new Set(samples.map((sample) => sample.captureEpoch).filter((value) => Number.isFinite(value)))];
  const frameWindow = createMetricWindow(samples, (sample) => sample.performance.recentAverageFrameMs);
  const spikeWindow = createMetricWindow(samples, (sample) => sample.performance.worstRecentFrameMs);
  const tweenWindow = createMetricWindow(samples, (sample) => sample.resources.activeTweens);
  const timerWindow = createMetricWindow(samples, (sample) => sample.resources.activeTimers);
  const listenerWindow = createMetricWindow(samples, (sample) => sample.resources.listenerCount);
  const trailWindow = createMetricWindow(samples, (sample) => sample.resources.trailSegmentCount);
  const feedWindow = createMetricWindow(samples, (sample) => sample.resources.intentEntryCount);
  const deferredWindow = createMetricWindow(samples, (sample) => sample.resources.deferredVisualTasksRemaining);
  const backgroundWindow = createMetricWindow(samples, (sample) => sample.resources.background.moving);
  const heapValues = samples
    .map((sample) => sample.resources.jsHeap?.usedBytes)
    .filter((value) => Number.isFinite(value));
  const visibility = buildVisibilityRollup(samples);

  return {
    sampleCount: samples.length,
    sceneInstanceIds,
    restartEpochs,
    frame: {
      startAverageMs: frameWindow.start,
      endAverageMs: frameWindow.end,
      maxRecentWorstMs: spikeWindow.max,
      worstFrameMs: round(maxOrFallback(samples.map((sample) => sample.performance.worstFrameMs), 0)),
      spikeCount: maxOrFallback(samples.map((sample) => sample.performance.spikeCount), 0),
      estimatedFpsEnd: last?.performance.estimatedFps ?? 0
    },
    pressure: {
      tweens: tweenWindow,
      timers: timerWindow,
      listeners: listenerWindow,
      trailSegments: trailWindow,
      visibleIntentEntries: feedWindow,
      deferredVisualTasks: deferredWindow,
      movingBackgroundActors: backgroundWindow
    },
    visibility: {
      hiddenSampleCount: visibility.hiddenSampleCount,
      changeCount: visibility.changeCount,
      suspendCount: visibility.suspendCount,
      epochCount: visibility.epochCount,
      epochs: visibility.epochs
    },
    heap: heapValues.length > 0
      ? {
          startUsedBytes: heapValues[0],
          endUsedBytes: heapValues.at(-1),
          minUsedBytes: Math.min(...heapValues),
          peakUsedBytes: Math.max(...heapValues)
        }
      : null,
    initial: first,
    final: last
  };
};

const normalizeFeedText = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

const normalizeFeedEntry = (entry) => ({
  speaker: normalizeFeedText(entry?.speaker),
  kind: normalizeFeedText(entry?.kind),
  importance: normalizeFeedText(entry?.importance),
  summary: normalizeFeedText(entry?.summary),
  slot: Number.isFinite(entry?.slot) ? Math.max(0, Math.trunc(entry.slot)) : 0
});

const normalizeFeedStatus = (status) => {
  if (!status || typeof status !== 'object') {
    return null;
  }

  const summary = normalizeFeedText(status.summary);
  if (summary.length === 0) {
    return null;
  }

  return {
    speaker: normalizeFeedText(status.speaker),
    kind: normalizeFeedText(status.kind),
    importance: normalizeFeedText(status.importance),
    summary
  };
};

const getRuntimeFeedSamples = (samples) => samples.map((sample) => {
  const entries = Array.isArray(sample?.feed?.visibleEntries)
    ? sample.feed.visibleEntries
      .map(normalizeFeedEntry)
      .filter((entry) => entry.summary.length > 0)
      .sort((left, right) => left.slot - right.slot)
    : [];
  const status = normalizeFeedStatus(sample?.feed?.status);
  const key = entries
    .map((entry) => [entry.speaker, entry.kind, entry.importance, entry.summary, entry.slot].join('|'))
    .join(' || ');
  const leadEntry = entries[0] ?? null;

  return {
    elapsedMs: Number.isFinite(sample?.elapsedMs) ? Math.max(0, sample.elapsedMs) : 0,
    visibleEntryCount: Number.isFinite(sample?.feed?.visibleEntryCount)
      ? Math.max(0, Math.trunc(sample.feed.visibleEntryCount))
      : entries.length,
    entries,
    status,
    key,
    leadKey: leadEntry ? [leadEntry.speaker, leadEntry.kind, leadEntry.summary].join('|') : '',
    statusKey: status ? [status.speaker, status.kind, status.summary].join('|') : '',
    hasVisibleFeed: entries.length > 0 || Boolean(status)
  };
});

const estimateSampleIntervalMs = (feedSamples) => {
  const deltas = [];
  for (let index = 1; index < feedSamples.length; index += 1) {
    const delta = feedSamples[index].elapsedMs - feedSamples[index - 1].elapsedMs;
    if (Number.isFinite(delta) && delta > 0) {
      deltas.push(delta);
    }
  }

  if (deltas.length === 0) {
    return DEFAULT_SAMPLE_INTERVAL_MS;
  }

  return round(deltas.reduce((total, value) => total + value, 0) / deltas.length);
};

export const buildFeedTimelineFromRuntimeSamples = (samples) => {
  const feedSamples = getRuntimeFeedSamples(samples);
  const samplesWithVisibleFeed = feedSamples.filter((sample) => sample.hasVisibleFeed);
  const samplesWithEntries = feedSamples.filter((sample) => sample.visibleEntryCount > 0);
  const captureEndElapsedMs = feedSamples.at(-1)?.elapsedMs ?? 0;
  const sampleIntervalEstimateMs = estimateSampleIntervalMs(feedSamples);
  const visibleEntryCounts = feedSamples.map((sample) => sample.visibleEntryCount);
  const runs = [];

  let currentRun = null;
  for (const sample of feedSamples) {
    if (!currentRun || sample.key !== currentRun.key) {
      if (currentRun) {
        runs.push(currentRun);
      }
      currentRun = {
        key: sample.key,
        entries: sample.entries,
        startElapsedMs: sample.elapsedMs,
        endElapsedMs: sample.elapsedMs,
        sampleCount: 1,
        visibleEntryCount: sample.visibleEntryCount
      };
      continue;
    }

    currentRun.endElapsedMs = sample.elapsedMs;
    currentRun.sampleCount += 1;
    currentRun.visibleEntryCount = Math.max(currentRun.visibleEntryCount, sample.visibleEntryCount);
  }

  if (currentRun) {
    runs.push(currentRun);
  }

  const feedRuns = runs.filter((run) => run.visibleEntryCount > 0);
  const snapshots = feedRuns.map((run, index) => {
    const nextStartElapsedMs = feedRuns[index + 1]?.startElapsedMs ?? (captureEndElapsedMs + sampleIntervalEstimateMs);
    const dwellMs = Math.max(sampleIntervalEstimateMs, nextStartElapsedMs - run.startElapsedMs);
    return {
      key: run.key,
      entries: run.entries.map((entry) => `${entry.speaker} ${entry.summary}`.trim()),
      startElapsedMs: round(run.startElapsedMs),
      endElapsedMs: round(run.endElapsedMs),
      dwellMs: round(dwellMs),
      sampleCount: run.sampleCount,
      visibleEntryCount: run.visibleEntryCount
    };
  });

  const uniqueMessages = [...new Set(samplesWithEntries.flatMap((sample) => sample.entries.map((entry) => `${entry.speaker} ${entry.summary}`.trim())))];
  const uniqueStatuses = [...new Set(samplesWithVisibleFeed
    .map((sample) => sample.status ? `${sample.status.speaker} ${sample.status.summary}`.trim() : '')
    .filter((text) => text.length > 0)
  )];
  const topMessages = uniqueMessages
    .map((text) => ({
      text,
      snapshotCount: samplesWithEntries.filter((sample) => (
        sample.entries.some((entry) => `${entry.speaker} ${entry.summary}`.trim() === text)
      )).length
    }))
    .sort((left, right) => right.snapshotCount - left.snapshotCount || left.text.localeCompare(right.text))
    .slice(0, 5);

  let maxDuplicateStreak = 0;
  let currentDuplicateStreak = 0;
  let previousLeadKey = '';

  for (const sample of samplesWithEntries) {
    if (sample.leadKey.length > 0 && sample.leadKey === previousLeadKey) {
      currentDuplicateStreak += 1;
    } else {
      previousLeadKey = sample.leadKey;
      currentDuplicateStreak = sample.leadKey.length > 0 ? 1 : 0;
    }
    maxDuplicateStreak = Math.max(maxDuplicateStreak, currentDuplicateStreak);
  }

  const replacements = Math.max(0, snapshots.length - 1);
  const durationMs = Math.max(
    sampleIntervalEstimateMs,
    (captureEndElapsedMs + sampleIntervalEstimateMs) - (feedSamples[0]?.elapsedMs ?? 0)
  );
  const averageDwellMs = snapshots.length > 0
    ? round(snapshots.reduce((total, snapshot) => total + snapshot.dwellMs, 0) / snapshots.length)
    : 0;
  const maxDwellMs = snapshots.length > 0
    ? round(Math.max(...snapshots.map((snapshot) => snapshot.dwellMs)))
    : 0;

  return {
    sampleCount: feedSamples.length,
    visibleFeedSampleCount: samplesWithVisibleFeed.length,
    sampleIntervalEstimateMs,
    visibleEntryCount: {
      start: visibleEntryCounts[0] ?? 0,
      end: visibleEntryCounts.at(-1) ?? 0,
      min: visibleEntryCounts.length > 0 ? Math.min(...visibleEntryCounts) : 0,
      max: visibleEntryCounts.length > 0 ? Math.max(...visibleEntryCounts) : 0,
      average: visibleEntryCounts.length > 0
        ? round(visibleEntryCounts.reduce((total, value) => total + value, 0) / visibleEntryCounts.length)
        : 0
    },
    snapshotCount: snapshots.length,
    uniqueMessageCount: uniqueMessages.length,
    uniqueMessages,
    uniqueStatusCount: uniqueStatuses.length,
    uniqueStatuses,
    replacements,
    replacementsPerMinute: round(replacements / Math.max(durationMs / 60_000, 1 / 60)),
    averageDwellMs,
    maxDwellMs,
    maxDuplicateStreak,
    maxUnchangedRunMs: maxDwellMs,
    snapshots,
    topMessages
  };
};

const capturePhaseScreenshots = async ({
  page,
  screenshotDir,
  screenshotLabel,
  phase,
  count,
  startIndex
}) => {
  const screenshotPaths = [];

  for (let index = 0; index < count; index += 1) {
    const screenshotPath = resolve(
      screenshotDir,
      `${String(startIndex + index).padStart(2, '0')}-${phase}-${screenshotLabel ?? 'observe'}.png`
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });
    screenshotPaths.push(screenshotPath);
  }

  return screenshotPaths;
};

const buildMarkdownSummary = ({
  url,
  sourceMode,
  label,
  commitSha,
  dirtyWorktree,
  durationSeconds,
  sampleIntervalMs,
  captureScreenshots,
  runtime,
  feed,
  screenshotPaths,
  consoleMessages
}) => {
  const consoleErrors = consoleMessages.filter((entry) => entry.type === 'error' || entry.type === 'pageerror');
  const worstFrame = runtime.frame.worstFrameMs ?? 0;
  const endFrame = runtime.frame.endAverageMs ?? 0;
  const heapLine = runtime.heap
    ? `- Heap used: start ${runtime.heap.startUsedBytes}, end ${runtime.heap.endUsedBytes}, peak ${runtime.heap.peakUsedBytes}`
    : '- Heap used: not available in this browser/runtime';

  return [
    `# Runtime Observe Summary: ${label}`,
    '',
    `- Source: ${sourceMode}`,
    `- URL: ${url}`,
    `- Commit: ${commitSha}${dirtyWorktree ? ' (dirty worktree)' : ''}`,
    `- Duration: ${durationSeconds}s sampled every ${sampleIntervalMs}ms`,
    `- Feed source: structured runtime diagnostics visible entries`,
    `- Screenshot mode: ${captureScreenshots ? 'captured outside the measured window only' : 'disabled during measured window'}`,
    '',
    '## Runtime',
    '',
    `- Samples: ${runtime.sampleCount}`,
    `- Scene instances: ${runtime.sceneInstanceIds.join(', ') || 'none'}`,
    `- Frame time: start ${runtime.frame.startAverageMs}ms, end ${endFrame}ms, worst ${worstFrame}ms, spikes ${runtime.frame.spikeCount}`,
    `- Pressure: tweens ${runtime.pressure.tweens.start} -> ${runtime.pressure.tweens.end}, timers ${runtime.pressure.timers.start} -> ${runtime.pressure.timers.end}, listeners ${runtime.pressure.listeners.start} -> ${runtime.pressure.listeners.end}`,
    `- Bounded counts: trail ${runtime.pressure.trailSegments.max}, feed ${runtime.pressure.visibleIntentEntries.max}, deferred ${runtime.pressure.deferredVisualTasks.max}, moving background ${runtime.pressure.movingBackgroundActors.max}`,
    heapLine,
    '',
    '## Thought Feed',
    '',
    `- Feed samples: ${feed.sampleCount}, snapshots: ${feed.snapshotCount}, unique messages: ${feed.uniqueMessageCount}`,
    `- Status samples: ${feed.visibleFeedSampleCount}, unique statuses: ${feed.uniqueStatusCount}`,
    `- Visible entries: start ${feed.visibleEntryCount.start}, end ${feed.visibleEntryCount.end}, min ${feed.visibleEntryCount.min}, max ${feed.visibleEntryCount.max}, average ${feed.visibleEntryCount.average}`,
    `- Replacements/min: ${feed.replacementsPerMinute}, average dwell ${feed.averageDwellMs}ms, longest unchanged run ${feed.maxUnchangedRunMs}ms`,
    `- Duplicate streak: ${feed.maxDuplicateStreak}`,
    `- Top messages: ${feed.topMessages.map((entry) => `${entry.text} (${entry.snapshotCount})`).join('; ') || 'none captured'}`,
    '',
    '## Artifacts',
    '',
    ...(screenshotPaths.length > 0
      ? screenshotPaths.map((screenshotPath) => `- Screenshot: ${screenshotPath}`)
      : ['- Screenshots: none requested']),
    '',
    '## Caveats',
    '',
    '- Feed metrics come from sampled runtime diagnostics, so sub-sample transient HUD changes may not be represented.',
    '- Perf metrics exclude screenshot capture time because screenshots are taken only before or after the measured interval.',
    '',
    '## Console',
    '',
    `- Messages captured: ${consoleMessages.length}`,
    `- Errors/pageerrors: ${consoleErrors.length}`
  ].join('\n');
};

const appendRuntimeDiagnosticsQuery = (baseUrl) => {
  const url = new URL(normalizeBaseUrl(baseUrl));
  if (!url.searchParams.has('runtimeDiagnostics')) {
    url.searchParams.set('runtimeDiagnostics', '1');
  }
  return url.toString();
};

const captureRuntimeObserve = async ({
  baseUrl,
  timeoutMs,
  durationSeconds,
  sampleIntervalMs,
  screenshotCount,
  captureScreenshots,
  screenshotDir,
  screenshotLabel
}) => {
  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] });
  try {
    const page = await browser.newPage({
      viewport: DEFAULT_VIEWPORT,
      colorScheme: 'dark',
      reducedMotion: 'reduce'
    });
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

    const url = appendRuntimeDiagnosticsQuery(baseUrl);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await waitForRuntimeDiagnostics(page, timeoutMs);

    const screenshotPaths = [];
    const samples = [];
    const totalScreenshotCount = Math.max(0, screenshotCount);
    const preScreenshotCount = captureScreenshots ? Math.ceil(totalScreenshotCount / 2) : 0;
    const postScreenshotCount = captureScreenshots ? Math.max(0, totalScreenshotCount - preScreenshotCount) : 0;

    if (screenshotDir && captureScreenshots) {
      await ensureDir(screenshotDir);
      screenshotPaths.push(...await capturePhaseScreenshots({
        page,
        screenshotDir,
        screenshotLabel,
        phase: 'pre',
        count: preScreenshotCount,
        startIndex: 1
      }));
    }

    const startedAt = Date.now();
    const durationMs = durationSeconds * 1000;
    const finishedAt = startedAt + durationMs;

    while (Date.now() < finishedAt) {
      const elapsedMs = Date.now() - startedAt;
      const diagnostics = await page.evaluate((diagnosticsKey) => window[diagnosticsKey], RUNTIME_DIAGNOSTICS_KEY);
      if (diagnostics) {
        samples.push({
          capturedAt: new Date().toISOString(),
          elapsedMs,
          ...diagnostics
        });
      }

      await sleep(sampleIntervalMs);
    }

    if (screenshotDir && captureScreenshots) {
      screenshotPaths.push(...await capturePhaseScreenshots({
        page,
        screenshotDir,
        screenshotLabel,
        phase: 'post',
        count: postScreenshotCount,
        startIndex: screenshotPaths.length + 1
      }));
    }

    return {
      url,
      consoleMessages,
      samples,
      screenshots: screenshotPaths
    };
  } finally {
    await browser.close();
  }
};

export const runRuntimeObserveCapture = async ({
  baseUrl = DEFAULT_BASE_URL,
  previewTimeoutMs = DEFAULT_PREVIEW_TIMEOUT_MS,
  timeoutMs = DEFAULT_CAPTURE_TIMEOUT_MS,
  artifactRoot = DEFAULT_ARTIFACT_ROOT,
  label = 'latest',
  durationSeconds = DEFAULT_DURATION_SECONDS,
  sampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
  screenshotCount = DEFAULT_SCREENSHOT_COUNT,
  captureScreenshots = DEFAULT_CAPTURE_SCREENSHOTS,
  skipBuild = false,
  useExistingUrl = false
} = {}) => {
  await ensureDir(artifactRoot);

  if (!useExistingUrl && !skipBuild) {
    runNpmCommand(['run', 'build']);
  }

  const sourceMode = useExistingUrl ? 'external-url' : 'local-preview';
  const preview = useExistingUrl
    ? null
    : await launchPreviewServer({
        requestedBaseUrl: baseUrl,
        previewTimeoutMs
      });

  try {
    const resolvedBaseUrl = preview?.baseUrl ?? baseUrl;
    const screenshotDir = resolve(artifactRoot, `${label}.screenshots`);
    const capture = await captureRuntimeObserve({
      baseUrl: resolvedBaseUrl,
      timeoutMs,
      durationSeconds,
      sampleIntervalMs,
      screenshotCount,
      captureScreenshots,
      screenshotDir,
      screenshotLabel: label
    });

    const runtime = buildRuntimeSummary(capture.samples);
    const feed = buildFeedTimelineFromRuntimeSamples(capture.samples);

    const summary = {
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      label,
      source: {
        mode: sourceMode,
        url: capture.url,
        commitSha: getCommitSha(),
        dirtyWorktree: isWorktreeDirty()
      },
      measurement: {
        feedSource: 'runtime-diagnostics.visibleEntries',
        captureScreenshots,
        screenshotsDuringMeasuredWindow: false
      },
      durationSeconds,
      sampleIntervalMs,
      runtime,
      feed,
      consoleMessages: capture.consoleMessages,
      screenshots: capture.screenshots
    };

    const captureArtifact = {
      schemaVersion: 2,
      capturedAt: new Date().toISOString(),
      label,
      durationSeconds,
      sampleIntervalMs,
      source: summary.source,
      url: capture.url,
      samples: capture.samples,
      consoleMessages: capture.consoleMessages,
      screenshots: summary.screenshots
    };

    const summaryPath = resolve(artifactRoot, `${label}.summary.json`);
    const capturePath = resolve(artifactRoot, `${label}.capture.json`);
    const markdownPath = resolve(artifactRoot, `${label}.summary.md`);
    const markdown = buildMarkdownSummary({
      url: capture.url,
      sourceMode,
      label,
      commitSha: summary.source.commitSha,
      dirtyWorktree: summary.source.dirtyWorktree,
      durationSeconds,
      sampleIntervalMs,
      captureScreenshots,
      runtime,
      feed,
      screenshotPaths: summary.screenshots,
      consoleMessages: capture.consoleMessages
    });

    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    await writeFile(capturePath, `${JSON.stringify(captureArtifact, null, 2)}\n`, 'utf8');
    await writeFile(markdownPath, `${markdown}\n`, 'utf8');

    return {
      summaryPath,
      capturePath,
      markdownPath,
      screenshots: summary.screenshots,
      summary
    };
  } finally {
    if (preview) {
      await stopPreviewServer(preview.child);
    }
  }
};

const main = async () => {
  const args = parseCliArgs();
  const result = await runRuntimeObserveCapture({
    baseUrl: args['base-url'] ?? DEFAULT_BASE_URL,
    previewTimeoutMs: parseIntegerArg(args['preview-timeout'], DEFAULT_PREVIEW_TIMEOUT_MS),
    timeoutMs: parseIntegerArg(args.timeout, DEFAULT_CAPTURE_TIMEOUT_MS),
    artifactRoot: typeof args['artifact-root'] === 'string' ? resolve(REPO_ROOT, args['artifact-root']) : DEFAULT_ARTIFACT_ROOT,
    label: typeof args.label === 'string' ? args.label : 'latest',
    durationSeconds: parseIntegerArg(args['duration-seconds'], DEFAULT_DURATION_SECONDS),
    sampleIntervalMs: parseIntegerArg(args['sample-interval-ms'], DEFAULT_SAMPLE_INTERVAL_MS),
    screenshotCount: parseIntegerArg(args['screenshot-count'], DEFAULT_SCREENSHOT_COUNT),
    captureScreenshots: args['capture-screenshots'] === true || args['capture-screenshots'] === 'true',
    skipBuild: args['skip-build'] === true || args['skip-build'] === 'true',
    useExistingUrl: typeof args['base-url'] === 'string'
  });

  process.stdout.write(`${JSON.stringify({
    summaryPath: result.summaryPath,
    capturePath: result.capturePath,
    markdownPath: result.markdownPath,
    screenshots: result.screenshots,
    sampleCount: result.summary.runtime.sampleCount,
    uniqueMessages: result.summary.feed.uniqueMessageCount,
    duplicateStreak: result.summary.feed.maxDuplicateStreak,
    replacementsPerMinute: result.summary.feed.replacementsPerMinute,
    captureScreenshots: result.summary.measurement.captureScreenshots
  }, null, 2)}\n`);
};

if (isDirectRun) {
  main().catch(async (error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
