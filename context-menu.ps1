# ============================================================
# M2_SCOUT - Windows Explorer right-click menu installer
#
# Adds an HKCU (current-user, no admin) context-menu entry so
# that right-clicking a folder - or the empty space inside a
# folder - launches M2_SCOUT with that folder pre-loaded in the
# first tab, ready to search.
#
#   Install :  powershell -ExecutionPolicy Bypass -File context-menu.ps1
#   Remove  :  powershell -ExecutionPolicy Bypass -File context-menu.ps1 -Uninstall
#
# Normally you just double-click INSTALL_CONTEXT_MENU.cmd /
# UNINSTALL_CONTEXT_MENU.cmd which call this script for you.
# ============================================================
[CmdletBinding()]
param([switch]$Uninstall)

$ErrorActionPreference = 'Stop'

$appDir   = $PSScriptRoot
$launcher = Join-Path $appDir 'run-hidden.vbs'
$icon     = Join-Path $appDir 'LOGO\M2_SCOUT.ico'
$keyName  = 'M2_SCOUT'

# Menu label "使用 M2_SCOUT 搜尋" built from code points so this
# file stays pure ASCII and the text is never mangled by the
# console code page / file encoding when it is written.
$label = (-join ([char]0x4F7F, [char]0x7528)) + ' M2_SCOUT ' + (-join ([char]0x641C, [char]0x5C0B))

# Two entry points:
#   Directory\shell            -> right-click ON a folder      (%1 = folder)
#   Directory\Background\shell -> right-click INSIDE a folder  (%V = folder)
$targets = @(
  @{ Root = "HKCU:\Software\Classes\Directory\shell\$keyName";           Param = '%1' },
  @{ Root = "HKCU:\Software\Classes\Directory\Background\shell\$keyName"; Param = '%V' }
)

if ($Uninstall) {
  foreach ($t in $targets) {
    if (Test-Path $t.Root) { Remove-Item -Path $t.Root -Recurse -Force }
  }
  Write-Host 'Removed the M2_SCOUT folder right-click menu.'
  return
}

if (-not (Test-Path $launcher)) {
  throw "Launcher not found: $launcher"
}

foreach ($t in $targets) {
  $root = $t.Root
  New-Item -Path $root -Force | Out-Null
  Set-ItemProperty -Path $root -Name '(default)' -Value $label
  if (Test-Path $icon) { Set-ItemProperty -Path $root -Name 'Icon' -Value $icon }

  New-Item -Path "$root\command" -Force | Out-Null
  $cmd = 'wscript.exe //nologo "{0}" "{1}"' -f $launcher, $t.Param
  Set-ItemProperty -Path "$root\command" -Name '(default)' -Value $cmd
}

Write-Host 'Installed the M2_SCOUT folder right-click menu.'
Write-Host 'Right-click any folder to use it. On Windows 11, click "Show more options" first.'
