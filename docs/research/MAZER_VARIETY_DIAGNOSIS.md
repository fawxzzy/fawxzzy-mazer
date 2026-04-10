# Mazer Variety Diagnosis

## Executive Summary

Mazer's ambient loop is correct, stable, and memory-light, but the current variety budget is being compressed in two places before the viewer ever gets a chance to feel true breadth:

1. The scheduler is heavily curated.
   The live loop locks mood into a fixed `solve / scan / blueprint` rhythm and then maps each mood into a narrow preset family.

2. The topology families are still too close together.
   Wilson is still the substrate truth, while `classic`, `braided`, `framed`, and `blueprint-rare` are post-processing families layered on top. That preserves correctness, but it also means the current demo spends most of its time showing different versions of the same base maze language.

Measured result:

- In a representative 128-cycle ambient sample, preset exposure was `classic=64`, `braided=48`, `framed=13`, `blueprint-rare=3`.
- The mood scheduler produced `solve=80`, `scan=32`, `blueprint=16`, which is exactly the current 5/2/1 rhythm.
- Coarse "shape signature" uniqueness across that run was only `47.7%`.
- The top 8 repeated signatures covered `37.5%` of the sample.

That means the current system is polished and coherent, but it is over-curated for unattended ambient use.

## Repo Truth

This diagnosis is based on current code in `C:\ATLAS\repos\fawxzzy-mazer`.

- `src/scenes/MenuScene.ts`
  - Owns the ambient loop.
  - Uses `resolveMenuDemoCycle(...)` to choose size, difficulty, mood, preset, and pacing.
  - Advances `demoSeed` by `1` on every new episode.
- `src/domain/maze/generator.ts`
  - Owns the current menu-generation config.
  - Uses only the menu variety pool when `shortcutCountModifier.menu = 0.13`.
- `src/domain/maze/core.ts`
  - Keeps Wilson as substrate truth.
  - Applies braid/preset passes after Wilson generation.
  - Solves on a corridor-compressed graph, then expands back to a tile path for raster output.
- `src/config/tuning.ts`
  - Fixes current ambient defaults for board scale, checkpoint modifier, shortcut modifiers, cadence, and seed start.

## Measurement Method

The numbers below come from a repo-local analysis script added for this pass:

- `scripts/analysis/mazer-variety-analysis.ts`

It was run in two modes:

1. Ambient-loop sample
   - 128 consecutive ambient episodes
   - same seed stepping and cycle routing as `MenuScene`
   - same menu generation config as the live product

2. Isolated preset comparison
   - 16 representative seeds
   - all 4 size buckets
   - all 4 presentation presets
   - generated with the same menu shortcut/checkpoint settings so preset deltas could be compared directly

Measured metrics:

- solution length
- dead-end count
- junction count
- corridor-length distribution
- branching factor distribution
- coverage
- straightness
- preset-family distribution
- repeated coarse shape signatures

## Current Variety Bottlenecks

### 1. Mood sequencing is pre-curated enough to become predictable

`MenuScene` uses 8-slot curated mood patterns with the same mix every block:

- `solve`: 5 slots
- `scan`: 2 slots
- `blueprint`: 1 slot

That means long unattended runs always land at:

- `62.5%` solve
- `25%` scan
- `12.5%` blueprint

This is already visible in the 128-cycle sample:

| Mood | Count | Share |
| --- | ---: | ---: |
| solve | 80 | 62.5% |
| scan | 32 | 25.0% |
| blueprint | 16 | 12.5% |

Because `solve` mood also renders the strongest solution-path read, the presentation keeps returning to the same "fully solved ambient board" family.

### 2. Mood and preset are coupled, so preset variety is mostly predetermined

Current preset routing is not independent:

- `solve` only yields `classic` or `braided`
- `scan` only yields `framed` or `braided`
- `blueprint` almost always yields `framed`, with `blueprint-rare` only `1/7` of blueprint cycles

So although there are 4 presets in theory, the ambient loop effectively spends most of its time in only 2 visible families.

Measured ambient distribution:

