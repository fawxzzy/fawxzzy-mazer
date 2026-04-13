# Visual Evidence

Generated proof packets stay under `tmp/captures/mazer-visual-proof/` to match the ATLAS path policy for disposable visual artifacts.

Commands:

- `npm run visual:proof`
- `npm run visual:index`
- `npm run visual:compare`
- `npm run visual:promote-baseline`
- `npm run visual:regressions`

Each packet includes `before.png`, `after.png`, `focus.png`, `contact-sheet.png`, `metadata.json`, `REPORT.md`, `score.json`, and `diff-summary.json`. Motion scenarios also emit `run.webm`.

The committed baseline pointer lives at `artifacts/visual/baseline.json`. It points at the current baseline run inside `tmp/captures/mazer-visual-proof/` and is updated explicitly by `npm run visual:promote-baseline`.

Comparison workflow:

- `npm run visual:index` refreshes the packet index and writes the current packet-level and aggregate `score.json` plus `diff-summary.json`.
- `npm run visual:compare` compares the latest run to `artifacts/visual/baseline.json` and exits non-zero when regressions are found.
- `npm run visual:regressions` prints the largest regressions ranked by scenario and viewport.
- `npm run visual:promote-baseline` moves the committed pointer to the latest indexed run.
