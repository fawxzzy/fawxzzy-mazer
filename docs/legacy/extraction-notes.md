# Extraction notes

## Objective boundary
- Used legacy Unreal project and screenshots as behavior/visual truth.
- Did **not** attempt to port or decode `.uasset` binaries.

## Archive handling
- Canonical archive path for this repo lane: `legacy/old-project.zip`.
- Extraction was performed into a temporary non-repo workspace only.
- Only these paths were extracted for analysis:
  - `Source/Mazer/**/*.cpp`
  - `Source/Mazer/**/*.h`
  - `Config/DefaultInput.ini`

## Commands used (high level)
- list archive entries and filter required paths
- unzip selected files into temp directory
- inspect source/config to write implementation specs

## Screenshot normalization
- Renamed menu reference screenshots to stable filenames:
  - `legacy/screenshots/menu-01.png`
  - `legacy/screenshots/menu-02.png`
  - `legacy/screenshots/menu-03.png`
  - `legacy/screenshots/menu-04.png`

## Verification results
- Documentation now captures gameplay, UI, and visual direction from legacy assets.
- No full Unreal project dump was extracted into tracked repo paths.
- Screenshot references are now stable and organized.
