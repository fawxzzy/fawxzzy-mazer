import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  DEFAULT_BASE_URL,
  DEFAULT_CAPTURE_TIMEOUT_MS,
  DEFAULT_PREVIEW_TIMEOUT_MS,
  REPO_ROOT,
  ensureDir,
  normalizeBaseUrl,
  parseCliArgs,
  parseIntegerArg
} from './common.mjs';
import {
  FUTURE_RUNTIME_ARTIFACT_ROOT,
  DEFAULT_FUTURE_RUNTIME_GATES,
  buildFutureRuntimeSemanticScore,
  evaluateFuturePhaserSnapshot,
  evaluatePlanet3DFrame
} from '../../tools/visual-pipeline/futureRuntime.mjs';
import {
  ensurePacketPaths,
  finalizeVideo,
  relativeFromRepo,
  resolveRunId,
  writeArtifactIndex,
  writeMetadata,
  writeReport
} from '../../tools/visual-pipeline/packets.mjs';
import { renderContactSheet } from '../../tools/visual-pipeline/contactSheet.mjs';

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

const FUTURE_RUNTIME_VIEWPORTS = Object.freeze([
  {
    id: 'desktop',
    label: 'Desktop',
    width: 1440,
    height: 900
  },
  {
    id: 'mobile',
    label: 'Mobile',
    width: 390,
    height: 844
  }
]);

const FUTURE_RUNTIME_SCENARIOS = Object.freeze([
  {
    id: 'future-phaser-content-proof',
    label: 'Future Phaser content proof',
    kind: 'future-phaser',
    route: '/future-phaser.html',
    motion: true,
    report: {
      changed: 'The Phaser future lane now proves trap, Warden, item, and puzzle content inside the runtime packet.',
      regressed: 'This lane is still future-facing and does not replace the shipping proof baseline.',
      better: 'Player readability, objective visibility, world-ping subordination, and signal overload are now machine-checkable.',
      worse: 'The packet remains a bounded adapter proof instead of a full visual parity claim.',
      humanJudgment: 'Confirm the Phaser adapter reads as a deliberate content-proof lane rather than a mirrored visual-proof scene.'
    }
  },
  {
    id: 'planet3d-content-proof',
    label: 'Planet 3D content proof',
    kind: 'planet3d',
    route: '/planet3d.html',
    motion: true,
    report: {
      changed: 'The one-shell prototype now emits proof packets while stepping through discrete rotation states and themed content cues.',
      regressed: 'This does not attempt to prove shell parity against the shipping lane.',
      better: 'The packet shows a recoverable rotation cycle, readable intent feed, a visible objective proxy, and content-proof gating.',
      worse: 'The lane is intentionally compact and does not chase cinematic world coverage.',
      humanJudgment: 'Confirm the final rotation returns to north while the content-proof panel stays readable instead of merely looking stable.'
    }
  }
]);

const resolveCommandSpec = (command, args) => (
  process.platform === 'win32'
    ? { command: 'cmd.exe', args: ['/d', '/s', '/c', `${command} ${args.join(' ')}`] }
    : { command, args }
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

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }

  throw new Error(`Timed out waiting for preview at ${baseUrl}.`);
};

const stopPreview = async (child) => {
  if (!child || child.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    await runCommand('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' }).catch(() => {});
    return;
  }

  child.kill('SIGTERM');
};

const getCommitSha = () => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};

const waitForStep = async (page, bridgeKey, minimumStep, timeoutMs) => {
  await page.waitForFunction(
    ([key, step]) => {
      const runtime = window[key];
      return Boolean(runtime) && Number(runtime.currentStep ?? runtime.snapshot?.currentStep ?? runtime.prototype?.currentFrame?.step ?? 0) >= step;
    },
    [bridgeKey, minimumStep],
    { timeout: timeoutMs }
  );
};

