import { describe, expect, test } from 'vitest';

const loadEdgeLiveHelpers = async () => {
  // @ts-expect-error The helper module is plain .mjs without TS declarations.
  return await import('../../scripts/visual/edge-live-check.mjs');
};

describe('edge live check', () => {
  test('builds edge-live experiment metadata from toggles', async () => {
    const { buildEdgeLiveExperiment } = await loadEdgeLiveHelpers();

    const experiment = buildEdgeLiveExperiment({
      label: 'surface-smoke',
      runId: 'session-17',
      toggles: {
        pacing: '0.7x',
        thoughtDensity: 'sparse',
        failCardTiming: '0.8s',
        memoryBeat: 'on',
        trapTelegraph: 'baseline'
      }
    });

    expect(experiment.variantId).toBe('p70-thought-sparse-fail-08-memory-on-trap-baseline');
    expect(experiment.toggles).toEqual({
      pacing: '0.7x',
      thoughtDensity: 'sparse',
      failCardTiming: '0.8s',
      memoryBeat: 'on',
      trapTelegraph: 'baseline'
    });
  }, 15_000);

  test('reuses the core layout matrix preset set', async () => {
    const { resolveEdgeLiveDefaultRoute, resolveEdgeLiveRunPaths } = await loadEdgeLiveHelpers();
    // @ts-expect-error The helper module is plain .mjs without TS declarations.
    const { resolveLayoutMatrixViewports } = await import('../../scripts/visual/layout-matrix.config.mjs');

    expect(resolveLayoutMatrixViewports('core').map((viewport: { id: string }) => viewport.id)).toEqual([
      'phone-portrait',
      'phone-tall',
      'phone-landscape',
      'tablet-portrait',
      'tablet-landscape',
      'laptop',
      'desktop',
      'desktop-wide'
    ]);
    expect(resolveEdgeLiveRunPaths('2026-04-18')).toMatchObject({
      runDir: expect.stringContaining('mazer-edge-live'),
      screenshotsDir: expect.stringContaining('screenshots'),
      videosDir: expect.stringContaining('videos')
    });
    expect(resolveEdgeLiveDefaultRoute('watch-play-shell')).toBe('/?mode=play&theme=aurora');
    expect(resolveEdgeLiveDefaultRoute('play-mode-smoke')).toBe('/?mode=play&theme=ember');
    expect(resolveEdgeLiveDefaultRoute('play-hud-trim')).toBe('/?mode=play&theme=aurora');
    expect(resolveEdgeLiveDefaultRoute('play-mode-interactive')).toBe('/?theme=aurora');
    expect(resolveEdgeLiveDefaultRoute('mobile-touch-smoke')).toBe('/?mode=play&theme=aurora');
    expect(resolveEdgeLiveDefaultRoute('legend-risk-telegraph')).toBeUndefined();
  }, 15_000);

  test('prefers explicit urls and derives board/hud verdicts from bounds', async () => {
    const { resolveEdgeLiveTargetUrl, resolveEdgeLiveVerdicts } = await loadEdgeLiveHelpers();
    const viewport = { id: 'desktop', label: 'Desktop', width: 1440, height: 900 };

    expect(resolveEdgeLiveTargetUrl(viewport, {
      baseUrl: 'http://127.0.0.1:4173',
      route: '/?profile=tv&theme=noir'
    })).toBe('http://127.0.0.1:4173/?profile=tv&theme=noir&runtimeDiagnostics=1');
    expect(resolveEdgeLiveTargetUrl(viewport, {
      baseUrl: 'http://127.0.0.1:4173',
      url: 'https://preview.example.test/mazer'
    })).toBe('https://preview.example.test/mazer?runtimeDiagnostics=1');

    const verdicts = resolveEdgeLiveVerdicts({
      viewport: { width: 1440, height: 900 },
      board: {
        bounds: { left: 220, top: 160, right: 820, bottom: 760 },
        safeBounds: { left: 200, top: 140, right: 840, bottom: 780 }
      },
      intentFeed: {
        bounds: { left: 860, top: 160, right: 1240, bottom: 620 },
        visible: true
      }
    });

    expect(verdicts.boardOverflow.pass).toBe(true);
    expect(verdicts.hudOverlap.pass).toBe(true);
    expect(verdicts.hudClip.pass).toBe(true);

    const overlapVerdicts = resolveEdgeLiveVerdicts({
      viewport: { width: 1440, height: 900 },
      board: {
        bounds: { left: 220, top: 160, right: 820, bottom: 760 },
        safeBounds: { left: 200, top: 140, right: 840, bottom: 780 }
      },
      intentFeed: {
        bounds: { left: 760, top: 240, right: 980, bottom: 700 },
        visible: true
      }
    });

    expect(overlapVerdicts.boardOverflow.pass).toBe(true);
    expect(overlapVerdicts.hudOverlap.pass).toBe(false);
    expect(overlapVerdicts.hudClip.pass).toBe(true);
  }, 15_000);

  test('resolves proof-surface workflows for the reduced projection routes', async () => {
    const { resolveEdgeLiveWorkflow } = await loadEdgeLiveHelpers();

    const shellWorkflow = resolveEdgeLiveWorkflow('projection-proof-shell');
    const activeWorkflow = resolveEdgeLiveWorkflow('projection-proof-active');
    const watchPassWorkflow = resolveEdgeLiveWorkflow('watch-pass-preview');
    const watchPassSetupWorkflow = resolveEdgeLiveWorkflow('watch-pass-setup');

    expect(shellWorkflow).toMatchObject({
      runId: 'projection-proof-shell',
      viewportIds: ['phone-portrait', 'desktop']
    });
    expect(shellWorkflow.routes).toHaveLength(2);
    expect(shellWorkflow.routes[0].route).toContain('/proof-surfaces.html?surface=all');
    expect(shellWorkflow.routes[0].route).toContain('mode=all');
    expect(activeWorkflow.routes.map((route: { id: string }) => route.id)).toEqual([
      'active-building',
      'active-watching',
      'active-failed'
    ]);
    expect(watchPassWorkflow.routes.map((route: { id: string }) => route.id)).toEqual([
      'watch-pass-ios-full',
      'watch-pass-android-compact',
      'watch-pass-ios-private',
      'watch-pass-paywall-yearly'
    ]);
    expect(watchPassSetupWorkflow.routes.map((route: { id: string }) => route.id)).toEqual([
      'watch-pass-setup-snapshot',
      'watch-pass-setup-active-private',
      'watch-pass-setup-ambient-compact'
    ]);
    expect(resolveEdgeLiveWorkflow('play-mode-interactive')).toBeNull();
    expect(resolveEdgeLiveWorkflow('matrix-readiness-smoke')).toBeNull();
  }, 15_000);

  test('summarizes interactive state and resolves movement keys from trail deltas', async () => {
    const { resolvePlayModeMovementKeyFromTrail, summarizeEdgeLiveInteractiveState } = await loadEdgeLiveHelpers();

    expect(resolvePlayModeMovementKeyFromTrail({ currentIndex: 4, nextIndex: 5 }, 4)).toBe('ArrowRight');
    expect(resolvePlayModeMovementKeyFromTrail({ currentIndex: 4, nextIndex: 8 }, 4)).toBe('ArrowDown');
    expect(resolvePlayModeMovementKeyFromTrail({ currentIndex: 4, nextIndex: 4 }, 4)).toBeNull();

    expect(summarizeEdgeLiveInteractiveState({
      runtime: {
        telemetry: {
          summary: {
            mode: 'play',
            eventCounts: {
              control_used: 3
            }
          }
        },
        projection: {
          mode: 'play',
          state: 'watching',
          progressPct: 28,
          riskLevel: 'medium',
          miniMapHash: 'abc123',
          elapsedMs: 1200
        },
        feed: {
          signature: 'intent|1',
          step: 4,
          changeCount: 2,
          visibleEntryCount: 2
        }
      },
      visual: {
        trail: {
          currentIndex: 9,
          nextIndex: 10,
          progress: 0.45,
          cue: 'moving'
        }
      }
    })).toMatchObject({
      mode: 'play',
      controlUsedCount: 3,
      projection: {
        state: 'watching'
      },
      trail: {
        nextIndex: 10
      }
    });
  }, 15_000);

  test('aggregates business receipts from captured telemetry events', async () => {
    const { buildEdgeLiveReceiptFromCaptures } = await loadEdgeLiveHelpers();

    const receipt = buildEdgeLiveReceiptFromCaptures({
      runId: 'business-kpis-smoke',
      toggles: {
        pacing: '0.8x',
        thoughtDensity: 'richer',
        failCardTiming: '1.3s',
        memoryBeat: 'on',
        trapTelegraph: 'baseline'
      },
      captures: [
        {
          secondLoad: {
            telemetry: {
              events: [
                {
                  eventId: 'evt-1',
                  kind: 'paywall_viewed',
                  runId: 'business-kpis-smoke',
                  createdAt: '2026-04-18T12:00:00.000Z',
                  elapsedMs: 0,
                  privacyMode: 'compact',
                  mode: 'watch',
                  payload: { entryPoint: 'watch-pass-preview', ctaLabel: 'Watch Pass preview', sourceCta: 'watch-pass-preview' }
                },
                {
                  eventId: 'evt-1b',
                  kind: 'plan_selected',
                  runId: 'business-kpis-smoke',
                  createdAt: '2026-04-18T12:00:00.500Z',
                  elapsedMs: 500,
                  privacyMode: 'compact',
                  mode: 'play',
                  payload: { planId: 'yearly', sourceCta: 'watch-pass-preview', emphasis: 'emphasized' }
                },
                {
                  eventId: 'evt-2',
                  kind: 'widget_configured',
                  runId: 'business-kpis-smoke',
                  createdAt: '2026-04-18T12:00:01.000Z',
                  elapsedMs: 1000,
                  mode: 'play',
                  payload: { surface: 'android-widget', placement: 'preview-shell' }
                }
              ]
            }
          },
          lifecycle: {
            telemetry: {
              events: [
                {
                  eventId: 'evt-3',
                  kind: 'live_activity_started',
                  runId: 'business-kpis-smoke',
                  createdAt: '2026-04-18T12:00:02.000Z',
                  elapsedMs: 2000,
                  mode: 'play',
                  payload: { surface: 'ios-active-run', placement: 'preview-shell' }
                },
                {
                  eventId: 'evt-4',
                  kind: 'control_used',
                  runId: 'business-kpis-smoke',
                  createdAt: '2026-04-18T12:00:02.400Z',
                  elapsedMs: 2400,
                  mode: 'play',
                  payload: { control: 'keyboard', source: 'play-shell' }
                }
              ]
            }
          }
        }
      ]
    });

    expect(receipt.eventCount).toBe(5);
    expect(receipt.eventCounts.paywall_viewed).toBe(1);
    expect(receipt.eventCounts.plan_selected).toBe(1);
    expect(receipt.eventCounts.widget_configured).toBe(1);
    expect(receipt.eventCounts.live_activity_started).toBe(1);
    expect(receipt.eventCounts.control_used).toBe(1);
    expect(receipt.mode).toBe('play');
    expect(receipt.sourceCta).toBe('watch-pass-preview');
    expect(receipt.sourceCtas).toEqual(['watch-pass-preview']);
    expect(receipt.planIds).toEqual(['yearly']);
    expect(receipt.kpis.widgetAttachRate).toBe(1);
    expect(receipt.kpis.widget_attach_rate).toBe(1);
    expect(receipt.kpis.controlUsedCount).toBe(1);
    expect(receipt.kpis.control_used_count).toBe(1);
    expect(receipt.kpis.liveActivityStartRate).toBe(1);
    expect(receipt.kpis.live_activity_start_rate).toBe(1);
    expect(receipt.kpis.paywallViewToPlanSelectRate).toBe(1);
    expect(receipt.kpis.paywall_view_to_plan_select).toBe(1);
    expect(receipt.kpis.paywallViewToPurchaseCompletedRate).toBe(0);
    expect(receipt.kpis.paywall_view_to_purchase_completed).toBe(0);
  }, 15_000);

  test('builds a proof-shell failure artifact for a 404 capture', async () => {
    const { buildProofSurfaceFailureArtifact } = await loadEdgeLiveHelpers();

    const artifact = buildProofSurfaceFailureArtifact({
      error: Object.assign(new Error('Proof-shell 404 detected while capturing watch-pass-ios-full on phone-portrait during first-load: http://127.0.0.1:4173/favicon.ico'), {
        code: 'EDGE_LIVE_PROOF_404'
      }),
      workflowId: 'watch-pass-preview',
      routeDefinition: {
        id: 'watch-pass-ios-full',
        label: 'Watch Pass iOS full',
        route: '/watch-pass-preview.html?platform=ios&privacy=full&thoughtDensity=richer&pacingPreset=balanced'
      },
      viewport: {
        id: 'phone-portrait',
        label: 'Phone Portrait',
        width: 390,
        height: 844
      },
      url: 'http://127.0.0.1:4173/watch-pass-preview.html?platform=ios&privacy=full&thoughtDensity=richer&pacingPreset=balanced',
      stage: 'first-load',
      httpFailures: [
        {
          stage: 'first-load',
          status: 404,
          method: 'GET',
          resourceType: 'other',
          url: 'http://127.0.0.1:4173/favicon.ico'
        }
      ],
      consoleMessages: [
        {
          type: 'error',
          text: 'Failed to load resource: the server responded with a status of 404 (Not Found)'
        }
      ],
      runDir: 'C:/ATLAS/tmp/captures/mazer-edge-live/watch-pass-preview',
      metadataPath: 'C:/ATLAS/tmp/captures/mazer-edge-live/watch-pass-preview/metadata/watch-pass-ios-full-phone-portrait.failure.json',
      screenshotPath: 'C:/ATLAS/tmp/captures/mazer-edge-live/watch-pass-preview/screenshots/watch-pass-ios-full-phone-portrait.failure.png'
    });

    expect(artifact.workflowId).toBe('watch-pass-preview');
    expect(artifact.failure.code).toBe('EDGE_LIVE_PROOF_404');
    expect(artifact.httpFailures).toHaveLength(1);
    expect(artifact.files.metadata).toBe('metadata/watch-pass-ios-full-phone-portrait.failure.json');
    expect(artifact.files.screenshot).toBe('screenshots/watch-pass-ios-full-phone-portrait.failure.png');
  }, 15_000);
});
