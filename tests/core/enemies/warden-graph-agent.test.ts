import { describe, expect, test } from 'vitest';
import { WardenGraphAgent, type WardenLocalObservation } from '../../../src/mazer-core/enemies';

const makeObservation = (overrides: Partial<WardenLocalObservation> = {}): WardenLocalObservation => ({
  step: overrides.step ?? 0,
  currentTileId: overrides.currentTileId ?? 'junction-a',
  traversableTileIds: overrides.traversableTileIds ?? ['north-lane', 'east-lane', 'west-lane'],
  localCues: overrides.localCues ?? ['junction'],
  visibleLandmarks: overrides.visibleLandmarks ?? [],
  playerVisible: overrides.playerVisible ?? false,
  playerTileId: overrides.playerTileId ?? null,
  playerLastKnownTileId: overrides.playerLastKnownTileId ?? null,
  sightlineBroken: overrides.sightlineBroken ?? false,
  rotationPhase: overrides.rotationPhase ?? 'stable'
});

describe('WardenGraphAgent', () => {
  test('selects only legal candidates and prefers direct player contact at a junction', () => {
    const agent = new WardenGraphAgent({
      seed: 'seed-warden-1',
      startTileId: 'junction-a'
    });

    const decision = agent.observeAndDecide(makeObservation({
      step: 3,
      traversableTileIds: ['north-lane', 'east-lane', 'west-lane'],
      playerVisible: true,
      playerTileId: 'east-lane'
    }));

    expect(decision.nextTileId).toBe('east-lane');
    expect(decision.intent).toBe('pursue');
    expect(decision.candidates.map((candidate) => candidate.nextTileId).sort()).toEqual([
      'east-lane',
      'north-lane',
      'west-lane'
    ]);
    expect(decision.candidates.every((candidate) => (
      ['north-lane', 'east-lane', 'west-lane'].includes(candidate.nextTileId)
    ))).toBe(true);
  });

  test('contains loop corridors when loop cues are present', () => {
    const agent = new WardenGraphAgent({
      seed: 'seed-warden-2',
      startTileId: 'ring-junction'
    });

    const decision = agent.observeAndDecide(makeObservation({
      currentTileId: 'ring-junction',
      traversableTileIds: ['loop-arc', 'service-lane'],
      localCues: ['loop corridor'],
      visibleLandmarks: [
        { id: 'loop-sign', label: 'Loop sign', tileId: 'loop-arc', cue: 'loop choke point' }
      ]
    }));

    expect(decision.nextTileId).toBe('loop-arc');
    expect(decision.intent).toBe('contain');
    expect(decision.reason).toMatch(/loop/i);
  });

  test('uses sightline-break proxies to recover line of sight', () => {
    const agent = new WardenGraphAgent({
      seed: 'seed-warden-3',
      startTileId: 'blind-corner'
    });

    const decision = agent.observeAndDecide(makeObservation({
      currentTileId: 'blind-corner',
      traversableTileIds: ['cover-arch', 'open-lane'],
      localCues: ['blind corner'],
      sightlineBroken: true,
      playerLastKnownTileId: 'open-lane',
      visibleLandmarks: [
        { id: 'vantage-arch', label: 'Vantage arch', tileId: 'cover-arch', cue: 'sightline vantage' }
      ]
    }));

    expect(decision.nextTileId).toBe('cover-arch');
    expect(decision.intent).toBe('contain');
    expect(decision.reason).toMatch(/line-of-sight/i);
  });

  test('reacts to turning phase by favoring stable anchors over exposed lanes', () => {
    const agent = new WardenGraphAgent({
      seed: 'seed-warden-4',
      startTileId: 'rotation-junction'
    });

    const decision = agent.observeAndDecide(makeObservation({
      currentTileId: 'rotation-junction',
      traversableTileIds: ['anchor-lane', 'exposed-lane'],
      localCues: ['rotation:turning'],
      rotationPhase: 'turning',
      visibleLandmarks: [
        { id: 'anchor', label: 'Anchor', tileId: 'anchor-lane', cue: 'stable checkpoint' },
        { id: 'exposed', label: 'Exposed', tileId: 'exposed-lane', cue: 'open runway' }
      ]
    }));

    expect(decision.nextTileId).toBe('anchor-lane');
    expect(decision.candidates[0]?.features.rotationAligned).toBe(true);
  });

  test('is deterministic across identical observation streams', () => {
    const stream: WardenLocalObservation[] = [
      makeObservation({
        step: 0,
        currentTileId: 'junction-a',
        traversableTileIds: ['north-lane', 'east-lane', 'west-lane'],
        localCues: ['junction']
      }),
      makeObservation({
        step: 1,
        currentTileId: 'east-lane',
        traversableTileIds: ['junction-a', 'intercept-lane'],
        localCues: ['hall'],
        playerLastKnownTileId: 'intercept-lane'
      }),
      makeObservation({
        step: 2,
        currentTileId: 'intercept-lane',
        traversableTileIds: ['east-lane', 'goal-lane'],
        localCues: ['phase:recovery'],
        rotationPhase: 'recovery',
        visibleLandmarks: [{ id: 'goal-proxy', label: 'Goal proxy', tileId: 'goal-lane', cue: 'intercept lane' }]
      })
    ];

    const left = new WardenGraphAgent({ seed: 'seed-warden-deterministic', startTileId: 'junction-a' });
    const right = new WardenGraphAgent({ seed: 'seed-warden-deterministic', startTileId: 'junction-a' });

    const leftDecisions = stream.map((entry) => left.observeAndDecide(entry));
    const rightDecisions = stream.map((entry) => right.observeAndDecide(entry));

    expect(rightDecisions).toEqual(leftDecisions);
    expect(right.getSnapshot()).toEqual(left.getSnapshot());
  });
});
