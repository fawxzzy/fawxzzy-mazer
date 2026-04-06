# Legacy file map

Source inputs:
- `legacy/old-project.zip`
- `legacy/screenshots/menu-01.png` .. `menu-04.png`

## Extracted code/config scope
Only the following paths were inspected from the Unreal archive:

- `Config/DefaultInput.ini`
- `Source/Mazer/**/*.h`
- `Source/Mazer/**/*.cpp`

## Runtime ownership map

### Maze lifecycle + generation
- `Source/Mazer/MazerGameModeBase.cpp/.h`
  - level boot sequence
  - staged generation pipeline (`CreateGrid` → `MapPath` → `CreatePath` → `CreateShortCuts` → `Draw`)
  - start/end tile selection and reset flow

- `Source/Mazer/Private/MazerGameState.cpp`
  - tick-driven scheduler for generation stage progression via `_LevelBuildingLogicDelayDuration`
  - reset trigger when `_ResetGame` is set

### Shared state and tuning values
- `Source/Mazer/Public/MazerGameInstance.h`
  - single source for all maze, player, UI, material, and option flags
  - arrays for tile graph (`_TileListArray`, `_PathArray`, `_WallArray`)
  - generation tunables (`_CheckPointModifier`, `_ShortcutCountModifier`)

### Player movement + HUD + demo AI
- `Source/Mazer/Private/Player/MazerPlayer.cpp/.h`
  - grid-step movement and collision-gated direction checks
  - overlap-driven win detection
  - player HUD timer + end-arrow rotation
  - non-playing menu demo AI pathing + backtracking

### Tile actor behavior
- `Source/Mazer/Private/Level/GridSquare.cpp` + `Public/Level/GridSquare.h`
  - per-tile flags (`floor`, `Path`, `Visited`, `End`)
  - delayed color-revert trail behavior

### UI overlays
- `Source/Mazer/Private/UI/MainMenuWidget.cpp/.h`
  - main menu buttons (Start/Options/Exit)
- `Source/Mazer/Private/UI/PauseMenuWidget.cpp/.h`
  - options panel for scale, camera zoom, path/wall color channels, feature/game-mode submenus
- `Source/Mazer/Private/UI/GamePauseMenu.cpp/.h`
  - in-run pause menu (Back/MainMenu/Reset/Features/CamScale)
- `Source/Mazer/Private/UI/FeaturesWidget.cpp/.h`
  - camera-follow and trail-fade toggles
- `Source/Mazer/Private/UI/GameModesWidget.cpp/.h`
  - dark mode toggle
- `Source/Mazer/Private/UI/GameHud.cpp/.h`
  - in-game HUD bindings (timer + arrow)
