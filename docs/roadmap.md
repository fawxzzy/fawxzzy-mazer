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
