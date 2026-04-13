# Integration Scope

Status: repo-owned truth for shared-system installs in the active Mazer planner lanes.

## Current Matrix

- `Playbook`: installed only as a bounded deterministic pattern engine under `src/mazer-core/playbook/**`.
- `Cortex`: intentionally absent from `src/mazer-core/**` and `src/visual-proof/**`.
- `Atlas`: intentionally absent from `src/mazer-core/**` and `src/visual-proof/**`.
- `retrieval`: off. No corpus lookup, memory sync, or knowledge-layer dependency is active in the runtime lanes covered by this doc.

## Hard Boundaries

- Playbook scores only legal local candidates that were already filtered by `FrontierPlanner`.
- Playbook may summarize intent phrasing and update replay episodes, but it does not own `IntentBusRecord` construction.
- `src/visual-proof/**` is an adapter lane over `src/mazer-core/**`, not a second planner implementation.
- UI surfaces and Playbook must not receive full-manifest truth as planner input.

## Approved Seam

The only approved shared-system seam in the active rotating-planet lane is:

- `src/mazer-core/playbook/**`

Approved Playbook interfaces:

- `scoreLegalCandidates(...)`
- `summarizeIntent(...)`
- `updateEpisodePatterns(...)`

Anything broader than that is out of scope for this repo lane until this file changes deliberately.

## Enforcement

- `npm run architecture:check` rejects Cortex or Atlas imports under `src/mazer-core/**` and `src/visual-proof/**`.
- `npm run test:architecture` keeps mutation coverage for the install boundary and the existing planner firewall rules.
