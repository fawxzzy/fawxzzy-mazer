# Mazer Install And Distribution Surfaces

## Executive summary

Mazer already has a solid baseline install lane for a browser-first ambient product:

- A single in-app `Install Mazer` action appears only when Chromium actually exposes `beforeinstallprompt`.
- Installed or standalone launches hide that action and keep the ambient shell running.
- iPhone/iPad-style browsers fall back to manual text: `Use Share > Add to Home Screen`.
- Windows already has a practical non-store launcher lane via `scripts/windows/Launch-Mazer.ps1` and `scripts/windows/Prepare-MazerShortcut.ps1`.

That means Mazer does **not** currently have an install problem so much as an install-surface expectations problem. The current button can legitimately "skip" because `beforeinstallprompt` is not a universal install API. It is a Chromium-centric, non-standard event that only appears when the browser decides the app is installable on that device and session. The runtime in [`src/boot/installSurface.ts`](C:/ATLAS/repos/fawxzzy-mazer/src/boot/installSurface.ts) already handles that correctly by failing open instead of blocking the ambient product.

My recommendation is to stay disciplined:

- Wave 1: keep the current browser/PWA lane and the current Windows launcher lane.
- Wave 2: if Mazer needs a true installer you control, choose **Tauri** first.
- Wave 3: only add **Capacitor** if mobile store distribution becomes an actual shipping goal.
- Skip Electron unless desktop-native plugin breadth or Electron-specific ecosystem leverage becomes more important than package weight.
- Treat Roku as a separate product, not a packaging checkbox.

## Current repo state

This document is based on the current repo implementation in `C:\ATLAS\repos\fawxzzy-mazer`.

### Current install surface

- [`src/boot/installSurface.ts`](C:/ATLAS/repos/fawxzzy-mazer/src/boot/installSurface.ts) captures `beforeinstallprompt`, stores the deferred event, clears it after use, listens for `appinstalled`, and resolves a three-state UI model: `hidden`, `available`, or `manual`.
- [`src/scenes/MenuScene.ts`](C:/ATLAS/repos/fawxzzy-mazer/src/scenes/MenuScene.ts) renders exactly one title-plate install affordance: either `Install Mazer`, the manual iOS instruction, or passive text.
- [`tests/boot/install-surface.test.ts`](C:/ATLAS/repos/fawxzzy-mazer/tests/boot/install-surface.test.ts) covers accepted install, standalone hiding, and iOS manual fallback behavior.

### Current PWA wiring

- [`index.html`](C:/ATLAS/repos/fawxzzy-mazer/index.html) links the manifest, touch icon, theme color, and mobile web app meta tags.
- [`public/manifest.webmanifest`](C:/ATLAS/repos/fawxzzy-mazer/public/manifest.webmanifest) sets `display: "standalone"`, `orientation: "landscape"`, and repository-owned icon assets.
- [`vite.config.ts`](C:/ATLAS/repos/fawxzzy-mazer/vite.config.ts) uses `vite-plugin-pwa` with `registerType: "autoUpdate"` and `devOptions.enabled = false`.
- [`src/boot/main.ts`](C:/ATLAS/repos/fawxzzy-mazer/src/boot/main.ts) explicitly unregisters localhost service workers to avoid stale development state.

### Current Windows lane

- [`scripts/windows/Launch-Mazer.ps1`](C:/ATLAS/repos/fawxzzy-mazer/scripts/windows/Launch-Mazer.ps1) builds the preview URL, prefers Microsoft Edge, and launches `--app=<url>` when available.
- [`scripts/windows/Prepare-MazerShortcut.ps1`](C:/ATLAS/repos/fawxzzy-mazer/scripts/windows/Prepare-MazerShortcut.ps1) creates a desktop shortcut that points to the repo-owned launcher and uses the repo icon.
- [`README.md`](C:/ATLAS/repos/fawxzzy-mazer/README.md) already tells users to create a shortcut, launch once, then pin the Edge app window or shortcut to the taskbar.

## Why the current install button can "skip"

This is expected behavior, not necessarily a bug.

