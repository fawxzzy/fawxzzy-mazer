import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
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
import runtimeBenchmarkPack from '../../src/mazer-core/eval/runtime-benchmark-pack.json' with { type: 'json' };

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

const FUTURE_PHASER_PROOF_SIGNAL_KEY = '__MAZER_FUTURE_PHASER_SIGNAL__';

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
      changed: 'The graph-first planet3d prototype now emits proof packets while stepping through discrete rotation states, shell transitions, and themed content cues.',
      regressed: 'This still does not attempt to prove shell parity against the shipping lane.',
      better: 'The packet shows a recoverable rotation cycle, readable intent feed, a visible objective proxy, and content-proof gating.',
      worse: 'The lane remains intentionally compact and does not chase cinematic world coverage.',
      humanJudgment: 'Confirm the final rotation returns to north while the content-proof panel stays readable and the shell bridge remains legible.'
    }
  },
  {
    id: 'planet3d-two-shell-proof',
    label: 'Planet 3D two-shell proof',
    kind: 'planet3d',
    route: '/planet3d.html',
    motion: true,
    report: {
      changed: 'The dedicated two-shell lane now proves a landmarked connector pair, a discrete alignment puzzle, and the recoverable return from inner shell to outer bearings.',
      regressed: 'This remains a prototype lane and does not widen into production art scope or dense multi-connector routing.',
      better: 'Shell relationship understanding, connector readability, rotation recovery, and objective proxy visibility are now all asserted from the same adapter-backed frame.',
      worse: 'The lane is still graph-first and deliberately sparse rather than fully featured.',
      humanJudgment: 'Confirm the bridge is scarce, the alignment puzzle is readable, and the inner-shell return lands with north-facing bearings restored.'
    }
  },
  {
    id: 'planet3d-three-shell-proof',
    label: 'Planet 3D three-shell proof',
    kind: 'planet3d',
    route: '/planet3d.html',
    motion: true,
    report: {
      changed: 'The constrained three-shell lane now proves an outer observatory reveal, a scarce bridge into the middle shell, and a single landmarked rotation latch into the inner shell.',
      regressed: 'This remains a narrow experiment and still avoids free-spin rotation or connector density creep.',
      better: 'The stack is now legible as outer, middle, and inner shells, with the objective proxy staying visible or proxied while rotation recovers to north.',
      worse: 'The lane is still a proof of structure, not a claim of production visual parity.',
      humanJudgment: 'Confirm the observatory explains the full shell stack, the mid-shell latch stays discrete, and the final recovery lands on the inner shell with bearings restored.'
    }
  }
]);

const FUTURE_RUNTIME_WORKFLOWS = Object.freeze({
  'full-proof': {
    runId: null,
    scenarioIds: FUTURE_RUNTIME_SCENARIOS.map((scenario) => scenario.id)
  },
  'content-proof': {
    runId: 'content-proof',
    scenarioIds: [
      'future-phaser-content-proof',
      'planet3d-content-proof'
    ]
  },
  'three-shell-proof': {
    runId: 'three-shell-proof',
    scenarioIds: [
      'planet3d-three-shell-proof'
    ]
  },
  'two-shell-proof': {
    runId: 'two-shell-proof',
    scenarioIds: [
      'planet3d-two-shell-proof'
    ]
  }
});

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

const resolveWorkflow = (runArg, workflowArg) => {
  const workflowId = typeof workflowArg === 'string' && FUTURE_RUNTIME_WORKFLOWS[workflowArg]
    ? workflowArg
    : typeof runArg === 'string' && FUTURE_RUNTIME_WORKFLOWS[runArg]
      ? runArg
      : 'full-proof';

  const workflow = FUTURE_RUNTIME_WORKFLOWS[workflowId];
  const scenarioSet = new Set(workflow.scenarioIds);
  const scenarios = FUTURE_RUNTIME_SCENARIOS.filter((scenario) => scenarioSet.has(scenario.id));
  if (scenarios.length === 0) {
    throw new Error(`Future runtime workflow ${workflowId} did not resolve any scenarios.`);
  }

  return {
    workflowId,
    runId: workflow.runId,
    scenarios
  };
};

