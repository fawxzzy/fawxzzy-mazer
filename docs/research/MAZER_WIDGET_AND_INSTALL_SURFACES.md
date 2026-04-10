# Mazer Widget And Install Surfaces

## Executive Summary

Mazer currently has one real install story: a browser/PWA lane with a Windows shortcut/app-window helper around it. That is working as intended. The existing install UI in [`src/boot/installSurface.ts`](../../src/boot/installSurface.ts) fails open, only shows `Install Mazer` when Chromium exposes `beforeinstallprompt`, and falls back to iOS-style manual instructions when needed. The title plate in [`src/scenes/MenuScene.ts`](../../src/scenes/MenuScene.ts) reflects that state instead of pretending every platform has a programmable install prompt.

What Mazer does not have yet is a widget story. A pure web install does not produce a widget surface. If we want real home-screen widgets, we need a native shell plus a widget extension. For Mazer that means a web-first app substrate with a thin native wrapper, then Android app widgets and Apple WidgetKit as separate extension targets.

My recommendation is opinionated:

1. Keep the current browser/PWA install lane and the Windows launcher/shortcut lane.
2. If you need a controlled desktop installer next, choose Tauri.
3. If you need real widgets, choose Capacitor as the mobile shell, then add Android widgets and iOS WidgetKit extensions.
4. Do not treat `beforeinstallprompt`, PWA install, and widget surfaces as interchangeable.

## Current Repo Truth

- [`src/boot/installSurface.ts`](../../src/boot/installSurface.ts) models install state as `hidden`, `available`, or `manual`.
- [`src/boot/installSurface.ts`](../../src/boot/installSurface.ts) treats install as ephemeral runtime state; it does not persist install preferences.
- [`src/scenes/MenuScene.ts`](../../src/scenes/MenuScene.ts) only exposes one title-plate install action and hides it once the app is standalone or already installed.
- [`public/manifest.webmanifest`](../../public/manifest.webmanifest) is a standard standalone PWA manifest with landscape orientation and local icon assets.
- [`scripts/windows/Launch-Mazer.ps1`](../../scripts/windows/Launch-Mazer.ps1) launches the current preview URL in Edge `--app=` mode when available.
- [`scripts/windows/Prepare-MazerShortcut.ps1`](../../scripts/windows/Prepare-MazerShortcut.ps1) builds a desktop shortcut to that launcher with the repo icon.
- [`README.md`](../../README.md) documents the browser install path and the Windows shortcut/pin flow.

This is a browser-first product with a practical Windows app-window wrapper. It is not already a native app shell, and it is not already a widget platform.

## Why `beforeinstallprompt` Can Skip

The current install button is truthful, not broken. It only appears when the browser emits `beforeinstallprompt`, which is platform- and policy-dependent.

- The event is Chromium-oriented and not a universal install API.
- If the browser decides the app is not installable in the current context, no event is emitted.
- If the app is already installed or already running in standalone mode, the event does not appear.
- iOS Safari does not expose the same programmable install prompt path; the manual Share -> Add to Home Screen flow is still the real fallback.

The practical consequence is simple: a missing prompt is not a failure of Mazer, it is a browser/platform boundary.

## Why An Installed Web App Is Not A Widget

An installed web app and a widget solve different problems.

- An installed web app is a full app surface in a browser-owned window.
- A widget is a glanceable, OS-managed surface with a much smaller rendering contract.
- Widgets do not host Phaser or a normal interactive canvas the way the app does.
- Android widgets are app widgets owned by a native app component.
- Apple widgets are WidgetKit extensions with their own timeline and rendering model.

So the widget path is not "install the PWA harder." It is "keep the web app as the source of truth, then add a native host and a widget extension that can read shared state."

## Current Bottlenecks

1. The current install surface is intentionally narrow.
   The repo is doing the right thing by not pretending browser install and widget support are the same class of capability.

