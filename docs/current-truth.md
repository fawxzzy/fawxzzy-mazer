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
- The live 2D receipt root is `tmp/captures/mazer-visual-proof/`. The committed baseline pointer at `artifacts/visual/baseline.json` is promoted explicitly from that repo-owned root.
- Trail attach and no-future-preview are the live contract now. The trail should promote into the moving head tile and stop previewing ahead of the actor.
- Desktop, TV, and OBS now use the tight 5px board-fit composition frame between the title band and the bottom-center install CTA lane.
- Title/header cleanup landed. Current visual polish favors clearer lockup contrast, lower shadow mud, and tighter readout spacing.
- Start/end diversity improved materially, but generator-side endpoint strategy spread is still not finished and remains too region-opposed heavy.

## Release rule

- Local repo health is green when the latest visual pass and repo verify pass are green.
- Production is only considered current when that latest local visual pass is committed and deployed.
- A local-only visual win does not upgrade production truth by itself.

## Still open

- Production can still lag behind the local baseline.
- Endpoint strategy diversity still needs another pass.
- `noir` and `monolith` may still want one last small separation/polish pass if the role split feels too close by eye.
