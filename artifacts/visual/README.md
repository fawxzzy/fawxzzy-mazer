# Visual Evidence

Generated proof packets stay under `tmp/captures/mazer-visual-proof/` to match the ATLAS path policy for disposable visual artifacts.

Commands:

- `npm run visual:proof`
- `npm run visual:canaries`
- `npm run visual:index`
- `npm run visual:compare`
- `node scripts/visual/future-runtime-run.mjs`
- `node scripts/visual/index-artifacts.mjs --future-artifact-root tmp/captures/mazer-future-runtime`
- `node scripts/visual/index-artifacts.mjs --future-artifact-root tmp/captures/mazer-future-runtime --compare`
- `node scripts/visual/index-artifacts.mjs --future-artifact-root tmp/captures/mazer-future-runtime --promote-baseline --run-id two-shell-proof`
- `node scripts/visual/legacy-run.mjs`
- `node scripts/visual/index-artifacts.mjs --compare-legacy --legacy-artifact-root tmp/captures/mazer-legacy-proof`
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
- The render layer now splits breadcrumb truth from feel: committed breadcrumbs stay tile-true, while a live head tether keeps the visible trail welded to the player transform every frame.
- Canary mutations explicitly fail on solution-overlay paint, trail-head mismatch, and omniscient start targeting.

Explorer packet metrics:

- `goalObservedStep`
- `replanCount`
- `backtrackCount`
- `frontierCount`
- `tilesDiscovered`
- `trailHeadMatchesPlayer`
- `speakerCount`
- `intentEmissionRate`
- `worldPingEmissionRate`
- `intentDebouncePass`
- `worldPingSpamPass`
- `feedReadabilityPass`
- `intentStackOverlapPass`
- `policyScorerId`
- `policyEpisodeCount`

Intent bus overlay:

- The spectator/debug overlay is hybrid: a HUD-space `Intent Bus` stack on neutral glass in a safe corner plus brief world-space micro pings for concrete local events.
- The bus is planner-owned. The feed consumes shared bus records instead of narrating raw runtime state or per-frame thought text.
- Each record carries `speaker`, `category`, `importance`, `summary`, `confidence`, optional `anchor`, `step`, and `ttlSteps`.
- Speakers are `@Runner`, `@Warden`, `@TrapNet`, `@Puzzle`, and `@Inventory`.
- Entries emit only on meaningful policy deltas such as frontier choice, dead-end confirmation, landmark observation, replans, and goal observation.
- The queue is capped at four visible entries with newest-to-oldest opacity slots of `100 / 70 / 40 / 15`.
- The persistent stack stays in screen space; world-space text is reserved for short anchored pings only and must never rotate with the planet as persistent UI.
- World pings are short event labels such as `Gate aligned`, `Trap inferred`, `Enemy seen`, `Item spotted`, and `Exit seen`.
- During large camera motion the healthy lane collapses ping density so anchored callouts do not fight orientation recovery.
- High-importance intent stays visible longer than low-importance chatter so the overlay reads like commentary, not per-frame thought spam.
- Feed categories are `observe`, `replan`, `danger`, `item`, `goal`, and `infer`.
- Feed lines stay verb-first, keep speaker handles visible, and debounce duplicate chatter within a short step window.

Intent proof gates:

- `intentStackOverlapPass` requires the HUD stack to stay out of the player/objective critical area.
- `intentDebouncePass` rejects duplicate summary spam inside the debounce window.
- `worldPingSpamPass` rejects overly frequent or overly dense world ping bursts.
- `feedReadabilityPass` requires the capped stack, slot fade order, verb-first copy, and importance-based linger rules to remain intact.

Readability gates:

- `trailHeadGapPx` keeps the visible trail head within `0.75px` of the player.
- `trailContrastPass` enforces at least `3:1` active-trail contrast plus a stronger active-vs-old trail split.
- `playerDominancePass` requires the player cue to remain the strongest local signal through dense clutter.
- `objectiveSeparationPass` requires a warm objective channel that stays distinct from the player in both hue and shape.

Cue tokens:

- `playerCore`: `#FFFFFF`
- `playerHalo`: `#53E6FF`
- `trailHead`: `#53E6FF`
- `trailBody`: `#1BCFEA @ 70%`
- `trailOld`: `#1BCFEA @ 28%`
- `cueOutline`: `#03141A`
- `objective`: `#FFD166`
- `enemy`: `#FF5C8A`

The committed baseline pointer lives at `artifacts/visual/baseline.json`. It points at the current baseline run inside `tmp/captures/mazer-visual-proof/` and is updated explicitly by `npm run visual:promote-baseline`.

Future runtime lane:

- Future Phaser and planet3d packets live under `tmp/captures/mazer-future-runtime/`.
- Their baseline pointer is separate from the visual-proof baseline and lives at `artifacts/visual/future-runtime-baseline.json`.
- `node scripts/visual/future-runtime-run.mjs --run content-proof` is the shared content-proof workflow for this lane; it captures `future-phaser.html` plus the non-baselined `planet3d-content-proof` packet set under the `content-proof` run id.
- `node scripts/visual/future-runtime-run.mjs --run two-shell-proof` is the dedicated future-baseline workflow; it captures only `planet3d-two-shell-proof` under the `two-shell-proof` run id.
- The content-proof packet contract now includes `trapInferencePass`, `wardenReadabilityPass`, `itemProxyPass`, `puzzleProxyPass`, and `signalOverloadPass`, with world pings kept subordinate to the readable intent feed.
- `scripts/visual/index-artifacts.mjs` accepts `--future-artifact-root tmp/captures/mazer-future-runtime` so index/compare/promote stay on the future lane without touching the visual-proof baseline.
- Future baseline promotion is lane-specific: use `--run-id two-shell-proof` so `artifacts/visual/future-runtime-baseline.json` points only at the dedicated two-shell packet set.
- Future baseline compare is also lane-specific: use `node scripts/visual/index-artifacts.mjs --future-artifact-root tmp/captures/mazer-future-runtime --compare --run-id two-shell-proof` when checking the promoted two-shell lane.
- The packet contract stays the same: `before.png`, `after.png`, `focus.png`, `contact-sheet.png`, `metadata.json`, `REPORT.md`, `score.json`, `diff-summary.json`, and `run.webm` when motion is enabled.

Comparison workflow:

- `npm run visual:index` refreshes the packet index and writes the current packet-level and aggregate `score.json` plus `diff-summary.json`.
- `npm run visual:compare` compares the latest run to `artifacts/visual/baseline.json` and exits non-zero when regressions are found.
- `node scripts/visual/index-artifacts.mjs --compare-legacy --legacy-artifact-root tmp/captures/mazer-legacy-proof` compares the current lane against the archived Unreal lane and writes `comparison-index.json`, `comparison-score.json`, `comparison-diff-summary.json`, `comparison-report.json`, and `comparison-report.md` beside the current artifact root.
- The legacy compare report is semantic, not a blessed pixel baseline. It groups current-vs-legacy differences into `player clarity`, `trail tightness`, `cue hierarchy`, `intent density`, and `pacing / replanning`, then classifies each axis as `improved`, `regressed`, or `intentional`.
- `npm run visual:regressions` prints the largest regressions ranked by scenario and viewport.
- `npm run visual:promote-baseline` moves the committed pointer to the latest indexed run.

Legacy lane:

- `node scripts/visual/legacy-run.mjs` unpacks `legacy/old-project.zip` into `tmp/legacy/mazer-old-project/<run-id>/` and indexes the archived screenshots under `tmp/captures/mazer-legacy-proof/`.
- The legacy packet uses the same packet directory contract as the current lane: `before.png`, `after.png`, `focus.png`, `contact-sheet.png`, `metadata.json`, `REPORT.md`, `score.json`, and `diff-summary.json`.
- Legacy remains a reference lane for feel checks, not the blessed baseline for graph, overlay, or topology truth.

Canary workflow:

- `npm run visual:canaries` runs a healthy control pass and then a mutated canary pass under `tmp/captures/mazer-visual-proof-canaries/`.
- The canary lane expects semantic failure and also expects compare/regressions to be non-zero between the control and mutated runs.
- Canary packet `REPORT.md` and `score.json` name the exact failing gates in human-readable form.
- Canary coverage now includes cue-channel collapse so player, trail, and objective token regressions fail the lane instead of silently blending together.
- Canary coverage also includes an intent-feed spam mutation so the healthy lane passes while the mutated lane fails debounce, ping cadence, and readability gates.
- The canary lane does not touch `artifacts/visual/baseline.json` or the blessed packet workflow.

Policy scorer:

- The explorer remains the deterministic safety kernel. It owns move legality, local observation limits, goal promotion, committed trail truth, and rotation legality.
- `PolicyScorer` is an optional ranking layer that scores only the legal candidate set already produced by the explorer.
- Proof packets now include scorer metadata and training-ready episode logs so frontier value, trap suspicion, enemy risk, item value, and rotation timing can learn without giving the scorer full-manifest truth.
- `scripts/training/promote-weights.mjs` can derive a candidate directly from the benchmark-pack headless runner when `--candidate` is omitted, then bless it only if the full governed matrix stays green.
