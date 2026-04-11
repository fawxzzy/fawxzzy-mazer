# Mazer Pixel-Art Visual Language

## Current Mazer Constraints
- Mazer is ambient-only and non-playable right now. The board is the hero, not the chrome.
- The runtime already commits to crisp rendering through Phaser `pixelArt: true`, `antialias: false`, `antialiasGL: false`, `roundPixels: true`, and `scale.autoRound: true`.
- The visual contract now has a screenshot gate for exact target URLs, with diagnostics exposed from `resolveTitleBandFrame`, `resolveInstallChromeFrame`, and `resolveDemoTrailRenderBounds`.
- Themes must stay identity-consistent across `noir`, `ember`, `aurora`, `vellum`, and `monolith`.
- The install CTA is shell chrome, not gameplay UI. It lives in a bottom-center lane and must not compete with the title or the board.

## Neutral Substrate, Semantic Accents
Treat the maze substrate as quiet architecture and treat gameplay-semantic elements as the only saturated signals.

Recommended role split:
- `wall`, `floor`, `panel`, `frame`, and `metadata rail` should be neutral or near-neutral. Their job is to hold shape and value, not steal attention.
- `trail`, `player`, `start`, `goal`, and optional `route` should be semantically distinct accents.
- `player` should be the sharpest cool signal.
- `trail` should be a neighboring but separate color family from `player`, not a dimmed clone of it.
- `start` and `goal` should read as destination markers, not secondary trail colors.

Practical rule for Mazer:
- If two roles are both “important,” separate them first by value, then by hue, then by detail treatment.
- Do not try to solve readability with glow first. Solve it with value bands and edge clarity first.

## Contrast Floors
For Mazer’s shell and board, use WCAG-style floors as a minimum design guardrail, not as the ceiling of quality.

Working floors:
- Text, metadata, title, subtitle, and install-label text: target `4.5:1` against the color they actually sit on.
- Meaningful graphics required for understanding state: target `3:1` against adjacent colors.
- Avoid designing directly on the minimum threshold. W3C explicitly treats these as thresholds, not rounded targets, so small misses still fail in practice.

What this means in Mazer:
- Measure the title against the actual title plate color, not the page background.
- Measure the install CTA against the bottom lane it visually sits on.
- Measure `trail`, `player`, `start`, and `goal` against the floor and against each other where they can touch or overlap.

## Crisp Pixel Art Without Looking Cheap
The premium move is not extra softness. It is controlled sharpness plus selective atmosphere.

Keep:
- Integer-friendly sizing and placement.
- Hard nearest-neighbor rendering.
- Thin, deliberate panel lines.
- Limited, role-specific glow only where it helps read state.

Reduce:
- Foreground blur.
- Large soft halos around title and CTA chrome.
- Overlapping atmospheric overlays in front of the board.

Premium pixel-art presentation pattern:
- Use softness only in the far background layer.
- Keep the board shell and board contents hard-edged.
- Use one accent glow per semantic object, not multiple stacked glows.
- Prefer layered rectangles, small circles, and reticle shapes over fuzzy bloom.

## What To Borrow From Premium Pixel-Art Games
Useful concepts to copy:
- From Sea of Stars: one consistent identity spanning logo assets, key art, screenshots, and lighting variants rather than inventing a new language per scene or theme.
- From high-end retro revival art generally: atmospheric depth behind the play surface, not in front of it.
- From strong JRPG key art systems: title lockups that stay legible at thumbnail size.
- From polished pixel interfaces: a neutral substrate with very intentional accent colors.

Do not copy:
- Character silhouettes, palette signatures, or lighting recipes directly.
- Painterly bloom that smears pixels.
- Decorative gradients inside the active gameplay surface.
- Busy logo treatment that depends on large-scale print resolution.

## Mazer-Specific Guidance
- `noir` and `monolith` should feel restrained, not monochrome. Their semantic accents need to be the only real color events on screen.
- `vellum` should feel archival, not faded-out. Warm paper is fine; washed-out maze legibility is not.
- `aurora` can carry the most atmospheric color, but the board still needs a neutral floor/wall split.
- `ember` can tolerate a slightly richer shell, but the trail and player still need clean separation from warm substrate.

## Top 5 Visual Changes To Make Next
1. Push semantic signals one more step apart in value before adding any more decorative treatment, especially `trail` vs `player` and `start` vs `goal`.
2. Keep reducing foreground softness until the board shell feels hard and the atmosphere clearly sits behind it.
3. Tighten the mobile title plate further if needed so the wordmark survives at a glance, not just at full-screen inspection.
4. Add screenshot-side contrast reporting for the title band and install lane so theme regressions are obvious in artifacts, not only by eye.
5. Consider a tiny theme-specific board-floor tint adjustment per profile if mobile readability still lags desktop for `vellum` or `aurora`.

## References
- [W3C Understanding SC 1.4.3: Contrast (Minimum)](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum)
- [W3C Understanding SC 1.4.11: Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- [Phaser Config docs](https://docs.phaser.io/api-documentation/class/core-config)
- [Phaser Cameras docs on `roundPixels`](https://docs.phaser.io/phaser/concepts/cameras)
- [Sea of Stars official press kit](https://sabotagestudio.com/presskits/sea-of-stars/)
