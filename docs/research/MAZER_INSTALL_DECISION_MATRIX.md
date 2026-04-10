# Mazer Install Decision Matrix

## Summary recommendation

Use this matrix to choose only one new lane at a time.

- Baseline now: browser/PWA + Edge app install + repo launcher scripts.
- Best next desktop lane: Tauri.
- Best next true mobile lane: Capacitor.
- Best Android-fast lane: TWA/Bubblewrap.
- Roku: separate product, not a packaging increment.

## Comparison matrix

| Lane | Implementation effort | Web code reuse | Windows | macOS | Linux | Android | iPhone / iPad | TV / Roku | App store viability | Update story | Install UX quality | Pin / home screen behavior | Signing / packaging overhead | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Browser / PWA install flow | Low, already shipped | Very high | Good in Chromium | Fair in Chromium | Fair in Chromium | Good in Chromium | Manual Safari flow only | Weak | None directly, except possible PWA-store packaging later | Web deploy + service worker behavior | Variable, browser-controlled | Desktop app icon where supported; Android home screen; manual iOS Home Screen | Low | Keep as baseline |
| Edge install site as app | Low, already operational | Very high | Very good | N/A | N/A | N/A | N/A | No | No direct store lane | Browser/web updates | Good for Windows personal use | Taskbar pin, Start, desktop shortcut, auto-start via `edge://apps` | Very low | Keep on Windows now |
| PWABuilder Windows package / Microsoft Store | Moderate | Very high | Strong | No | No | No | No | No | Strong for Microsoft Store | Web code updates usually flow from web; manifest-integrated changes need repackage/resubmit | Good | Start/taskbar integration as packaged Windows app | Moderate | Use only if Windows package/store matters |
| Tauri desktop app | Moderate to high | High | Strong | Strong | Strong | Possible via Tauri mobile, but not the best immediate lane | Possible via Tauri mobile, but not the best immediate lane | No | Direct download strong; desktop store possible with more work | Tauri updater or store flow; release engineering required | Strong | Native app pinning / desktop integration | High | Best next desktop lane |
| Electron desktop app | Moderate to high | High | Strong | Strong | Strong | No practical win for this product | No practical win for this product | No | Direct download strong; desktop store possible | Mature auto-update paths on Win/macOS; Linux usually package-manager oriented | Strong | Native app pinning / desktop integration | High | Only if Electron ecosystem is specifically needed |
| Capacitor mobile app | Moderate to high | High | No primary value | No primary value | No | Strong | Strong | No | Strong for Play Store and App Store | Store release by default; Live Updates possible for web-layer changes with extra tooling | Strong once polished | Android launcher + iOS Home Screen app identity | High | Best true mobile lane later |
| Android TWA / Bubblewrap / PWABuilder | Moderate | Very high | No | No | No | Strong | No | No | Strong for Google Play | Web app updates for the site; wrapper updates when native metadata or wrapper changes | Good on Android | Android launcher install via Play / TWA | Moderate | Best if Android-only speed matters |
| Roku-native app | High | Low to moderate | No | No | No | No | No | Strong only on Roku | Roku channel distribution only | Separate Roku app releases | Can be strong if built well | Roku home screen / channel install | High and separate stack | Defer unless Roku becomes explicit scope |

## Detailed scoring notes

### Browser / PWA install flow

- Effort: low because Mazer already ships it.
- Reuse: near-total reuse.
- Risk: platform inconsistency, not engineering instability.
- Fit: strongest current value-per-hour lane.

### Edge app lane

- Effort: low because repo launchers already shape the URL and shortcut flow.
- Reuse: total reuse.
- Risk: browser-owned experience, not a controlled installer.
- Fit: strongest current Windows quality-of-life lane.

### PWABuilder Windows package

- Effort: moderate because packaging metadata, Partner Center setup, and package testing are still required.
- Reuse: almost total reuse.
- Risk: Windows-only lane and more packaging bureaucracy than the current need may justify.
- Fit: useful if Windows storefront presence matters.

### Tauri

- Effort: moderate to high because the repo would gain a Rust/native release lane.
- Reuse: strong for the existing web presentation.
- Risk: packaging/signing complexity, not runtime fit.
- Fit: best choice when "installer we own" becomes the actual problem.

### Electron

