import type { RunProjectionInput, RunProjectionState } from '../projections/runProjection.ts';

export const PROOF_SURFACE_FIXTURE_ORDER = Object.freeze([
  'preroll',
  'building',
  'watching',
  'waiting',
  'failed',
  'retrying',
  'cleared'
] satisfies RunProjectionState[]);

const FIXTURE_LABELS: Record<RunProjectionState, string> = {
  preroll: 'Preroll',
  building: 'Building',
  watching: 'Watching',
  waiting: 'Waiting',
  failed: 'Failed',
  retrying: 'Retrying',
  cleared: 'Cleared'
};

const FIXTURE_INPUTS: Record<RunProjectionState, RunProjectionInput> = {
  preroll: {
    runId: 'proof-preroll-17',
    mazeId: 'wave5a-a12',
    attemptNo: 1,
    elapsedMs: 3_200,
    state: 'preroll',
    compactThought: 'Lining up the first safe branch before the build lands.',
    riskLevel: 'medium',
    progressPct: 0,
    miniMapHash: 'maze-start-n4',
    updatedAt: '2026-04-18T16:20:00.000Z'
  },
  building: {
    runId: 'proof-building-17',
    mazeId: 'wave5a-b04',
    attemptNo: 2,
    elapsedMs: 12_400,
    state: 'building',
    compactThought: 'Opening the middle lane while the board clarifies the anchor route.',
    riskLevel: 'medium',
    progressPct: 24.5,
    miniMapHash: 'maze-build-k9',
    updatedAt: '2026-04-18T16:21:00.000Z'
  },
  watching: {
    runId: 'proof-watching-17',
    mazeId: 'wave5a-c18',
    attemptNo: 4,
    elapsedMs: 38_400,
    state: 'watching',
    compactThought: 'Watching the north branch because the lower trap cadence still feels noisy.',
    riskLevel: 'high',
    progressPct: 61.7,
    miniMapHash: 'maze-watch-q3',
    updatedAt: '2026-04-18T16:22:00.000Z'
  },
  waiting: {
    runId: 'proof-waiting-17',
    mazeId: 'wave5a-d03',
    attemptNo: 4,
    elapsedMs: 52_100,
    state: 'waiting',
    compactThought: 'Holding the clear lane while the next readable commit settles.',
    riskLevel: 'low',
    progressPct: 74.2,
    miniMapHash: 'maze-hold-r2',
    updatedAt: '2026-04-18T16:23:00.000Z'
  },
  failed: {
    runId: 'proof-failed-17',
    mazeId: 'wave5a-e11',
    attemptNo: 5,
    elapsedMs: 59_600,
    state: 'failed',
    failReason: 'North gate closed before the watcher could commit through the center splice.',
    compactThought: 'Trap fired just ahead of the commit window.',
    riskLevel: 'critical',
    progressPct: 86.4,
    miniMapHash: 'maze-fail-v6',
    updatedAt: '2026-04-18T16:24:00.000Z'
  },
  retrying: {
    runId: 'proof-retrying-17',
    mazeId: 'wave5a-f09',
    attemptNo: 6,
    elapsedMs: 18_900,
    state: 'retrying',
    failReason: 'Resetting after the late trap snap.',
    compactThought: 'Retrying through the calmer west branch before the dock shifts again.',
    riskLevel: 'high',
    progressPct: 27.8,
    miniMapHash: 'maze-retry-z8',
    updatedAt: '2026-04-18T16:25:00.000Z'
  },
  cleared: {
    runId: 'proof-cleared-17',
    mazeId: 'wave5a-g01',
    attemptNo: 6,
    elapsedMs: 66_000,
    state: 'cleared',
    compactThought: 'Exit confirmed, route residue cleared, next watch ready.',
    riskLevel: 'low',
    progressPct: 100,
    miniMapHash: 'maze-clear-y1',
    updatedAt: '2026-04-18T16:26:00.000Z'
  }
};

export const isProofSurfaceFixture = (value: string | null | undefined): value is RunProjectionState => (
  typeof value === 'string'
  && PROOF_SURFACE_FIXTURE_ORDER.includes(value as RunProjectionState)
);

export const resolveProofSurfaceFixture = (value: string | null | undefined): RunProjectionState => (
  isProofSurfaceFixture(value) ? value : 'watching'
);

export const resolveProofSurfaceFixtureInput = (fixture: RunProjectionState): RunProjectionInput => ({
  ...FIXTURE_INPUTS[fixture]
});

export const resolveProofSurfaceFixtureLabel = (fixture: RunProjectionState): string => FIXTURE_LABELS[fixture];
