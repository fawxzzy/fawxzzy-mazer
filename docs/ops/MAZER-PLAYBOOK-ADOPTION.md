# Mazer Playbook Adoption

This repo claims the Playbook owner contract `playbook_convergence_contract` at version `1.0.0` from `repos/fawxzzy-playbook/exports/playbook.contract.example.v1.json`.

It does not copy the Playbook contract locally. Repo-owned evidence for this tranche lives in:

- `exports/repo.playbook.adoption.evidence.schema.v1.json`
- `exports/mazer.playbook.adoption.evidence.v1.json`
- `tests/playbook-adoption-evidence.test.mjs`

## Current Status

- adoption status: `adopted`
- verification state: `targeted`
- continuity status: `structured`
- drift status: `none_detected`

This tranche proves that Mazer can declare its Playbook contract version, publish one stable repo-local adoption export, and validate that export against the owner contract ids and local schema. It does not claim stack-owned approval or execution boundaries that belong to ATLAS root, Lifeline, or `_stack`.

## Initiative And Operator Linkage

The live operator fixture for this repo is explicitly linked to:

- root initiative: `docs/memory/initiatives/initiative-mazer-d2-learning-scorer.json`
- current proposed follow-up: `runtime/atlas/proposed-sessions/session-proposed-mazer-d2-fixed-blessed-id-soak/session.manifest.json`

Those surfaces remain root-owned truth. This repo references them so the linkage is machine-readable, but it does not recreate the proposal queue, blessing queue, or governed session state as repo-local canonical data.

Repo-local surfaces that correspond to the live initiative stay here:

- `docs/INTEGRATION_SCOPE.md`
- `artifacts/training/governed-candidate-experiment-pack.json`
- `artifacts/training/manual-blessing-review-pack.json`
- `artifacts/training/playbook-weight-registry.json`

Those files describe the repo-owned scorer, candidate, and manual-review workflow that the root initiative is pointing at.

## Implemented Patterns

Implemented in this repo:

- `pattern_ground_work_in_current_awareness`
  Evidence: `README.md`, `docs/current-truth.md`, `docs/roadmap.md`
- `pattern_explicit_trust_posture`
  Evidence: `docs/INTEGRATION_SCOPE.md`, this doc, `exports/mazer.playbook.adoption.evidence.v1.json`
- `pattern_owner_repo_keeps_owner_truth`
  Evidence: repo-owned doctrine stays in Mazer while the Playbook contract and root initiative or proposal surfaces are referenced directly
- `pattern_convergence_is_measurable`
  Evidence: `tests/playbook-adoption-evidence.test.mjs`
- `pattern_structured_handoff_and_promotion`
  Evidence: `docs/INTEGRATION_SCOPE.md`, `docs/current-truth.md`, this doc

Not applicable in this repo:

- `pattern_proposal_before_execution`

That pattern is currently owned by the root proposal and governed execution lanes. Mazer records the non-applicability explicitly rather than silently omitting it.

## Adoption Checks

Implemented here:

- `adoption_continuity_lane_is_structured`
- `adoption_trust_posture_is_negative_safe`

Not applicable here:

- `adoption_playbook_exports_contract`
- `adoption_atlas_consumes_owner_truth_read_only`
- `adoption_proposal_and_execution_are_separate`

Those remain owned by Playbook, ATLAS root, Lifeline, and `_stack` rather than by this repo.

## Continuity Posture

Mazer follows the ATLAS continuity lane for serious Codex or ChatGPT work:

- raw transcript is `trace_only`
- structured handoff is required
- durable repo facts promote into repo-owned docs or artifacts plus the stack handoff or receipt lane when needed

Current handoff contract reference:

- `schemas/atlas.continuity.handoff.v1.json`

Current durable promotion targets for repo-local work:

- `docs/current-truth.md` for active anti-drift runtime truth
- `docs/roadmap.md` for durable next-lane planning
- `docs/INTEGRATION_SCOPE.md` for integration and workflow doctrine
- `artifacts/training/` for governed scorer and review-pack truth
- `runtime/receipts/handoffs/` for structured cross-session traceability

Transcript residue is never the durable endpoint by itself.

## Trust And Boundary Notes

The repo keeps restricted states explicit:

- governed candidates are advisory-only
- manual blessing review is required before any blessing change
- the live root operator path is still proposal-only
- pending manual review is visible, but that state remains rooted in the root initiative and proposed-session surfaces

This keeps repo-local truth honest without duplicating root-owned operator memory.

## Out Of Scope

This tranche does not:

- duplicate the Playbook contract text in Mazer
- copy the root proposal queue or blessing queue into repo-owned state
- claim governed write or approval ownership for the repo
- treat transcripts as durable memory
- widen execution posture beyond the current proposal-only path
