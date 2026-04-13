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

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

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
  const solutionOverlay = await getLocatorSnapshot(page.getByTestId('stage-solution-overlay'));
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

  if (!diagnostics.trailHeadMatchesPlayer) {
    failures.push('trail-head-sync');
  }

  if (solutionOverlay.present || diagnostics.solutionOverlayVisible) {
    failures.push('solution-overlay-hidden');
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
    trailHeadMatchesPlayer: diagnostics.trailHeadMatchesPlayer,
    solutionOverlayHidden: !solutionOverlay.present && !diagnostics.solutionOverlayVisible,
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

const buildSemanticScore = ({ metadataSeed, sceneScores, recovery, beforeDiagnostics, afterDiagnostics }) => {
  const gates = {
    playerVisibleEveryScene: sceneScores.every((scene) => scene.playerVisible),
    objectiveVisibleEveryScene: sceneScores.every((scene) => scene.objectiveVisible),
    landmarkVisibleEveryScene: sceneScores.every((scene) => scene.landmarkVisible),
    connectorVisibleEveryScene: sceneScores.every((scene) => scene.connectorVisible),
    trailHeadMatchesPlayerEveryScene: sceneScores.every((scene) => scene.trailHeadMatchesPlayer),
    noSolutionOverlayEveryScene: sceneScores.every((scene) => scene.solutionOverlayHidden),
    focusContractMatchedEveryScene: sceneScores.every((scene) => scene.focus.matched),
    nonOmniscientStartTarget: !beforeDiagnostics
      || beforeDiagnostics.currentTargetTileId !== beforeDiagnostics.goalTileId
      || beforeDiagnostics.goalObservedStep === 0,
    goalObservedAfterStart: !afterDiagnostics
      || afterDiagnostics.totalSteps <= 1
      || (afterDiagnostics.goalObservedStep !== null && afterDiagnostics.goalObservedStep > 0),
    recoveryFramePresent: recovery.present,
    recoveryFrameStable: recovery.stable
  };
  const failures = [];

  for (const scene of sceneScores) {
    for (const failure of scene.failures) {
      failures.push(`${scene.stateId}: ${failure}`);
    }
  }

  if (!gates.nonOmniscientStartTarget) {
    failures.push('before: start-target-limited');
  }

  if (!gates.goalObservedAfterStart) {
    failures.push('after: goal-observed-after-start');
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
  const failingGates = failures.map((failure) => {
    if (failure.startsWith('recovery:')) {
      return {
        gateId: 'recovery-stability',
        label: 'Recovery frame stability',
        stateId: 'recovery',
        detail: failure
      };
    }

    const separator = failure.indexOf(': ');
    const stateId = separator >= 0 ? failure.slice(0, separator) : null;
    const gateId = separator >= 0 ? failure.slice(separator + 2) : failure;
    const labels = {
      'player-visible': 'Player visibility',
      'objective-visible': 'Objective visibility',
      'landmark-visible': 'Landmark salience',
      'connector-visible': 'Connector readability',
      'trail-head-sync': 'Trail head sync',
      'solution-overlay-hidden': 'No solution overlay',
      'start-target-limited': 'Non-omniscient start target',
      'goal-observed-after-start': 'Goal observation after step 0',
      'focus-player': 'Player focus contract',
      'focus-objective': 'Objective focus contract',
      'focus-landmark': 'Landmark focus contract',
      'focus-connector': 'Connector focus contract'
    };

    return {
      gateId,
      label: labels[gateId] ?? gateId,
      stateId,
      detail: failure
    };
  });

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
    failingGates,
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
    recovery,
    beforeDiagnostics,
    afterDiagnostics
  });

  const video = page.video();
  await context.close();
  let videoPath = null;
  if (video) {
    const rawVideoPath = await video.path();
    videoPath = await finalizeVideo(rawVideoPath, packet.videoPath);
  }

  await writeReport(packet.reportPath, scenario.report, {
    semanticScore,
    expectedFailures: scenario.expectedFailures ?? []
  });

  const metadata = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    runId,
    commitSha,
    scenario: metadataSeed.scenario,
    viewport,
    source: {
      kind: afterDiagnostics?.sourceKind ?? beforeDiagnostics?.sourceKind ?? 'fallback',
      manifestPath: afterDiagnostics?.manifestPath ?? beforeDiagnostics?.manifestPath ?? null,
      seed: afterDiagnostics?.seed ?? beforeDiagnostics?.seed ?? metadataSeed.scenario.seed ?? null,
      districtType: afterDiagnostics?.districtType ?? beforeDiagnostics?.districtType ?? null,
      canary: afterDiagnostics?.canary ?? beforeDiagnostics?.canary ?? null,
      rotationState: afterDiagnostics?.rotationLabel ?? beforeDiagnostics?.rotationLabel ?? null
    },
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
    },
    explorer: {
      goalObservedStep: afterDiagnostics?.goalObservedStep ?? null,
      replanCount: afterDiagnostics?.replanCount ?? null,
      backtrackCount: afterDiagnostics?.backtrackCount ?? null,
      frontierCount: afterDiagnostics?.frontierCount ?? null,
      tilesDiscovered: afterDiagnostics?.tilesDiscovered ?? null,
      trailHeadMatchesPlayer: afterDiagnostics?.trailHeadMatchesPlayer ?? null
    }
  };

  await writeMetadata(packet.scorePath, semanticScore);
  await writeMetadata(packet.metadataPath, metadata);
  return { metadata, semanticScore };
};

export const runVisualProofSuite = async ({
  baseUrl = DEFAULT_BASE_URL,
  config,
  configPath = 'playwright.visual.config.json',
  artifactRoot,
  previewTimeoutMs = DEFAULT_PREVIEW_TIMEOUT_MS,
  captureTimeoutMs = DEFAULT_CAPTURE_TIMEOUT_MS,
  skipBuild = false,
  runId,
  allowFailures = false
} = {}) => {
  const resolvedConfig = config ?? await readVisualProofConfig(REPO_ROOT, configPath);
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const resolvedArtifactRoot = typeof artifactRoot === 'string' ? artifactRoot : resolvedConfig.artifactRoot;
  const commitSha = getCommitSha();
  const resolvedRunId = resolveRunId(commitSha, runId);
  const previewLogPath = resolve(REPO_ROOT, resolvedArtifactRoot, '_preview.log');

  await ensureDir(resolve(REPO_ROOT, resolvedArtifactRoot));
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
    for (const scenario of resolvedConfig.scenarios) {
      for (const viewport of resolvedConfig.viewports) {
        const packetResult = await captureScenarioPacket({
          browser,
          baseUrl: normalizedBaseUrl,
          config: resolvedConfig,
          artifactRoot: resolvedArtifactRoot,
          scenario,
          viewport,
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

    const { indexPath } = await writeArtifactIndex(REPO_ROOT, resolvedArtifactRoot);
    const summary = {
      runId: resolvedRunId,
      artifactRoot: resolvedArtifactRoot,
      packetCount: packets.length,
      indexPath: relativeFromRepo(REPO_ROOT, indexPath),
      failures,
      packets
    };

    if (failures.length > 0 && !allowFailures) {
      throw new Error(
        `Semantic visual gates failed: ${failures
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
  const summary = await runVisualProofSuite({
    baseUrl: args['base-url'] ?? process.env.MAZER_VISUAL_BASE_URL ?? DEFAULT_BASE_URL,
    configPath: typeof args.config === 'string' ? args.config : 'playwright.visual.config.json',
    artifactRoot: typeof args['artifact-root'] === 'string' ? args['artifact-root'] : undefined,
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
