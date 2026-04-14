# Integration Scope

Status: repo-owned truth for shared-system installs in the active Mazer planner lanes.

## Current Matrix

- `Playbook`: installed only as a bounded deterministic pattern engine under `src/mazer-core/playbook/**`.
- `Cortex`: intentionally absent from `src/mazer-core/**` and `src/visual-proof/**`.
- `Atlas`: intentionally absent from `src/mazer-core/**` and `src/visual-proof/**`.
- `retrieval`: off. No corpus lookup, memory sync, or knowledge-layer dependency is active in the runtime lanes covered by this doc.
- `future-runtime`: isolated prototype lanes under `src/future-runtime/**` may consume `mazer-core` only through the runtime adapter seam. They do not modify the shipping `MenuScene` baseline.

## Hard Boundaries

- Playbook scores only legal local candidates that were already filtered by `FrontierPlanner`.
- Playbook scoring consumes bounded `PolicyEpisodeLogFeatures` derived from replayable episodes, not proof manifests, raw bus payloads, or runtime-authored truth.
- Learned/adaptive priors for frontier value, backtrack urgency, trap suspicion, enemy risk, item value, and rotation timing are advisory only. They rank legal candidates; they do not legalize moves, promote goals, or author actions.
- Offline training and tuning stay dev-lane only under `src/mazer-core/logging/export/**`, `src/mazer-core/eval/**`, `src/mazer-core/playbook/tuning/**`, and `scripts/training/**`. They may export replay-linked datasets and advisory scorer weights, but they do not run in the shipping runtime and they do not own planner truth.
- Advisory scorer weights now follow a governed `candidate -> blessed` promotion lane. Candidates may be produced offline or derived from the benchmark-pack headless runner, but they are not considered blessed until `scripts/training/promote-weights.mjs` verifies architecture, tests, build, visual proof, visual canaries, future-runtime content proof, the dedicated two-shell future baseline promotion, and the shared runtime benchmark eval without regressions.
- Playbook may summarize intent phrasing and update replay episodes, but it does not own `IntentBusRecord` construction.
- `src/visual-proof/**` is an adapter lane over `src/mazer-core/**`, not a second planner implementation.
- `src/future-runtime/**` is an adapter lane over `src/mazer-core/**`, not a second planner implementation.
- Future runtime adapters project observations and apply legal moves only. Planner decisions, trail truth, intent records, and episode truth remain core-owned.
- Future runtime adapters must not import proof-lane code from `src/visual-proof/**` or `src/topology-proof/**`.
- UI surfaces and Playbook must not receive full-manifest truth as planner input.
- `scripts/lifeline/**` is the headless orchestration lane for seeded benchmark scenarios, deterministic replay verification, runtime eval summaries, replay-linked dataset export, and scorer-tuning prep. It may consume `src/mazer-core/**`, but it must not import UI surfaces, future-runtime rendering code, or proof-lane planner substitutes.

## Approved Seam

The only approved shared-system seam in the active rotating-planet lane is:

- `src/mazer-core/playbook/**`

Approved Playbook interfaces:

- `scoreLegalCandidates(...)`
- `summarizeIntent(...)`
- `updateEpisodePatterns(...)`
- `updateTuningWeights(...)`
- `PolicyEpisodeLogFeatures`
- `ReplayLinkedTrainingDataset`
- `OfflineScorerTuningRun`
- `PlaybookWeightRegistry`
- `evaluateWeightPromotion(...)`

Approved future runtime interfaces:

- `RuntimeAdapterBridge`
- `RuntimeAdapterHost`
- `RuntimeTrailDelivery`
- `RuntimeIntentDelivery`
- `RuntimeEpisodeDelivery`

Anything broader than that is out of scope for this repo lane until this file changes deliberately.

## Isolated Future Lanes

- `src/future-runtime/phaser/**`: isolated Phaser runtime adapter lane for non-shipping scene experiments.
- `src/future-runtime/planet3d/**`: isolated future planet runtime tests. The first promoted future-runtime baseline is the dedicated `planet3d-two-shell-proof` lane, not the shared content-proof pass.
- `scripts/lifeline/**`: isolated headless orchestration lane for benchmarked replay, eval, dataset export, and tuning-prep runs.

Rule:

- these lanes stay behind isolated entry paths and must not replace or mutate the current ambient shipping baseline by default

## Weight Workflow

- Candidate weights stay advisory-only and live outside planner legality or authorship.
- Blessed weights represent the last promoted advisory profile that stayed green on the governed proof lanes.
- Promotion compares candidate eval metrics against the current blessed eval summary over the shared benchmark pack in `scripts/lifeline/benchmark-pack.mjs`.
- Promotion also requires the future-runtime pointer in `artifacts/visual/future-runtime-baseline.json` to stay lane-correct: it must point at the dedicated `two-shell-proof` run and only the `planet3d-two-shell-proof` packet set.
- Promotion rejects any candidate that changes benchmark scenario ids, fails replay integrity, falls outside expected metric bands, or regresses any governed metric.
- Required weight diff reporting covers frontier value, backtrack urgency, trap suspicion, enemy risk, item value, puzzle value, and rotation timing.
- Replay-linked dataset export now records benchmark pack metadata so eval, dataset export, and promotion all reference the same scenario ids.

## Burn-In Workflow

- `node scripts/lifeline/burn-in.mjs --counts 25,100,500` runs the benchmark pack under the current blessed advisory profile and writes resumable output under `tmp/lifeline/burn-in/`.
- Burn-in is fixed-weight only. It resolves the blessed neutral advisory profile from `artifacts/training/playbook-weight-registry.json` and does not tune or promote candidate weights.
- Each burn-in batch emits:
  - `manifest.json`
  - `failure-buckets.json`
  - `eval-summary-rollup.json`
  - `dataset-pointers.json`
  - `scorer-weight-metadata.json`
- Each batch also writes per-attempt headless runner outputs under `tmp/lifeline/burn-in/runs-<count>/attempts/`.
- The batch manifest is resumable. Completed attempts are preserved, and rerunning the command continues from the next missing attempt unless `--resume false` is passed.
- Burn-in thresholds are fixed:
  - deterministic replay consistency: every attempt must keep replay integrity green, stay within metric bands, and match the baseline deterministic signature
  - no architecture leakage: `npm run architecture:check` must pass before and after each batch
  - no proof-gate regression: `npm run visual:proof` and `npm run visual:canaries` must pass before and after each batch
  - stable summaryId/runId generation: suite ids and per-scenario ids must remain unchanged across attempts
  - no candidate-weight promotion: the weight registry digest must not change during burn-in

## Enforcement

- `npm run architecture:check` rejects Cortex or Atlas imports under `src/mazer-core/**` and `src/visual-proof/**`.
- `npm run architecture:check` also rejects proof-lane imports or planner bypasses under `src/future-runtime/**`.
- `npm run architecture:check` must keep replay export, eval, and tuning surfaces bounded away from proof manifests and bus-owned legality/authorship.
- `npm run test:architecture` keeps mutation coverage for the install boundary and the existing planner firewall rules.