2. The Windows convenience lane is not the same thing as a native desktop runtime.
   The launcher scripts improve install feel on Windows, but they do not create a cross-platform native app shell.

3. Widget support requires a new architectural layer.
   A widget-capable future means native shell plus shared-state contract, not another web install button.

4. External runtime layers will add real release overhead.
   Code signing, store metadata, and native release pipelines do not exist in the repo today, so any native lane is a real product expansion.

## Recommended Architecture

The long-term shape I would keep is:

1. The ambient web build stays the substrate.
2. The native shell stays thin.
3. Widget extensions render glanceable summaries, not the full Phaser experience.
4. Shared state between the shell and widget stays explicit, small, and replaceable.

For Mazer that likely means:

- Android: native shell plus an app-widget provider that reads shared state and renders a small maze snapshot or status card.
- iOS: native shell plus a WidgetKit extension that uses timeline entries from shared storage.
- Web: keep the current PWA and browser install story as the baseline product.

That architecture keeps the current app central and makes future replacement easier, because the native layers only adapt the substrate instead of becoming the substrate.

## Phased Plan

### Phase 1: Keep the current baseline

- Keep the PWA install lane.
- Keep the Windows launcher and shortcut scripts.
- Keep the fail-open install UI.
- Do not add widget-specific behavior to the web app itself.

### Phase 2: Choose one native shell if the product needs it

- Choose Tauri if the immediate need is a controlled desktop installer.
- Choose Capacitor if the immediate need is mobile distribution plus widget extensions.

### Phase 3: Add real widget targets

- Android widget: render a tiny glanceable surface from shared app state.
- iOS WidgetKit: render the same idea with WidgetKit timelines and app-group storage.
- Keep the widget contract narrow. A widget should summarize, not replicate the full app.

## Failure Modes To Avoid

- Rule: every external installer/runtime layer is temporary scaffolding unless and until our own stack replaces it.
- Pattern: keep the ambient web build as the substrate, then wrap it with the thinnest native shell needed for the target surface.
- Failure Mode: assuming PWA install, native install, and widget surfaces are equivalent leads to skipped install prompts, broken expectations, and the wrong architecture choice.
- Failure Mode: trying to make the widget host the full app turns a glanceable surface into an unreliable mini-browser.

## Open Blockers

- No store accounts, signing identities, notarization, or release automation exist in the repo yet.
- No native shell exists yet, so any widget path is still a new product lane, not a patch.
- The widget content model is not defined yet. We need to decide whether the widget shows a snapshot, the current ambient mode, the last generated seed, or some other glanceable state.
- Roku should remain a separate product path. The current web app does not become a Roku app by packaging it differently.

## Sources

- [MDN: `beforeinstallprompt` event](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event)
- [web.dev: Installation prompt](https://web.dev/learn/pwa/installation-prompt/)
- [web.dev: Install criteria](https://web.dev/articles/install-criteria)
- [web.dev: Customize install experience](https://web.dev/customize-install/)
- [Apple Support: Turn a website into an app in Safari on iPhone](https://support.apple.com/en-us/102540)
- [Android Developers: App widgets overview](https://developer.android.com/develop/ui/views/appwidgets)
- [Android Developers: Trusted Web Activities overview](https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities)
- [Chrome for Developers: Trusted Web Activity quick start](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start)
- [Microsoft Learn: PWA in Microsoft Edge](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/)
- [Microsoft Support: Install, manage, or uninstall apps in Microsoft Edge](https://support.microsoft.com/en-us/microsoft-edge/install-manage-or-uninstall-apps-in-microsoft-edge-0c156575-a94a-45e4-a54f-3a84846f6113)
- [PWABuilder: Android platform](https://blog.pwabuilder.com/docs/android-platform/)
- [Tauri: Distribute](https://v2.tauri.app/distribute/)
- [Capacitor docs](https://capacitorjs.com/docs)
- [Roku Developer: Build a streaming app on the Roku platform](https://developer.roku.com/develop)