| Preset | Count | Share |
| --- | ---: | ---: |
| classic | 64 | 50.0% |
| braided | 48 | 37.5% |
| framed | 13 | 10.2% |
| blueprint-rare | 3 | 2.3% |

`blueprint-rare` is the most topology-distinct preset in the current system, but it appears only 3 times in 128 ambient cycles.

### 3. The menu lane excludes one whole variety regime before generation starts

`generator.ts` has 5 variety presets:

- `survey`
- `relay`
- `weave`
- `switchback`
- `gauntlet`

But the menu path uses `shortcutCountModifier.menu = 0.13`, which keeps ambient generation inside the 4-entry `MENU_VARIETY_POOL`.

Result:

- `gauntlet` never appears in the current ambient product.
- Ambient scale and footprint changes stay inside a fairly tight band.
- Most of the visible difference comes from size bucket and preset routing, not from genuinely different topology pressure.

### 4. Size changes scale strongly, but not family grammar

Size does change path length and coverage. It does not create sharply different shape families.

Ambient sample means by size:

| Size | Solution Length | Coverage | Corridor Mean | Mean Branching Factor |
| --- | ---: | ---: | ---: | ---: |
| small | 69.2 | 0.280 | 3.478 | 3.128 |
| medium | 153.5 | 0.172 | 3.444 | 3.144 |
| large | 208.2 | 0.077 | 3.438 | 3.148 |
| huge | 283.1 | 0.057 | 3.418 | 3.149 |

Interpretation:

- size clearly changes path length and board occupancy
- corridor structure stays in a narrow band
- branching factor barely moves

So size makes mazes longer or denser, but not dramatically more distinct as visual families.

### 5. Difficulty is not currently a strong "looks different" lever

Ambient sample means by labeled difficulty:

| Difficulty | Solution Length | Dead Ends | Junctions | Straightness | Coverage |
| --- | ---: | ---: | ---: | ---: | ---: |
| chill | 200.9 | 285.6 | 362.6 | 0.718 | 0.150 |
| standard | 195.5 | 235.9 | 310.1 | 0.715 | 0.182 |
| spicy | 176.1 | 193.7 | 346.2 | 0.712 | 0.118 |
| brutal | 139.1 | 122.5 | 263.4 | 0.722 | 0.135 |

Difficulty is doing real routing work, but not in a way that produces clearly separable visual families. In practice:

- difficulty labels affect search budgets and accepted buckets
- the resulting boards do not read as four distinct ambient families
- size is currently more legible than difficulty

### 6. Corridor compression is not the source of visual sameness

The solver in `core.ts` compresses corridors into a graph for pathfinding, but then expands back to the tile path before rasterization and rendering.

That means:

- corridor compression helps solve performance
- it does not flatten the visible maze layout
- it is not the direct cause of same-y visuals

What does create sameness is that `solve` mood keeps emphasizing a similar "optimal path reveal" read on most cycles, even when the underlying board differs.

### 7. Framed and blueprint are either too subtle or too rare to register as families

Current preset behavior in `core.ts`:

- `classic`: no extra pass
- `braided`: extra braid pass only
- `framed`: light braid + perimeter line carving
- `blueprint-rare`: framed pass + architectural cross-corridors

Isolated preset comparison means:

| Preset | Solution Length | Dead Ends | Junctions | Straightness | Coverage | Corridor Mean |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| classic | 201.4 | 247.4 | 297.9 | 0.709 | 0.168 | 3.416 |
| braided | 162.2 | 183.6 | 325.6 | 0.717 | 0.141 | 3.485 |
| framed | 155.0 | 214.8 | 336.1 | 0.766 | 0.126 | 3.264 |
| blueprint-rare | 131.7 | 187.7 | 389.7 | 0.804 | 0.097 | 3.040 |

Key read:

- `braided` is meaningfully different from `classic`, but it still lives in the same broad family
- `framed` is more distinct than the current ambient loop makes it feel
- `blueprint-rare` is the strongest family separator, but the scheduler nearly never shows it

## Wilson Truth Vs Post-Processing

Current truth is:

1. Generate Wilson maze
2. Optionally braid
3. Apply presentation preset passes
4. Pick farthest endpoints from the post-processed graph
5. Solve and rasterize

