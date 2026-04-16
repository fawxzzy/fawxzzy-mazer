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
import { launchPreviewServer, stopPreviewServer } from './preview-server.mjs';
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
const VISUAL_PROOF_SOURCE_PATH = 'scripts/visual/mazer-run.mjs';
const DEFAULT_READABILITY_GATES = Object.freeze({
  trailHeadGapPx: 0.75,
  minimumNonTextContrast: 3,
  minimumPlayerDominance: 1.15,
  minimumObjectiveHueDelta: 40,
  minimumTrailActiveVsOldContrast: 1.25,
  minimumTrailActiveWidthRatio: 1.25
});

const resolveCommandSpec = (command, args) => (
  process.platform === 'win32'
    ? { command: 'cmd.exe', args: ['/d', '/s', '/c', `${command} ${args.join(' ')}`] }
    : { command, args }
);

const writeCaptureTrace = (previewLog, event) => {
  const line = `[visual-proof] ${JSON.stringify({
    timestamp: new Date().toISOString(),
    ...event
  })}\n`;
  previewLog?.write(line);
  process.stdout.write(line);
};

const resolveProofAppLocator = (page) => page.locator('main.proof-app');

const waitForVisualProofState = async (page, expectedStateId, timeoutMs) => {
  await page.waitForFunction((stateId) => (
    Boolean(window.__MAZER_VISUAL_PROOF__?.getDiagnostics?.()?.stateId === stateId)
  ), expectedStateId, { timeout: timeoutMs });
};

const captureClippedScreenshot = async (page, locator, path, timeoutMs) => {
  await locator.waitFor({ state: 'visible', timeout: timeoutMs });
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(`Could not resolve a visible capture box for ${path}.`);
  }

  await page.screenshot({
    path,
    clip: box,
    animations: 'disabled'
  });
};

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

  if (diagnostics.readability.trailHeadGapPx > diagnostics.readabilityGates.trailHeadGapPx) {
    failures.push('trail-head-gap');
  }

  if (!diagnostics.readability.trailContrastPass) {
    failures.push('trail-contrast');
  }

  if (!diagnostics.readability.playerDominancePass) {
    failures.push('player-dominance');
  }

  if (!diagnostics.readability.objectiveSeparationPass) {
    failures.push('objective-separation');
  }

  if (!diagnostics.intentFeed.metrics.intentDebouncePass) {
    failures.push('intent-debounce');
  }

  if (!diagnostics.intentFeed.metrics.worldPingSpamPass) {
    failures.push('world-ping-spam');
  }

  if (!diagnostics.intentFeed.metrics.feedReadabilityPass) {
    failures.push('feed-readability');
  }

  if (!diagnostics.intentFeed.layout?.intentStackOverlapPass) {
    failures.push('intent-stack-overlap');
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
    intentFeed: diagnostics.intentFeed,
    readability: diagnostics.readability,
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
  const stageFirst = await stageLocator.innerHTML();
  const focusFirst = await focusLocator.innerHTML();
  await page.waitForTimeout(140);
  const stageSecond = await stageLocator.innerHTML();
  const focusSecond = await focusLocator.innerHTML();
  const stageStable = stageFirst === stageSecond;
  const focusStable = focusFirst === focusSecond;

  return {
    stateId: diagnostics?.stateId ?? recoveryStateId,
    present: diagnostics?.stateId === recoveryStateId,
    stable: stageStable && focusStable,
    stageStable,
    focusStable
  };
};

