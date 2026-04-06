# Legacy tuning defaults (Unreal -> rebuild)

This pass locks feel-defining defaults into one module (`src/config/tuning.ts`) and records which values are direct legacy truth vs screenshot-derived approximations.

## Source references used
- Legacy code: `legacy/old-project.zip` (`Source/Mazer/**/*.cpp|*.h`).
- Legacy visual references: `legacy/screenshots/menu-01.png` to `menu-04.png`.
- Rebuild tuning source: `src/config/tuning.ts`.

## Direct-from-legacy values

### Board + generation
- Grid scale default: `_Scale = 50` when unset.
- Checkpoint modifier: `_CheckPointModifier = 0.35`.
- Shortcut modifiers carried by rebuild lanes:
  - menu/demo: `0.13`
  - in-run: `0.18`

### Camera scale behavior
- Camera scale edit range: `-50..50`.
- Camera buffer formula: `(scale + (camScale * 2)) * preScalar`.
- Rebuild mapping keeps this via `resolveBoardScaleFromCamScale(...)`.

### Label ordering from legacy UI bindings
- Main menu labels/order: `Start`, `Options`, `Exit`.
- Menu options submenu order: `Features`, `Game Modes`, `Back`.
- In-run pause order: `Back`, `Reset`, `Main Menu`, `Features`.

### Legacy color truth
- Path linear RGB: `(0.19099, 0.192708, 0.18769)`.
- Wall linear RGB: `(0.067708, 0.067708, 0.067708)`.

## Screenshot-derived approximations
These were tuned by matching the menu screenshots:
- Menu board dominance (`boardScaleWide: 0.79`, `boardScaleNarrow: 0.74`) to keep the square board visually large and centered.
- Title feel (`"Mazer"`, scale `0.19`, alpha/pulse range `0.42..0.56`, raised near board top).
- Legacy menu lane spacing (wide left/right action separation via `spacingRatio: 0.33`, clamped up to `454px`).
- Starfield density and motion (`320` stars, subtle drift, restrained cloud alpha).
- Board frame thickness/insets and top highlight treatment.
- Goal pulse profile and trail fade/line alpha curve.
- HUD vertical offsets and spacing rhythm.

## Intentional deviations
- Demo cadence remains `70ms` step + `120ms` goal pulse from current lane as practical parity with legacy timer-driven AI (exact BP timer value not recoverable from C++ source).
- Player movement input cadence tuned tighter than previous rebuild defaults (`cooldownMs: 76`, switch bypass `18`) for a more responsive board-first feel.
- Trail color remains a readable cyan accent while preserving legacy path/wall base colors.

## Rule enforced
- Feel-defining values live in one module: `src/config/tuning.ts`.
- Scenes/renderers consume tuning imports instead of local magic numbers.
