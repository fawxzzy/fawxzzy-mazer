import { describe, expect, test } from 'vitest';
import { BeliefGraph } from '../../../src/mazer-core/agent/BeliefGraph';
import { FrontierPlanner } from '../../../src/mazer-core/agent/FrontierPlanner';
import { EpisodicPolicyScorer } from '../../../src/mazer-core/agent/PolicyScorer';
import { buildIntentBus } from '../../../src/mazer-core/intent/IntentBus';
import { ItemTopologyLedger, type TopologyItemDefinition } from '../../../src/mazer-core/items';
import { PuzzleTopologyState, type TopologyPuzzleDefinition } from '../../../src/mazer-core/puzzles';
import { buildTopologySignalBundle } from '../../../src/mazer-core/signals';
import { TrapTopologySystem, type TrapContract, type TrapTopologyObservation } from '../../../src/mazer-core/traps';
import { WardenGraphAgent, type WardenLocalObservation } from '../../../src/mazer-core/enemies';

const baseTrapContracts: TrapContract[] = [
  {
    id: 'junction-spike',
    label: 'Junction Spike',
    severity: 'high',
    anchor: {
      kind: 'junction',
      junctionId: 'junction-alpha',
      tileId: 'trap-branch'
    },
    visibility: {
      landmarkId: 'hazard-marker'
    }
  }
];

const itemDefinitions: readonly TopologyItemDefinition[] = [
  {
    id: 'cache-key',
    label: 'Cache key',
    kind: 'checkpoint-key',
    visibility: 'proxied',
    anchor: {
      tileId: 'cache-branch',
      checkpointId: 'checkpoint-alpha'
    },
    proxyCues: [
      {
        kind: 'landmark',
        id: 'cache-beacon',
        label: 'Cache beacon',
        confidence: 0.88
      }
    ],
    tags: ['item', 'key']
  }
];

const puzzleDefinitions: readonly TopologyPuzzleDefinition[] = [
  {
    id: 'cipher-shell',
    label: 'Cipher shell',
    visibility: 'proxied',
    anchor: {
      tileId: 'cipher-branch',
      shellId: 'north-shell'
    },
    proxyCues: [
      {
        kind: 'landmark',
        id: 'cipher-obelisk',
        label: 'Cipher obelisk',
        confidence: 0.9
      }
    ],
    requiredCheckpointKeyIds: [],
    requiredSignalNodeIds: [],
    requiredShellUnlockIds: [],
    outputShellId: 'north-shell'
  }
];

const makeTrapObservation = (step: number): TrapTopologyObservation => ({
  step,
  currentTileId: 'trap-branch',
  rotationPhase: 'north',
  activeJunctionIds: ['junction-alpha'],
  activeLoopIds: [],
  activeCheckpointIds: [],
  visibleLandmarkIds: ['hazard-marker'],
  visibleProxyIds: [],
  nearbyConnectorIds: [],
  traversedConnectorId: null
});

const makeWardenObservation = (): WardenLocalObservation => ({
  step: 1,
  currentTileId: 'junction-a',
  traversableTileIds: ['trap-branch', 'cache-branch'],
  localCues: ['junction', 'blind corner'],
  visibleLandmarks: [
    { id: 'trap-cover', label: 'Trap cover', tileId: 'trap-branch', cue: 'sightline choke' }
  ],
  playerVisible: false,
  playerTileId: null,
  playerLastKnownTileId: 'trap-branch',
  sightlineBroken: true,
  rotationPhase: 'turning'
});

