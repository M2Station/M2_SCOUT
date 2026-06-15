#
# M2_SCOUT
# Copyright (c) 2026 OA Hsiao
# SPDX-License-Identifier: MIT
#
# This source code is licensed under the MIT License found in the
# LICENSE file in the root directory of this source tree.
#

# ============================================================
# M2_SCOUT - Windows Explorer right-click menu installer
#
# Adds an HKCU (current-user, no admin) context-menu entry so
# that right-clicking a folder - or the empty space inside a
# folder - launches M2_SCOUT with that folder pre-loaded in the
# first tab, ready to search.
#
#   Install (dev) :  powershell -ExecutionPolicy Bypass -File context-menu.ps1
#   Install (app) :  ... -File context-menu.ps1 -Launcher "C:\path\M2_SCOUT.exe"
#   Remove        :  ... -File context-menu.ps1 -Uninstall
#
# The NSIS installer calls this on install with -Launcher pointing
# at the freshly installed exe. Normally you just double-click
# INSTALL_CONTEXT_MENU.cmd / UNINSTALL_CONTEXT_MENU.cmd.
#
# This file is PURE ASCII on purpose: the Chinese menu label is
# built from Unicode code points so no encoding (console code page
# / editor) can ever mangle it.
# ============================================================
[CmdletBinding()]
param(
  [switch]$Uninstall,
  # Program to launch. Defaults are auto-detected (see below):
  #   - run-hidden.vbs next to this script (dev checkout), or
  #   - M2_SCOUT.exe   next to this script (installed app).
  [string]$Launcher,
  # Menu icon (.ico / .exe). Defaults to LOGO\M2_SCOUT.ico beside this script.
  [string]$Icon
)

$ErrorActionPreference = 'Stop'

$appDir  = $PSScriptRoot
$keyName = 'M2_SCOUT'

# Auto-detect the launcher when not supplied.
if (-not $Launcher) {
  $vbs = Join-Path $appDir 'run-hidden.vbs'
  $exe = Join-Path $appDir 'M2_SCOUT.exe'
  if     (Test-Path $vbs) { $Launcher = $vbs }   # dev checkout
  elseif (Test-Path $exe) { $Launcher = $exe }   # installed app
  else                    { $Launcher = $vbs }   # report the missing vbs below
}
if (-not $Icon) {
  $Icon = Join-Path $appDir 'LOGO\M2_SCOUT.ico'
}

# Menu label (Chinese "search this folder with M2_SCOUT") built from Unicode code
# points so this file stays pure ASCII and the text is never mangled by the
# console code page / file encoding when it is written.
$label = (-join ([char]0x4F7F, [char]0x7528)) + ' M2_SCOUT ' + (-join ([char]0x641C, [char]0x5C0B))

# Two entry points:
#   Directory\shell            -> right-click ON a folder      (%1 = folder)
#   Directory\Background\shell -> right-click INSIDE a folder  (%V = folder)
$targets = @(
  @{ Root = "HKCU:\Software\Classes\Directory\shell\$keyName";           Param = '%1' },
  @{ Root = "HKCU:\Software\Classes\Directory\Background\shell\$keyName"; Param = '%V' }
)

# Always remove any existing entry FIRST (dev or a previous install) so the menu
# can never keep pointing at a stale path.
foreach ($t in $targets) {
  if (Test-Path $t.Root) { Remove-Item -Path $t.Root -Recurse -Force }
}

if ($Uninstall) {
  Write-Host 'Removed the M2_SCOUT folder right-click menu.'
  return
}

if (-not (Test-Path $Launcher)) {
  throw "Launcher not found: $Launcher"
}

# A .vbs launcher is run through wscript (no console window); an .exe is launched
# directly (a packaged Electron app is already a windowed process).
$isVbs = $Launcher.ToLower().EndsWith('.vbs')

foreach ($t in $targets) {
  $root = $t.Root
  New-Item -Path $root -Force | Out-Null
  Set-ItemProperty -Path $root -Name '(default)' -Value $label
  if (Test-Path $Icon) { Set-ItemProperty -Path $root -Name 'Icon' -Value $Icon }

  New-Item -Path "$root\command" -Force | Out-Null
  if ($isVbs) {
    $cmd = 'wscript.exe //nologo "{0}" "{1}"' -f $Launcher, $t.Param
  } else {
    $cmd = '"{0}" "{1}"' -f $Launcher, $t.Param
  }
  Set-ItemProperty -Path "$root\command" -Name '(default)' -Value $cmd
}

Write-Host "Installed the M2_SCOUT folder right-click menu -> $Launcher"
Write-Host 'Right-click any folder to use it. On Windows 11, click "Show more options" first.'

