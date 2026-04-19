import { copyFile, unlink, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  DEFAULT_BASE_URL,
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
import {
  buildExperimentManifest,
  buildTelemetryReceipt,
  normalizeExperimentToggles,
  resolveExperimentVariantId
} from '../../src/telemetry/index.ts';
import { resolveTouchControlLayout } from '../../src/input-human/touch.ts';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH;

const EDGE_LIVE_ROOT = resolve(STACK_ROOT, 'tmp', 'captures', 'mazer-edge-live');
const VISUAL_CAPTURE_KEY = '__MAZER_VISUAL_CAPTURE__';
const VISUAL_DIAGNOSTICS_KEY = '__MAZER_VISUAL_DIAGNOSTICS__';
const RUNTIME_DIAGNOSTICS_KEY = '__MAZER_RUNTIME_DIAGNOSTICS__';
const PROOF_SURFACE_SIGNAL_KEY = '__MAZER_PROOF_SURFACES__';
const DEFAULT_PRESET_GROUP = 'core';
const DEFAULT_HEADLESS = true;
const EDGE_LIVE_DEFAULT_CAPTURE_TIMEOUT_MS = 45_000;
const EDGE_LIVE_DEFAULT_PREVIEW_TIMEOUT_MS = 60_000;
const CAPTURE_CONFIG = Object.freeze({
  enabled: true,
  forceInstallMode: 'available'
});
const PROOF_SURFACE_404_FAILURE_CODE = 'EDGE_LIVE_PROOF_404';
const INTERACTIVE_PLAY_FAILURE_CODE = 'EDGE_LIVE_PLAY_INTERACTION';
const INTERACTIVE_PLAY_MODE_RUN_ID = 'play-mode-interactive';
const MOBILE_TOUCH_SMOKE_RUN_ID = 'mobile-touch-smoke';
const EDGE_LIVE_SPECIAL_ROUTES = Object.freeze({
  'watch-play-shell': '/?mode=play&theme=aurora',
  'play-mode-smoke': '/?mode=play&theme=ember',
  'play-hud-trim': '/?mode=play&theme=aurora',
  'play-mode-interactive': '/?theme=aurora',
  'mobile-touch-smoke': '/?mode=play&theme=aurora'
});
const EDGE_LIVE_RUN_VIEWPORT_IDS = Object.freeze({
  'play-mode-interactive': ['desktop'],
  'mobile-touch-smoke': ['phone-portrait']
});
const EDGE_LIVE_INTERACTION_RUNS = Object.freeze({
  'play-mode-interactive': Object.freeze({
    kind: 'keyboard',
    requiredMode: 'play',
    ensureModeKey: 'm',
    movementWaitMs: 220,
    controlWaitMs: 180,
    restartWaitMs: 900,
    steps: [
      { id: 'move-1', kind: 'movement', candidates: ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'] },
      { id: 'move-2', kind: 'movement', candidates: ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'] },
      { id: 'pause', kind: 'control', key: 'p' },
      { id: 'resume', kind: 'control', key: 'p' },
      { id: 'toggle-thoughts', kind: 'control', key: 't' },
      { id: 'restart', kind: 'control', key: 'r' },
      { id: 'move-3', kind: 'movement', candidates: ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'], waitMs: 320 }
    ]
  }),
  'mobile-touch-smoke': Object.freeze({
    kind: 'touch',
    requiredMode: 'play',
    movementWaitMs: 260,
    controlWaitMs: 220,
    restartWaitMs: 900,
    steps: [
      { id: 'move-1', kind: 'movement', candidates: ['move_up', 'move_right', 'move_down', 'move_left'] },
      { id: 'move-2', kind: 'movement', candidates: ['move_up', 'move_right', 'move_down', 'move_left'] },
      { id: 'pause', kind: 'control', control: 'pause' },
      { id: 'resume', kind: 'control', control: 'pause' },
      { id: 'toggle-thoughts', kind: 'control', control: 'toggle_thoughts' },
      { id: 'restart', kind: 'control', control: 'restart_attempt' },
      { id: 'move-3', kind: 'movement', candidates: ['move_up', 'move_right', 'move_down', 'move_left'], waitMs: 360 }
    ]
  })
});
const PROOF_SURFACE_WORKFLOWS = Object.freeze({
  'watch-pass-preview': Object.freeze({
    runId: 'watch-pass-preview',
    viewportIds: ['phone-portrait', 'desktop'],
    routes: [
      {
        id: 'watch-pass-ios-full',
        label: 'Watch Pass iOS full',
        route: '/watch-pass-preview.html?platform=ios&privacy=full&thoughtDensity=richer&pacingPreset=balanced'
      },
      {
        id: 'watch-pass-android-compact',
        label: 'Watch Pass Android compact',
        route: '/watch-pass-preview.html?platform=android&privacy=compact&thoughtDensity=sparse&pacingPreset=brisk'
      },
      {
        id: 'watch-pass-ios-private',
        label: 'Watch Pass iOS private',
        route: '/watch-pass-preview.html?platform=ios&privacy=private&reducedMotion=true&thoughtDensity=sparse&pacingPreset=calm'
      },
      {
        id: 'watch-pass-paywall-yearly',
        label: 'Watch Pass paywall yearly',
        route: '/watch-pass-paywall.html?platform=ios&privacy=compact&thoughtDensity=richer&pacingPreset=balanced&plan=yearly&entryPoint=watch-pass-preview&sourceCta=Watch%20Pass%20preview'
      }
    ]
  }),
  'watch-pass-setup': Object.freeze({
    runId: 'watch-pass-setup',
    viewportIds: ['phone-portrait', 'desktop'],
    routes: [
      {
        id: 'watch-pass-setup-snapshot',
        label: 'Watch Pass setup snapshot',
        route: '/watch-pass-setup.html?surface=snapshot-card&platformFrame=ios-like&privacy=full&thoughtDensity=richer&pacingPreset=balanced'
      },
      {
        id: 'watch-pass-setup-active-private',
        label: 'Watch Pass setup active private',
        route: '/watch-pass-setup.html?surface=active-run-tracker&platformFrame=ios-like&privacy=private&reducedMotion=true&thoughtDensity=sparse&pacingPreset=calm'
      },
      {
        id: 'watch-pass-setup-ambient-compact',
        label: 'Watch Pass setup ambient compact',
        route: '/watch-pass-setup.html?surface=ambient-tile&platformFrame=android-like&privacy=compact&thoughtDensity=sparse&pacingPreset=brisk'
      }
    ]
  }),
  'projection-proof-shell': Object.freeze({
    runId: 'projection-proof-shell',
    viewportIds: ['phone-portrait', 'desktop'],
    routes: [
      {
        id: 'shell-ios',
        label: 'Proof shell iOS',
        route: '/proof-surfaces.html?surface=all&fixture=watching&skin=ios&mode=all'
      },
      {
        id: 'shell-android',
        label: 'Proof shell Android',
        route: '/proof-surfaces.html?surface=all&fixture=watching&skin=android&mode=all'
      }
    ]
  }),
  'projection-proof-snapshot': Object.freeze({
    runId: 'projection-proof-snapshot',
    viewportIds: ['phone-portrait', 'desktop'],
    routes: [
      {
        id: 'snapshot-watching',
        label: 'Snapshot card watching',
        route: '/proof-surfaces.html?surface=snapshot-card&fixture=watching&skin=ios&mode=all'
      }
    ]
  }),
  'projection-proof-active': Object.freeze({
    runId: 'projection-proof-active',
    viewportIds: ['phone-portrait', 'desktop'],
    routes: [
      {
        id: 'active-building',
        label: 'Active tracker building',
        route: '/proof-surfaces.html?surface=active-run-tracker&fixture=building&skin=ios&mode=all'
      },
      {
        id: 'active-watching',
        label: 'Active tracker watching',
        route: '/proof-surfaces.html?surface=active-run-tracker&fixture=watching&skin=ios&mode=all'
      },
      {
        id: 'active-failed',
        label: 'Active tracker failed',
        route: '/proof-surfaces.html?surface=active-run-tracker&fixture=failed&skin=ios&mode=all'
      }
    ]
  }),
  'projection-proof-ambient': Object.freeze({
    runId: 'projection-proof-ambient',
    viewportIds: ['phone-portrait', 'desktop'],
    routes: [
      {
        id: 'ambient-waiting',
        label: 'Ambient tile waiting',
        route: '/proof-surfaces.html?surface=ambient-tile&fixture=waiting&skin=android&mode=all'
      }
    ]
  })
});

const round = (value, digits = 2) => {
  if (!Number.isFinite(value)) {
    return value;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const normalizeTelemetryMode = (value) => (
  value === 'watch' || value === 'play' ? value : null
);

const buildWatchPassFunnelLines = (receipt) => [
  `- Mode: ${receipt?.mode ?? 'n/a'}`,
  `- Source CTA: ${receipt?.sourceCta ?? 'n/a'}`,
  `- Paywall views: ${receipt?.kpis?.paywallViewCount ?? 0}`,
  `- Plan selects: ${receipt?.kpis?.planSelectedCount ?? 0}`,
  `- Paywall -> plan select: ${receipt?.kpis?.paywall_view_to_plan_select ?? 'n/a'}`,
  `- Paywall -> purchase completed: ${receipt?.kpis?.paywall_view_to_purchase_completed ?? 'n/a'}`,
  `- Purchase completed: ${receipt?.kpis?.purchaseCompletedCount ?? 0}`,
  `- Widget attach rate: ${receipt?.kpis?.widget_attach_rate ?? 0}`,
  `- Live activity start rate: ${receipt?.kpis?.live_activity_start_rate ?? 0}`,
  `- Reduced motion adoption: ${receipt?.kpis?.reduced_motion_adoption ?? 0}`,
  `- Private mode adoption: ${receipt?.kpis?.private_mode_adoption ?? 0}`
];

const normalizeTelemetryEventKey = (event) => (
  event?.eventId
  ?? [
    event?.kind ?? '',
    event?.runId ?? '',
    event?.mazeId ?? '',
    event?.attemptNo ?? '',
    event?.elapsedMs ?? '',
    event?.createdAt ?? ''
  ].join('|')
);

const resolveTelemetryModeFromCaptures = (captures) => {
  for (const capture of captures) {
    const candidates = [
      capture?.telemetry?.mode,
      capture?.firstLoad?.telemetry?.mode,
      capture?.secondLoad?.telemetry?.mode,
      capture?.lifecycle?.telemetry?.mode
    ];

    for (const candidate of candidates) {
      const normalized = normalizeTelemetryMode(candidate);
      if (normalized) {
        return normalized;
      }
    }

    const url = typeof capture?.url === 'string' && capture.url.length > 0
      ? new URL(capture.url)
      : null;
    const normalizedUrlMode = normalizeTelemetryMode(url?.searchParams.get('mode'));
    if (normalizedUrlMode) {
      return normalizedUrlMode;
    }
  }

  return null;
};

const relativeToRun = (runDir, filePath) => relative(runDir, filePath).replace(/\\/g, '/');

const normalizeRoute = (value) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return '/';
  }

  const trimmed = value.trim();
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const resolveInteractiveProjectionMode = (projection) => (
  projection?.mode === 'play' || projection?.mode === 'watch'
    ? projection.mode
    : null
);

export const summarizeEdgeLiveInteractiveState = (diagnostics) => {
  const runtime = diagnostics?.runtime ?? null;
  const visual = diagnostics?.visual ?? null;
  const telemetrySummary = runtime?.telemetry?.summary ?? null;
  const telemetryEvents = Array.isArray(runtime?.telemetry?.events) ? runtime.telemetry.events : [];
  const projection = runtime?.projection ?? null;
  const feed = runtime?.feed ?? null;
  const controlUsedCount = Math.max(
    telemetrySummary?.eventCounts?.control_used ?? 0,
    telemetryEvents.filter((event) => event?.kind === 'control_used').length
  );

  return {
    mode: resolveInteractiveProjectionMode(projection) ?? resolveTelemetryModeFromCaptures([{ telemetry: { mode: telemetrySummary?.mode ?? null } }]) ?? null,
    controlUsedCount,
    projection: projection
      ? {
          mode: resolveInteractiveProjectionMode(projection),
          state: projection.state ?? null,
          progressPct: projection.progressPct ?? null,
          riskLevel: projection.riskLevel ?? null,
          miniMapHash: projection.miniMapHash ?? null,
          elapsedMs: projection.elapsedMs ?? null
        }
      : null,
    feed: feed
      ? {
          signature: feed.signature ?? null,
          step: feed.step ?? null,
          changeCount: feed.changeCount ?? null,
          visibleEntryCount: feed.visibleEntryCount ?? null
        }
      : null,
    trail: visual?.trail
      ? {
          currentIndex: visual.trail.currentIndex ?? null,
          nextIndex: visual.trail.nextIndex ?? null,
          progress: visual.trail.progress ?? null,
          cue: visual.trail.cue ?? null
        }
      : null
  };
};

export const resolvePlayModeMovementKeyFromTrail = (trail, rasterWidth) => {
  const currentIndex = Number.isFinite(trail?.currentIndex) ? Math.max(0, Math.trunc(trail.currentIndex)) : null;
  const nextIndex = Number.isFinite(trail?.nextIndex) ? Math.max(0, Math.trunc(trail.nextIndex)) : null;
  const width = Number.isFinite(rasterWidth) ? Math.max(1, Math.trunc(rasterWidth)) : null;
  if (currentIndex === null || nextIndex === null || width === null || currentIndex === nextIndex) {
    return null;
  }

  const currentX = currentIndex % width;
  const currentY = Math.floor(currentIndex / width);
  const nextX = nextIndex % width;
  const nextY = Math.floor(nextIndex / width);
  const dx = nextX - currentX;
  const dy = nextY - currentY;

  if (dx === 1 && dy === 0) {
    return 'ArrowRight';
  }
  if (dx === -1 && dy === 0) {
    return 'ArrowLeft';
  }
  if (dx === 0 && dy === 1) {
    return 'ArrowDown';
  }
  if (dx === 0 && dy === -1) {
    return 'ArrowUp';
  }

  return null;
};

const buildInteractiveStateSignature = (state) => JSON.stringify(state ?? null);

const hasInteractiveStateDelta = (before, after) => buildInteractiveStateSignature(before) !== buildInteractiveStateSignature(after);

const resolveEdgeLiveInteraction = (runId) => (
  typeof runId === 'string' ? EDGE_LIVE_INTERACTION_RUNS[runId] ?? null : null
);

const resolveEdgeLiveViewports = (presetGroup, runId) => {
  const viewports = resolveLayoutMatrixViewports(presetGroup);
  const allowedViewportIds = typeof runId === 'string' ? EDGE_LIVE_RUN_VIEWPORT_IDS[runId] : null;
  if (!Array.isArray(allowedViewportIds) || allowedViewportIds.length === 0) {
    return viewports;
  }

  const allowedSet = new Set(allowedViewportIds);
  return viewports.filter((viewport) => allowedSet.has(viewport.id));
};

const resolveTouchControlPoint = ({ viewport, diagnostics, control }) => {
  const safeInsets = diagnostics?.visual?.viewport?.safeInsets ?? {};
  const layout = resolveTouchControlLayout({
    width: viewport.width,
    height: viewport.height
  }, {
    safeInsets,
    compact: viewport.width < 720 || viewport.height < 720
  });
  const rect = layout.controls[control];

  return rect
    ? { x: rect.centerX, y: rect.centerY }
    : null;
};

const runEdgeLiveInteraction = async ({
  page,
  viewport,
  timeoutMs,
  interaction
}) => {
  const waitAfterInput = async (ms, options = {}) => {
    await page.waitForTimeout(Math.max(0, Math.round(ms)));
    try {
      return await waitForDiagnostics(page, Math.max(2_000, Math.round(timeoutMs / 3)), options);
    } catch {
      return readDiagnostics(page);
    }
  };

  const triggerKeyboardStep = async (key) => {
    await page.keyboard.press(key);
  };

  const waitForMovementReady = async () => {
    await page.waitForFunction(
      ({ runtimeKey, requiredMode }) => {
        const runtime = window[runtimeKey] ?? null;
        const projection = runtime?.projection ?? null;
        return projection?.mode === requiredMode && projection?.state === 'watching';
      },
      {
        runtimeKey: RUNTIME_DIAGNOSTICS_KEY,
        requiredMode: interaction.requiredMode ?? 'play'
      },
      { timeout: Math.max(5_000, Math.round(timeoutMs * 0.8)) }
    );
    return readDiagnostics(page);
  };

  const triggerTouchStep = async (diagnostics, control) => {
    const point = resolveTouchControlPoint({ viewport, diagnostics, control });
    if (!point) {
      const error = new Error(`Interactive touch workflow could not resolve ${control} touch coordinates on ${viewport.id}.`);
      error.code = INTERACTIVE_PLAY_FAILURE_CODE;
      error.failureStage = 'touch-layout';
      error.control = control;
      throw error;
    }

    await page.touchscreen.tap(point.x, point.y);
  };

  let currentDiagnostics = await readDiagnostics(page);
  const baselineState = summarizeEdgeLiveInteractiveState(currentDiagnostics);
  const timeline = [];

  if (interaction.requiredMode && baselineState.mode !== interaction.requiredMode) {
    if (interaction.kind !== 'keyboard' || typeof interaction.ensureModeKey !== 'string') {
      const error = new Error(`Interactive ${interaction.kind} workflow requires play mode on ${viewport.id}, but it could not switch modes automatically.`);
      error.code = INTERACTIVE_PLAY_FAILURE_CODE;
      error.failureStage = 'ensure-play-mode';
      error.interaction = {
        runId: INTERACTIVE_PLAY_MODE_RUN_ID,
        baseline: baselineState,
        timeline
      };
      throw error;
    }

    const beforeSwitch = summarizeEdgeLiveInteractiveState(currentDiagnostics);
    await triggerKeyboardStep(interaction.ensureModeKey);
    currentDiagnostics = await waitAfterInput(interaction.controlWaitMs ?? 180);
    const afterSwitch = summarizeEdgeLiveInteractiveState(currentDiagnostics);
    timeline.push({
      id: 'ensure-play-mode',
      kind: 'mode',
      key: interaction.ensureModeKey,
      before: beforeSwitch,
      after: afterSwitch,
      changed: hasInteractiveStateDelta(beforeSwitch, afterSwitch)
    });

    if (afterSwitch.mode !== interaction.requiredMode) {
      const error = new Error(`Interactive ${interaction.kind} workflow did not switch into ${interaction.requiredMode} mode on ${viewport.id}.`);
      error.code = INTERACTIVE_PLAY_FAILURE_CODE;
      error.failureStage = 'ensure-play-mode';
      error.interaction = {
        runId: INTERACTIVE_PLAY_MODE_RUN_ID,
        baseline: baselineState,
        timeline
      };
      throw error;
    }
  } else {
    timeline.push({
      id: 'ensure-play-mode',
      kind: 'mode',
      key: null,
      before: baselineState,
      after: baselineState,
      changed: false
    });
  }

  let movementChanged = false;
  for (const step of interaction.steps ?? []) {
    let before = summarizeEdgeLiveInteractiveState(await readDiagnostics(page));
    let after = before;
    let attempted = [];
    let usedInput = null;

    if (step.kind === 'movement') {
      currentDiagnostics = await waitForMovementReady();
      const movementReadyState = summarizeEdgeLiveInteractiveState(currentDiagnostics);
      const currentProjectionState = movementReadyState?.projection?.state ?? null;
      if (currentProjectionState !== 'watching') {
        const error = new Error(`Interactive ${interaction.kind} workflow never reached a movement-ready play state on ${viewport.id}.`);
        error.code = INTERACTIVE_PLAY_FAILURE_CODE;
        error.failureStage = 'movement-ready';
        throw error;
      }

      before = movementReadyState;
      after = movementReadyState;
      const candidates = Array.isArray(step.candidates) ? step.candidates : [];
      attempted = candidates;
      for (const candidate of candidates) {
        const beforeCandidateDiagnostics = await readDiagnostics(page);
        if (interaction.kind === 'touch') {
          await triggerTouchStep(beforeCandidateDiagnostics, candidate);
        } else {
          await triggerKeyboardStep(candidate);
        }
        currentDiagnostics = await waitAfterInput(step.waitMs ?? interaction.movementWaitMs ?? 220);
        after = summarizeEdgeLiveInteractiveState(currentDiagnostics);
        usedInput = candidate;
        if (hasInteractiveStateDelta(before, after)) {
          movementChanged = true;
          break;
        }
      }
    } else if (interaction.kind === 'touch') {
      attempted = [step.control];
      await triggerTouchStep(await readDiagnostics(page), step.control);
      currentDiagnostics = await waitAfterInput(
        step.control === 'restart_attempt'
          ? interaction.restartWaitMs ?? 900
          : step.waitMs ?? interaction.controlWaitMs ?? 180
      );
      after = summarizeEdgeLiveInteractiveState(currentDiagnostics);
      usedInput = step.control;
    } else {
      attempted = [step.key];
      await triggerKeyboardStep(step.key);
      currentDiagnostics = await waitAfterInput(
        step.key === 'r'
          ? interaction.restartWaitMs ?? 900
          : step.waitMs ?? interaction.controlWaitMs ?? 180
      );
      after = summarizeEdgeLiveInteractiveState(currentDiagnostics);
      usedInput = step.key;
    }

    timeline.push({
      id: step.id,
      kind: step.kind,
      input: usedInput,
      attempted,
      before,
      after,
      changed: hasInteractiveStateDelta(before, after)
    });
  }

  const finalDiagnostics = await waitAfterInput(Math.max(200, interaction.controlWaitMs ?? 180), { requireActiveTrail: true });
  const finalState = summarizeEdgeLiveInteractiveState(finalDiagnostics);
  if (interaction.requiredMode && finalState.mode !== interaction.requiredMode) {
    const error = new Error(`Interactive ${interaction.kind} workflow on ${viewport.id} drifted out of ${interaction.requiredMode} mode.`);
    error.code = INTERACTIVE_PLAY_FAILURE_CODE;
    error.failureStage = 'final-mode';
    error.interaction = {
      runId: interaction.kind === 'touch' ? MOBILE_TOUCH_SMOKE_RUN_ID : INTERACTIVE_PLAY_MODE_RUN_ID,
      baseline: baselineState,
      timeline,
      final: finalState
    };
    throw error;
  }

  if (!movementChanged) {
    const error = new Error(`Interactive ${interaction.kind} workflow on ${viewport.id} did not change runtime or projection state after movement.`);
    error.code = INTERACTIVE_PLAY_FAILURE_CODE;
    error.failureStage = 'interaction-state-delta';
    error.interaction = {
      runId: interaction.kind === 'touch' ? MOBILE_TOUCH_SMOKE_RUN_ID : INTERACTIVE_PLAY_MODE_RUN_ID,
      baseline: baselineState,
      timeline,
      final: finalState
    };
    throw error;
  }

  if ((finalState.controlUsedCount ?? 0) <= 0) {
    const error = new Error(`Interactive ${interaction.kind} workflow on ${viewport.id} did not record any control_used events.`);
    error.code = INTERACTIVE_PLAY_FAILURE_CODE;
    error.failureStage = 'interaction-control-events';
    error.interaction = {
      runId: interaction.kind === 'touch' ? MOBILE_TOUCH_SMOKE_RUN_ID : INTERACTIVE_PLAY_MODE_RUN_ID,
      baseline: baselineState,
      timeline,
      final: finalState
    };
    throw error;
  }

  return {
    runId: interaction.kind === 'touch' ? MOBILE_TOUCH_SMOKE_RUN_ID : INTERACTIVE_PLAY_MODE_RUN_ID,
    inputKind: interaction.kind,
    baseline: baselineState,
    final: finalState,
    finalDiagnostics,
    keyTimeline: timeline,
    controlUsedCount: finalState.controlUsedCount,
    changed: hasInteractiveStateDelta(baselineState, finalState),
    mode: finalState.mode
  };
};

export const resolveEdgeLiveDefaultRoute = (runId) => {
  if (typeof runId !== 'string') {
    return undefined;
  }

  return EDGE_LIVE_SPECIAL_ROUTES[runId] ?? undefined;
};

const isBaseUrlReady = async (baseUrl) => {
  try {
    const response = await fetch(normalizeBaseUrl(baseUrl), { redirect: 'manual' });
    return response.ok;
  } catch {
    return false;
  }
};

const resolveViewportTargetUrl = ({ viewport, baseUrl, route, explicitUrl }) => {
  if (typeof explicitUrl === 'string' && explicitUrl.trim().length > 0) {
    const url = new URL(explicitUrl.trim());
    if (!url.searchParams.has('runtimeDiagnostics')) {
      url.searchParams.set('runtimeDiagnostics', '1');
    }
    return url.toString();
  }

  const url = new URL(`${normalizeBaseUrl(baseUrl)}${normalizeRoute(route ?? resolveLayoutMatrixRoute(viewport))}`);
  if (!url.searchParams.has('runtimeDiagnostics')) {
    url.searchParams.set('runtimeDiagnostics', '1');
  }
  return url.toString();
};

const isInsideBounds = (inner, outer, tolerance = 0) => (
  Boolean(inner)
  && Boolean(outer)
  && inner.left >= (outer.left - tolerance)
  && inner.right <= (outer.right + tolerance)
  && inner.top >= (outer.top - tolerance)
  && inner.bottom <= (outer.bottom + tolerance)
);

const doRectsOverlap = (left, right) => (
  Boolean(left)
  && Boolean(right)
  && left.left < right.right
  && left.right > right.left
  && left.top < right.bottom
  && left.bottom > right.top
);

const resolveExperimentSelection = (args = {}) => {
  const readToggle = (camelKey, kebabKey) => (
    typeof args[camelKey] === 'string'
      ? args[camelKey]
      : typeof args[kebabKey] === 'string'
        ? args[kebabKey]
        : undefined
  );
  const toggles = normalizeExperimentToggles({
    pacing: typeof args.pacing === 'string' ? args.pacing : undefined,
    thoughtDensity: readToggle('thoughtDensity', 'thought-density'),
    failCardTiming: readToggle('failCardTiming', 'fail-card-timing'),
    memoryBeat: typeof args.memoryBeat === 'string'
      ? args.memoryBeat
      : typeof args['memory-beat'] === 'string'
        ? args['memory-beat']
        : args.memoryBeat === true || args['memory-beat'] === true
          ? 'on'
          : undefined,
    trapTelegraph: readToggle('trapTelegraph', 'trap-telegraph')
  });

  return {
    toggles,
    variantId: resolveExperimentVariantId(toggles)
  };
};

export const resolveEdgeLiveRunPaths = (runId) => {
  const runDir = resolve(EDGE_LIVE_ROOT, runId);
  return {
    runDir,
    screenshotsDir: resolve(runDir, 'screenshots'),
    videosDir: resolve(runDir, 'videos'),
    metadataDir: resolve(runDir, 'metadata'),
    summaryPath: resolve(runDir, 'summary.json'),
    markdownPath: resolve(runDir, 'summary.md')
  };
};

export const resolveEdgeLiveWorkflow = (runId) => (
  typeof runId === 'string' && PROOF_SURFACE_WORKFLOWS[runId]
    ? PROOF_SURFACE_WORKFLOWS[runId]
    : null
);

export const buildEdgeLiveExperiment = (options = {}) => {
  const selection = options.toggles
    ? (() => {
        const toggles = normalizeExperimentToggles(options.toggles);
        return {
          toggles,
          variantId: resolveExperimentVariantId(toggles)
        };
      })()
    : resolveExperimentSelection(options);
  return buildExperimentManifest({
    kind: 'edge-live',
    label: typeof options.label === 'string' ? options.label : 'edge-live',
    runId: typeof options.runId === 'string' ? options.runId : null,
    mazeId: typeof options.mazeId === 'string' ? options.mazeId : null,
    attemptNo: Number.isFinite(options.attemptNo) ? options.attemptNo : null,
    toggles: selection.toggles,
    generatedAt: typeof options.generatedAt === 'string' ? options.generatedAt : undefined
  });
};

export const buildProofSurfaceFailureArtifact = ({
  error,
  workflowId,
  routeDefinition,
  viewport,
  url,
  stage,
  httpFailures,
  consoleMessages,
  runDir,
  metadataPath,
  screenshotPath
}) => ({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  workflowId,
  routeId: routeDefinition.id,
  routeLabel: routeDefinition.label,
  route: routeDefinition.route,
  stage,
  viewport,
  url,
  failure: {
    code: error?.code ?? PROOF_SURFACE_404_FAILURE_CODE,
    reason: error?.message ?? 'unknown proof-shell failure',
    message: error?.message ?? 'unknown proof-shell failure'
  },
  httpFailures,
  consoleMessages,
  files: {
    metadata: relativeToRun(runDir, metadataPath),
    screenshot: screenshotPath ? relativeToRun(runDir, screenshotPath) : null
  }
});

export const resolveEdgeLiveTargetUrl = (viewport, options = {}) => resolveViewportTargetUrl({
  viewport,
  baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
  route: options.route,
  explicitUrl: options.url
});

export const resolveEdgeLiveVerdicts = (diagnostics) => {
  const boardBounds = diagnostics?.board?.bounds ?? null;
  const safeBounds = diagnostics?.board?.safeBounds ?? null;
  const hudBounds = diagnostics?.intentFeed?.bounds ?? null;
  const viewport = diagnostics?.viewport ?? null;
  const viewportBounds = viewport
    ? {
        left: 0,
        top: 0,
        right: viewport.width,
        bottom: viewport.height
      }
    : null;

  const boardOverflow = isInsideBounds(boardBounds, safeBounds, 4);
  const hudOverlap = boardBounds && hudBounds ? !doRectsOverlap(boardBounds, hudBounds) : false;
  const hudClip = viewportBounds && hudBounds ? isInsideBounds(hudBounds, viewportBounds, 2) : false;

  return {
    boardOverflow: {
      pass: boardOverflow,
      bounds: boardBounds,
      safeBounds
    },
    hudOverlap: {
      pass: hudOverlap,
      bounds: hudBounds,
      boardBounds
    },
    hudClip: {
      pass: hudClip,
      bounds: hudBounds,
      viewportBounds
    }
  };
};

const readDiagnostics = async (page) => page.evaluate((keys) => ({
  visual: window[keys.visual] ?? null,
  runtime: window[keys.runtime] ?? null
}), {
  visual: VISUAL_DIAGNOSTICS_KEY,
  runtime: RUNTIME_DIAGNOSTICS_KEY
});

const waitForDiagnostics = async (page, timeoutMs, { requireActiveTrail = false } = {}) => {
  const startedAt = Date.now();
  let lastDiagnostics = null;

  while ((Date.now() - startedAt) < timeoutMs) {
    lastDiagnostics = await readDiagnostics(page);
    const visual = lastDiagnostics?.visual ?? null;
    const ready = Boolean(
      visual
      && visual.board?.bounds
      && visual.board?.safeBounds
      && visual.intentFeed?.bounds
      && visual.intentFeed?.visible === true
      && (!requireActiveTrail || (
        visual.trail?.currentIndex !== visual.trail?.nextIndex
        && visual.trail?.progress > 0
        && visual.trail?.progress < 1
      ))
    );

    if (ready) {
      return lastDiagnostics;
    }

    await page.waitForTimeout(200);
  }

  const error = new Error(requireActiveTrail
    ? 'Timed out waiting for an active attempt lifecycle frame.'
    : 'Timed out waiting for edge live diagnostics to become ready.');
  error.lastDiagnostics = lastDiagnostics;
  throw error;
};

const createSnapshot = (stage, diagnostics, screenshotPath) => {
  const visual = diagnostics.visual;
  const runtime = diagnostics.runtime;
  const verdicts = resolveEdgeLiveVerdicts(visual);

  return {
    stage,
    screenshotPath,
    revision: visual?.revision ?? null,
    board: {
      bounds: visual?.board?.bounds ?? null,
      safeBounds: visual?.board?.safeBounds ?? null,
      tileSize: visual?.board?.tileSize ?? null
    },
    hud: {
      bounds: visual?.intentFeed?.bounds ?? null,
      visible: visual?.intentFeed?.visible ?? null,
      dock: visual?.intentFeed?.dock ?? null,
      compact: visual?.intentFeed?.compact ?? null,
      statusVisible: visual?.intentFeed?.statusVisible ?? null,
      quickThoughtCount: visual?.intentFeed?.quickThoughtCount ?? null,
      maxVisibleEvents: visual?.intentFeed?.maxVisibleEvents ?? null
    },
    trail: visual?.trail
      ? {
          start: visual.trail.start,
          limit: visual.trail.limit,
          currentIndex: visual.trail.currentIndex,
          nextIndex: visual.trail.nextIndex,
          progress: visual.trail.progress,
          cue: visual.trail.cue
        }
      : null,
    runtime: runtime?.feed
      ? {
          step: runtime.feed.step ?? null,
          signature: runtime.feed.signature ?? null,
          changeCount: runtime.feed.changeCount ?? null,
          visibleEntryCount: runtime.feed.visibleEntryCount ?? null
        }
      : null,
    telemetry: runtime?.telemetry?.summary
      ? {
          eventCount: runtime.telemetry.summary.eventCount ?? 0,
          eventCounts: runtime.telemetry.summary.eventCounts ?? {},
          eventKinds: runtime.telemetry.summary.eventKinds ?? [],
          timingWindows: runtime.telemetry.summary.timingWindows ?? [],
          failToRetryContinuation: runtime.telemetry.summary.failToRetryContinuation ?? null,
          thoughtDwell: runtime.telemetry.summary.thoughtDwell ?? null,
          mode: normalizeTelemetryMode(runtime.telemetry.summary.mode ?? runtime.telemetry.mode ?? null),
          events: Array.isArray(runtime?.telemetry?.events) ? runtime.telemetry.events : []
        }
      : null,
    projection: runtime?.projection ?? null,
    verdicts
  };
};

export const collectTelemetryEventsFromEdgeLiveCaptures = (captures) => {
  const deduped = new Map();

  for (const capture of captures) {
    const snapshots = [
      capture?.firstLoad,
      capture?.secondLoad,
      capture?.lifecycle?.available === false ? null : capture?.lifecycle
    ].filter(Boolean);
    for (const snapshot of snapshots) {
      const events = Array.isArray(snapshot?.telemetry?.events) ? snapshot.telemetry.events : [];
      for (const event of events) {
        const key = normalizeTelemetryEventKey(event);
        if (!deduped.has(key)) {
          deduped.set(key, event);
        }
      }
    }
  }

  return [...deduped.values()].sort((left, right) => (
    (Number.isFinite(left?.elapsedMs) ? left.elapsedMs : Number.MAX_SAFE_INTEGER)
    - (Number.isFinite(right?.elapsedMs) ? right.elapsedMs : Number.MAX_SAFE_INTEGER)
  ));
};

export const buildEdgeLiveReceiptFromCaptures = ({
  captures,
  runId,
  toggles
}) => {
  const events = collectTelemetryEventsFromEdgeLiveCaptures(captures);
  const mode = resolveTelemetryModeFromCaptures(captures);
  return buildTelemetryReceipt({
    kind: 'edge-live',
    label: runId,
    runId,
    toggles,
    events,
    mode,
    privacyMode: 'full',
    sessionCount: 1
  });
};

const captureViewport = async ({
  browser,
  baseUrl,
  explicitUrl,
  viewport,
  route,
  runId,
  timeoutMs,
  runDir,
  screenshotsDir,
  videosDir,
  metadataDir,
  experiment
}) => {
  const interaction = resolveEdgeLiveInteraction(runId);
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    hasTouch: interaction?.kind === 'touch',
    isMobile: interaction?.kind === 'touch',
    recordVideo: {
      dir: videosDir,
      size: { width: viewport.width, height: viewport.height }
    }
  });

  await context.addInitScript(({ key, value }) => {
    window[key] = value;
  }, {
    key: VISUAL_CAPTURE_KEY,
    value: CAPTURE_CONFIG
  });

  const page = await context.newPage();
  const consoleMessages = [];
  page.on('console', (message) => {
    consoleMessages.push({
      type: message.type(),
      text: message.text(),
      location: message.location()
    });
  });
  page.on('pageerror', (error) => {
    consoleMessages.push({
      type: 'pageerror',
      text: error.message
    });
  });

  const url = resolveViewportTargetUrl({ viewport, baseUrl, route, explicitUrl });
  const firstLoadPath = resolve(screenshotsDir, `${viewport.id}-first-load.png`);
  const secondLoadPath = resolve(screenshotsDir, `${viewport.id}-second-load.png`);
  const lifecyclePath = resolve(screenshotsDir, `${viewport.id}-attempt-lifecycle.png`);
  const metadataPath = resolve(metadataDir, `${viewport.id}.json`);
  const videoPath = resolve(videosDir, `${viewport.id}.webm`);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const firstDiagnostics = await waitForDiagnostics(page, timeoutMs);
    await page.screenshot({
      path: firstLoadPath,
      fullPage: false,
      animations: 'disabled'
    });

    await page.reload({ waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const secondDiagnostics = await waitForDiagnostics(page, timeoutMs);
    await page.screenshot({
      path: secondLoadPath,
      fullPage: false,
      animations: 'disabled'
    });

    let lifecycle = null;
    let interactionRecord = null;
    try {
      let lifecycleDiagnostics = null;
      if (interaction) {
        interactionRecord = await runEdgeLiveInteraction({
          page,
          viewport,
          timeoutMs,
          interaction
        });
        lifecycleDiagnostics = interactionRecord.finalDiagnostics ?? await readDiagnostics(page);
      } else {
        lifecycleDiagnostics = await waitForDiagnostics(page, Math.max(2_000, Math.round(timeoutMs / 3)), { requireActiveTrail: true });
      }
      await page.screenshot({
        path: lifecyclePath,
        fullPage: false,
        animations: 'disabled'
      });
      lifecycle = createSnapshot('attempt-lifecycle', lifecycleDiagnostics, relativeToRun(runDir, lifecyclePath));
    } catch (error) {
      if (interaction) {
        throw error;
      }
      lifecycle = {
        available: false
      };
    }

    const record = {
      viewport,
      url,
      route: explicitUrl ? null : route,
      experiment,
      consoleMessages,
      firstLoad: createSnapshot('first-load', firstDiagnostics, relativeToRun(runDir, firstLoadPath)),
      secondLoad: createSnapshot('second-load', secondDiagnostics, relativeToRun(runDir, secondLoadPath)),
      lifecycle,
      interaction: interactionRecord
        ? {
            ...interactionRecord,
            finalDiagnostics: undefined
          }
        : null,
      files: {
        firstLoad: relativeToRun(runDir, firstLoadPath),
        secondLoad: relativeToRun(runDir, secondLoadPath),
        lifecycle: lifecycle?.available === false ? null : relativeToRun(runDir, lifecyclePath),
        video: relativeToRun(runDir, videoPath),
        metadata: relativeToRun(runDir, metadataPath)
      }
    };

    await writeFile(metadataPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');

    await page.close();
    const video = page.video();
    if (video) {
      const rawVideoPath = await video.path();
      await copyFile(rawVideoPath, videoPath);
      await unlink(rawVideoPath);
    }

    return record;
  } finally {
    await context.close();
  }
};

const buildMarkdownSummary = ({ runId, sourceMode, baseUrl, explicitUrl, presetGroup, experiment, captures, receipt, interaction }) => {
  const playMetrics = receipt.playMetrics ?? receipt.kpis;
  const lines = [
    '# Mazer Edge Live Check',
    '',
    `- Run: ${runId}`,
    `- Source: ${sourceMode}`,
    `- Mode: ${receipt.mode ?? 'n/a'}`,
    `- Base URL: ${baseUrl}`,
    `- Explicit URL: ${explicitUrl ?? 'not provided'}`,
    `- Presets: ${presetGroup}`,
    `- Variant: ${experiment.variantId}`,
    `- Toggles: pacing ${experiment.toggles.pacing}, thought ${experiment.toggles.thoughtDensity}, fail card ${experiment.toggles.failCardTiming}, memory ${experiment.toggles.memoryBeat}, trap ${experiment.toggles.trapTelegraph}`,
    '',
    '| Viewport | Route | Board Bounds | HUD Bounds | Board Overflow | HUD Overlap | HUD Clip | Video |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |'
  ];

  for (const capture of captures) {
    const telemetry = capture.telemetry ?? { eventCount: 0, thoughtDwell: { densityPerMinute: 0 } };
    lines.push(
      `| ${capture.viewport.id} | ${capture.route ?? '-'} | ${formatBounds(capture.board.bounds)} | ${formatBounds(capture.hud.bounds)} | ${capture.verdicts.boardOverflow.pass ? 'pass' : 'fail'} | ${capture.verdicts.hudOverlap.pass ? 'pass' : 'fail'} | ${capture.verdicts.hudClip.pass ? 'pass' : 'fail'} | ${capture.files.video} |`
    );
    lines.push(`  Events: ${telemetry.eventCount}, thought density ${telemetry.thoughtDwell?.densityPerMinute ?? 0}/min`);
  }

  lines.push(
    '',
    '## Business / KPI',
    '',
    `- Event count: ${receipt.eventCount}`,
    `- Privacy mode: ${receipt.privacyMode ?? 'n/a'}`,
    `- Source CTA: ${receipt.sourceCta ?? 'n/a'}`,
    `- Experiment ids: ${receipt.experimentIds.join(', ') || experiment.variantId}`,
    `- Runs watched / session: ${receipt.kpis.runsWatchedPerSession}`,
    `- Avg watch time: ${receipt.kpis.averageWatchTimeMs ?? 'n/a'}ms`,
    `- Thought dwell: ${receipt.kpis.thoughtBoxDwellMs ?? 'n/a'}ms`,
    `- Widget attach rate: ${receipt.kpis.widgetAttachRate}`,
    `- Live activity rate: ${receipt.kpis.liveActivityStartRate}`,
    `- Paywall to purchase: ${receipt.kpis.paywallToPurchaseConversion ?? 'n/a'}`,
    `- Reduced motion adoption: ${receipt.kpis.reducedMotionAdoptionRate}`,
    `- Private mode adoption: ${receipt.kpis.privateModeAdoptionRate}`,
    '',
    '## Play Metrics',
    '',
    `- Controls used: total ${playMetrics.controlUsedCount}; keyboard ${playMetrics.controlUsedByControl.keyboard}; touch ${playMetrics.controlUsedByControl.touch}; restart ${playMetrics.controlUsedByControl.restart}; pause ${playMetrics.controlUsedByControl.pause}; toggle ${playMetrics.controlUsedByControl.toggle_thoughts}`,
    `- Action mix: move ${playMetrics.controlUsedByAction.move}; pause ${playMetrics.controlUsedByAction.pause}; restart ${playMetrics.controlUsedByAction.restart}; toggle thoughts ${playMetrics.controlUsedByAction.toggle_thoughts}`,
    `- Watch -> play switch: count ${playMetrics.watchToPlaySwitchCount}, rate ${playMetrics.watchToPlaySwitchRate ?? 'n/a'}`,
    `- Play fail -> retry continuation: count ${playMetrics.playFailToRetryContinuationCount}, rate ${playMetrics.playFailToRetryContinuationRate ?? 'n/a'}`,
    '',
    '## Watch Pass Funnel',
    '',
    ...buildWatchPassFunnelLines(receipt),
  );

  if (interaction) {
    lines.push(
      '',
      '## Interactive Proof',
      '',
      `- Mode: ${interaction.mode ?? 'n/a'}`,
      `- Input: ${interaction.inputKind ?? 'n/a'}`,
      `- Control used count: ${interaction.controlUsedCount ?? 0}`,
      `- State changed: ${interaction.changed ? 'yes' : 'no'}`,
      '- Input timeline:'
    );

    for (const step of interaction.keyTimeline ?? []) {
      lines.push(`  - ${step.id}: ${step.kind} ${step.input ?? 'n/a'} changed=${step.changed ? 'yes' : 'no'}`);
    }
  }

  lines.push(
    '',
    '## Notes',
    '',
    '- First load, second load, and an active-motion attempt frame are captured when available.',
    '- Board overflow compares the published board bounds against the safe frame.',
    '- HUD overlap checks the intent feed rectangle against the maze board bounds.',
    '- HUD clip checks the intent feed rectangle against the viewport bounds.'
  );

  return `${lines.join('\n')}\n`;
};

const formatBounds = (bounds) => (
  bounds
    ? `${Math.round(bounds.left)},${Math.round(bounds.top)} ${Math.round(bounds.width)}x${Math.round(bounds.height)}`
    : '-'
);

const resolveSourceMode = ({ explicitUrl, previewUsed }) => {
  if (typeof explicitUrl === 'string' && explicitUrl.trim().length > 0) {
    return 'explicit-url';
  }

  return previewUsed ? 'existing-preview' : 'local-preview';
};

const waitForProofSurfaceDiagnostics = async (page, timeoutMs) => {
  await page.waitForFunction(
    (signalKey) => Boolean(window[signalKey]?.ready),
    PROOF_SURFACE_SIGNAL_KEY,
    { timeout: timeoutMs }
  );

  return page.evaluate((signalKey) => window[signalKey]?.getDiagnostics?.() ?? window[signalKey] ?? null, PROOF_SURFACE_SIGNAL_KEY);
};

const resolveWorkflowViewports = (workflow) => {
  const allViewports = resolveLayoutMatrixViewports(DEFAULT_PRESET_GROUP);
  const allowedIds = new Set(workflow.viewportIds);
  return allViewports.filter((viewport) => allowedIds.has(viewport.id));
};

const captureProofSurfaceRoute = async ({
  browser,
  workflowId,
  baseUrl,
  routeDefinition,
  viewport,
  timeoutMs,
  runDir,
  screenshotsDir,
  metadataDir,
  interactive = null
}) => {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    reducedMotion: 'reduce'
  });
  const page = await context.newPage();
  const consoleMessages = [];
  const httpFailures = [];
  const httpFailureKeys = new Set();
  let currentStage = 'initial-load';

  page.on('console', (message) => {
    consoleMessages.push({
      type: message.type(),
      text: message.text()
    });
  });
  page.on('response', (response) => {
    if (response.status() !== 404) {
      return;
    }

    const request = response.request();
    const key = `404|${request.method()}|${request.resourceType()}|${response.url()}`;
    if (httpFailureKeys.has(key)) {
      return;
    }

    httpFailureKeys.add(key);
    httpFailures.push({
      stage: currentStage,
      status: response.status(),
      method: request.method(),
      resourceType: request.resourceType(),
      url: response.url()
    });
  });
  page.on('pageerror', (error) => {
    consoleMessages.push({
      type: 'pageerror',
      text: error.message
    });
  });

  const url = `${normalizeBaseUrl(baseUrl)}${routeDefinition.route}`;
  const screenshotPath = resolve(screenshotsDir, `${routeDefinition.id}-${viewport.id}.png`);
  const lifecycleScreenshotPath = resolve(screenshotsDir, `${routeDefinition.id}-${viewport.id}.lifecycle.png`);
  const failureScreenshotPath = resolve(screenshotsDir, `${routeDefinition.id}-${viewport.id}.failure.png`);
  const metadataPath = resolve(metadataDir, `${routeDefinition.id}-${viewport.id}.json`);
  const failureMetadataPath = resolve(metadataDir, `${routeDefinition.id}-${viewport.id}.failure.json`);

  const assertNoProofSurface404s = async (stage) => {
    const firstFailure = httpFailures[0];
    if (!firstFailure) {
      return;
    }

    const error = new Error(
      `Proof-shell 404 detected while capturing ${routeDefinition.id} on ${viewport.id} during ${stage}: ${firstFailure.url}`
    );
    error.code = PROOF_SURFACE_404_FAILURE_CODE;
    error.failureStage = stage;
    error.httpFailures = httpFailures;
    error.failurePath = failureMetadataPath;
    throw error;
  };

  try {
    currentStage = 'first-load';
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const diagnostics = await waitForProofSurfaceDiagnostics(page, timeoutMs);
    await page.screenshot({
      path: screenshotPath,
      fullPage: false,
      animations: 'disabled'
    });
    await assertNoProofSurface404s('first-load');

    let interaction = null;
    let interactionScreenshotPath = null;
    let lifecycle = null;

    if (interactive) {
      const baselineState = summarizeEdgeLiveInteractiveState(diagnostics);
      const timeline = [];
      const waitAfterKey = async (ms) => {
        await page.waitForTimeout(Math.max(0, Math.round(ms)));
      };

      if (baselineState.mode !== 'play') {
        const beforeSwitch = summarizeEdgeLiveInteractiveState(await readDiagnostics(page));
        await page.keyboard.press(interactive.ensureModeKey ?? 'm');
        await waitAfterKey(interactive.controlWaitMs ?? 160);
        const afterSwitchDiagnostics = await waitForProofSurfaceDiagnostics(page, timeoutMs);
        const afterSwitch = summarizeEdgeLiveInteractiveState(afterSwitchDiagnostics);
        timeline.push({
          id: 'ensure-play-mode',
          kind: 'mode',
          key: interactive.ensureModeKey ?? 'm',
          before: beforeSwitch,
          after: afterSwitch,
          changed: hasInteractiveStateDelta(beforeSwitch, afterSwitch)
        });

        if (afterSwitch.mode !== 'play') {
          const error = new Error(`Interactive play workflow did not switch into play mode on ${viewport.id}.`);
          error.code = INTERACTIVE_PLAY_FAILURE_CODE;
          error.failureStage = 'ensure-play-mode';
          error.interaction = {
            runId: INTERACTIVE_PLAY_MODE_RUN_ID,
            baseline: baselineState,
            timeline
          };
          throw error;
        }
      } else {
        timeline.push({
          id: 'ensure-play-mode',
          kind: 'mode',
          key: null,
          before: baselineState,
          after: baselineState,
          changed: false
        });
      }

      const runInteractiveStep = async (step) => {
        const before = summarizeEdgeLiveInteractiveState(await readDiagnostics(page));
        await page.keyboard.press(step.key);
        await waitAfterKey(step.kind === 'movement'
          ? interactive.movementWaitMs ?? 180
          : interactive.controlWaitMs ?? 160);
        const afterDiagnostics = await waitForProofSurfaceDiagnostics(page, timeoutMs);
        const after = summarizeEdgeLiveInteractiveState(afterDiagnostics);
        timeline.push({
          id: step.id,
          kind: step.kind,
          key: step.key,
          before,
          after,
          changed: hasInteractiveStateDelta(before, after)
        });
        return afterDiagnostics;
      };

      let finalDiagnostics = diagnostics;
      const movementSteps = interactive.timeline.filter((step) => step.kind === 'movement');
      const controlSteps = interactive.timeline.filter((step) => step.kind === 'control');
      let movementChanged = false;

      for (const step of movementSteps) {
        finalDiagnostics = await runInteractiveStep(step);
        if (hasInteractiveStateDelta(summarizeEdgeLiveInteractiveState(diagnostics), summarizeEdgeLiveInteractiveState(finalDiagnostics))) {
          movementChanged = true;
          break;
        }
      }

      for (const step of controlSteps) {
        finalDiagnostics = await runInteractiveStep(step);
      }

      if (!movementChanged) {
        const error = new Error(`Interactive play workflow on ${viewport.id} did not change runtime or projection state after movement.`);
        error.code = INTERACTIVE_PLAY_FAILURE_CODE;
        error.failureStage = 'interaction-state-delta';
        error.interaction = {
          runId: INTERACTIVE_PLAY_MODE_RUN_ID,
          baseline: baselineState,
          timeline,
          final: summarizeEdgeLiveInteractiveState(finalDiagnostics)
        };
        throw error;
      }

      const lifecycleDiagnostics = await waitForProofSurfaceDiagnostics(page, Math.max(2_000, Math.round(timeoutMs / 3)));
      await page.screenshot({
        path: lifecycleScreenshotPath,
        fullPage: false,
        animations: 'disabled'
      });
      interactionScreenshotPath = lifecycleScreenshotPath;
      lifecycle = createSnapshot('attempt-lifecycle', lifecycleDiagnostics, relativeToRun(runDir, lifecycleScreenshotPath));
      const finalState = summarizeEdgeLiveInteractiveState(lifecycleDiagnostics);
      const controlUsedCount = finalState.controlUsedCount;
      if (controlUsedCount <= 0) {
        const error = new Error(`Interactive play workflow on ${viewport.id} did not record any control_used events.`);
        error.code = INTERACTIVE_PLAY_FAILURE_CODE;
        error.failureStage = 'interaction-control-events';
        error.interaction = {
          runId: INTERACTIVE_PLAY_MODE_RUN_ID,
          baseline: baselineState,
          timeline,
          final: finalState
        };
        throw error;
      }

      interaction = {
        runId: INTERACTIVE_PLAY_MODE_RUN_ID,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        baseline: baselineState,
        final: finalState,
        keyTimeline: timeline,
        controlUsedCount,
        changed: hasInteractiveStateDelta(baselineState, finalState),
        mode: finalState.mode
      };
    } else {
      try {
        const lifecycleDiagnostics = await waitForProofSurfaceDiagnostics(page, Math.max(2_000, Math.round(timeoutMs / 3)), { requireActiveTrail: true });
        await page.screenshot({
          path: lifecycleScreenshotPath,
          fullPage: false,
          animations: 'disabled'
        });
        lifecycle = createSnapshot('attempt-lifecycle', lifecycleDiagnostics, relativeToRun(runDir, lifecycleScreenshotPath));
      } catch {
        lifecycle = {
          available: false
        };
      }
    }

    const record = {
      routeId: routeDefinition.id,
      routeLabel: routeDefinition.label,
      route: routeDefinition.route,
      viewport,
      url,
      diagnostics,
      consoleMessages,
      interaction,
      files: {
        screenshot: relativeToRun(runDir, screenshotPath),
        metadata: relativeToRun(runDir, metadataPath),
        ...(interactionScreenshotPath
          ? { interaction: relativeToRun(runDir, interactionScreenshotPath) }
          : {})
      }
    };

    await writeFile(metadataPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    return record;
  } catch (error) {
    let partialScreenshotPath = null;

    try {
      await page.screenshot({
        path: failureScreenshotPath,
        fullPage: false,
        animations: 'disabled'
      });
      partialScreenshotPath = failureScreenshotPath;
    } catch {
      partialScreenshotPath = null;
    }

    const failureArtifact = buildProofSurfaceFailureArtifact({
      error,
      workflowId,
      routeDefinition,
      viewport,
      url,
      stage: error?.failureStage ?? currentStage,
      httpFailures,
      consoleMessages,
      runDir,
      metadataPath: failureMetadataPath,
      screenshotPath: partialScreenshotPath
    });

    await writeFile(failureMetadataPath, `${JSON.stringify(failureArtifact, null, 2)}\n`, 'utf8');

    if (error instanceof Error) {
      error.failurePath = failureMetadataPath;
      error.httpFailures = httpFailures;
      if (!error.code) {
        error.code = PROOF_SURFACE_404_FAILURE_CODE;
      }
      throw error;
    }

    const wrappedError = new Error(String(error));
    wrappedError.code = PROOF_SURFACE_404_FAILURE_CODE;
    wrappedError.failurePath = failureMetadataPath;
    wrappedError.httpFailures = httpFailures;
    throw wrappedError;
  } finally {
    await context.close();
  }
};

const buildProofSurfaceMarkdownSummary = ({ workflowId, runId, sourceMode, baseUrl, captures, interaction }) => {
  const receipt = captures.find((capture) => capture?.diagnostics?.receipt)?.diagnostics?.receipt ?? null;
  const lines = [
    '# Mazer Edge Live Proof Surfaces',
    '',
    `- Workflow: ${workflowId}`,
    `- Run: ${runId}`,
    `- Source: ${sourceMode}`,
    `- Mode: ${receipt?.mode ?? 'n/a'}`,
    `- Base URL: ${baseUrl}`,
    '',
    '| Route | Viewport | Surface | Fixture | Skin | Modes | Screenshot |',
    '| --- | --- | --- | --- | --- | --- | --- |'
  ];

  for (const capture of captures) {
    lines.push(
      `| ${capture.routeId} | ${capture.viewport.id} | ${capture.diagnostics?.surface ?? '-'} | ${capture.diagnostics?.fixture ?? '-'} | ${capture.diagnostics?.skin ?? '-'} | ${(capture.diagnostics?.modes ?? []).join(', ') || '-'} | ${capture.files.screenshot} |`
    );
    if (capture.diagnostics?.receipt) {
      lines.push(`  Receipt: events ${capture.diagnostics.receipt.eventCount}, privacy ${capture.diagnostics.receipt.privacyMode ?? 'n/a'}, widget ${capture.diagnostics.receipt.kpis?.widgetAttachRate ?? 'n/a'}, live ${capture.diagnostics.receipt.kpis?.liveActivityStartRate ?? 'n/a'}`);
    }
  }

  lines.push(
    '',
    '## Watch Pass Funnel',
    '',
    ...buildWatchPassFunnelLines(receipt)
  );

  if (interaction) {
    lines.push(
      '',
      '## Interactive Proof',
      '',
      `- Mode: ${interaction.mode ?? 'n/a'}`,
      `- Control used count: ${interaction.controlUsedCount ?? 0}`,
      `- State changed: ${interaction.changed ? 'yes' : 'no'}`,
      '- Key timeline:'
    );

    for (const step of interaction.keyTimeline ?? []) {
      lines.push(
        `  - ${step.id}: ${step.kind} ${step.key ?? 'n/a'} changed=${step.changed ? 'yes' : 'no'}`
      );
    }
  }

  return `${lines.join('\n')}\n`;
};

export const captureEdgeLiveProofWorkflow = async ({
  workflowId,
  baseUrl = DEFAULT_BASE_URL,
  runId,
  timeoutMs = EDGE_LIVE_DEFAULT_CAPTURE_TIMEOUT_MS,
  previewTimeoutMs = EDGE_LIVE_DEFAULT_PREVIEW_TIMEOUT_MS,
  skipBuild = false,
  headless = DEFAULT_HEADLESS
} = {}) => {
  const workflow = resolveEdgeLiveWorkflow(workflowId);
  if (!workflow) {
    throw new Error(`Unknown edge live proof workflow: ${workflowId}`);
  }

  const requestedBaseUrl = normalizeBaseUrl(baseUrl);
  const resolvedRunId = resolveSessionId(runId ?? workflow.runId ?? workflowId);
  const runPaths = resolveEdgeLiveRunPaths(resolvedRunId);
  const previewUsed = !(await isBaseUrlReady(requestedBaseUrl));
  const preview = previewUsed
    ? await (async () => {
      if (!skipBuild) {
        await import('node:child_process').then(({ execFileSync }) => {
          if (process.platform === 'win32') {
            execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm run build'], {
              cwd: REPO_ROOT,
              stdio: 'inherit'
            });
            return;
          }

          execFileSync('npm', ['run', 'build'], {
            cwd: REPO_ROOT,
            stdio: 'inherit'
          });
        });
      }

      return launchPreviewServer({
        requestedBaseUrl,
        previewTimeoutMs
      });
    })()
    : null;
  const resolvedBaseUrl = normalizeBaseUrl(preview?.baseUrl ?? requestedBaseUrl);
  const sourceMode = resolveSourceMode({ explicitUrl: null, previewUsed });
  const browser = await chromium.launch({
    channel: 'msedge',
    headless,
    args: ['--use-angle=swiftshader']
  });

  await ensureDir(EDGE_LIVE_ROOT);
  await ensureDir(runPaths.runDir);
  await ensureDir(runPaths.screenshotsDir);
  await ensureDir(runPaths.metadataDir);

  try {
    const viewports = resolveWorkflowViewports(workflow);
    const captures = [];

    for (const routeDefinition of workflow.routes) {
      for (const viewport of viewports) {
        captures.push(await captureProofSurfaceRoute({
          browser,
          workflowId,
          baseUrl: resolvedBaseUrl,
          routeDefinition,
          viewport,
          timeoutMs,
          runDir: runPaths.runDir,
          screenshotsDir: runPaths.screenshotsDir,
          metadataDir: runPaths.metadataDir,
          interactive: workflow.interactive ?? null
        }));
      }
    }

    const interactive = captures.find((capture) => capture?.interaction)?.interaction ?? null;

    const summary = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      workflowId,
      runId: resolvedRunId,
      source: {
        mode: sourceMode,
        baseUrl: resolvedBaseUrl
      },
      artifactRoot: runPaths.runDir,
      files: {
        markdown: relativeToRun(runPaths.runDir, runPaths.markdownPath)
      },
      captures
    };

    const markdown = buildProofSurfaceMarkdownSummary({
      workflowId,
      runId: resolvedRunId,
      sourceMode,
      baseUrl: resolvedBaseUrl,
      captures,
      interaction: interactive
    });

    await writeFile(runPaths.summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    await writeFile(runPaths.markdownPath, markdown, 'utf8');

    return {
      runDir: runPaths.runDir,
      summaryPath: runPaths.summaryPath,
      markdownPath: runPaths.markdownPath,
      summary
    };
  } finally {
    await browser.close();
    if (preview) {
      await stopPreviewServer(preview.child);
    }
  }
};

export const captureEdgeLive = async ({
  baseUrl = DEFAULT_BASE_URL,
  url,
  route,
  presetGroup = DEFAULT_PRESET_GROUP,
  runId,
  timeoutMs = EDGE_LIVE_DEFAULT_CAPTURE_TIMEOUT_MS,
  previewTimeoutMs = EDGE_LIVE_DEFAULT_PREVIEW_TIMEOUT_MS,
  skipBuild = false,
  headless = DEFAULT_HEADLESS,
  experiment = resolveExperimentSelection()
} = {}) => {
  const explicitUrl = typeof url === 'string' && url.trim().length > 0 ? url.trim() : null;
  const requestedBaseUrl = normalizeBaseUrl(baseUrl);
  const resolvedRunId = resolveSessionId(runId);
  const resolvedRoute = route ?? resolveEdgeLiveDefaultRoute(runId);
  const runPaths = resolveEdgeLiveRunPaths(resolvedRunId);
  const viewports = resolveEdgeLiveViewports(presetGroup, resolvedRunId);

  await ensureDir(EDGE_LIVE_ROOT);
  await ensureDir(runPaths.runDir);
  await ensureDir(runPaths.screenshotsDir);
  await ensureDir(runPaths.videosDir);
  await ensureDir(runPaths.metadataDir);

  const previewUsed = !explicitUrl && !(await isBaseUrlReady(requestedBaseUrl));
  const preview = previewUsed
    ? await (async () => {
      if (!skipBuild) {
        await import('node:child_process').then(({ execFileSync }) => {
          if (process.platform === 'win32') {
            execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm run build'], {
              cwd: REPO_ROOT,
              stdio: 'inherit'
            });
            return;
          }

          execFileSync('npm', ['run', 'build'], {
            cwd: REPO_ROOT,
            stdio: 'inherit'
          });
        });
      }

      return launchPreviewServer({
        requestedBaseUrl,
        previewTimeoutMs
      });
    })()
    : null;

  const resolvedBaseUrl = normalizeBaseUrl(preview?.baseUrl ?? requestedBaseUrl);
  const sourceMode = resolveSourceMode({ explicitUrl, previewUsed });
  const experimentManifest = buildExperimentManifest({
    kind: 'edge-live',
    label: resolvedRunId,
    runId: resolvedRunId,
    toggles: experiment.toggles
  });
  const browser = await chromium.launch({
    channel: 'msedge',
    headless,
    args: ['--use-angle=swiftshader']
  });

  try {
    const captures = [];

    for (const viewport of viewports) {
      captures.push(await captureViewport({
        browser,
        baseUrl: resolvedBaseUrl,
        explicitUrl,
        viewport,
        route: resolvedRoute,
        runId: resolvedRunId,
        timeoutMs,
        runDir: runPaths.runDir,
        screenshotsDir: runPaths.screenshotsDir,
        videosDir: runPaths.videosDir,
        metadataDir: runPaths.metadataDir,
        experiment: experimentManifest
      }));
    }

    const receipt = buildEdgeLiveReceiptFromCaptures({
      captures,
      runId: resolvedRunId,
      toggles: experiment.toggles
    });
    const interaction = captures.find((capture) => capture?.interaction)?.interaction ?? null;

    const summary = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      runId: resolvedRunId,
      experiment: experimentManifest,
      business: {
        eventCount: receipt.eventCount,
        experimentIds: receipt.experimentIds,
        mode: receipt.mode,
        privacyMode: receipt.privacyMode,
        sourceCta: receipt.sourceCta,
        sourceCtas: receipt.sourceCtas,
        planIds: receipt.planIds,
        kpis: receipt.kpis,
        playMetrics: receipt.playMetrics,
        watchPass: {
          mode: receipt.mode,
          sourceCta: receipt.sourceCta,
          sourceCtas: receipt.sourceCtas,
          planIds: receipt.planIds,
          paywallViewCount: receipt.kpis.paywallViewCount,
          planSelectedCount: receipt.kpis.planSelectedCount,
          paywallViewToPlanSelect: receipt.kpis.paywall_view_to_plan_select,
          paywallViewToPurchaseCompleted: receipt.kpis.paywall_view_to_purchase_completed,
          purchaseCompletedCount: receipt.kpis.purchaseCompletedCount,
          widgetAttachRate: receipt.kpis.widget_attach_rate,
          liveActivityStartRate: receipt.kpis.live_activity_start_rate,
          reducedMotionAdoption: receipt.kpis.reduced_motion_adoption,
          privateModeAdoption: receipt.kpis.private_mode_adoption
        }
      },
      source: {
        mode: sourceMode,
        baseUrl: resolvedBaseUrl,
        explicitUrl
      },
      presetGroup,
      artifactRoot: runPaths.runDir,
      files: {
        markdown: relativeToRun(runPaths.runDir, runPaths.markdownPath),
      experiment: relativeToRun(runPaths.runDir, resolve(runPaths.runDir, 'experiment.json')),
      receipt: relativeToRun(runPaths.runDir, resolve(runPaths.runDir, 'receipt.json'))
    },
      captures: captures.map((capture) => ({
        viewport: capture.viewport,
        route: capture.route,
        url: capture.url,
        experiment: capture.experiment,
        files: capture.files,
        board: capture.secondLoad.board,
        hud: capture.secondLoad.hud,
        verdicts: capture.secondLoad.verdicts,
        telemetry: capture.secondLoad.telemetry,
        projection: capture.secondLoad.projection,
        lifecycle: capture.lifecycle,
        interaction: capture.interaction,
        consoleMessageCount: capture.consoleMessages.length
      }))
    };

    const markdown = buildMarkdownSummary({
      runId: resolvedRunId,
      sourceMode,
      baseUrl: resolvedBaseUrl,
      explicitUrl,
      presetGroup,
      experiment: experimentManifest,
      captures: summary.captures,
      receipt,
      interaction
    });

    await writeFile(resolve(runPaths.runDir, 'experiment.json'), `${JSON.stringify(experimentManifest, null, 2)}\n`, 'utf8');
    await writeFile(resolve(runPaths.runDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    await writeFile(runPaths.summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    await writeFile(runPaths.markdownPath, markdown, 'utf8');

    return {
      runDir: runPaths.runDir,
      summaryPath: runPaths.summaryPath,
      markdownPath: runPaths.markdownPath,
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
  const experiment = resolveExperimentSelection(args);
  const workflow = typeof args.run === 'string' ? resolveEdgeLiveWorkflow(args.run) : null;
  const result = workflow
    ? await captureEdgeLiveProofWorkflow({
      workflowId: args.run,
      baseUrl: typeof args['base-url'] === 'string' ? args['base-url'] : DEFAULT_BASE_URL,
      runId: typeof args['run-id'] === 'string' ? args['run-id'] : undefined,
      timeoutMs: parseIntegerArg(args.timeout, EDGE_LIVE_DEFAULT_CAPTURE_TIMEOUT_MS),
      previewTimeoutMs: parseIntegerArg(args['preview-timeout'], EDGE_LIVE_DEFAULT_PREVIEW_TIMEOUT_MS),
      skipBuild: args['skip-build'] === true || args['skip-build'] === 'true',
      headless: args.headless === undefined ? DEFAULT_HEADLESS : !(args.headless === false || args.headless === 'false')
    })
    : await captureEdgeLive({
      baseUrl: typeof args['base-url'] === 'string' ? args['base-url'] : DEFAULT_BASE_URL,
      url: typeof args.url === 'string' ? args.url : undefined,
      route: typeof args.route === 'string' ? args.route : undefined,
      presetGroup: typeof args.preset === 'string' ? args.preset : DEFAULT_PRESET_GROUP,
      runId: typeof args.run === 'string' ? args.run : undefined,
      timeoutMs: parseIntegerArg(args.timeout, EDGE_LIVE_DEFAULT_CAPTURE_TIMEOUT_MS),
      previewTimeoutMs: parseIntegerArg(args['preview-timeout'], EDGE_LIVE_DEFAULT_PREVIEW_TIMEOUT_MS),
      skipBuild: args['skip-build'] === true || args['skip-build'] === 'true',
      headless: args.headless === undefined ? DEFAULT_HEADLESS : !(args.headless === false || args.headless === 'false'),
      experiment
    });

  process.stdout.write(`${JSON.stringify({
    runDir: result.runDir,
    summaryPath: result.summaryPath,
    markdownPath: result.markdownPath,
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