That is the right stability-first architecture. It also means current variety depends mostly on:

- how different the post-processing passes really are
- how often the scheduler actually exposes them

At the moment, the architecture is sound, but the family separation is under-powered for ambient variety goals.

## Shape Signature Repetition

Using coarse buckets over solution length, dead ends, junctions, straightness, coverage, mean corridor length, and branching factor:

- unique signature rate over 128 ambient cycles was `47.7%`
- the top 2 signatures covered `14.8%` of the run
- the top 8 signatures covered `37.5%` of the run

That does not mean the mazes are literally repeating. It means they are collapsing into the same coarse visual families often enough that the unattended read starts to feel familiar.

## Ranked Improvement Options

### Low-Risk Presentation-Level Variety

#### 1. Decouple mood scheduling from preset scheduling

Value: very high  
Risk: low

Why:

- the current scheduler is the single biggest compression point
- family exposure is almost fully predetermined today
- this can increase perceived variety without touching Wilson correctness

Recommended direction:

- keep mood pacing logic
- route presets with their own weighted scheduler
- enforce cooldowns instead of a fixed 8-slot pattern
- give `framed` and `blueprint-rare` minimum exposure floors

#### 2. Make presentation families visibly different on purpose

Value: high  
Risk: low

Why:

- solve mood dominates the current read
- framed and blueprint do not announce themselves strongly enough
- this improves perceived breadth without destabilizing generation

Recommended direction:

- stronger blueprint overlay/chrome language
- clearer framed perimeter composition
- different metadata/veil/halo behavior by family, not only by mood
- more variation in how much of the solution path is shown

### Medium-Risk Post-Processing Variety

#### 3. Expand Wilson-preserving topology families

Value: very high  
Risk: medium

Why:

- post-processing is where current family separation should grow
- current passes are still relatively near each other

Recommended direction:

- add 2-3 stronger Wilson post-passes with measurable targets
- examples: avenue, courtyard, sector, offset spine, ring, split-axis
- validate with the existing metric harness before shipping

#### 4. Widen ambient variety bands and stop excluding a whole regime

Value: medium  
Risk: medium

Why:

- ambient never sees `gauntlet`
- scale and footprint deltas are still tightly bounded

Recommended direction:

- include the full variety pool for ambient
- widen footprint asymmetry, not just board scale
- consider a larger seed-step or stronger cycle hash so adjacent episodes do not feel over-curated

### High-Risk Generator / Topology Variety

#### 5. Add alternate substrate generators or topology-target searches

Value: high  
Risk: high

Why:

- this is the path to truly different maze grammars
- it also puts current correctness and solver expectations at the highest risk

Recommended direction:

- only pursue after Wilson-plus-post-processing is exhausted
- require metric gates and long-run validation before adoption

## Recommended Next Implementation Lane

Best next lane:

**Medium-risk Wilson-preserving family expansion, starting with scheduler decoupling.**

Why this is the best next move:

- It attacks the real compression point first.
- It preserves the current correctness and ambient stability story.
- It can materially change what the viewer sees without introducing a second substrate generator.
- It gives Mazer a path to genuine family breadth instead of just more jitter.

Suggested implementation order:

1. Split mood scheduling from preset scheduling.
2. Raise minimum `framed` and `blueprint` family exposure.
3. Strengthen framed / blueprint passes so they read as distinct families.
4. Add 1-2 new Wilson post-processing families.
5. Re-run the analysis harness and compare before/after signature spread.

Suggested success targets for the next lane:

- reduce top-8 signature coverage below `25%` on a 128-cycle run
- raise unique signature rate above `60%`
- raise non-`classic` / non-`braided` exposure to at least `25%`
- keep current lint, test, soak, and build green

## Guidance Notes

Rule: ambient variety must come from genuinely different topology or clearly different presentation families, not only from tiny bounded parameter jitter.

Pattern: measure maze-family diversity with representative shape metrics before adding more generation complexity.

Failure Mode: curated preset rotations can feel polished at first but collapse into sameness over long unattended runs.
