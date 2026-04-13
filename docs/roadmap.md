# Roadmap

- Wave 1: foundation bootstrap and scene wiring.
- Wave 2: board model, generation, pathing, and gameplay migration.
- Wave 3: laptop-first visual polish (playfield framing, safe-area aware scaling, keyboard-forward controls).
- Wave 4: PWA/installability hardening (manifest/icon plumbing, production SW, localhost SW-off discipline).
- Wave 5: mobile packaging lane (Capacitor wrapper, device QA, store-readiness checklist).

## Current focus (April 6, 2026)
- Preserve keyboard-first cadence on laptop/desktop while keeping touch gesture controls available for coarse-pointer devices.
- Lock installability plumbing to repository-provided icon binaries and keep those assets immutable in feature work.
- Continue treating the service worker as production-only so localhost gameplay iteration remains cache-stale resistant.
- Keep Capacitor/store release tasks explicitly deferred until gameplay parity and device QA gates are complete.

## Deferred future lane
- Rotating planet maze design research is now captured in `docs/research/MAZER_ROTATING_PLANET_MAZE_MASTER_PLAN.md`.
- That lane stays explicitly deferred behind the current ambient stabilization and packaging work.
- Fixed staging order for that lane:
  1. design brief
  2. topology sandbox
  3. isolated 3D prototype
  4. later integration decision
- The current Phaser ambient build remains the shipping baseline until a future spike proves camera clarity, readability, and orientation on its own terms.
