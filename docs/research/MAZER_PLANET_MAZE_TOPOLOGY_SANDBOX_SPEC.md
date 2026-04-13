# Mazer Planet Maze Topology Sandbox Spec

Status: future-facing proof harness contract for the rotating-planet lane. This document does not change the shipping Phaser runtime.

## Purpose

The topology sandbox is the canonical truth source for future rotating-planet proof work.

Required flow:

`seed -> graph manifest -> rendered proof scene -> visual packet -> merged score`

Rule:

- the proof harness consumes architecture truth
- the proof harness does not define architecture truth

Belief graph separation:

- the environment projects truth into local observations before the agent sees anything
- the agent may path only over the discovered graph, not the full manifest graph
- goal promotion happens only after the goal is observed or discovered locally
- trail is derived only from committed occupancy history
- the deterministic explorer is the safety kernel and remains authoritative for legality
- learned scoring may rank only the legal candidate set already produced by the safety kernel
- failure mode: full-manifest shortest path masquerading as smart AI

## Output Contract

The sandbox exports one JSON manifest per proof seed to `public/topology-proof/manifests/`.

Each manifest must include:

- `nodes`
- `edges`
- `shells`
- `districts`
- `landmarks`
- `connectors`
- `rotationStates`
- `wayfindingCues`
- `metrics`
- `proof`

The `proof` section is the render-ready slice for the isolated visual lane. It carries:

- route segments
- state keyframes
- semantic gate contract
- human review prompt

## District Presets

The first pass uses five fixed proof presets:

- `labyrinth-tutorial`
- `puzzle`
- `loopy-combat-capable`
- `scavenger-checkpoint`
- `vantage-observatory`

These presets must differ in measured topology, not only naming or art treatment.

## Schema Summary

`PlanetMazeGraph`

- identifies node ids, edge ids, shell ids, district ids, landmark ids, and gate ids
- declares entry node, objective node, and canonical solution path ids

`PlanetDistrict`

- identifies `districtType`
- declares topology target bands:
  `solutionLengthBand`, `deadEndBand`, `loopBand`, `shellTransitionBand`
- declares readability target bands:
  `landmarkSpacingBand`, `objectiveVisibilityBand`, `vantageFrequencyBand`
- lists mechanic hooks allowed in the district

`RotationState`

- declares `currentAlignment`
- lists `allowedMoves`
- lists `unlockedGates`
- records affected districts
- publishes shell rotation offsets and active connector ids

`WayfindingCue`

- declares cue type, trigger, priority, visual treatment, and target id
- keeps player, objective, landmark, connector, and vantage cues explicit

`PlanetMazeMetrics`

- `solutionLength`
- `deadEndCount`
- `junctionDegreeHistogram`
- `corridorRunLength`
- `loopCount`
- `shellTransitionCount`
- `landmarkSpacing`
- `objectiveVisibilityUptime`
- `vantageFrequency`

## Metric Rules

The sandbox must stay deterministic for a given seed.

Verification requirements:

- same seed produces the same manifest
- manifests serialize and round-trip without data loss
- every manifest includes a populated metric summary
- district presets land inside their declared metric bands
- presets differ in at least one structural metric beyond their district name

## Choice Architecture

The sandbox must preserve this split:

- deterministic safety kernel
- optional learned choice scorer

The safety kernel owns:

- legal moves
- local observation only
- goal promotion only after observation
- trail truth from committed movement
- rotation legality

The learned scorer may rank:

- frontier value
- backtrack urgency
- trap suspicion
- enemy risk
- item value
- rotation timing

The learned scorer must not:

- emit actions outside the legal candidate set
- read the full manifest graph as planner truth
- inspect hidden goal state before local observation

Proof playback should capture training-ready episodes containing:

- local observation features
- legal candidate set
- chosen action
- resulting outcome
- trap, enemy, item, and puzzle context

Episode logs must be stable and replayable for the same seed and observation stream.

## Visual-Proof Integration

The isolated proof surface loads manifests through:

- `?manifest=/topology-proof/manifests/<scenario>.json`
- fallback `?scenario=<id>` only when no manifest is supplied

Packet metadata must record:

- seed
- district type
- rotation state label
- manifest path

## Intent Bus Contract

The spectator layer is a planner-owned `Intent Bus`, not raw inner-monologue text.

Required record fields:

- `speaker`
- `category`
- `importance`
- `summary`
- `confidence`
- optional `anchor`
- `step`
- `ttlSteps`

Allowed speakers:

- `Runner`
- `Maze`
- `TrapNet`
- `Warden`
- `Inventory`
- `Puzzle`

3D readability rules:

- keep the main feed in screen space only
- keep it in a safe corner, not center mass
- keep world-space text to anchored micro pings only
- do not let persistent text rotate with the planet
- collapse world-ping density during large camera motion
- limit concurrent anchored pings near the player

Rule:

- show intent deltas, not inner monologue

## Canary Rule

Canaries mutate the manifest-driven proof surface and must fail on purpose.

Required canary targets:

- player visibility
- objective visibility
- landmark salience
- connector readability after rotation
- solved-route overlay paint
- trail-head mismatch
- omniscient goal targeting at start

Canaries do not update or depend on the blessed visual baseline pointer.