const waitForRuntimeReady = async (page, bridgeKey, timeoutMs) => {
  await page.waitForFunction(
    (key) => Boolean(window[key]),
    bridgeKey,
    { timeout: timeoutMs }
  );
};

const readFuturePhaserSession = async (page, bridgeKey) => page.evaluate((key) => {
  const session = window[key];
  if (!session) {
    return null;
  }

  return {
    currentStep: session.currentStep ?? null,
    isComplete: session.isComplete ?? false,
    ...(session.snapshot ?? {})
  };
}, bridgeKey);

const captureCanvas = async (page, timeoutMs) => {
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ state: 'visible', timeout: timeoutMs });
  return canvas;
};

const resolveDiagnosticStep = (diagnostics) => (
  diagnostics?.stateId
  ?? diagnostics?.currentStep
  ?? diagnostics?.diagnostics?.currentStep
  ?? diagnostics?.diagnostics?.step
  ?? diagnostics?.step
  ?? null
);

const capturePhaserScenario = async ({
  page,
  packet,
  timeoutMs
}) => {
  const canvas = await captureCanvas(page, timeoutMs);
  const bridgeKey = '__MAZER_FUTURE_PHASER__';

  await waitForRuntimeReady(page, bridgeKey, timeoutMs);
  await waitForStep(page, bridgeKey, 1, timeoutMs);

  const beforeDiagnostics = await readFuturePhaserSession(page, bridgeKey);
  await page.screenshot({ path: packet.beforePath, fullPage: false, animations: 'disabled' });

  const keyframeSteps = [2, 3];
  const keyframePaths = [];
  const keyframeDiagnostics = [];
  for (const [index, minimumStep] of keyframeSteps.entries()) {
    await waitForStep(page, bridgeKey, minimumStep, timeoutMs);
    const diagnostics = await readFuturePhaserSession(page, bridgeKey);
    keyframeDiagnostics.push(diagnostics);
    const keyframePath = resolve(packet.keyframesDir, `${String(index + 1).padStart(2, '0')}-step-${minimumStep}.png`);
    await canvas.screenshot({ path: keyframePath, animations: 'disabled' });
    keyframePaths.push({ label: `step-${minimumStep}`, path: keyframePath });
  }

  await waitForFunctionComplete(page, bridgeKey, timeoutMs, 'isComplete');
  const afterDiagnostics = await readFuturePhaserSession(page, bridgeKey);
  await page.screenshot({ path: packet.afterPath, fullPage: false, animations: 'disabled' });
  await canvas.screenshot({ path: packet.focusPath, animations: 'disabled' });
  const browser = page.context().browser();
  if (!browser) {
    throw new Error('Future Phaser contact sheet capture requires an attached browser.');
  }
  await renderContactSheet(browser, {
    frames: keyframePaths,
    outputPath: packet.contactSheetPath,
    title: 'Future Phaser adapter loop'
  });

  return {
    beforeDiagnostics,
    afterDiagnostics,
    keyframeDiagnostics,
    keyframePaths
  };
};

const waitForFunctionComplete = async (page, bridgeKey, timeoutMs, propertyName) => {
  await page.waitForFunction(
    ([key, name]) => Boolean(window[key]) && Boolean(window[key][name]),
    [bridgeKey, propertyName],
    { timeout: timeoutMs }
  );
};

