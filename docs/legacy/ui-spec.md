# UI spec (legacy behavior)

Constraint: exactly one active overlay should be visible at a time (menu/options/pause/win-like terminal states).

## Main menu
Primary controls:
- **Start**
  - sets `_Playing=true`
  - switches to game-only input mode
  - server-travels to `Game/Level/Template`
- **Options**
  - opens `PauseMenuWidget` as menu-time options screen
  - pauses game world while open
- **Exit**
  - issues `quit` console command

## Options (menu-time `PauseMenuWidget`)
Editable fields:
- Maze scale (`25..150`)
- Camera scale (`-50..50`)
- Path RGB channels (`0..1` each)
- Wall RGB channels (`0..1` each)

Buttons:
- **Features** → opens `FeaturesWidget`
- **Game Modes** → opens `GameModesWidget`
- **Back**
  - closes options
  - unpauses
  - if scale/material changed, reloads level via server travel

## Features submenu (`FeaturesWidget`)
Toggles:
- Camera follow (`_ToggleCameraFollow`)
- Trail fade behavior (`_ToggleTrailFade`)

Each toggle also updates accompanying On/Off label text.

## Game modes submenu (`GameModesWidget`)
Toggles:
- Dark mode (`_DarkMode`)
  - light intensity `2.0` when off
  - light intensity `0.3` when on

## In-game pause (`GamePauseMenu`)
Controls:
- **Back**: resume play
- **Reset**: set `_ResetPlayerPosition=true`, then resume
- **Main Menu**: set `_Playing=false` and travel to template (menu flow)
- **Features**: opens `FeaturesWidget`
- Camera scale text field (`-50..50`)

Pause key binding is `P`.

## Win flow
- No dedicated win overlay in extracted C++.
- Win is represented by end-tile overlap → reset/retravel behavior.
- During active play this exits to template scene with `_Playing=false` (effectively returning to menu pipeline).