const resetRunArtifacts = async (artifactRoot, runId) => {
  if (!runId) {
    return;
  }

  await Promise.all(FUTURE_RUNTIME_SCENARIOS.flatMap((scenario) => (
    FUTURE_RUNTIME_VIEWPORTS.map((viewport) => (
      rm(resolve(REPO_ROOT, artifactRoot, scenario.id, viewport.id, runId), {
        recursive: true,
        force: true
      })
    ))
  )));
};

const getCommitSha = () => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
};

const recordCaptureStage = (stages, stage, details = {}) => {
  stages.push({
    stage,
    at: new Date().toISOString(),
    ...details
  });
};

const waitForRuntimeReady = async (page, bridgeKey, timeoutMs) => {
  await page.waitForFunction(
    (key) => Boolean(window[key]),
    bridgeKey,
    { timeout: timeoutMs }
  );
};

const waitForFuturePhaserReady = async (page, timeoutMs) => {
  await page.waitForFunction(
    (key) => {
      const signal = window[key];
      if (!signal) {
        return false;
      }

      const status = typeof signal.getStatus === 'function' ? signal.getStatus() : signal;
      return status?.readyState === 'ready' || status?.readyState === 'error';
    },
    FUTURE_PHASER_PROOF_SIGNAL_KEY,
    { timeout: timeoutMs }
  );
};

const readFuturePhaserProofStatus = async (page) => page.evaluate((key) => {
  const signal = window[key];
  if (!signal) {
    return null;
  }

  return typeof signal.getStatus === 'function'
    ? signal.getStatus()
    : {
        readyState: signal.readyState ?? null,
        completionState: signal.completionState ?? null,
        currentStep: signal.currentStep ?? null,
        isComplete: signal.isComplete ?? false,
        error: signal.error ?? null,
        snapshot: signal.snapshot ?? null
      };
}, FUTURE_PHASER_PROOF_SIGNAL_KEY);

const readFuturePhaserSession = async (page) => {
  const proofStatus = await readFuturePhaserProofStatus(page);
  return proofStatus?.snapshot ?? null;
};

const advanceFuturePhaserProof = async (page, minimumStep) => page.evaluate(
  ([key, step]) => window[key].advanceToStep(step),
  [FUTURE_PHASER_PROOF_SIGNAL_KEY, minimumStep]
);

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

const completeFuturePhaserProof = async (page, maxSteps = 12) => page.evaluate(
  ([key, stepLimit]) => window[key].completeProof(stepLimit),
  [FUTURE_PHASER_PROOF_SIGNAL_KEY, maxSteps]
);

