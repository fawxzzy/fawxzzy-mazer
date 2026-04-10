# PLAYBOOK

## Rebuild principles
1. **Legacy logic is source truth**: replicate behavior from `legacy/old-project.zip` before extending.
   Rule: keep Wilson as generation truth unless a replacement clearly improves both visual quality and solver stability.
2. **Screenshots are visual truth**: use `legacy/screenshots/*` to validate spacing, alignment, and palette.
3. **Board-first shell**: prioritize board state, pathing, and deterministic updates before UI chrome.
4. **Single-overlay rule**: only one major overlay can be active at a time.
5. **Corridor-heavy runtime rule**: compress straight corridors before solving instead of paying full tile-path search cost.
6. **Fail-open polish rule**: optional presentation polish must never be able to black-screen the board/title path.

## Delivery cadence
- Ship in waves with lane-specific scope.
- Keep domain logic deterministic and test-driven.
- Wire scenes first, then fill feature depth incrementally.
