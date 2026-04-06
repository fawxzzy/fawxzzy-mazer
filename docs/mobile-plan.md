# Mobile + PWA Plan

## Current status (April 6, 2026)
- The web app remains tuned for laptop keyboard-first play and board readability.
- Touch support stays intentionally secondary (swipe to move, tap to pause) and should only be active for coarse-pointer environments.
- PWA installability plumbing is wired to repository-supplied assets via:
  - `public/manifest.webmanifest`
  - icon/meta links in `index.html`
  - `vite-plugin-pwa` integration in `vite.config.ts`

## Service worker stance
- Keep service worker disabled in local development (`vite dev`) to avoid stale localhost caches during gameplay iteration.
- Enable service worker only in production builds/deploys.

## Asset policy
- Treat these as provided repository assets (do not generate, re-encode, or replace in implementation tasks):
  - `/public/favicon.svg`
  - `/public/apple-touch-icon.png`
  - `/public/icons/icon-192.png`
  - `/public/icons/icon-512.png`
  - `/public/icons/icon-192-maskable.png`
  - `/public/icons/icon-512-maskable.png`

## Installability checks
- Confirm `manifest.webmanifest` references all provided icon binaries.
- Confirm `index.html` links include favicon, apple-touch icon, and manifest.
- Confirm production build emits PWA registration plumbing.
- Confirm localhost development does not register a service worker.

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
