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
- Advisory scorer weights now follow a governed `candidate -> manual review -> blessed` promotion lane. Candidates may be produced offline or derived from the benchmark-pack headless runner, but they are not considered blessed until a review artifact is written for each governed candidate, the human-readable scenario deltas are inspected against the current blessed advisory baseline, and `scripts/training/promote-weights.mjs --candidate-id <id> --bless` is invoked explicitly.
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

## Governed Candidate Experiment Pack

- `node scripts/training/governed-candidate-experiment-pack.mjs` evaluates the governed experiment pack defined in `artifacts/training/governed-candidate-experiment-pack.json`.
- The v2 pack currently covers four non-neutral advisory-only profiles:
  - `frontier-biased`
  - `caution-biased`
  - `pursuit-avoidance-biased`
  - `item-priority-biased`
- The governed benchmark contract now rides on `mazer-runtime-benchmark-v3`, which keeps the original five single-focus probes and adds five combined-system probes:
  - traps plus Warden pressure plus item relevance
  - recovery after discrete alignment changes
  - puzzle visibility during rotation
  - multi-speaker intent load
  - three-shell connector reasoning
- The experiment pack runs the required global gate surface once per pack:
  - `npm run architecture:check`
  - `npm test`
  - `npm run build`
  - `npm run visual:proof`
  - `npm run visual:canaries`
  - `npm run future:content-proof`
  - `npm run future:two-shell-proof`
  - `npm run future:three-shell-proof`
- Each candidate is then evaluated locally over the governed benchmark pack through `scripts/eval/run-eval.mjs`, using candidate-specific weights written under `tmp/training/governed-candidate-experiment-pack/` and eval summaries under `tmp/eval/governed-candidate-experiment-pack/`.
- Registry updates remain governed and advisory-only:
  - accepted candidates are recorded as `candidate`
  - rejected candidates are recorded as `rejected`
  - no experiment-pack candidate is blessed automatically
- Reject reasons must stay explicit. Metric-band failures are recorded per scenario in the candidate notes, alongside any failed gate names, scenario-id mismatches, or replay-integrity failures.
- Candidate promotion remains blocked until the v3 benchmark pack, content-proof, two-shell proof, three-shell proof, visual proof, and visual canaries all stay green for the evaluated weights.
- The experiment-pack lane does not widen legality. Candidate evaluation still routes through the legal local-candidate scoring path and cannot bypass the existing planner firewall.

## Manual Blessing Workflow

- `artifacts/training/manual-blessing-review-pack.json` is the repo-owned source of truth for which governed candidates enter manual blessing review.
- `node scripts/training/promote-weights.mjs` is review-only by default:
  - it resolves the current blessed advisory baseline from `artifacts/training/playbook-weight-registry.json`
  - it loads the current governed v3 candidates from the registry
  - the review-pack scenario ids must exactly match `mazer-runtime-benchmark-v3`
  - it writes one review artifact per candidate under `tmp/training/manual-blessing-review-pack-v3/`
  - it writes `tmp/training/manual-blessing-review-pack-v3/manifest.json`
  - it does not mutate `currentBlessedRecordId`
- Every candidate review artifact must emit:
  - `keptGreen` for the required proof surfaces that stayed green
  - `improved` for aggregate or shared-scenario gains relative to the current blessed advisory baseline
  - `worsened` for aggregate or shared-scenario regressions relative to the current blessed advisory baseline
  - `blockedReasons` for any failed governed surface, missing scenario delta, benchmark mismatch, or rejected registry state
  - `recommendation` with exactly one of:
    - `keep-as-candidate`
    - `ready-for-manual-blessing`
    - `reject`
- Blessing remains manual and explicit:
  - review artifacts must exist first
  - proof, eval, and human-readable scenario deltas must all be present
  - `node scripts/training/promote-weights.mjs --candidate-id <id> --bless` is the only path that may update `currentBlessedRecordId`
- Do not bless from metrics alone. Shared benchmark deltas and the added benchmark-v3 coverage must agree with the proof surface before any blessing change.

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

## Continuous Lifeline Workflow

- `node scripts/lifeline/continuous.mjs` extends the fixed-weight burn-in lane into a resumable continuous runner for seeded benchmark batches.
- Continuous mode is still core-driven only:
  - it runs through `scripts/lifeline/**`
  - it keeps Playbook advisory-only
  - it does not import UI surfaces, `MenuScene`, or future-runtime render code
- The lane resolves and pins the active blessed advisory profile at startup, then records the active blessed weight id in the manifest, watchdog summary, and rollups.
- The standard soak packs are now:
  - `1000` runs
  - `5000` runs
- Unless explicit counts are passed, continuous mode runs those standard soak packs in order.
- Continuous mode checkpoints to `tmp/lifeline/continuous/` with stable top-level pointers:
  - `manifest.json`
  - `checkpoint.json`
  - `watchdog.json`
  - `summary-rollup.json`
  - `latest-batch-manifest.json`
  - `latest-summary-rollup.json`
  - `latest-failure-buckets.json`
- Each completed batch writes a retained packet under `tmp/lifeline/continuous/batches/<batch-id>/` with:
  - `manifest.json`
  - `summary-rollup.json`
  - `failure-buckets.json`
  - `health-before.json`
  - `health-after.json`
  - the nested soak packet under `soak-pack/`
- Each batch summary is diffable and must carry:
  - the failure-bucket histogram for that batch
  - the eval rollup for the full soak pack
  - artifact pointers for the retained packet and nested soak packet
  - the active blessed weight id used for that batch
- Resume semantics are checkpoint-based. Restarting the command continues from the next unresolved batch index unless `--resume false` is passed.
- Resume stays packet-safe:
  - completed soak attempts inside `soak-pack/` are preserved
  - interrupted packs resume from the next missing attempt
  - retained batch summaries, latest-pointer files, and the pruned batch ledger stay stable across resumes
- Retention is windowed. Older retained batch directories are pruned once the configured retention window is exceeded, while summary rollups and the pruned batch id ledger remain stable across resumes.
- Continuous failure buckets stay explicit:
  - `resumeCheckpointMismatch`
  - `batchExecutionFailure`
  - `blessedWeightMismatch`
  - `stableArtifactPointerMismatch`
  - `retentionPruneFailure`
  - `healthPackRegression`
- Continuous soak acceptance thresholds are fixed:
  - replay consistency must stay deterministic across the whole nested soak pack
  - metric bands must remain inside the currently accepted benchmark ranges
  - `npm run health` must pass before and after every retained batch
  - the pinned blessed advisory id and pinned blessed weights must remain unchanged for the full soak run
- Continuous mode fails the soak immediately if any retained batch trips one of those thresholds. Failed batches remain written for inspection, but they are not considered healthy-lane proof.
- The watchdog summary is the small operational surface for long-running batches. It reports batch count, last successful batch, failure-bucket histogram, checkpoint path, stable latest pointers, and the active blessed weight id.

## Enforcement

- `npm run architecture:check` rejects Cortex or Atlas imports under `src/mazer-core/**` and `src/visual-proof/**`.
- `npm run architecture:check` also rejects proof-lane imports or planner bypasses under `src/future-runtime/**`.
- `npm run architecture:check` must keep replay export, eval, and tuning surfaces bounded away from proof manifests and bus-owned legality/authorship.
- `npm run test:architecture` keeps mutation coverage for the install boundary and the existing planner firewall rules.