const buildSemanticScore = ({ metadataSeed, sceneScores, recovery, beforeDiagnostics, afterDiagnostics, readabilityGates }) => {
  const resolvedReadabilityGates = { ...DEFAULT_READABILITY_GATES, ...(readabilityGates ?? {}) };
  const motionSummary = afterDiagnostics?.motionSummary ?? null;
  const maxTrailHeadGapPx = motionSummary?.sampleCount
    ? motionSummary.maxTrailHeadGapPx
    : Math.max(...sceneScores.map((scene) => scene.readability.trailHeadGapPx), 0);
  const gates = {
    trailHeadGapPx: maxTrailHeadGapPx <= resolvedReadabilityGates.trailHeadGapPx,
    trailContrastPass: sceneScores.every((scene) => scene.readability.trailContrastPass) && (motionSummary ? motionSummary.trailContrastPass : true),
    playerDominancePass: sceneScores.every((scene) => scene.readability.playerDominancePass) && (motionSummary ? motionSummary.playerDominancePass : true),
    objectiveSeparationPass: sceneScores.every((scene) => scene.readability.objectiveSeparationPass) && (motionSummary ? motionSummary.objectiveSeparationPass : true),
    intentDebouncePass: sceneScores.every((scene) => scene.intentFeed.metrics.intentDebouncePass),
    worldPingSpamPass: sceneScores.every((scene) => scene.intentFeed.metrics.worldPingSpamPass),
    feedReadabilityPass: sceneScores.every((scene) => scene.intentFeed.metrics.feedReadabilityPass),
    intentStackOverlapPass: sceneScores.every((scene) => scene.intentFeed.layout?.intentStackOverlapPass ?? scene.intentFeed.metrics.intentStackOverlapPass),
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

  if (motionSummary?.sampleCount && maxTrailHeadGapPx > resolvedReadabilityGates.trailHeadGapPx) {
    failures.push('motion: trail-head-gap');
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
      'trail-head-gap': 'Trail head tether',
      'trail-contrast': 'Trail contrast',
      'player-dominance': 'Player dominance',
      'objective-separation': 'Objective separation',
      'intent-debounce': 'Intent feed debounce',
      'world-ping-spam': 'World ping cadence',
      'feed-readability': 'Feed readability',
      'intent-stack-overlap': 'Intent stack overlap',
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
    readability: {
      gates: resolvedReadabilityGates,
      maxTrailHeadGapPx,
      motionSummary
    },
    intent: {
      intentEmissionRate: Number((sceneScores.at(-1)?.intentFeed.metrics.intentEmissionRate ?? 0).toFixed(3)),
      emittedCount: sceneScores.at(-1)?.intentFeed.metrics.emittedCount ?? 0,
      highImportanceEventCount: sceneScores.at(-1)?.intentFeed.metrics.highImportanceEventCount ?? 0,
      worldPingCount: sceneScores.at(-1)?.intentFeed.metrics.worldPingCount ?? 0,
      worldPingEmissionRate: Number((sceneScores.at(-1)?.intentFeed.metrics.worldPingEmissionRate ?? 0).toFixed(3))
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
  timeoutMs,
  previewLog
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
  writeCaptureTrace(previewLog, {
    phase: 'packet-start',
    scenarioId: scenario.id,
    scenarioLabel: scenario.label,
    viewportId: viewport.id,
    viewportLabel: viewport.label,
    stateId: null,
    artifactRoot,
    packetPath: relativeFromRepo(REPO_ROOT, packet.packetDir)
  });
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
  await waitForVisualProofState(page, scenario.beforeState, timeoutMs);
  await rememberSceneScore(beforeDiagnostics);
  writeCaptureTrace(previewLog, {
    phase: 'before-screenshot',
    scenarioId: scenario.id,
    viewportId: viewport.id,
    stateId: beforeDiagnostics?.stateId ?? scenario.beforeState,
    artifactRoot,
    packetPath: relativeFromRepo(REPO_ROOT, packet.packetDir),
    target: 'main.proof-app'
  });
  await captureClippedScreenshot(page, resolveProofAppLocator(page), packet.beforePath, timeoutMs);

  const keyframePaths = [];
  for (const [index, stateId] of scenario.keyframes.entries()) {
    const diagnostics = await setState(stateId);
    await waitForVisualProofState(page, stateId, timeoutMs);
    await rememberSceneScore(diagnostics);
    const keyframePath = resolve(packet.keyframesDir, `${String(index + 1).padStart(2, '0')}-${stateId}.png`);
    writeCaptureTrace(previewLog, {
      phase: 'keyframe-screenshot',
      scenarioId: scenario.id,
      viewportId: viewport.id,
      stateId,
      artifactRoot,
      packetPath: relativeFromRepo(REPO_ROOT, packet.packetDir),
      target: config.selectors.stage,
      keyframeIndex: index + 1
    });
    await captureClippedScreenshot(page, page.locator(config.selectors.stage), keyframePath, timeoutMs);
    keyframePaths.push({ label: stateId, path: keyframePath });
  }

  if (scenario.motion) {
    await setState(scenario.beforeState);
    await page.evaluate(async () => {
      await window.__MAZER_VISUAL_PROOF__?.playMotion();
    });
  }

  const afterDiagnostics = await setState(scenario.afterState);
  await waitForVisualProofState(page, scenario.afterState, timeoutMs);
  await rememberSceneScore(afterDiagnostics);
  writeCaptureTrace(previewLog, {
    phase: 'after-screenshot',
    scenarioId: scenario.id,
    viewportId: viewport.id,
    stateId: afterDiagnostics?.stateId ?? scenario.afterState,
    artifactRoot,
    packetPath: relativeFromRepo(REPO_ROOT, packet.packetDir),
    target: 'main.proof-app'
  });
  await captureClippedScreenshot(page, resolveProofAppLocator(page), packet.afterPath, timeoutMs);
  writeCaptureTrace(previewLog, {
    phase: 'focus-screenshot',
    scenarioId: scenario.id,
    viewportId: viewport.id,
    stateId: afterDiagnostics?.stateId ?? scenario.afterState,
    artifactRoot,
    packetPath: relativeFromRepo(REPO_ROOT, packet.packetDir),
    target: config.selectors.focus
  });
  await captureClippedScreenshot(page, page.locator(config.selectors.focus), packet.focusPath, timeoutMs);
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
  writeCaptureTrace(previewLog, {
    phase: 'packet-complete',
    scenarioId: scenario.id,
    viewportId: viewport.id,
    stateId: recovery.stateId ?? afterDiagnostics?.stateId ?? scenario.afterState,
    artifactRoot,
    packetPath: relativeFromRepo(REPO_ROOT, packet.packetDir)
  });

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
    afterDiagnostics,
    readabilityGates: config.readabilityGates
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
    readabilityGates: config.readabilityGates ?? DEFAULT_READABILITY_GATES,
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
    readability: {
      trailHeadGapPx: afterDiagnostics?.readability?.trailHeadGapPx ?? null,
      trailContrastPass: afterDiagnostics?.readability?.trailContrastPass ?? null,
      playerDominancePass: afterDiagnostics?.readability?.playerDominancePass ?? null,
      objectiveSeparationPass: afterDiagnostics?.readability?.objectiveSeparationPass ?? null,
      motionSummary: afterDiagnostics?.motionSummary ?? null
    },
    intent: {
      visibleEntryCount: afterDiagnostics?.intentFeed?.entries?.length ?? 0,
      visibleWorldPingCount: afterDiagnostics?.intentFeed?.pings?.length ?? 0,
      intentEmissionRate: afterDiagnostics?.intentFeed?.metrics?.intentEmissionRate ?? null,
      worldPingEmissionRate: afterDiagnostics?.intentFeed?.metrics?.worldPingEmissionRate ?? null,
      intentDebouncePass: afterDiagnostics?.intentFeed?.metrics?.intentDebouncePass ?? null,
      worldPingSpamPass: afterDiagnostics?.intentFeed?.metrics?.worldPingSpamPass ?? null,
      feedReadabilityPass: afterDiagnostics?.intentFeed?.metrics?.feedReadabilityPass ?? null,
      intentStackOverlapPass: afterDiagnostics?.intentFeed?.layout?.intentStackOverlapPass ?? null
    },
    explorer: {
      goalObservedStep: afterDiagnostics?.goalObservedStep ?? null,
      replanCount: afterDiagnostics?.replanCount ?? null,
      backtrackCount: afterDiagnostics?.backtrackCount ?? null,
      frontierCount: afterDiagnostics?.frontierCount ?? null,
      tilesDiscovered: afterDiagnostics?.tilesDiscovered ?? null,
      trailHeadMatchesPlayer: afterDiagnostics?.trailHeadMatchesPlayer ?? null,
      policyScorerId: afterDiagnostics?.policyScorerId ?? null,
      policyEpisodeCount: afterDiagnostics?.policyEpisodeCount ?? 0,
      policyEpisodes: afterDiagnostics?.policyEpisodes ?? []
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
  const requestedBaseUrl = normalizeBaseUrl(baseUrl);
  const resolvedArtifactRoot = typeof artifactRoot === 'string' ? artifactRoot : resolvedConfig.artifactRoot;
  const commitSha = getCommitSha();
  const resolvedRunId = resolveRunId(commitSha, runId);
  const previewLogPath = resolve(REPO_ROOT, resolvedArtifactRoot, '_preview.log');

  await ensureDir(resolve(REPO_ROOT, resolvedArtifactRoot));
  const previewLog = createWriteStream(previewLogPath, { flags: 'a' });

  if (!skipBuild) {
    await runCommand('npm', ['run', 'build']);
  }

  const preview = await launchPreviewServer({
    requestedBaseUrl,
    previewTimeoutMs,
    previewLog
  });

  const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader'] });

  try {
    const packets = [];
    const failures = [];
    for (const scenario of resolvedConfig.scenarios) {
      for (const viewport of resolvedConfig.viewports) {
        const packetResult = await captureScenarioPacket({
          browser,
          baseUrl: preview.baseUrl,
          config: resolvedConfig,
          artifactRoot: resolvedArtifactRoot,
          scenario,
          viewport,
          runId: resolvedRunId,
          commitSha,
          timeoutMs: captureTimeoutMs,
          previewLog
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
    await stopPreviewServer(preview.child);
    previewLog.end();
  }
};

const buildVisualProofGateResult = (summary) => ({
  schemaVersion: 1,
  ok: summary.failures.length === 0,
  runId: summary.runId,
  artifactRoot: summary.artifactRoot,
  packetCount: summary.packetCount,
  indexPath: summary.indexPath,
  failureCount: summary.failures.length,
  failures: summary.failures,
  sourceFilePath: VISUAL_PROOF_SOURCE_PATH
});

export const runVisualProofGate = async (options = {}) => {
  const summary = await runVisualProofSuite({
    ...options,
    allowFailures: true
  });

  return buildVisualProofGateResult(summary);
};

const main = async () => {
  const args = parseCliArgs();
  const result = await runVisualProofGate({
    baseUrl: args['base-url'] ?? process.env.MAZER_VISUAL_BASE_URL ?? DEFAULT_BASE_URL,
    configPath: typeof args.config === 'string' ? args.config : 'playwright.visual.config.json',
    artifactRoot: typeof args['artifact-root'] === 'string' ? args['artifact-root'] : undefined,
    previewTimeoutMs: parseIntegerArg(args['preview-timeout'], DEFAULT_PREVIEW_TIMEOUT_MS),
    captureTimeoutMs: parseIntegerArg(args.timeout, DEFAULT_CAPTURE_TIMEOUT_MS),
    skipBuild: args['skip-build'] === true || args['skip-build'] === 'true',
    runId: typeof args.run === 'string' ? args.run : undefined
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (!result.ok && !(args['allow-failures'] === true || args['allow-failures'] === 'true')) {
    process.exitCode = 1;
  }
};

if (isDirectRun) {
  main().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}

export {
  VISUAL_PROOF_SOURCE_PATH,
  buildVisualProofGateResult
};
