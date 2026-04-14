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
- Playbook may summarize intent phrasing and update replay episodes, but it does not own `IntentBusRecord` construction.
- `src/visual-proof/**` is an adapter lane over `src/mazer-core/**`, not a second planner implementation.
- `src/future-runtime/**` is an adapter lane over `src/mazer-core/**`, not a second planner implementation.
- Future runtime adapters project observations and apply legal moves only. Planner decisions, trail truth, intent records, and episode truth remain core-owned.
- Future runtime adapters must not import proof-lane code from `src/visual-proof/**` or `src/topology-proof/**`.
- UI surfaces and Playbook must not receive full-manifest truth as planner input.

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

Approved future runtime interfaces:

- `RuntimeAdapterBridge`
- `RuntimeAdapterHost`
- `RuntimeTrailDelivery`
- `RuntimeIntentDelivery`
- `RuntimeEpisodeDelivery`

Anything broader than that is out of scope for this repo lane until this file changes deliberately.

## Isolated Future Lanes

- `src/future-runtime/phaser/**`: isolated Phaser runtime adapter lane for non-shipping scene experiments.
- `src/future-runtime/planet3d/**`: isolated one-shell 3D runtime adapter lane for future readability and rotation tests.

Rule:

- these lanes stay behind isolated entry paths and must not replace or mutate the current ambient shipping baseline by default

## Enforcement

- `npm run architecture:check` rejects Cortex or Atlas imports under `src/mazer-core/**` and `src/visual-proof/**`.
- `npm run architecture:check` also rejects proof-lane imports or planner bypasses under `src/future-runtime/**`.
- `npm run architecture:check` must keep replay export, eval, and tuning surfaces bounded away from proof manifests and bus-owned legality/authorship.
- `npm run test:architecture` keeps mutation coverage for the install boundary and the existing planner firewall rules.
