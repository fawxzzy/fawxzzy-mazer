import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { ExplorerAgent } from '../../../src/visual-proof/agent/ExplorerAgent';
import { EpisodicPolicyScorer } from '../../../src/visual-proof/agent/PolicyScorer';
import type { ExplorerDecision, LocalObservation, TileId, VisibleLandmark } from '../../../src/visual-proof/agent/types';

type TileSpec = {
  neighbors: TileId[];
  goalVisible: boolean;
  goalTileId: TileId | null;
  cues: string[];
  landmarks: VisibleLandmark[];
};

const MAZE: Record<TileId, TileSpec> = {
  start: {
    neighbors: ['branch-a', 'main-a'],
    goalVisible: false,
    goalTileId: null,
    cues: ['start'],
    landmarks: [{ id: 'entry-sign', label: 'Entry sign' }]
  },
  'branch-a': {
    neighbors: ['start', 'branch-dead-end'],
    goalVisible: false,
    goalTileId: null,
    cues: ['branch'],
    landmarks: [{ id: 'branch-mark', label: 'Branch mark' }]
  },
  'branch-dead-end': {
    neighbors: ['branch-a'],
    goalVisible: false,
    goalTileId: null,
    cues: ['dead-end'],
    landmarks: []
  },
  'main-a': {
    neighbors: ['start', 'junction'],
    goalVisible: false,
    goalTileId: null,
    cues: ['hall'],
    landmarks: []
  },
  junction: {
    neighbors: ['main-a', 'side-room', 'goal-approach'],
    goalVisible: true,
    goalTileId: 'goal',
    cues: ['junction'],
    landmarks: [{ id: 'goal-signal', label: 'Goal signal' }]
  },
  'side-room': {
    neighbors: ['junction'],
    goalVisible: true,
    goalTileId: 'goal',
    cues: ['side'],
    landmarks: []
  },
  'goal-approach': {
    neighbors: ['junction', 'goal'],
    goalVisible: true,
    goalTileId: 'goal',
    cues: ['approach'],
    landmarks: []
  },
  goal: {
    neighbors: ['goal-approach'],
    goalVisible: true,
    goalTileId: 'goal',
    cues: ['goal'],
    landmarks: [{ id: 'exit-marker', label: 'Exit marker' }]
  }
};

const directionByEdge: Record<string, string> = {
  'start::branch-a': 'west',
  'start::main-a': 'east',
  'branch-a::branch-dead-end': 'north',
  'branch-a::start': 'east',
  'main-a::junction': 'east',
  'main-a::start': 'west',
  'junction::side-room': 'south',
  'junction::goal-approach': 'east',
  'junction::main-a': 'west',
  'side-room::junction': 'north',
  'goal-approach::goal': 'east',
  'goal-approach::junction': 'west',
  'goal::goal-approach': 'west'
};

const makeObservation = (step: number, tileId: TileId, heading: string): LocalObservation => {
  const tile = MAZE[tileId];
  return {
    step,
    currentTileId: tileId,
    heading,
    traversableTileIds: [...tile.neighbors],
    localCues: [...tile.cues],
    visibleLandmarks: [...tile.landmarks],
    goal: {
      visible: tile.goalVisible,
      tileId: tile.goalTileId,
      label: tile.goalVisible ? 'Exit' : undefined
    }
  };
};

const nextHeading = (from: TileId, to: TileId): string => directionByEdge[`${from}::${to}`] ?? 'north';

const runAgent = (seed: string, scorer: EpisodicPolicyScorer | null = null) => {
  const agent = new ExplorerAgent({ seed, startTileId: 'start', startHeading: 'east', policyScorer: scorer });
  const log: ExplorerDecision[] = [];
  let tileId: TileId = 'start';
  let heading = 'east';

  for (let step = 0; step < 8; step += 1) {
    const decision = agent.observe(makeObservation(step, tileId, heading));
    log.push(decision);

    if (!decision.nextTileId) {
      break;
    }

    heading = nextHeading(tileId, decision.nextTileId);
    tileId = decision.nextTileId;
  }

  return { agent, log };
};

const observeRoute = (agent: ExplorerAgent, route: Array<{ tileId: TileId; heading: string; step: number }>) => {
  for (const entry of route) {
    agent.observe(makeObservation(entry.step, entry.tileId, entry.heading));
  }
};

