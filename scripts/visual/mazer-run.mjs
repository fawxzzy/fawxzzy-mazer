import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
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
import { readVisualProofConfig } from '../../tools/visual-pipeline/config.mjs';
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

const getLocatorSnapshot = async (locator, attributeName) => {
  const count = await locator.count();
  if (count === 0) {
    return {
      present: false,
      visible: false,
      value: null,
      box: null
    };
  }

  const target = locator.first();
  const box = await target.boundingBox();
  return {
    present: true,
    visible: Boolean(box && box.width > 0 && box.height > 0),
    value: attributeName ? await target.getAttribute(attributeName) : null,
    box
  };
};

const evaluateFocusContract = async (page, diagnostics) => {
  const target = diagnostics.semanticGate.focusTarget;
  if (target === 'player') {
    const snapshot = await getLocatorSnapshot(page.getByTestId('focus-player'));
    return {
      target,
      matched: snapshot.visible,
      details: snapshot
    };
  }

  if (target === 'objective') {
    const snapshot = await getLocatorSnapshot(page.getByTestId('focus-objective'));
    return {
      target,
      matched: diagnostics.objectiveVisible ? snapshot.visible : !snapshot.present,
      details: snapshot
    };
  }

  if (target === 'landmark') {
    const snapshot = await getLocatorSnapshot(page.getByTestId('focus-landmark'), 'data-landmark-id');
    return {
      target,
      matched: snapshot.visible && snapshot.value === diagnostics.semanticGate.landmarkId,
      details: snapshot
    };
  }

  const snapshot = await getLocatorSnapshot(page.getByTestId('focus-connector'), 'data-connector-id');
  return {
    target,
    matched: snapshot.visible && snapshot.value === diagnostics.semanticGate.connectorId,
    details: snapshot
  };
};

const evaluateSceneContracts = async (page, diagnostics) => {
  const player = await getLocatorSnapshot(page.getByTestId('stage-player'));
  const objective = await getLocatorSnapshot(page.getByTestId('stage-objective'));
  const landmark = await getLocatorSnapshot(page.getByTestId('stage-landmark'), 'data-landmark-id');
  const connector = await getLocatorSnapshot(page.getByTestId('stage-connector'), 'data-connector-id');
  const focus = await evaluateFocusContract(page, diagnostics);
  const failures = [];

  if (!player.visible) {
    failures.push('player-visible');
  }

  if (diagnostics.objectiveVisible && !objective.visible) {
    failures.push('objective-visible');
  }

  if (!landmark.visible || landmark.value !== diagnostics.semanticGate.landmarkId) {
    failures.push('landmark-visible');
  }

  if (!connector.visible || connector.value !== diagnostics.semanticGate.connectorId) {
    failures.push('connector-visible');
  }

  if (!focus.matched) {
    failures.push(`focus-${focus.target}`);
  }

  return {
    stateId: diagnostics.stateId,
    caption: diagnostics.caption,
    connectorState: diagnostics.semanticGate.connectorState,
    playerVisible: player.visible,
    objectiveVisible: diagnostics.objectiveVisible ? objective.visible : true,
    landmarkVisible: landmark.visible && landmark.value === diagnostics.semanticGate.landmarkId,
    connectorVisible: connector.visible && connector.value === diagnostics.semanticGate.connectorId,
    focus,
    failures,
    passed: failures.length === 0
  };
};

const evaluateRecoveryFrame = async ({ page, config, setState, recoveryStateId }) => {
  if (!recoveryStateId) {
    return {
      stateId: null,
      present: true,
      stable: true,
      stageStable: true,
      focusStable: true
    };
  }

  const diagnostics = await setState(recoveryStateId);
  const stageLocator = page.locator(config.selectors.stage);
  const focusLocator = page.locator(config.selectors.focus);
  const stageFirst = await stageLocator.screenshot({ animations: 'disabled' });
  const focusFirst = await focusLocator.screenshot({ animations: 'disabled' });
  await page.waitForTimeout(140);
  const stageSecond = await stageLocator.screenshot({ animations: 'disabled' });
  const focusSecond = await focusLocator.screenshot({ animations: 'disabled' });
  const stageStable = stageFirst.equals(stageSecond);
  const focusStable = focusFirst.equals(focusSecond);

  return {
    stateId: diagnostics?.stateId ?? recoveryStateId,
    present: diagnostics?.stateId === recoveryStateId,
    stable: stageStable && focusStable,
    stageStable,
    focusStable
  };
};

