# Mobile + PWA Plan

## Current status (April 6, 2026)
- The web app is still tuned for laptop keyboard-first play.
- Touch support is intentionally secondary (swipe to move, tap to pause) so desktop gameplay pacing remains primary.
- PWA installability wiring is in place via:
  - `public/manifest.webmanifest`
  - icon links in `index.html`
  - `vite-plugin-pwa` integration in `vite.config.ts`

## Service worker stance
- Keep service worker disabled in local development (`vite dev`) to avoid stale localhost caches during gameplay iteration.
- Enable service worker only in production builds/deploys.

## Asset policy
- Treat these as provided repository assets (do not generate in code tasks):
  - `/public/favicon.svg`
  - `/public/apple-touch-icon.png`
  - `/public/icons/icon-192.png`
  - `/public/icons/icon-512.png`
  - `/public/icons/icon-192-maskable.png`
  - `/public/icons/icon-512-maskable.png`

## Capacitor / app-store path (later)
When web gameplay and UI stabilization are complete:
1. Add a Capacitor shell around the built web app.
2. Map system back-button behavior to in-game overlay state.
3. Verify orientation lock and safe-area handling on device.
4. Add native store metadata, screenshots, and privacy details.
5. Ship as a store track only after parity checks against the web build.

## Near-term checks
- `npm run build`
- `npm run test`
- Validate that localhost dev does not register a service worker.
- Run Lighthouse installability checks against the production preview.
