# Mazer Rotating Planet Maze Master Plan

Status: future-facing design brief. This document is not current repo truth and does not change the shipping baseline.

Related docs:
- `docs/research/MAZER_MAZE_INSPIRATION_ATLAS.md`
- `docs/research/MAZER_MASTER_MAZES_ACROSS_MEDIA.md`
- `docs/roadmap.md`

## Purpose

Convert the rotating-planet maze research into a staged, graph-first Mazer concept that is specific enough to guide future prototype work without re-scoping the current ambient build.

## Current-State Gap

Mazer today is still:
- an ambient-first shipping baseline
- a 2D build
- owned by `MenuScene` at runtime
- based on Wilson-preserving maze generation
- governed by screenshot-gated visual truth plus `docs/current-truth.md`

This document describes a later product lane. It does not upgrade that future concept into present-tense repo truth.

## North Star

Target experience loop:
- orientation
- confusion
- insight
- progress
- payoff

Primary rule:
- readability is not polish; readability is core design truth

Implications:
- geometry and spectacle can create wonder, but they cannot replace stable player bearings
- the player must regain orientation after earned moments of insight, checkpoint completion, or vantage unlocks
- "hard to understand" is a failure state unless it resolves into a learnable rule

## Core Concept

The target form is a graph-first, surface-first concentric-shell planet maze with scarce shell transitions and discrete, learnable rotation.

Chosen structure:
- players begin on the outer shell
- the outer shell teaches traversal, landmarks, and discrete rotation rules
- windows, sightlines, and observatories expose inner shells early so players can build a mental model before entering them
- shell transitions unlock later through explicit gates, bridges, or aligned connectors
- the center is meaningful and must feel like a destination, not just a final coordinate

Rejected default:
- continuous free-spin planet rotation is not the default puzzle rule because it weakens predictability, camera clarity, and player planning

## District Set

The planet is divided into five fixed district types. This is a closed set for the first concept pass.

### 1. Labyrinth / Tutorial District

Role:
- teach movement, shell logic, landmarks, and rotation consequences with low decision pressure

Topology:
- mostly unicursal or near-unicursal
- minimal dead ends
- strong sightlines to the next landmark or gate

Use:
- onboarding
- ceremonial transitions
- payoff routes into new shells or major reveals

### 2. Multicursal Puzzle District

Role:
- serve as the main maze-mastery district

Topology:
- branching puzzle-maze structure
- high junction significance
- deliberate dead-end budget
- limited loops so wrong turns teach without dissolving route pressure

Use:
- core navigation challenges
- route-learning and re-orientation play

### 3. Loopy / Combat-Capable District

Role:
- support pursuit, evasion, and dynamic route choice without punishing the player with constant hard resets

Topology:
- lower dead-end density
- meaningful cycles and escape routes
- strong line-of-sight breaks near junctions

Use:
- enemies that activate at decision points
- hazards that change threat depending on rotation state

### 4. Scavenger / Checkpoint District

Role:
- break "find the exit" monotony with bounded regional objectives

Topology:
- medium branch density
- several bounded sub-goals
- visible checkpoint proxies from nearby paths or vantage points

Use:
- key fragments
- signal stations
- district control nodes

### 5. Vantage / Observatory District

Role:
- reward progress with renewed orientation and macro understanding

Topology:
- tower, balcony, observatory, or elevated ring logic
- lower route density near the final vantage moment
- direct visibility into other shells, gates, or objective markers

Use:
- re-orientation reward
- route preview
- dramatic reveal of the core and next progression target

## Rotation Rules

Rotation is a discrete topology operator.

It may:
- align bridges between shell segments
- open or close shell connectors
- remap which gate pairs are active
- change hazard or enemy schedules by phase

It may not, by default:
- freely spin the world with analog precision
- rely on continuous camera chase to explain topology
- hide outcomes that the player cannot predict from available cues

Operational rule:
- every rotation state must have a readable before/after consequence that can be learned and named by the player

## Wayfinding Rules

Wayfinding requirements are mandatory for the concept.

The planet must use:
- distinctive landmarks at decision points
- visible objective proxies when the true target is not directly visible
- reduced visual crowding so the player silhouette and route options stay legible
- selective diegetic highlights for player position, current choice, and active objective

The planet must avoid:
- equal visual weight on every wall and surface
- decorative geometry that looks interactive but is not
- constant HUD dependency to explain the space

Wayfinding rhythm:
- confusion is allowed between landmarks
- clarity must return at landmarks, vantages, checkpoints, and rotation outcomes

## Topology Rules

The maze is designed graph-first and rendered second.

Topology rules:
- use tree or near-perfect-maze logic where the goal is high decision cost and meaningful wrong turns
- add loops only in districts that need escape routes, pursuit routes, or alternate circulation
- treat dead ends as a pacing budget, not generator residue
- place shell connectors deliberately so layer transitions stay scarce, landmarked, and earned
- keep districts topologically distinct enough that a player can feel the difference before mastering the local puzzle

Difficulty levers:
- decision density
- backtracking cost
- visibility and landmark spacing
- threat pressure

Rule:
- one or two levers may lead in a given district; the rest should support instead of compete

## Content And Progression

The planet is not solved as one continuous undifferentiated maze.

Progression model:
1. learn the outer shell in the labyrinth district
2. clear bounded regional goals in puzzle and scavenger districts
3. unlock the first shell transition
4. use observatory rewards to update the player's mental map
5. enter deeper shells with stricter route pressure or higher threat
6. reach a meaningful core destination only after the player has mastered both navigation and rotation logic