const capturePhaserScenario = async ({
  page,
  packet,
  timeoutMs,
  stages
}) => {
  const canvas = await captureCanvas(page, timeoutMs);
  recordCaptureStage(stages, 'canvas-visible');
  await waitForFuturePhaserReady(page, timeoutMs);
  const readyStatus = await readFuturePhaserProofStatus(page);
  if (readyStatus?.readyState === 'error') {
    throw new Error(`Future Phaser proof surface entered error state before capture: ${readyStatus.error ?? 'unknown error'}.`);
  }
  recordCaptureStage(stages, 'runtime-ready', {
    readyState: readyStatus?.readyState ?? null,
    completionState: readyStatus?.completionState ?? null,
    currentStep: readyStatus?.currentStep ?? null
  });

  await advanceFuturePhaserProof(page, 1);
  const beforeDiagnostics = await readFuturePhaserSession(page);
  recordCaptureStage(stages, 'before-step-captured', {
    currentStep: beforeDiagnostics?.currentStep ?? null
  });
  await page.screenshot({ path: packet.beforePath, fullPage: false, animations: 'disabled' });

  const keyframeSteps = [2, 3];
  const keyframePaths = [];
  const keyframeDiagnostics = [];
  for (const [index, minimumStep] of keyframeSteps.entries()) {
    await advanceFuturePhaserProof(page, minimumStep);
    const diagnostics = await readFuturePhaserSession(page);
    keyframeDiagnostics.push(diagnostics);
    const keyframePath = resolve(packet.keyframesDir, `${String(index + 1).padStart(2, '0')}-step-${minimumStep}.png`);
    await canvas.screenshot({ path: keyframePath, animations: 'disabled' });
    keyframePaths.push({ label: `step-${minimumStep}`, path: keyframePath });
    recordCaptureStage(stages, 'keyframe-captured', {
      minimumStep,
      currentStep: diagnostics?.currentStep ?? null,
      keyframePath: relativeFromRepo(REPO_ROOT, keyframePath)
    });
  }

  await completeFuturePhaserProof(page);
  const afterStatus = await readFuturePhaserProofStatus(page);
  if (afterStatus?.completionState === 'error') {
    throw new Error(`Future Phaser proof surface entered error state during completion: ${afterStatus.error ?? 'unknown error'}.`);
  }
  const afterDiagnostics = afterStatus?.snapshot ?? null;
  recordCaptureStage(stages, 'proof-complete', {
    readyState: afterStatus?.readyState ?? null,
    completionState: afterStatus?.completionState ?? null,
    currentStep: afterStatus?.currentStep ?? null
  });
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

const capturePlanet3DScenario = async ({
  page,
  packet,
  timeoutMs,
  scenario
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
  const keyframeSteps = scenario?.id === 'planet3d-three-shell-proof'
    ? [2, 4, 6]
    : scenario?.id === 'planet3d-two-shell-proof'
      ? [2, 3, 4]
      : [2, 3];
  for (const index of keyframeSteps) {
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
    title: scenario?.id === 'planet3d-two-shell-proof'
      ? 'Planet 3D two-shell bridge'
      : scenario?.id === 'planet3d-three-shell-proof'
        ? 'Planet 3D three-shell stack'
      : 'Planet 3D rotation recovery'
  });

  return {
    beforeDiagnostics,
    afterDiagnostics,
    keyframeDiagnostics,
    keyframePaths
  };
};

const evaluatePlanet3DProofGates = (frame) => ({
  shellHierarchyPass: Boolean(frame?.contentProof?.shellHierarchyPass),
  connectorReadabilityPass: Boolean(frame?.contentProof?.connectorReadabilityPass),
  rotationRecoveryPass: frame?.rotationState === 'north',
  objectiveProxyPass: Boolean(frame?.contentProof?.objectiveProxyPass),
  signalOverloadPass: Boolean(frame?.contentProof?.signalOverloadPass)
});

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
  proofGates,
  semanticScore,
  captureStages
}) => {
  const latestIntentEntries = scenario.kind === 'future-phaser'
    ? (afterDiagnostics?.intentDeliveries?.at(-1)?.bus?.records ?? []).slice(-4)
    : (afterDiagnostics?.intentFeed?.entries ?? []).slice(-4);
  const intentSpeakers = [...new Set(latestIntentEntries.map((entry) => entry.speaker).filter(Boolean))];

  return {
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
    benchmark: {
      packId: runtimeBenchmarkPack.packId,
      scenarioIds: runtimeBenchmarkPack.scenarios.map((entry) => entry.id)
    },
    proofGates,
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
      intentSpeakerCount: intentSpeakers.length,
      intentSpeakers,
      playerReadable: semanticScore.contract.playerReadableEveryScene,
      objectiveProxyVisible: semanticScore.contract.objectiveProxyVisibleEveryScene,
      intentFeedReadable: semanticScore.contract.intentFeedReadableEveryScene,
      worldPingSubordinate: semanticScore.contract.worldPingSubordinateEveryScene,
      rotationRecovered: semanticScore.contract.rotationRecoveredEveryScene,
      shellHierarchyPass: afterDiagnostics?.contentProof?.shellHierarchyPass ?? false,
      objectiveProxyPass: afterDiagnostics?.contentProof?.objectiveProxyPass ?? false,
      trapInferencePass: semanticScore.contract.trapInferencePassEveryScene,
      wardenReadabilityPass: semanticScore.contract.wardenReadabilityPassEveryScene,
      itemProxyPass: semanticScore.contract.itemProxyPassEveryScene,
      puzzleProxyPass: semanticScore.contract.puzzleProxyPassEveryScene,
      shellRelationshipUnderstanding: afterDiagnostics?.contentProof?.shellRelationshipPass ?? false,
      connectorReadability: afterDiagnostics?.contentProof?.connectorReadabilityPass ?? false,
      rotationRecovery: afterDiagnostics?.contentProof?.rotationRecoveryPass ?? false,
      signalOverloadPass: semanticScore.contract.signalOverloadPassEveryScene
    },
    capture: {
      stages: captureStages ?? []
    }
  };
};

