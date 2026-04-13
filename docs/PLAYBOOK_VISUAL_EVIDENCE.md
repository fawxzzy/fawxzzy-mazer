# Visual Evidence Playbook

Use screenshots as the primary machine input for Codex. Treat video as secondary evidence for motion, camera movement, rotation, or animation review. If a still frame can prove the contract, use a still frame.

## Operating Policy

- Capture only from a preview or staging host.
- Use resettable temp users or test fixtures only.
- Do not capture from production accounts or production sessions.
- Keep disposable artifacts under `tmp/`.
- Commit only durable pointers, docs, and indexes.

## Packet Schema

Each visual packet should keep a stable, named scenario and viewport matrix. The packet directory should contain:

```text
before.png
after.png
focus.png
contact-sheet.png
metadata.json
REPORT.md
run.webm
score.json
diff-summary.json
baseline.json
keyframes/
```

Notes:

- `run.webm` is optional and expected only for motion scenarios.
- `score.json` should hold the pass/fail gates and a small numeric summary.
- `diff-summary.json` should rank the largest regressions or deltas for review.
- `baseline.json` should point at the approved baseline packet or run.
- `metadata.json` should describe the scenario, viewport, seeded state, and artifact pointers.

## Baseline Workflow

1. Capture a latest packet set from the preview host.
2. Compare the latest run against the current baseline.
3. Review ranked regressions and the failing gates.
4. Promote the latest run to baseline only after the contract passes.
5. Keep baseline promotion explicit, never implicit.

## Mazer Example

For the rotating planet maze lane, use screenshots from the isolated visual-proof surface as the main proof artifact. Use video only for the discrete rotation and orientation-recovery scenarios. The packet should include the before/after/focus frames, a contact sheet, metadata, report text, and the scoring/baseline artifacts above.

## Auth-App Example

For an auth-enabled app, capture from a preview or staging host with a resettable temp account. Never use a production account, production credentials, or a live user session. If login state matters, seed a disposable test user and make the capture reproducible before taking screenshots.

