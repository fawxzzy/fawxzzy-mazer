# Mazer Variety Decision Matrix

## Summary Recommendation

Do not jump to a new substrate generator yet.

The fastest path to materially better ambient variety is:

1. decouple mood and preset scheduling
2. raise exposure for the distinct families that already exist
3. strengthen Wilson-preserving post-processing so those families measure and read as separate

That gives Mazer a meaningful variety gain without paying the risk of a generator rewrite.

## Decision Matrix

| Lever | Level | Expected Variety Gain | Correctness Risk | Ambient Stability Risk | Memory Risk | Implementation Cost | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Decouple mood scheduler from preset scheduler | Low | Very high | Low | Low | Low | Low | Do first |
| Make framed / blueprint presentation families louder | Low | High | Low | Low | Low | Low | Do alongside scheduler split |
| Expand Wilson post-processing into stronger families | Medium | Very high | Medium | Medium | Low | Medium | Best next implementation lane |
| Widen menu variety pool and footprint bands | Medium | Medium | Medium | Low | Low | Medium | Do after scheduler split |
| Alternate substrate generator or topology-target search | High | High | High | High | Medium | High | Defer |

## Lever Notes

### 1. Decouple Mood Scheduler From Preset Scheduler

Why it ranks first:

- current mood routing almost fully determines preset distribution
- current ambient exposure is `classic=64`, `braided=48`, `framed=13`, `blueprint-rare=3` over 128 cycles
- this is the biggest compression point and the easiest to fix safely

What changes:

- keep mood for cadence and presentation tone
- give presets their own weighted queue or cooldown-based scheduler
- enforce minimum exposure for underrepresented families

What to watch:

- avoid long streaks of the same preset
- keep blueprint from becoming noisy
- maintain deterministic capture behavior when explicit launch controls are set

### 2. Make Framed / Blueprint Families Visibly Louder

Why it ranks second:

- some of the current family difference is real in metrics, but weak in viewer read
- the product spends too much time showing the same "solved maze with mild chrome variation" language

What changes:

- stronger blueprint overlays and family-specific chrome
- more obvious perimeter behavior for framed boards
- family-specific solution-path and trail treatment

What to watch:

- do not let presentation polish hide the board
- keep OBS framing and TV legibility intact
- keep the family distinction intentional, not noisy

### 3. Expand Wilson Post-Processing Into Stronger Families

Why it is the best next lane:

- it keeps Wilson as generation truth
- it gives ambient variety real topology differences instead of only scheduler differences
- it is safer than adding a second substrate generator

Good candidates:

- avenue / spine family
- courtyard / ring family
- sector / offset-axis family
- stronger blueprint common family instead of blueprint being mostly `framed`

Success criterion:

- each family should move at least several shape metrics in a measurable direction
- if a family does not register in the analysis harness, it is not a real family yet

### 4. Widen Menu Variety Pool And Footprint Bands

Why it is not first:

- it helps, but it does not solve the scheduler bottleneck by itself
- more jitter alone can still feel same-y

Useful changes:

- include the full variety pool for ambient so `gauntlet` is not menu-excluded
- widen footprint asymmetry
- widen braid bands and min-solution targets carefully
- consider a less tidy seed progression than `+1` when not in deterministic capture mode

What to watch:

- bounded parameter jitter without family identity is not enough
- avoid exploding acceptance churn for large / huge ambient runs

### 5. Add Alternate Substrate Generators Or Topology-Target Searches

Why it is deferred:

- highest chance of breaking current solver and soak stability assumptions
- highest implementation cost
- not yet justified while the current Wilson lane still has room to grow

When it becomes justified:

- only after Wilson-plus-post-processing can no longer produce distinct families
- only with measurement gates and long-run validation

## What I Would Build Next And Why

I would build a **Wilson-preserving family expansion lane** with this scope:

1. split mood scheduling from preset scheduling
2. promote `framed` from rare accent into a real family
3. replace `blueprint` as "mostly framed, sometimes blueprint-rare" with two actual blueprint families
4. add one new post-processing family with a measurable topology target
5. keep the analysis script as the before/after gate

Why this is the right next move:

- it directly addresses the current compression points
- it preserves the correctness story that is already green
- it can materially change the unattended ambient read without destabilizing the stack

## Validation Targets For The Next Lane

Use `scripts/analysis/mazer-variety-analysis.ts` before and after the implementation.

Targets:

- top-8 shape-signature coverage under `25%` on a 128-cycle run
- unique shape-signature rate above `60%`
- `framed` plus blueprint-family exposure above `25%`
- no regression in `npm run lint`
- no regression in `npm test`
- no regression in `npm run test:soak`
- no regression in `npm run build`

## Guardrails

Rule: ambient variety must come from genuinely different topology or clearly different presentation families, not only from tiny bounded parameter jitter.

Pattern: measure maze-family diversity with representative shape metrics before adding more generation complexity.

Failure Mode: curated preset rotations can feel polished at first but collapse into sameness over long unattended runs.
