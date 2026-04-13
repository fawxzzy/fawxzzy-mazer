# Codex Visual Evidence Prompt

Use this template for a new visual lane.

```text
You are working on {{repo_name}}.

Goal
Build a repeatable visual evidence lane for {{feature_or_surface}}.

Rules
- Use screenshots as the primary agent input.
- Use video only when motion, camera movement, rotation, or animation must be reviewed.
- Capture only from {{preview_host_or_staging_host}}.
- Use only resettable temp users or test fixtures.
- Do not capture from production accounts or production sessions.
- Keep disposable artifacts in tmp/ and commit only durable pointers, docs, and indexes.

Evidence packet
Each packet should include:
- before.png
- after.png
- focus.png
- contact-sheet.png
- metadata.json
- REPORT.md
- run.webm for motion scenarios
- score.json
- diff-summary.json
- baseline.json
- keyframes/

Workflow
1. Capture a latest packet set.
2. Compare the latest run to baseline.
3. Review the ranked regressions and the failed gates.
4. Promote the run to baseline only after it passes.

Output
Return the packet path, the comparison result, the baseline pointer, and the top regressions by scenario and viewport.
```

Example: Mazer

```text
Repo: fawxzzy-mazer
Surface: isolated visual-proof lane
Host: preview only
Auth: none
Use the visual packet as proof of player readability, shell legibility, and orientation recovery.
```

Example: Auth app

```text
Repo: {{auth_app_repo}}
Surface: authenticated preview flow
Host: preview or staging only
Auth: resettable temp user only
Never use a production account or a real user session.
Use the packet to prove the login and post-login flow without depending on live data.
```