const buildSemanticScore = ({ metadataSeed, sceneScores, recovery }) => {
  const gates = {
    playerVisibleEveryScene: sceneScores.every((scene) => scene.playerVisible),
    objectiveVisibleEveryScene: sceneScores.every((scene) => scene.objectiveVisible),
    landmarkVisibleEveryScene: sceneScores.every((scene) => scene.landmarkVisible),
    connectorVisibleEveryScene: sceneScores.every((scene) => scene.connectorVisible),
    focusContractMatchedEveryScene: sceneScores.every((scene) => scene.focus.matched),
    recoveryFramePresent: recovery.present,
    recoveryFrameStable: recovery.stable
  };
  const failures = [];

  for (const scene of sceneScores) {
    for (const failure of scene.failures) {
      failures.push(`${scene.stateId}: ${failure}`);
    }
  }

  if (!recovery.present) {
    failures.push(`recovery: missing ${recovery.stateId ?? 'expected-state'}`);
  }

  if (!recovery.stable) {
    failures.push(`recovery: unstable frame (stage=${recovery.stageStable}, focus=${recovery.focusStable})`);
  }

  const gateValues = Object.values(gates);
  const passedGateCount = gateValues.filter(Boolean).length;
  const totalGateCount = gateValues.length;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    scenario: metadataSeed.scenario,
    viewport: metadataSeed.viewport,
    runId: metadataSeed.runId,
    summary: {
      passed: gateValues.every(Boolean),
      passedGateCount,
      totalGateCount,
      requiredSceneCount: sceneScores.length,
      scenePassCount: sceneScores.filter((scene) => scene.passed).length,
      passRatio: Number((passedGateCount / totalGateCount).toFixed(3))
    },
    gates,
    recovery,
    failures,
    scenes: sceneScores
  };
};