describe('TopologySignalBridge', () => {
  test('builds bounded local cues and candidate advisories from topology-bound systems', () => {
    const trapSystem = new TrapTopologySystem(baseTrapContracts);
    const trapStep = trapSystem.evaluate(makeTrapObservation(1));

    const warden = new WardenGraphAgent({
      seed: 'seed-bridge',
      startTileId: 'junction-a'
    });
    const wardenDecision = warden.observeAndDecide(makeWardenObservation());

    const itemLedger = new ItemTopologyLedger(itemDefinitions);
    const itemObservation = itemLedger.observeAndRank({
      step: 1,
      currentTileId: 'junction-a',
      neighborTileIds: ['cache-branch'],
      visibleLandmarkIds: ['cache-beacon'],
      visibleConnectorIds: [],
      localCues: ['cache beacon'],
      requestedCheckpointIds: ['checkpoint-alpha'],
      requestedSignalNodeIds: [],
      requestedShellIds: []
    });

    const puzzleState = new PuzzleTopologyState(puzzleDefinitions);
    const puzzleObservation = puzzleState.observeAndRank({
      step: 1,
      currentTileId: 'junction-a',
      neighborTileIds: ['cipher-branch'],
      visibleLandmarkIds: ['cipher-obelisk'],
      visibleConnectorIds: [],
      localCues: ['cipher obelisk'],
      targetShellId: 'north-shell'
    });

    const bundle = buildTopologySignalBundle({
      trapSnapshot: trapSystem.getSnapshot(),
      trapStep,
      wardenDecision,
      itemDefinitions,
      itemObservation,
      puzzleDefinitions,
      puzzleObservation
    });

    expect(bundle.localCues.some((cue) => cue.includes('trap'))).toBe(true);
    expect(bundle.localCues.some((cue) => cue.includes('enemy'))).toBe(true);
    expect(bundle.localCues.some((cue) => cue.includes('item'))).toBe(true);
    expect(bundle.localCues.some((cue) => cue.includes('puzzle'))).toBe(true);
    expect(bundle.candidateSignals['trap-branch']?.trapRisk ?? 0).toBeGreaterThan(0);
    expect(bundle.candidateSignals['trap-branch']?.enemyPressure ?? 0).toBeGreaterThan(0);
    expect(bundle.candidateSignals['cache-branch']?.itemOpportunity ?? 0).toBeGreaterThan(0);
    expect(bundle.candidateSignals['cipher-branch']?.puzzleOpportunity ?? 0).toBeGreaterThan(0);
  });

  test('routes topology cues through the existing intent bus contract', () => {
    const trapSystem = new TrapTopologySystem(baseTrapContracts);
    const trapBundle = buildTopologySignalBundle({
      trapSnapshot: trapSystem.getSnapshot(),
      trapStep: trapSystem.evaluate(makeTrapObservation(1))
    });
    const itemLedger = new ItemTopologyLedger(itemDefinitions);
    const itemBundle = buildTopologySignalBundle({
      itemDefinitions,
      itemObservation: itemLedger.observeAndRank({
        step: 2,
        currentTileId: 'junction-a',
        neighborTileIds: ['cache-branch'],
        visibleLandmarkIds: ['cache-beacon'],
        visibleConnectorIds: [],
        localCues: ['cache beacon'],
        requestedCheckpointIds: ['checkpoint-alpha'],
        requestedSignalNodeIds: [],
        requestedShellIds: []
      })
    });
    const puzzleState = new PuzzleTopologyState(puzzleDefinitions);
    const puzzleBundle = buildTopologySignalBundle({
      puzzleDefinitions,
      puzzleObservation: puzzleState.observeAndRank({
        step: 3,
        currentTileId: 'junction-a',
        neighborTileIds: ['cipher-branch'],
        visibleLandmarkIds: ['cipher-obelisk'],
        visibleConnectorIds: [],
        localCues: ['cipher obelisk'],
        targetShellId: 'north-shell'
      })
    });
    const warden = new WardenGraphAgent({
      seed: 'seed-intent',
      startTileId: 'junction-a'
    });
    const enemyBundle = buildTopologySignalBundle({
      wardenDecision: warden.observeAndDecide(makeWardenObservation())
    });

    const bus = buildIntentBus([
      {
        step: 1,
        currentTileId: 'junction-a',
        currentTileLabel: 'Junction A',
        targetTileId: 'trap-branch',
        targetTileLabel: 'Trap branch',
        targetKind: 'frontier',
        nextTileId: 'trap-branch',
        reason: 'topology cue',
        frontierCount: 2,
        replanCount: 0,
        backtrackCount: 0,
        goalVisible: false,
        goalObservedStep: null,
        visibleLandmarks: [],
        observedLandmarkIds: [],
        localCues: trapBundle.localCues,
        traversableTileIds: ['trap-branch', 'cache-branch'],
        traversedConnectorId: null,
        traversedConnectorLabel: null
      },
      {
        step: 2,
        currentTileId: 'junction-a',
        currentTileLabel: 'Junction A',
        targetTileId: 'trap-branch',
        targetTileLabel: 'Trap branch',
        targetKind: 'frontier',
        nextTileId: 'trap-branch',
        reason: 'topology cue',
        frontierCount: 2,
        replanCount: 0,
        backtrackCount: 0,
        goalVisible: false,
        goalObservedStep: null,
        visibleLandmarks: [],
        observedLandmarkIds: [],
        localCues: enemyBundle.localCues,
        traversableTileIds: ['trap-branch', 'cache-branch'],
        traversedConnectorId: null,
        traversedConnectorLabel: null
      },
      {
        step: 3,
        currentTileId: 'junction-a',
        currentTileLabel: 'Junction A',
        targetTileId: 'cache-branch',
        targetTileLabel: 'Cache branch',
        targetKind: 'frontier',
        nextTileId: 'cache-branch',
        reason: 'topology cue',
        frontierCount: 2,
        replanCount: 0,
        backtrackCount: 0,
        goalVisible: false,
        goalObservedStep: null,
        visibleLandmarks: [],
        observedLandmarkIds: [],
        localCues: itemBundle.localCues,
        traversableTileIds: ['trap-branch', 'cache-branch'],
        traversedConnectorId: null,
        traversedConnectorLabel: null
      },
      {
        step: 4,
        currentTileId: 'junction-a',
        currentTileLabel: 'Junction A',
        targetTileId: 'cipher-branch',
        targetTileLabel: 'Cipher branch',
        targetKind: 'frontier',
        nextTileId: 'cipher-branch',
        reason: 'topology cue',
        frontierCount: 2,
        replanCount: 0,
        backtrackCount: 0,
        goalVisible: false,
        goalObservedStep: null,
        visibleLandmarks: [],
        observedLandmarkIds: [],
        localCues: puzzleBundle.localCues,
        traversableTileIds: ['trap-branch', 'cipher-branch'],
        traversedConnectorId: null,
        traversedConnectorLabel: null
      }
    ]);

    const kinds = bus.records.map((record) => record.kind);
    expect(kinds).toContain('trap-inferred');
    expect(kinds).toContain('enemy-seen');
    expect(kinds).toContain('item-spotted');
    expect(kinds).toContain('puzzle-state-observed');
  });

  test('feeds bounded candidate advisories into the scorer through frontier planning', () => {
    const trapSystem = new TrapTopologySystem(baseTrapContracts);
    const trapStep = trapSystem.evaluate(makeTrapObservation(1));

    const itemLedger = new ItemTopologyLedger(itemDefinitions);
    const itemObservation = itemLedger.observeAndRank({
      step: 1,
      currentTileId: 'junction-a',
      neighborTileIds: ['cache-branch', 'trap-branch'],
      visibleLandmarkIds: ['cache-beacon'],
      visibleConnectorIds: [],
      localCues: ['cache beacon'],
      requestedCheckpointIds: ['checkpoint-alpha'],
      requestedSignalNodeIds: [],
      requestedShellIds: []
    });

    const bundle = buildTopologySignalBundle({
      trapSnapshot: trapSystem.getSnapshot(),
      trapStep,
      itemDefinitions,
      itemObservation
    });

    const graph = new BeliefGraph();
    const observation = {
      step: 1,
      currentTileId: 'junction-a',
      heading: 'east',
      traversableTileIds: ['cache-branch', 'trap-branch'],
      localCues: [...bundle.localCues],
      candidateSignals: bundle.candidateSignals,
      visibleLandmarks: [],
      goal: {
        visible: false,
        tileId: null
      }
    } as const;

    graph.observe(observation);

    const planner = new FrontierPlanner('seed-topology', new EpisodicPolicyScorer());
    const plan = planner.plan(graph, observation.currentTileId, observation.heading, {
      observation,
      snapshot: {
        seed: 'seed-topology',
        currentTileId: 'junction-a',
        currentHeading: 'east',
        mode: 'explore',
        counters: {
          replanCount: 0,
          backtrackCount: 0,
          frontierCount: 2,
          goalObservedStep: null,
          tilesDiscovered: 3
        },
        discoveredNodeIds: ['junction-a', 'cache-branch', 'trap-branch'],
        frontierIds: ['cache-branch', 'trap-branch'],
        goalTileId: null,
        observedLandmarkIds: [],
        observedCues: [...bundle.localCues]
      }
    });

    expect(plan.selectedCandidateId).toContain('cache-branch');
    expect(plan.candidates.find((candidate) => candidate.targetTileId === 'cache-branch')?.features.itemOpportunity ?? 0).toBeGreaterThan(0);
    expect(plan.candidates.find((candidate) => candidate.targetTileId === 'trap-branch')?.features.trapRisk ?? 0).toBeGreaterThan(0);
  });
});