- `beforeinstallprompt` is non-standard and limited in browser support. MDN explicitly marks it as limited availability and Chromium-oriented.
- The saved deferred event is one-shot. web.dev and MDN both note that `prompt()` can only be called once for a captured event.
- The event does not fire if the app is already installed or already running in standalone mode.
- The event does not fire if the browser decides the app is not installable in the current context.
- The event does not fire on iOS Safari via the same programmable path; iPhone/iPad install is still a manual Share -> Add to Home Screen flow.
- There is no fallback API that forces the browser install prompt if the event never arrived.

That is why Mazer's current behavior is correct:

- show the button only when a real deferred prompt exists,
- hide it after use,
- show manual instructions only on platforms where that is the truthful fallback,
- keep the ambient presentation usable regardless.

### Reusable note

Rule: install UX is platform-specific; never promise one-click install where the OS/browser requires manual steps.

Pattern: keep the current web/PWA lane as the baseline, then add one native/package lane only when it materially improves distribution.

Failure Mode: treating `beforeinstallprompt` as a universal install API leads to skipped buttons, confusing states, and broken expectations.

## Lane-by-lane assessment

### 1. Browser/PWA install flow

This is the lane Mazer already ships.

- Effort: already done for the current scope.
- Web-code reuse: essentially 100%.
- Strength: zero packaging tax, zero store review, lowest maintenance.
- Weakness: inconsistent install UX across browsers and platforms.
- Best fit: browser-first ambient distribution, quick links, low-friction desktop/mobile access.

Verdict: keep it. This is the baseline that every other lane should build on, not replace.

### 2. Edge "install site as app" and pin/taskbar lane

This is the easiest Windows-specific upgrade over plain browser usage, and Mazer already supports it operationally through the launcher scripts.

- Effort: already low; current scripts do most of the work.
- Web-code reuse: 100%.
- Strength: good Windows UX today with taskbar pinning, desktop shortcut creation, and optional auto-start via `edge://apps`.
- Weakness: still browser-owned; not a fully controlled installer story.
- Best fit: local Windows use, ambient display machines, OBS capture rigs, kiosk-ish personal setups.

Verdict: this is the best practical Windows lane right now for Mazer with almost no extra engineering.

### 3. PWABuilder Windows package / Microsoft Store lane

This packages the existing PWA for Windows distribution without rewriting Mazer as a native desktop app.

- Effort: moderate.
- Web-code reuse: nearly full reuse.
- Strength: gets you a Windows package and optional Microsoft Store presence while keeping the web app as the product.
- Weakness: Windows-only packaging lane, older documentation footprint, still PWA-hosted rather than a fully owned native runtime.
- Update story: Microsoft documents that normal web code updates generally ship from the web without resubmitting the Store package, but manifest-integrated changes require rebuilding and resubmitting the package.

Verdict: good if the specific goal is "ship Mazer as a Windows app/package" without adopting Tauri or Electron. Not the best next move unless Microsoft Store discovery matters.

### 4. Tauri desktop installer lane

This is the best true desktop-app lane for Mazer if the goal is a lightweight installer you control.

- Effort: moderate-to-high, but still materially lighter than Electron.
- Web-code reuse: high for the UI/runtime shell, but packaging, app lifecycle, assets, updater, and signing work still need to be added.
- Strength: real installers, real desktop app identity, broad desktop target coverage, lighter footprint than Electron.
- Weakness: introduces Rust/toolchain complexity and desktop release engineering overhead.
- Best fit: when Mazer needs a true desktop product, not just a pinned PWA window.

Verdict: best Wave 2 choice for desktop if the goal is "Mazer installer" rather than "Mazer in Edge."

### 5. Electron desktop installer lane

Electron is proven and flexible, but it is not the best value move for this specific product right now.

- Effort: moderate-to-high.
- Web-code reuse: high, same as Tauri in broad terms.
- Strength: huge ecosystem, mature updater story, familiar packaging flow, easy integration with Node/Electron plugins.
- Weakness: heavier runtime, bigger install size, more resource overhead for an ambient maze app that does not obviously need deep Electron APIs.
- Best fit: if Mazer later needs desktop-native integrations that are easier in Electron than Tauri.

