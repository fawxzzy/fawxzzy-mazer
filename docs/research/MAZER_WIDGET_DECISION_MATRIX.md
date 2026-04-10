# Mazer Widget Decision Matrix

## Summary Recommendation

Choose at most one new lane at a time.

- Keep now: browser/PWA install + Windows Edge app-window launcher.
- Best next desktop installer: Tauri.
- Best next widget-capable mobile shell: Capacitor.
- Best Android-only web packaging shortcut: TWA/Bubblewrap.
- Do not treat Roku as a packaging increment. It is a separate product.

## Comparison Matrix

| Lane | Reuse | Real install | Real widget | Windows | macOS | Linux | Android | iPhone / iPad | Roku / TV | Update story | Signing / store overhead | External tooling dependence | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Browser / PWA install | Very high | Yes, browser-owned | No | Good in Chromium | Fair in Chromium | Fair in Chromium | Good in Chromium | Manual Safari flow only | Weak | Web deploy plus service worker rules | Low | Low | Keep as baseline |
| Edge install-as-app / pin | Very high | Yes, Windows app-window lane | No | Very good | N/A | N/A | N/A | N/A | No | Browser/web updates | Very low | Very low | Keep now |
| Windows packaged PWA | Very high | Yes, packaged Windows app | No | Strong | No | No | No | No | No | Web updates plus package rebuilds for manifest-sensitive changes | Moderate | Moderate | Use only if Windows distribution becomes explicit scope |
| Tauri desktop shell | High | Yes, owned installer | No | Strong | Strong | Strong | Possible, but not the best immediate use | Possible, but not the best immediate use | No | Native updater or store flow | High | High | Best next desktop lane |
| Electron desktop shell | High | Yes, owned installer | No | Strong | Strong | Strong | No practical win here | No practical win here | No | Mature auto-update paths | High | High | Viable, but not first choice |
| Capacitor mobile shell | High | Yes, store app | Yes, via native extensions | No primary value | No primary value | No primary value | Strong | Strong | No | Store release by default, with optional live-update tooling | High | High | Best next widget-capable shell |
| Android app widgets in native shell | Medium to high, if Capacitor or another native shell exists | Yes, through the host app | Yes | No | No | No | Strong | No | No | Host app updates plus shared-state model | High | High | Pursue only after a native shell exists |
| iOS WidgetKit in native shell | Medium to high, if Capacitor or another native shell exists | Yes, through the host app | Yes | No | No | No | No | Strong | No | Host app updates plus WidgetKit timelines | High | High | Pursue only after a native shell exists |
| Android TWA / Bubblewrap | Very high | Yes, Play-distributed wrapper | No | No | No | No | Strong | No | No | Web app updates plus wrapper updates | Moderate | Moderate | Best if Android-only shipping speed matters more than widgets |
| Roku-native | Low to moderate | Yes, but only as a Roku channel | No | No | No | No | No | No | Strong only on Roku | Separate Roku releases | High | High and separate | Defer unless Roku becomes explicit scope |

## What The Matrix Means

The current browser/PWA lane is already enough for the ambient web product. It is also the best proof that the app can ship without a native wrapper. The Windows launcher and shortcut scripts are a practical quality-of-life layer, not a native app runtime.

The next decision depends on the problem you are actually trying to solve:

- If the problem is "I want a controlled desktop installer," pick Tauri.
- If the problem is "I want a real widget on Android and iOS," pick Capacitor and then add native widget extensions.
- If the problem is "I only need Android store packaging fast," pick TWA/Bubblewrap.
- If the problem is "I want a Roku product," start a separate product lane.

## Why The Widget Path Is Not The Same As Install

The browser install prompt can disappear because it is not universal and it is not guaranteed.

- `beforeinstallprompt` is browser-controlled.
- It only appears when the browser decides the app is installable.
- It disappears when the app is already installed or the page is already running standalone.
- It does not create a widget surface.

A widget requires a different architecture:

- Native host app.
- Widget extension.
- Shared state or timeline data that both layers can read.
- A small glanceable UI contract, not the full Phaser scene graph.

## Recommended Phased Execution Plan

1. Keep the current ambient web build as the product truth.
2. Keep the Edge launcher and Windows shortcut lane as the current desktop convenience layer.
3. If desktop installation becomes a real requirement, build Tauri first.
4. If widget surfaces become a real requirement, build Capacitor next, then add Android widgets and iOS WidgetKit.
5. Avoid Electron unless you later need a desktop integration that Tauri cannot cover.
6. Avoid Roku until it is an explicit product with its own publishing and QA budget.

## What I Would Build Next And Why

I would build **Capacitor + widget extensions** next only if the goal is truly mobile and widget-capable distribution.

Why:

- It preserves the web build as the center of gravity.
- It gives you a real native host that can own widget extensions.
- It maps cleanly to Android app widgets and Apple WidgetKit.
- It keeps future replacement easier because the native layers are thin wrappers over the same ambient web substrate.

If the next objective is desktop-only installation, I would choose **Tauri** instead. That is the cleaner answer for "installer we own" without dragging in a mobile release pipeline.

## Open Blockers And Unknowns

- No native shell exists yet, so widgets are still hypothetical.
- No widget content contract is defined yet.
- No signing, notarization, Play Console, or App Store workflow exists in the repo.
- No shared storage model exists for widget snapshots or timeline entries.
- No decision has been made on whether the widget should show a live maze snapshot, the current mood, the last seed, or a simpler status card.

## Source Anchors In This Repo

- [`src/boot/installSurface.ts`](../../src/boot/installSurface.ts)
- [`src/scenes/MenuScene.ts`](../../src/scenes/MenuScene.ts)
- [`public/manifest.webmanifest`](../../public/manifest.webmanifest)
- [`scripts/windows/Launch-Mazer.ps1`](../../scripts/windows/Launch-Mazer.ps1)
- [`scripts/windows/Prepare-MazerShortcut.ps1`](../../scripts/windows/Prepare-MazerShortcut.ps1)
- [`README.md`](../../README.md)