describe('ExplorerAgent', () => {
  test('produces deterministic action logs for the same seed', () => {
    const first = runAgent('seed-17');
    const second = runAgent('seed-17');

    expect(first.log).toEqual(second.log);
    expect(first.agent.getDiagnostics()).toEqual(second.agent.getDiagnostics());
  });

  test('keeps the deterministic explorer path unchanged when the scorer is disabled', () => {
    const defaultRun = runAgent('seed-17');
    const explicitDisabledRun = runAgent('seed-17', null);

    expect(defaultRun.log).toEqual(explicitDisabledRun.log);
    expect(defaultRun.agent.getEpisodeLog()).toEqual(explicitDisabledRun.agent.getEpisodeLog());
  });

  test('does not target the exit before the goal is observed', () => {
    const agent = new ExplorerAgent({ seed: 'seed-17', startTileId: 'start', startHeading: 'east' });
    const decision = agent.observe(makeObservation(0, 'start', 'east'));

    expect(decision.targetKind).toBe('frontier');
    expect(decision.targetTileId).not.toBe('goal');
    expect(agent.getDiagnostics().counters.goalObservedStep).toBeNull();
  });

  test('records the first goal observation after the start step', () => {
    const agent = new ExplorerAgent({ seed: 'seed-19', startTileId: 'start', startHeading: 'east' });
    observeRoute(agent, [
      { step: 0, tileId: 'start', heading: 'east' },
      { step: 1, tileId: 'main-a', heading: 'east' },
      { step: 2, tileId: 'junction', heading: 'east' }
    ]);
    const counters = agent.getDiagnostics().counters;

    expect(counters.goalObservedStep).not.toBeNull();
    expect(counters.goalObservedStep as number).toBeGreaterThan(0);
    expect(counters.tilesDiscovered).toBeGreaterThan(0);
  });

  test('scores only legal candidates and never targets the goal omnisciently', () => {
    const agent = new ExplorerAgent({
      seed: 'seed-29',
      startTileId: 'start',
      startHeading: 'east',
      policyScorer: new EpisodicPolicyScorer()
    });
    let tileId: TileId = 'start';
    let heading = 'east';

    for (let step = 0; step < 6; step += 1) {
      const observation = makeObservation(step, tileId, heading);
      const decision = agent.observe(observation);

      if (decision.nextTileId) {
        expect(observation.traversableTileIds).toContain(decision.nextTileId);
      }

      if (step === 0) {
        expect(decision.targetKind).toBe('frontier');
        expect(decision.targetTileId).not.toBe('goal');
      }

      if (!decision.nextTileId) {
        break;
      }

      heading = nextHeading(tileId, decision.nextTileId);
      tileId = decision.nextTileId;
    }
  });

  test('records stable, replayable policy episodes when the scorer is enabled', () => {
    const first = runAgent('seed-41', new EpisodicPolicyScorer());
    const second = runAgent('seed-41', new EpisodicPolicyScorer());
    const episodes = first.agent.getEpisodeLog();

    expect(episodes.length).toBeGreaterThan(0);
    expect(episodes).toEqual(second.agent.getEpisodeLog());
    expect(episodes[0].scorerId).toBe('episode-priors');
    expect(episodes[0].candidates.length).toBeGreaterThan(0);
    expect(episodes[0].chosenCandidateId).not.toBeNull();
    expect(episodes[0].outcome).not.toBeNull();
  });

  test('does not import full manifest truth directly', () => {
    const sourceFiles = [
      '../../../src/visual-proof/agent/ExplorerAgent.ts',
      '../../../src/visual-proof/agent/BeliefGraph.ts',
      '../../../src/visual-proof/agent/FrontierPlanner.ts',
      '../../../src/visual-proof/agent/PolicyScorer.ts',
      '../../../src/visual-proof/agent/types.ts'
    ];

    for (const relativePath of sourceFiles) {
      const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
      expect(source).not.toMatch(/from\s+['"][^'"]*topology-proof/);
      expect(source).not.toMatch(/from\s+['"][^'"]*scenarioLibrary/);
      expect(source).not.toMatch(/from\s+['"][^'"]*manifestLoader/);
    }
  });
});