const captureScenarioPacket = async ({
  browser,
  baseUrl,
  config,
  artifactRoot,
  scenario,
  viewport,
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
  const url = `${normalizeBaseUrl(baseUrl)}${scenario.route}${scenario.route.includes('?') ? '&' : '?'}viewport=${encodeURIComponent(viewport.id)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await page.waitForFunction(() => Boolean(window.__MAZER_VISUAL_PROOF__?.ready), null, { timeout: timeoutMs });
  const sceneScoresByState = new Map();

  const setState = async (stateId) => {
    const diagnostics = await page.evaluate(async (value) => {
      return await window.__MAZER_VISUAL_PROOF__?.setState(value);
    }, stateId);
    return diagnostics;
  };

  const rememberSceneScore = async (diagnostics) => {
    if (diagnostics && !sceneScoresByState.has(diagnostics.stateId)) {
      sceneScoresByState.set(diagnostics.stateId, await evaluateSceneContracts(page, diagnostics));
    }
  };

  const beforeDiagnostics = await setState(scenario.beforeState);
  await rememberSceneScore(beforeDiagnostics);
  await page.screenshot({ path: packet.beforePath, fullPage: false, animations: 'disabled' });

  const keyframePaths = [];
  for (const [index, stateId] of scenario.keyframes.entries()) {
    const diagnostics = await setState(stateId);
    await rememberSceneScore(diagnostics);
    const keyframePath = resolve(packet.keyframesDir, `${String(index + 1).padStart(2, '0')}-${stateId}.png`);
    await page.locator(config.selectors.stage).screenshot({ path: keyframePath, animations: 'disabled' });
    keyframePaths.push({ label: stateId, path: keyframePath });
  }

  if (scenario.motion) {
    await setState(scenario.beforeState);
    await page.evaluate(async () => {
      await window.__MAZER_VISUAL_PROOF__?.playMotion();
    });
  }

  const afterDiagnostics = await setState(scenario.afterState);
  await rememberSceneScore(afterDiagnostics);
  await page.screenshot({ path: packet.afterPath, fullPage: false, animations: 'disabled' });
  await page.locator(config.selectors.focus).screenshot({ path: packet.focusPath, animations: 'disabled' });
  await renderContactSheet(browser, {
    frames: keyframePaths,
    outputPath: packet.contactSheetPath,
    title: `${scenario.label} :: ${viewport.label}`
  });

  const recovery = await evaluateRecoveryFrame({
    page,
    config,
    setState,
    recoveryStateId: scenario.motion ? (afterDiagnostics?.semanticGate?.recoveryStateId ?? null) : null
  });
  const recoveryDiagnostics = recovery.stateId ? await page.evaluate(() => window.__MAZER_VISUAL_PROOF__?.getDiagnostics()) : null;
  await rememberSceneScore(recoveryDiagnostics);

  const orderedSceneIds = [...new Set([
    scenario.beforeState,
    ...scenario.keyframes,
    scenario.afterState,
    recovery.stateId
  ].filter(Boolean))];
  const sceneScores = orderedSceneIds
    .map((stateId) => sceneScoresByState.get(stateId))
    .filter(Boolean);

  const metadataSeed = {
    scenario: {
      id: scenario.id,
      label: scenario.label,
      motion: scenario.motion,
      route: scenario.route,
      seed: scenario.seed,
      authFixture: scenario.authFixture
    },
    viewport,
    runId
  };
  const semanticScore = buildSemanticScore({
    metadataSeed,
    sceneScores,
    recovery
  });

  const video = page.video();
  await context.close();
  let videoPath = null;
  if (video) {
    const rawVideoPath = await video.path();
    videoPath = await finalizeVideo(rawVideoPath, packet.videoPath);
  }

  await writeReport(packet.reportPath, scenario.report);

  const metadata = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    runId,
    commitSha,
    scenario: metadataSeed.scenario,
    viewport,
    states: {
      before: scenario.beforeState,
      after: scenario.afterState,
      keyframes: scenario.keyframes
    },
    diagnostics: {
      before: beforeDiagnostics,
      after: afterDiagnostics
    },
    artifacts: {
      before: relativeFromRepo(REPO_ROOT, packet.beforePath),
      after: relativeFromRepo(REPO_ROOT, packet.afterPath),
      focus: relativeFromRepo(REPO_ROOT, packet.focusPath),
      contactSheet: relativeFromRepo(REPO_ROOT, packet.contactSheetPath),
      keyframes: keyframePaths.map((entry) => relativeFromRepo(REPO_ROOT, entry.path)),
      video: videoPath ? relativeFromRepo(REPO_ROOT, videoPath) : null,
      metadata: relativeFromRepo(REPO_ROOT, packet.metadataPath),
      report: relativeFromRepo(REPO_ROOT, packet.reportPath),
      score: relativeFromRepo(REPO_ROOT, packet.scorePath)
    },
    semanticScore: {
      passed: semanticScore.summary.passed,
      passRatio: semanticScore.summary.passRatio,
      failureCount: semanticScore.failures.length
    }
  };

  await writeMetadata(packet.scorePath, semanticScore);
  await writeMetadata(packet.metadataPath, metadata);
  return { metadata, semanticScore };
};

const main = async () => {
  const args = parseCliArgs();
  const config = await readVisualProofConfig(REPO_ROOT);
  const normalizedBaseUrl = normalizeBaseUrl(args['base-url'] ?? process.env.MAZER_VISUAL_BASE_URL ?? DEFAULT_BASE_URL);
  const artifactRoot = typeof args['artifact-root'] === 'string' ? args['artifact-root'] : config.artifactRoot;
  const previewTimeoutMs = parseIntegerArg(args['preview-timeout'], DEFAULT_PREVIEW_TIMEOUT_MS);
  const captureTimeoutMs = parseIntegerArg(args.timeout, DEFAULT_CAPTURE_TIMEOUT_MS);
  const skipBuild = args['skip-build'] === true || args['skip-build'] === 'true';
  const commitSha = getCommitSha();
  const runId = resolveRunId(commitSha, typeof args.run === 'string' ? args.run : undefined);
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
    for (const scenario of config.scenarios) {
      for (const viewport of config.viewports) {
        const packetResult = await captureScenarioPacket({
          browser,
          baseUrl: normalizedBaseUrl,
          config,
          artifactRoot,
          scenario,
          viewport,
          runId,
          commitSha,
          timeoutMs: captureTimeoutMs
        });
        packets.push(packetResult.metadata);
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
    if (failures.length > 0) {
      throw new Error(
        `Semantic visual gates failed: ${failures
          .map((entry) => `${entry.scenarioId}/${entry.viewportId}: ${entry.failures.join(', ')}`)
          .join('; ')}`
      );
    }

    process.stdout.write(`${JSON.stringify({
      runId,
      artifactRoot,
      packetCount: packets.length,
      indexPath: relativeFromRepo(REPO_ROOT, indexPath)
    }, null, 2)}\n`);
  } finally {
    await browser.close();
    await stopPreview(previewChild);
    previewLog.end();
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