- Effort: similar to Tauri in setup class, often heavier in ongoing footprint.
- Reuse: strong.
- Risk: bigger runtime and more package weight than Mazer seems to need.
- Fit: only if Electron-specific integrations become important.

### Capacitor

- Effort: moderate to high because mobile product QA is real work even with high code reuse.
- Reuse: strong for web code, weaker for UX assumptions.
- Risk: mobile shell and store obligations arrive immediately.
- Fit: best if Mazer needs real mobile-app distribution.

### TWA / Bubblewrap

- Effort: lower than Capacitor for Android-only shipping.
- Reuse: near-total reuse.
- Risk: Android-only, asset-links verification, narrower native extensibility.
- Fit: best if the real ask is "get the web app into Play quickly."

### Roku-native

- Effort: high because this is a separate platform stack.
- Reuse: mostly conceptual, not implementation-level.
- Risk: high scope expansion.
- Fit: only for an explicit Roku product.

## Current Mazer-specific call

If I score these lanes against the current repo state, the ranking is:

1. Keep browser/PWA + Edge launcher as-is.
2. Tauri if a real desktop installer becomes necessary.
3. Capacitor if mobile-store presence becomes necessary.
4. TWA/Bubblewrap if Android-only speed becomes necessary.
5. PWABuilder Windows package if Microsoft Store visibility becomes necessary.
6. Electron only for a desktop-integration reason that Tauri does not satisfy.
7. Roku-native only as a separate product decision.

## Mazer-specific evidence anchors

- Current install runtime: [`src/boot/installSurface.ts`](C:/ATLAS/repos/fawxzzy-mazer/src/boot/installSurface.ts)
- Current title-plate install UX: [`src/scenes/MenuScene.ts`](C:/ATLAS/repos/fawxzzy-mazer/src/scenes/MenuScene.ts)
- Current manifest: [`public/manifest.webmanifest`](C:/ATLAS/repos/fawxzzy-mazer/public/manifest.webmanifest)
- Current HTML wiring: [`index.html`](C:/ATLAS/repos/fawxzzy-mazer/index.html)
- Current PWA plugin and SW stance: [`vite.config.ts`](C:/ATLAS/repos/fawxzzy-mazer/vite.config.ts)
- Current localhost SW cleanup: [`src/boot/main.ts`](C:/ATLAS/repos/fawxzzy-mazer/src/boot/main.ts)
- Current Windows launcher lane: [`scripts/windows/Launch-Mazer.ps1`](C:/ATLAS/repos/fawxzzy-mazer/scripts/windows/Launch-Mazer.ps1)
- Current Windows shortcut lane: [`scripts/windows/Prepare-MazerShortcut.ps1`](C:/ATLAS/repos/fawxzzy-mazer/scripts/windows/Prepare-MazerShortcut.ps1)

## External references

- [MDN: `beforeinstallprompt` event](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event)
- [web.dev: Installation prompt](https://web.dev/learn/pwa/installation-prompt/)
- [Microsoft Support: Install, manage, or uninstall apps in Microsoft Edge](https://support.microsoft.com/en-au/topic/install-manage-or-uninstall-apps-in-microsoft-edge-0c156575-a94a-45e4-a54f-3a84846f6113)
- [Microsoft Learn: Publish a PWA to the Microsoft Store](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/microsoft-store)
- [PWABuilder docs: What is a classic package](https://blog.pwabuilder.com/docs/what-is-a-classic-package/)
- [PWABuilder docs: Android platform](https://blog.pwabuilder.com/docs/android-platform/)
- [Tauri v2: Distribute](https://v2.tauri.app/distribute/)
- [Electron Forge: Makers](https://www.electronforge.io/config/makers)
- [Electron: Updating applications](https://www.electronjs.org/docs/latest/tutorial/updates)
- [Capacitor docs](https://capacitorjs.com/docs)
- [Ionic Appflow: Live Updates intro](https://ionic.io/docs/appflow/deploy/intro)
- [Chrome for Developers: Trusted Web Activity quick start](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start)
- [Android Developers: Trusted Web Activities overview](https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities)
- [Apple Support: Turn a website into an app in Safari on iPhone](https://support.apple.com/en-gu/guide/iphone/iphea86e5236/26/ios/26)
- [Roku Developer: Build a streaming app on the Roku platform](https://developer.roku.com/develop)