const capturePlanet3DScenario = async ({
  page,
  packet,
  timeoutMs
}) => {
  const canvas = await captureCanvas(page, timeoutMs);
  const bridgeKey = '__MAZER_FUTURE_PLANET3D__';

  await waitForRuntimeReady(page, bridgeKey, timeoutMs);

  const beforeDiagnostics = await page.evaluate((key) => {
    const controller = window[key];
    if (!controller) {
      return null;
    }

    return controller.step();
  }, bridgeKey);
  await page.waitForTimeout(50);
  await page.screenshot({ path: packet.beforePath, fullPage: false, animations: 'disabled' });

  const keyframePaths = [];
  const keyframeDiagnostics = [];
  for (const index of [2, 3]) {
    const diagnostics = await page.evaluate((key) => {
      const controller = window[key];
      if (!controller) {
        return null;
      }

      return controller.step();
    }, bridgeKey);
    keyframeDiagnostics.push(diagnostics);
    await page.waitForTimeout(50);
    const keyframePath = resolve(packet.keyframesDir, `${String(keyframePaths.length + 1).padStart(2, '0')}-step-${index}.png`);
    await canvas.screenshot({ path: keyframePath, animations: 'disabled' });
    keyframePaths.push({ label: `step-${index}`, path: keyframePath });
  }

  const afterDiagnostics = await page.evaluate((key) => {
    const controller = window[key];
    if (!controller) {
      return null;
    }

    return controller.step(12);
  }, bridgeKey);
  await page.waitForTimeout(50);
  await page.screenshot({ path: packet.afterPath, fullPage: false, animations: 'disabled' });
  await canvas.screenshot({ path: packet.focusPath, animations: 'disabled' });
  const browser = page.context().browser();
  if (!browser) {
    throw new Error('Planet3D contact sheet capture requires an attached browser.');
  }
  await renderContactSheet(browser, {
    frames: keyframePaths,
    outputPath: packet.contactSheetPath,
    title: 'Planet 3D rotation recovery'
  });

  return {
    beforeDiagnostics,
    afterDiagnostics,
    keyframeDiagnostics,
    keyframePaths
  };
};

const buildPacketMetadata = ({
  scenario,
  viewport,
  runId,
  commitSha,
  packet,
  beforeDiagnostics,
  afterDiagnostics,
  keyframeDiagnostics,
  keyframePaths,
  semanticScore
}) => ({
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  runId,
  commitSha,
  scenario: {
    id: scenario.id,
    label: scenario.label,
    kind: scenario.kind,
    motion: scenario.motion,
    route: scenario.route
  },
  viewport,
  source: {
    kind: scenario.kind,
    stateId: resolveDiagnosticStep(afterDiagnostics),
    currentStep: afterDiagnostics?.diagnostics?.currentStep ?? afterDiagnostics?.diagnostics?.step ?? afterDiagnostics?.step ?? null,
    rotationState: afterDiagnostics?.diagnostics?.rotationState ?? afterDiagnostics?.rotationState ?? null
  },
  readabilityGates: DEFAULT_FUTURE_RUNTIME_GATES,
  states: {
    before: resolveDiagnosticStep(beforeDiagnostics) ?? 'before',
    after: resolveDiagnosticStep(afterDiagnostics) ?? 'after',
    keyframes: keyframeDiagnostics.map((diagnostics, index) => resolveDiagnosticStep(diagnostics) ?? `keyframe-${index + 1}`)
  },
  diagnostics: {
    before: beforeDiagnostics,
    after: afterDiagnostics,
    keyframes: keyframeDiagnostics
  },
  artifacts: {
    before: relativeFromRepo(REPO_ROOT, packet.beforePath),
    after: relativeFromRepo(REPO_ROOT, packet.afterPath),
    focus: relativeFromRepo(REPO_ROOT, packet.focusPath),
    contactSheet: relativeFromRepo(REPO_ROOT, packet.contactSheetPath),
    keyframes: keyframePaths.map((entry) => relativeFromRepo(REPO_ROOT, entry.path)),
    video: null,
    metadata: relativeFromRepo(REPO_ROOT, packet.metadataPath),
    report: relativeFromRepo(REPO_ROOT, packet.reportPath),
    score: relativeFromRepo(REPO_ROOT, packet.scorePath)
  },
  semanticScore: {
    passed: semanticScore.summary.passed,
    passRatio: semanticScore.summary.passRatio,
    failureCount: semanticScore.failures.length
  },
  runtime: {
    stepCount: afterDiagnostics?.currentStep
      ?? afterDiagnostics?.diagnostics?.currentStep
      ?? afterDiagnostics?.diagnostics?.step
      ?? afterDiagnostics?.step
      ?? afterDiagnostics?.results?.length
      ?? null,
    playerReadable: semanticScore.contract.playerReadableEveryScene,
    objectiveProxyVisible: semanticScore.contract.objectiveProxyVisibleEveryScene,
    intentFeedReadable: semanticScore.contract.intentFeedReadableEveryScene,
    worldPingSubordinate: semanticScore.contract.worldPingSubordinateEveryScene,
    rotationRecovered: semanticScore.contract.rotationRecoveredEveryScene,
    trapInferencePass: semanticScore.contract.trapInferencePassEveryScene,
    wardenReadabilityPass: semanticScore.contract.wardenReadabilityPassEveryScene,
    itemProxyPass: semanticScore.contract.itemProxyPassEveryScene,
    puzzleProxyPass: semanticScore.contract.puzzleProxyPassEveryScene,
    signalOverloadPass: semanticScore.contract.signalOverloadPassEveryScene
  }
});

