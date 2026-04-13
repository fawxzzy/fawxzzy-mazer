# Visual Evidence

Generated proof packets stay under `tmp/captures/mazer-visual-proof/` to match the ATLAS path policy for disposable visual artifacts.

Commands:

- `npm run visual:proof`
- `npm run visual:canaries`
- `npm run visual:index`
- `npm run visual:compare`
- `npm run visual:promote-baseline`
- `npm run visual:regressions`
- `npm run topology:export`

Each packet includes `before.png`, `after.png`, `focus.png`, `contact-sheet.png`, `metadata.json`, `REPORT.md`, `score.json`, and `diff-summary.json`. Motion scenarios also emit `run.webm`.

Manifest-driven proof:

- Canonical proof scenes now load from `public/topology-proof/manifests/*.json`.
- `playwright.visual.config.json` routes the isolated proof lane through `?manifest=/topology-proof/manifests/<scenario>.json`.
- `src/visual-proof/scenarioLibrary.ts` remains available only as fallback smoke data when no manifest is supplied.
- Packet metadata records manifest source, seed, district type, and rotation state label.

Anti-cheat guarantees:

- Normal proof, baseline, and canary runs do not paint a solved route overlay.
- The explorer may path only over the discovered graph; A* to the exit on the full manifest is treated as cheating.
- The active goal is promoted only after local observation; before that the planner targets a frontier.
- The rendered trail is derived only from committed occupancy history, and `trailHeadTileId` must match `playerTileId`.
- Canary mutations explicitly fail on solution-overlay paint, trail-head mismatch, and omniscient start targeting.

Explorer packet metrics:

- `goalObservedStep`
- `replanCount`
- `backtrackCount`
- `frontierCount`
- `tilesDiscovered`
- `trailHeadMatchesPlayer`

The committed baseline pointer lives at `artifacts/visual/baseline.json`. It points at the current baseline run inside `tmp/captures/mazer-visual-proof/` and is updated explicitly by `npm run visual:promote-baseline`.

Comparison workflow:

- `npm run visual:index` refreshes the packet index and writes the current packet-level and aggregate `score.json` plus `diff-summary.json`.
- `npm run visual:compare` compares the latest run to `artifacts/visual/baseline.json` and exits non-zero when regressions are found.
- `npm run visual:regressions` prints the largest regressions ranked by scenario and viewport.
- `npm run visual:promote-baseline` moves the committed pointer to the latest indexed run.

Canary workflow:

- `npm run visual:canaries` runs a healthy control pass and then a mutated canary pass under `tmp/captures/mazer-visual-proof-canaries/`.
- The canary lane expects semantic failure and also expects compare/regressions to be non-zero between the control and mutated runs.
- Canary packet `REPORT.md` and `score.json` name the exact failing gates in human-readable form.
- The canary lane does not touch `artifacts/visual/baseline.json` or the blessed packet workflow.