Verdict: viable, but not first choice. For Mazer's current shape, Electron solves fewer problems per MB than Tauri.

### 6. Capacitor mobile-app lane

This is the serious mobile-store lane if Mazer decides it wants real App Store / Play Store distribution from the existing web codebase.

- Effort: moderate-to-high.
- Web-code reuse: high, but not frictionless. Mobile app UX, orientation, lifecycle, safe areas, touch expectations, and store compliance still have to be handled.
- Strength: strongest path to shipping one web-first codebase as real Android and iOS apps.
- Weakness: adds native project ownership, device QA, mobile release management, and store metadata/review overhead.
- Best fit: when Mazer actually wants App Store and Play Store presence, push notifications, native APIs, or mobile identity beyond "install to home screen."

Verdict: best Wave 3 lane if mobile stores become real scope. Not justified yet for docs-only Mazer.

### 7. Android TWA / Bubblewrap / PWABuilder lane

This is the fastest "Android store from the web app" lane, but it is narrower than Capacitor.

- Effort: lower than Capacitor for Android-only store shipping.
- Web-code reuse: extremely high.
- Strength: very direct route from PWA to Google Play using a thin Android wrapper around the existing site.
- Weakness: Android-only, verification-sensitive, less flexible than a full native wrapper if Mazer later needs native plugins or richer app-specific behavior.
- Best fit: Android store shipping fast, with the web app remaining the real product.

Verdict: only choose this if Android distribution matters soon and iPhone does not. It is a good specialty lane, not the universal mobile answer.

### 8. Roku-native lane

This is not an install wrapper around the current Mazer web app. It is a separate app product built for the Roku platform.

- Effort: high.
- Web-code reuse: low for packaging/runtime; some product design, visual framing, and content logic ideas can carry over, but the implementation stack changes.
- Strength: true Roku installability and TV-native UX.
- Weakness: BrightScript + SceneGraph app development is a separate engineering lane with separate QA, publishing, and remote-control UX concerns.
- Best fit: only if Mazer on Roku becomes an explicit product objective.

Verdict: defer. Mazer's current `profile=tv` web surface is useful, but it is not a Roku app lane.

## Recommended phased path

### Wave 1: keep what is already working

- Keep the current browser/PWA install surface.
- Keep the current Edge app-window + taskbar pin + desktop shortcut lane on Windows.
- Keep the current fail-open install runtime and do not over-promise one-click install.
- Keep the current localhost service-worker discipline.

This gives Mazer the lowest-risk install story for the current ambient product.

### Wave 2: if you need one real installer, choose Tauri

Choose Tauri if any of these become true:

- Mazer needs a direct-download desktop installer that feels like an owned app, not a browser trick.
- Mazer needs a branded install/update story outside Edge.
- Mazer needs desktop distribution across Windows and macOS, with Linux as a bonus.

Why Tauri over Electron for Mazer:

- Mazer is visually driven but technically simple.
- It does not currently need a heavy desktop-integration surface.
- The lighter runtime matches the product better.

### Wave 3: optional future lanes

- Add Capacitor if App Store / Play Store mobile distribution becomes a real product goal.
- Add Android TWA instead of Capacitor only if Android-only shipping speed matters more than cross-platform symmetry.
- Add PWABuilder Windows package or Microsoft Store packaging if Windows storefront distribution matters more than a direct-download desktop installer.
- Add Roku-native only if TV install becomes an explicit product with dedicated time and budget.

## What I would build next and why

I would **not** build a new packaging lane yet.

I would keep the current install surface, keep the current Windows launcher/taskbar lane, and only invest in another lane when there is a concrete distribution goal that the current setup cannot satisfy.

If forced to choose the next lane today, I would build **Tauri** first.

Why:

- It gives Mazer a true desktop installer you control.
- It preserves most of the existing web code.
- It improves the "this is an app" feeling more than PWABuilder Windows packaging alone.
- It avoids Electron's heavier runtime cost for a product that does not currently need Electron's breadth.