const captureScenarioPacket = async ({
  browser,
  baseUrl,
  scenario,
  viewport,
  artifactRoot,
  runId,
  commitSha,
  timeoutMs
}) => {
  const packet = await ensurePacketPaths(REPO_ROOT, artifactRoot, scenario.id, viewport.id, runId);
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    recordVideo: scenario.motion
      ? {
          dir: packet.packetDir,
          size: { width: viewport.width, height: viewport.height }
        }
      : undefined
  });

  const page = await context.newPage();
  const url = `${normalizeBaseUrl(baseUrl)}${scenario.route}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

  let captureResult;
  try {
    if (scenario.kind === 'future-phaser') {
      captureResult = await capturePhaserScenario({ page, packet, timeoutMs });
    } else if (scenario.kind === 'planet3d') {
      captureResult = await capturePlanet3DScenario({ page, packet, timeoutMs });
    } else {
      throw new Error(`Unsupported future runtime scenario kind: ${scenario.kind}`);
    }

    const beforeDiagnostics = captureResult.beforeDiagnostics;
    const afterDiagnostics = captureResult.afterDiagnostics;
    const keyframeDiagnostics = captureResult.keyframeDiagnostics;
    const sceneScores = [
      afterDiagnostics
    ].filter(Boolean).map((diagnostics) => (
      scenario.kind === 'future-phaser'
        ? evaluateFuturePhaserSnapshot(diagnostics)
        : evaluatePlanet3DFrame(diagnostics)
    ));
    const semanticScore = buildFutureRuntimeSemanticScore({
      metadataSeed: {
        scenario: {
          id: scenario.id,
          label: scenario.label,
          kind: scenario.kind,
          motion: scenario.motion,
          route: scenario.route
        },
        viewport,
        runId
      },
      sceneScores
    });
    const metadata = buildPacketMetadata({
      scenario,
      viewport,
      runId,
      commitSha,
      packet,
      beforeDiagnostics,
      afterDiagnostics,
      keyframeDiagnostics,
      keyframePaths: captureResult.keyframePaths,
      semanticScore
    });

    const video = page.video();
    await context.close();
    let videoPath = null;
    if (video) {
      const rawVideoPath = await video.path();
      videoPath = await finalizeVideo(rawVideoPath, packet.videoPath);
    }
    metadata.artifacts.video = videoPath ? relativeFromRepo(REPO_ROOT, videoPath) : null;

    await writeReport(packet.reportPath, scenario.report, {
      semanticScore,
      expectedFailures: []
    });
    await writeMetadata(packet.scorePath, semanticScore);
    await writeMetadata(packet.metadataPath, metadata);

    return {
      metadata,
      semanticScore
    };
  } finally {
    await context.close().catch(() => {});
  }
};

export const runFutureRuntimeProofSuite = async ({
  baseUrl = DEFAULT_BASE_URL,
  artifactRoot = FUTURE_RUNTIME_ARTIFACT_ROOT,
  previewTimeoutMs = DEFAULT_PREVIEW_TIMEOUT_MS,
  captureTimeoutMs = DEFAULT_CAPTURE_TIMEOUT_MS,
  skipBuild = false,
  runId,
  allowFailures = false
} = {}) => {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const commitSha = getCommitSha();
  const resolvedRunId = resolveRunId(commitSha, runId);
  const previewLogPath = resolve(REPO_ROOT, artifactRoot, '_preview.log');

  await ensureDir(resolve(REPO_ROOT, artifactRoot));
  const previewLog = createWriteStream(previewLogPath, { flags: 'a' });

  if (!skipBuild) {
    await runCommand('npm', ['run', 'build']);
  }

  const previewCommand = resolveCommandSpec('npm', ['run', 'preview']);
  const previewChild = spawn(previewCommand.command, previewCommand.args, {
    cwd: REPO_ROOT,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  previewChild.stdout?.on('data', (chunk) => {
    previewLog.write(chunk);
    process.stdout.write(String(chunk));
  });
  previewChild.stderr?.on('data', (chunk) => {
    previewLog.write(chunk);
    process.stderr.write(String(chunk));
  });

  const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader'] });

  try {
    await waitForPreview(normalizedBaseUrl, previewTimeoutMs, previewChild);

    const packets = [];
    const failures = [];
    for (const scenario of FUTURE_RUNTIME_SCENARIOS) {
      for (const viewport of FUTURE_RUNTIME_VIEWPORTS) {
        const packetResult = await captureScenarioPacket({
          browser,
          baseUrl: normalizedBaseUrl,
          scenario,
          viewport,
          artifactRoot,
          runId: resolvedRunId,
          commitSha,
          timeoutMs: captureTimeoutMs
        });
        packets.push(packetResult);
        if (!packetResult.semanticScore.summary.passed) {
          failures.push({
            scenarioId: scenario.id,
            viewportId: viewport.id,
            failures: packetResult.semanticScore.failures
          });
        }
      }
    }

    const { indexPath } = await writeArtifactIndex(REPO_ROOT, artifactRoot);
    const summary = {
      runId: resolvedRunId,
      artifactRoot,
      packetCount: packets.length,
      indexPath: relativeFromRepo(REPO_ROOT, indexPath),
      failures,
      packets
    };

    if (failures.length > 0 && !allowFailures) {
      throw new Error(
        `Future runtime semantic gates failed: ${failures
          .map((entry) => `${entry.scenarioId}/${entry.viewportId}: ${entry.failures.join(', ')}`)
          .join('; ')}`
      );
    }

    return summary;
  } finally {
    await browser.close();
    await stopPreview(previewChild);
    previewLog.end();
  }
};

const main = async () => {
  const args = parseCliArgs();
  const summary = await runFutureRuntimeProofSuite({
    baseUrl: args['base-url'] ?? process.env.MAZER_VISUAL_BASE_URL ?? DEFAULT_BASE_URL,
    artifactRoot: typeof args['artifact-root'] === 'string'
      ? args['artifact-root']
      : FUTURE_RUNTIME_ARTIFACT_ROOT,
    previewTimeoutMs: parseIntegerArg(args['preview-timeout'], DEFAULT_PREVIEW_TIMEOUT_MS),
    captureTimeoutMs: parseIntegerArg(args.timeout, DEFAULT_CAPTURE_TIMEOUT_MS),
    skipBuild: args['skip-build'] === true || args['skip-build'] === 'true',
    runId: typeof args.run === 'string' ? args.run : undefined,
    allowFailures: args['allow-failures'] === true || args['allow-failures'] === 'true'
  });

  process.stdout.write(`${JSON.stringify({
    runId: summary.runId,
    artifactRoot: summary.artifactRoot,
    packetCount: summary.packetCount,
    indexPath: summary.indexPath,
    failureCount: summary.failures.length
  }, null, 2)}\n`);
};

if (isDirectRun) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
