[CmdletBinding()]
param(
  [ValidateSet('default', 'tv', 'obs', 'mobile')]
  [string]$Profile = 'default',

  [ValidateSet('full', 'minimal', 'none')]
  [string]$Chrome,

  [ValidateSet('show', 'hide')]
  [string]$Title,

  [string]$BaseUrl = 'http://127.0.0.1:4173/',

  [switch]$BrowserWindow
)

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$uriBuilder = [System.UriBuilder]$BaseUrl
$query = [System.Web.HttpUtility]::ParseQueryString($uriBuilder.Query)

if ($Profile -ne 'default') {
  $query['profile'] = $Profile
}
if ($Chrome) {
  $query['chrome'] = $Chrome
}
if ($Title) {
  $query['title'] = $Title
}

$uriBuilder.Query = $query.ToString()
$launchUrl = $uriBuilder.Uri.AbsoluteUri

$edgeCandidates = @(
  (Get-Command msedge.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source),
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

if (-not $BrowserWindow -and $edgeCandidates) {
  Start-Process -FilePath $edgeCandidates[0] -ArgumentList @("--app=$launchUrl") -WorkingDirectory $repoRoot
  return
}

Start-Process -FilePath $launchUrl -WorkingDirectory $repoRoot
