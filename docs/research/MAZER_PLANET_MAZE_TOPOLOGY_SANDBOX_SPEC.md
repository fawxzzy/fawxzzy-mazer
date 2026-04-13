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

## Visual-Proof Integration

The isolated proof surface loads manifests through:

- `?manifest=/topology-proof/manifests/<scenario>.json`
- fallback `?scenario=<id>` only when no manifest is supplied

Packet metadata must record:

- seed
- district type
- rotation state label
- manifest path

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