If the next business goal were "ship on phones," I would choose **Capacitor** instead. If the next goal were "get into Google Play quickly with minimal native work," I would choose **TWA/Bubblewrap** instead.

## Open blockers and unknowns

- No store accounts, signing identities, notarization flow, or publishing credentials are documented in the repo yet.
- There is no current native shell or packaging scaffold for Tauri, Electron, Capacitor, or Bubblewrap.
- The repo is landscape-first and ambient-first; mobile-store work would require a stronger device QA and interaction decision than the current docs imply.
- Roku would require a separate product lane and technology stack.
- [`docs/mobile-plan.md`](C:/ATLAS/repos/fawxzzy-mazer/docs/mobile-plan.md) still references older asset paths such as `/public/favicon.svg` and `/public/apple-touch-icon.png`, while the current repo uses [`index.html`](C:/ATLAS/repos/fawxzzy-mazer/index.html) plus [`public/icons/icon-192.png`](C:/ATLAS/repos/fawxzzy-mazer/public/icons/icon-192.png). I did not change that file in this pass, but the mismatch should be cleaned up before a future packaging implementation wave.

## Sources

- [MDN: `beforeinstallprompt` event](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event)
- [MDN: Trigger installation from your PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt)
- [MDN: Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
- [web.dev: How to provide your own in-app install experience](https://web.dev/customize-install/)
- [web.dev: Installation prompt](https://web.dev/learn/pwa/installation-prompt/)
- [web.dev: Install criteria](https://web.dev/articles/install-criteria)
- [Microsoft Support: Install, manage, or uninstall apps in Microsoft Edge](https://support.microsoft.com/en-au/topic/install-manage-or-uninstall-apps-in-microsoft-edge-0c156575-a94a-45e4-a54f-3a84846f6113)
- [Microsoft Learn: Publish a PWA to the Microsoft Store](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/microsoft-store)
- [PWABuilder docs: What is a classic package](https://blog.pwabuilder.com/docs/what-is-a-classic-package/)
- [PWABuilder docs: Next steps for getting your PWA into the Microsoft Store](https://blog.pwabuilder.com/docs/next-steps-for-getting-your-pwa-into-the-microsoft-store/)
- [PWABuilder docs: Android platform](https://blog.pwabuilder.com/docs/android-platform/)
- [Tauri v2: Distribute](https://v2.tauri.app/distribute/)
- [Tauri v2: Windows installer](https://v2.tauri.app/distribute/windows-installer/)
- [Tauri v2: DMG](https://v2.tauri.app/distribute/dmg/)
- [Tauri v2: AppImage](https://v2.tauri.app/distribute/appimage/)
- [Tauri v2: Updater plugin](https://v2.tauri.app/plugin/updater/)
- [Electron Forge: Importing an existing project](https://www.electronforge.io/import-existing-project)
- [Electron Forge: Makers](https://www.electronforge.io/config/makers)
- [Electron Forge: DMG maker](https://www.electronforge.io/config/makers/dmg)
- [Electron: Updating applications](https://www.electronjs.org/docs/latest/tutorial/updates)
- [Electron: Publishing and updating](https://www.electronjs.org/docs/latest/tutorial/tutorial-publishing-updating)
- [Capacitor docs](https://capacitorjs.com/docs)
- [Capacitor site](https://capacitorjs.com/)
- [Ionic Appflow: Live Updates intro](https://ionic.io/docs/appflow/deploy/intro)
- [Ionic Appflow: Capacitor SDK setup](https://ionic.io/docs/appflow/deploy/setup)
- [Chrome for Developers: Trusted Web Activity quick start](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start)
- [Android Developers: Trusted Web Activities overview](https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities)
- [Chrome for Developers: Android concepts for web developers](https://developer.chrome.com/docs/android/trusted-web-activity/android-for-web-devs)
- [Apple Support: Turn a website into an app in Safari on iPhone](https://support.apple.com/en-gu/guide/iphone/iphea86e5236/26/ios/26)
- [Roku Developer: Build a streaming app on the Roku platform](https://developer.roku.com/develop)