Content rules:
- regional goals should be short enough to feel finishable in one pass
- the core must have narrative or mechanical meaning beyond "final tile"
- enemies, traps, and puzzles must attach to junctions, loops, sightlines, checkpoints, or rotation phases
- no mechanic should float above topology as generic noise

Implementation boundary:
- future content systems consume `mazer-core` through the runtime adapter seam
- Playbook remains the only shared engine in scope at the shared-system boundary
- runtime or UI lanes may publish trail, intent, proof, and packet outputs, but they do not author planner truth or patch the Intent Bus contract
- lane-specific baselines must be promoted independently before additional content stacks on top

## Future Content Hooks

Trap hooks:
- bind trap contracts to junctions, loops, checkpoints, or rotation phases
- require inferable state through timing, landmarks, proxies, or connector behavior before a trap can matter
- treat blocked hidden-state traps as failure telemetry, not as surprise difficulty

Warden hooks:
- keep the first enemy agent topology-bound by limiting decisions to junction exits, loop circulation, sightline breaks, and rotation-phase reactions
- reuse local legal-candidate discipline instead of runtime-specific cheating or animation-authored pathing

Item and puzzle hooks:
- keep item usefulness and puzzle opportunity tied to districts, connectors, checkpoints, and shell unlocks
- require visible or proxied puzzle state whenever the true state is offscreen
- feed items and puzzles into the bounded scorer only as advisory signals derived from local evidence

## Technical Staging

Fixed sequence:
1. design brief
2. topology sandbox
3. isolated 3D prototype
4. later integration decision

Stage rules:
- the topology sandbox should prove graph rules, district signatures, landmark spacing, objective visibility behavior, and rotation-state clarity before visual spectacle becomes the focus
- the isolated 3D prototype should prove camera behavior, player readability, shell legibility, and orientation recovery under motion
- the first isolated 3D prototype gate is one shell only, with discrete rotation states, a visible objective proxy, readable trail output, and no production multi-shell scope
- the current Phaser ambient build is not the implementation target for the first 3D spike
- no live-product integration decision should be made until the spike proves camera, readability, and orientation
- engine and runtime choice remain deferred until after the isolated prototype gate

## Prototype Gates

The first prototype lane is successful only if it proves:
- the player can recover bearings after a rotation event
- shell relationships remain understandable from ordinary play, not only from debug views
- district types feel different in topology, not just in art direction
- the player and active objective remain visible without heavy HUD dependence
- bounded regional goals feel satisfying before the core is reached

## Replay And Logging

Replay and logging rules for the future lane:
- keep runtime logs local and deterministic so identical observation streams reproduce the same trail, intent feed, and episode log
- record trap activations, blocked hidden-state telemetry, warden decisions, item evidence, and puzzle opportunities as bounded runtime outputs rather than manifest truth
- future-runtime proof packets may compare lane outputs, but they do not replace the visual-proof baseline or import planner truth from another lane

## Proposed Future Contracts

These contracts are documentation-only for future prototype work. They do not change current runtime code.

### `PlanetMazeGraph`

Purpose:
- topology contract for the full planet

Must identify:
- `nodes`
- `edges`
- `shells`
- `districts`
- `landmarks`
- `gates`

Expected responsibilities:
- represent per-shell navigation graph
- mark connector edges between shells
- encode landmark identity at junctions or hubs
- mark gates that depend on rotation or progression state

### `PlanetDistrict`

Purpose:
- district contract for one named region

Must identify:
- `districtType`
- `topologyTargets`
- `readabilityTargets`
- `mechanicHooks`

Expected responsibilities:
- declare whether the district is labyrinth, puzzle, loopy or combat-capable, scavenger, or vantage
- define intended junction density, dead-end budget, and loop budget
- define required landmark spacing and objective visibility behavior
- list which enemies, traps, or puzzles are allowed to attach to the district

### `RotationState`

Purpose:
- explicit state contract for planet reconfiguration

Must identify:
- `currentAlignment`
- `allowedMoves`
- `unlockedGates`
- `affectedDistricts`

Expected responsibilities:
- define the currently active connector layout
- constrain which rotations are valid from the present state
- expose which gates are newly opened or closed
- identify which districts or shell links changed because of the move

### `WayfindingCue`

Purpose:
- contract for world-embedded guidance

Must identify:
- `cueType`
- `trigger`
- `priority`
- `visualTreatment`

Expected responsibilities:
- define whether the cue marks player position, current choice, landmark, objective proxy, or shell connector
- define when the cue appears, fades, or intensifies
- define priority so multiple cues do not compete at the same moment
- define the in-world treatment rather than assuming a HUD marker

### `PlanetMazeMetrics`

Purpose:
- measurement contract for tuning and validation

Must include:
- existing maze metrics such as solution length, dead ends, junctions, branch density, straightness, and coverage
- shell transition count
- portal density
- landmark spacing
- objective visibility uptime
- vantage frequency

Expected use:
- compare district signatures
- reject layouts that are large but unreadable
- verify that guidance and topology create intentional difficulty instead of noise

## Scope Boundary

This lane intentionally does not:
- change current repo truth
- replace the current Wilson-based ambient product
- commit to a 3D engine
- define production integration dates
- authorize a production-looking multi-shell slice before the topology sandbox and isolated readability gates
- authorize code changes outside future prototype work
