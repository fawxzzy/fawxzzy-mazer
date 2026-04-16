# Roadmap

- Wave 1: foundation bootstrap and scene wiring.
- Wave 2: 2D board model, generation, pathing, and shipping-runtime migration.
- Wave 3: 2D readability and composition polish across desktop, TV, OBS, and mobile surfaces.
- Wave 4: PWA/installability hardening (manifest/icon plumbing, production SW, localhost SW-off discipline).
- Wave 5: packaging and release-surface hardening after the 2D baseline freeze.

## Current focus (April 16, 2026)
- Keep the current 2D Phaser build as the shipping baseline and local freeze target.
- Prioritize small readability, composition, and repo-truth alignment passes that improve the active shipping lane without reopening runtime churn.
- Keep installability plumbing and verification green with repo-owned assets and production-only service-worker behavior.
- Treat future-runtime and planet research as isolated support material, not as the current product claim.

## Parked future lane
- Rotating planet maze design research is now captured in `docs/research/MAZER_ROTATING_PLANET_MAZE_MASTER_PLAN.md`.
- That lane stays explicitly parked and deferred behind the active 2D shipping lane.
- Fixed staging order for that lane:
  1. design brief
  2. topology sandbox
  3. isolated 3D prototype
  4. later integration decision
- The immediate near-term option remains the 2D readability upgrade in the current product, not a 3D reopen.
- The current Phaser 2D build remains the shipping baseline until a future spike separately proves camera clarity, readability, and orientation on its own terms.