const collectRuntimeFailureSnapshot = async (page, scenario, packet) => page.evaluate(
  ({ phaserSignalKey, kind, packetPath }) => {
    const phaserSignal = window[phaserSignalKey];
    const planetController = window.__MAZER_FUTURE_PLANET3D__;
    return {
      location: window.location.href,
      documentReadyState: document.readyState,
      canvasCount: document.querySelectorAll('canvas').length,
      artifactPath: packetPath,
      proofSignal: phaserSignal
        ? (
          typeof phaserSignal.getStatus === 'function'
            ? phaserSignal.getStatus()
            : {
                readyState: phaserSignal.readyState ?? null,
                completionState: phaserSignal.completionState ?? null,
                currentStep: phaserSignal.currentStep ?? null,
                isComplete: phaserSignal.isComplete ?? false,
                error: phaserSignal.error ?? null,
                snapshot: phaserSignal.snapshot ?? null
              }
        )
        : null,
      planet3d: kind === 'planet3d'
        ? {
            step: planetController?.frame?.step ?? null,
            rotationState: planetController?.frame?.rotationState ?? null,
            playerTileId: planetController?.frame?.player?.tileId ?? null
          }
        : null
    };
  },
  {
    phaserSignalKey: FUTURE_PHASER_PROOF_SIGNAL_KEY,
    kind: scenario.kind,
    packetPath: relativeFromRepo(REPO_ROOT, packet.packetDir)
  }
);

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
  const failureSummaryPath = resolve(packet.packetDir, 'failure-summary.json');
  const stages = [];
  recordCaptureStage(stages, 'packet-created', {
    artifactPath: relativeFromRepo(REPO_ROOT, packet.packetDir),
    runId,
    scenarioId: scenario.id,
    viewportId: viewport.id
  });
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
  recordCaptureStage(stages, 'page-loaded', { url });

  let captureResult;
  try {
    if (scenario.kind === 'future-phaser') {
      captureResult = await capturePhaserScenario({ page, packet, timeoutMs, stages });
    } else if (scenario.kind === 'planet3d') {
      captureResult = await capturePlanet3DScenario({ page, packet, timeoutMs, scenario });
    } else {
      throw new Error(`Unsupported future runtime scenario kind: ${scenario.kind}`);
    }
    recordCaptureStage(stages, 'capture-finished');

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
    if (scenario.kind === 'planet3d') {
      const proofGates = evaluatePlanet3DProofGates(afterDiagnostics);
      const failingProofGates = Object.entries(proofGates)
        .filter(([, passed]) => !passed)
        .map(([gateId]) => gateId);
      if (failingProofGates.length > 0) {
        throw new Error(`Planet3D proof gates failed for ${scenario.id}/${viewport.id}: ${failingProofGates.join(', ')}`);
      }
    }
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
      proofGates: scenario.kind === 'planet3d' ? evaluatePlanet3DProofGates(afterDiagnostics) : null,
      semanticScore,
      captureStages: stages
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
  } catch (error) {
    const failureSummary = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      runId,
      scenarioId: scenario.id,
      viewportId: viewport.id,
      scenarioKind: scenario.kind,
      artifactPath: relativeFromRepo(REPO_ROOT, packet.packetDir),
      stages,
      failure: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack ?? error.message : String(error)
      },
      runtimeSnapshot: await collectRuntimeFailureSnapshot(page, scenario, packet).catch(() => null)
    };
    await writeMetadata(failureSummaryPath, failureSummary);
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} `
      + `(runId=${runId}, scenarioId=${scenario.id}, viewportId=${viewport.id}, artifactPath=${relativeFromRepo(REPO_ROOT, packet.packetDir)}, failureSummary=${relativeFromRepo(REPO_ROOT, failureSummaryPath)})`
    );
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
  workflowId = 'full-proof',
  scenarioIds = null,
  runId,
  allowFailures = false
} = {}) => {
  const requestedBaseUrl = normalizeBaseUrl(baseUrl);
  const commitSha = getCommitSha();
  const workflow = FUTURE_RUNTIME_WORKFLOWS[workflowId] ?? FUTURE_RUNTIME_WORKFLOWS['full-proof'];
  const scenarioSet = new Set(
    Array.isArray(scenarioIds) && scenarioIds.length > 0
      ? scenarioIds
      : workflow.scenarioIds
  );
  const scenarios = FUTURE_RUNTIME_SCENARIOS.filter((scenario) => scenarioSet.has(scenario.id));
  if (scenarios.length === 0) {
    throw new Error(`Future runtime workflow ${workflowId} did not match any proof scenarios.`);
  }

  const resolvedRunId = resolveRunId(commitSha, runId ?? workflow.runId);
  const previewLogPath = resolve(REPO_ROOT, artifactRoot, '_preview.log');

  await ensureDir(resolve(REPO_ROOT, artifactRoot));
  await resetRunArtifacts(artifactRoot, resolvedRunId);
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
    for (const scenario of scenarios) {
      for (const viewport of FUTURE_RUNTIME_VIEWPORTS) {
        const packetResult = await captureScenarioPacket({
          browser,
          baseUrl: preview.baseUrl,
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
      workflowId,
      runId: resolvedRunId,
      artifactRoot,
      benchmarkPackId: runtimeBenchmarkPack.packId,
      benchmarkScenarioIds: runtimeBenchmarkPack.scenarios.map((entry) => entry.id),
      scenarioIds: scenarios.map((scenario) => scenario.id),
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
    await stopPreviewServer(preview.child);
    previewLog.end();
  }
};

const main = async () => {
  const args = parseCliArgs();
  const workflow = resolveWorkflow(args.run, args.workflow);
  const summary = await runFutureRuntimeProofSuite({
    baseUrl: args['base-url'] ?? process.env.MAZER_VISUAL_BASE_URL ?? DEFAULT_BASE_URL,
    artifactRoot: typeof args['artifact-root'] === 'string'
      ? args['artifact-root']
      : FUTURE_RUNTIME_ARTIFACT_ROOT,
    previewTimeoutMs: parseIntegerArg(args['preview-timeout'], DEFAULT_PREVIEW_TIMEOUT_MS),
    captureTimeoutMs: parseIntegerArg(args.timeout, DEFAULT_CAPTURE_TIMEOUT_MS),
    skipBuild: args['skip-build'] === true || args['skip-build'] === 'true',
    workflowId: workflow.workflowId,
    scenarioIds: workflow.scenarios.map((scenario) => scenario.id),
    runId: typeof args['run-id'] === 'string'
      ? args['run-id']
      : typeof args.run === 'string' && FUTURE_RUNTIME_WORKFLOWS[args.run]
        ? workflow.runId
        : typeof args.run === 'string'
          ? args.run
          : undefined,
    allowFailures: args['allow-failures'] === true || args['allow-failures'] === 'true'
  });

  process.stdout.write(`${JSON.stringify({
    workflowId: summary.workflowId,
    runId: summary.runId,
    artifactRoot: summary.artifactRoot,
    scenarioIds: summary.scenarioIds,
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
