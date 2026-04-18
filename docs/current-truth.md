# Current Truth

Use this note as the anti-drift override when older diffs, screenshots, or prose disagree.

## Precedence

Current repo truth should be read in this order:

1. Latest repo-owned visual artifacts from the visual-proof receipt root in `tmp/captures/mazer-visual-proof/`
2. The current visual assertions in `tests/scenes/demo-build.test.ts`
3. Current runtime/tooling in `scripts/visual/mazer-run.mjs`, `scripts/visual/index-artifacts.mjs`, and `scripts/gates/future-lane-health.mjs`
4. Older prose and research notes

If an older note conflicts with the screenshot gate or `demo-build.test.ts`, treat the older note as stale.

## Local baseline truth

- The screenshot gate is the primary visual source of truth now. Exact target URLs, diagnostics, and before/after artifacts are repo-owned.
- The active shipping lane is the 2D Phaser runtime. Future-runtime and planet/3D proof work stay parked and non-authoritative for shipping claims.
- The repo-owned proof path is green locally as of April 18, 2026: `npm run verify` passed with the lower-lane thought HUD contract, the status-vs-quick-thought split, and the current runtime visibility rollup coverage in place.
- The live 2D receipt root is `tmp/captures/mazer-visual-proof/`. The committed baseline pointer at `artifacts/visual/baseline.json` is promoted explicitly from that repo-owned root.
- Trail attach and no-future-preview are the live contract now. The trail should promote into the moving head tile and stop previewing ahead of the actor.
- The player must remain the dominant local visual signal in the shipping 2D runtime, including worst-case high-contrast or noisy board states.
- Theme-specific palette tuning must never allow trail or goal to outrank the player's local signal.
- Readable HUD thought text uses a bounded queue plus minimum dwell time. It should not replace entries at raw event speed.
- The layout-proof path should be one command plus one preset config. Responsive captures should not depend on one-off ad hoc scripts.
- Thought HUD status and quick-thought lanes are separate responsibilities now. Persistent route context should not share the same lane contract as short-lived observation updates.
- Contrast that only works on some board presets is not sufficient for the live shipping surface.
- Desktop, TV, and OBS now use the tight 5px board-fit composition frame between the title band and the bottom-center install CTA lane.
- Floating thought HUDs in the gameplay core are a failure mode. The live shell should favor the lower safe lane and keep the maze attention core clean.
- Title/header cleanup landed. Current visual polish favors clearer lockup contrast, lower shadow mud, and tighter readout spacing.
- Start/end diversity improved materially, but generator-side endpoint strategy spread is still not finished and remains too region-opposed heavy.

## Release rule

- Local repo health is green when the latest visual pass and repo verify pass are green.
- Production is only considered current when that latest local visual pass is committed and deployed.
- A local-only visual win does not upgrade production truth by itself.

## Still open

- Production can still lag behind the local baseline.
- Endpoint strategy diversity still needs another pass.
- Runtime observe/soak visibility rollups are now repo-owned analysis truth. They inform local diagnostics and soak receipts, but they do not upgrade production truth by themselves.
- `noir` and `monolith` may still want one last small separation/polish pass if the role split feels too close by eye.
