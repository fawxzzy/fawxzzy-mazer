[CmdletBinding()]
param(
  [ValidateSet('default', 'tv', 'obs', 'mobile')]
  [string]$Profile = 'default',

  [ValidateSet('full', 'minimal', 'none')]
  [string]$Chrome,

  [ValidateSet('show', 'hide')]
  [string]$Title,

  [string]$ShortcutName = 'Mazer',

  [string]$Destination = ([Environment]::GetFolderPath('Desktop'))
)

$launcherPath = Resolve-Path (Join-Path $PSScriptRoot 'Launch-Mazer.cmd')
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$iconPath = Join-Path $repoRoot 'public\icons\mazer-emblem.ico'
$arguments = @()

if ($Profile -ne 'default') {
  $arguments += "-Profile $Profile"
}
if ($Chrome) {
  $arguments += "-Chrome $Chrome"
}
if ($Title) {
  $arguments += "-Title $Title"
}

$shortcutPath = Join-Path $Destination ("$ShortcutName.lnk")
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $launcherPath.Path
$shortcut.Arguments = ($arguments -join ' ')
$shortcut.WorkingDirectory = $repoRoot.Path

if (Test-Path $iconPath) {
  $shortcut.IconLocation = $iconPath
}

$shortcut.Save()
Write-Output "Created $shortcutPath"
