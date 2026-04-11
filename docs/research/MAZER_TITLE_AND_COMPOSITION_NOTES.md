# Mazer Title And Composition Notes

## Composition Contract
- Board first.
- Title band above.
- Install CTA bottom-center.
- Bottom metadata must stay readable but secondary.
- OBS profile must remain centered and fully in frame.
- Title and install chrome belong to the shell, not the maze board.

## Title Band Patterns That Fit Mazer
### Narrow plate, centered wordmark
Best for `title` and `ambient` presentation.

Why it fits:
- Reads well at distance.
- Leaves the board as the main mass.
- Works across desktop and mobile without inventing a second identity.

Rules:
- One wordmark line.
- One restrained subtitle line.
- No third line unless there is a real information need.
- Plate should be lighter or darker than the backdrop by value, not by decorative effects.

### Left-anchored technical band
Useful only for a stronger “loading / systems” mode.

Why it fits:
- Feels like utility chrome rather than box art.
- Lets loading states feel more operational than ceremonial.

Why it should stay secondary:
- It competes harder with the board.
- It is less calm for ambient loops.

## Title Styling Rules
- Prioritize letterform clarity over ornament.
- If the title needs shadow, use a short directional shadow, not a dropped blur cloud.
- Thin plate lines are enough. Multiple internal bands quickly turn muddy at stream or mobile scale.
- Subtitle text should read as support text, not as a second logo.

Recommended lockup:
- `Mazer`
- small, understated mode line such as `pattern engine` or `ambient engine`

Avoid:
- bylines inside the plate unless they carry real product value
- double shadows
- large diffuse glows
- plate shapes that are visually heavier than the maze frame

## Projected Shadow / Sun-Cycle Ideas
Only use directional lighting when it clarifies depth rather than romanticizing the screen.

Good uses:
- a short title shadow offset by 1-2px
- a board shell shadow that grounds the frame
- subtle day-cycle shifts in the far background clouds

Bad uses:
- blurry title projection crossing into the board area
- moving foreground haze over the board
- soft bloom on the install lane

If Mazer ever uses a “sun cycle”:
- keep the board neutral
- move color temperature mostly in the backdrop
- let title and install chrome change only slightly with the theme

## Install CTA Placement
The install CTA should feel like ambient app chrome, not like the title’s footer.

Rules:
- bottom-center, always
- one compact chip or button, never a panel
- keep clear vertical separation from metadata
- the CTA can be framed, but the frame should not read as a second HUD
- on mobile, increase legibility before increasing ornament

The W3C non-text contrast guidance is useful here:
- the text must still meet text contrast expectations
- a border is optional unless it is the only thing making the control discoverable
- if a border is used, treat it as support, not the primary signal

## Profile Notes
### Desktop title
- strongest title treatment
- quiet but clear plate
- board still dominates overall area

### Mobile title
- fewer lines
- slightly stronger alpha and plate contrast
- more emphasis on wordmark clarity than decorative frame detail

### OBS / TV
- title should usually be hidden or heavily reduced
- the board and its safe framing do all the work
- install CTA can stay visible if it remains fully subordinate

## Practical Review Checklist
- Does the wordmark survive at thumbnail size?
- Does the subtitle remain readable without looking like a second title?
- Does the board still own the visual center of mass?
- Does the CTA stay visibly separate from both title and metadata?
- If blur is removed, does the screen get clearer rather than emptier? That is usually a good sign.

## References
- [Sea of Stars official press kit](https://sabotagestudio.com/presskits/sea-of-stars/)
- [W3C Understanding SC 1.4.3: Contrast (Minimum)](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum)
- [W3C Understanding SC 1.4.11: Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- [Phaser Config docs](https://docs.phaser.io/api-documentation/class/core-config)
