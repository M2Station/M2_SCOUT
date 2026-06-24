#
# M2_SCOUT
# Copyright (c) 2026 OA Hsiao
# SPDX-License-Identifier: MIT
#
# This source code is licensed under the MIT License found in the
# LICENSE file in the root directory of this source tree.
#

# ============================================================
# M2_SCOUT - release helper
#
# Two modes:
#   * Verify (default): make sure the toolchain is present, then
#     build the Windows NSIS installer locally. Publishes nothing.
#   * Publish (-Publish): set the version, commit, tag vX.Y.Z and
#     push. Pushing the tag triggers .github/workflows/release.yml,
#     which builds the installer on a clean runner and publishes the
#     GitHub Release. CI is the single source of truth.
#
# Dependencies are auto-provisioned: git / node / npm are installed
# via winget if missing (and gh when publishing).
#
# Examples:
#   pwsh scripts/release.ps1                       # verify build only
#   pwsh scripts/release.ps1 -Version 0.0.1 -Publish
#   pwsh scripts/release.ps1 -Bump patch -Publish
#
# This file is PURE ASCII (no non-ASCII bytes) on purpose.
# ============================================================
[CmdletBinding()]
param(
  [string]$Version,                                   # explicit semver, e.g. 0.0.1 or v0.0.1
  [ValidateSet('patch', 'minor', 'major')]
  [string]$Bump,                                      # or auto-increment from package.json
  [switch]$Publish,                                   # opt in to bump + commit + tag + push
  [string]$Branch = 'main'
)

$ErrorActionPreference = 'Stop'

# --- repo root (parent of this scripts/ folder) -------------------------------
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "OK  $msg"  -ForegroundColor Green }
function Fail($msg)       { Write-Host "ERR $msg"  -ForegroundColor Red; exit 1 }

# --- dependency auto-provisioning --------------------------------------------
function Ensure-Tool([string]$exe, [string]$wingetId, [string]$friendly) {
  if (Get-Command $exe -ErrorAction SilentlyContinue) {
    Write-Ok "$friendly found ($exe)"
    return
  }
  Write-Step "$friendly not found - installing via winget ($wingetId)"
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Fail "winget is unavailable; please install $friendly manually, then re-run."
  }
  winget install --id $wingetId --silent --accept-source-agreements --accept-package-agreements
  # winget does not refresh the current session PATH; reload it from the machine/user env.
  $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
              [System.Environment]::GetEnvironmentVariable('Path', 'User')
  if (-not (Get-Command $exe -ErrorAction SilentlyContinue)) {
    Fail "$friendly still not on PATH after install. Open a new terminal and re-run."
  }
  Write-Ok "$friendly installed"
}

Write-Step 'Checking build dependencies'
Ensure-Tool 'git'  'Git.Git'            'Git'
Ensure-Tool 'node' 'OpenJS.NodeJS.LTS'  'Node.js'
Ensure-Tool 'npm'  'OpenJS.NodeJS.LTS'  'npm'
if ($Publish) { Ensure-Tool 'gh' 'GitHub.cli' 'GitHub CLI' }

# --- resolve the target version ----------------------------------------------
$pkgPath = Join-Path $repoRoot 'package.json'
$pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
$current = $pkg.version

function Step-Version([string]$ver, [string]$part) {
  $m = [regex]::Match($ver, '^(\d+)\.(\d+)\.(\d+)$')
  if (-not $m.Success) { Fail "package.json version '$ver' is not X.Y.Z" }
  $maj = [int]$m.Groups[1].Value; $min = [int]$m.Groups[2].Value; $pat = [int]$m.Groups[3].Value
  switch ($part) {
    'major' { $maj++; $min = 0; $pat = 0 }
    'minor' { $min++; $pat = 0 }
    'patch' { $pat++ }
  }
  "$maj.$min.$pat"
}

$target = $null
if ($Version) {
  $target = $Version.TrimStart('v', 'V')
} elseif ($Bump) {
  $target = Step-Version $current $Bump
} else {
  $target = $current   # verify the version already in package.json
}
if ($target -notmatch '^\d+\.\d+\.\d+$') { Fail "Resolved version '$target' is not valid semver." }
$tag = "v$target"
Write-Ok "current=$current  target=$target  tag=$tag  publish=$($Publish.IsPresent)"

# --- install node deps (ci when a lockfile exists) ---------------------------
Write-Step 'Installing npm dependencies'
if (Test-Path (Join-Path $repoRoot 'package-lock.json')) { npm ci } else { npm install }
if ($LASTEXITCODE -ne 0) { Fail 'npm install failed' }

if (-not $Publish) {
  Write-Step "Verification build (electron-builder NSIS) for v$target"
  npm run dist
  if ($LASTEXITCODE -ne 0) { Fail 'Build failed' }
  $setups = Get-ChildItem (Join-Path $repoRoot 'dist') -Filter '*Setup*.exe' -ErrorAction SilentlyContinue
  if ($setups) { foreach ($s in $setups) { Write-Ok "Installer built: $($s.Name)" } } else { Fail 'No Setup .exe produced' }
  Write-Host ''
  Write-Host 'Verify-only run complete. Nothing was committed, tagged, or published.' -ForegroundColor Yellow
  Write-Host "To publish: pwsh scripts/release.ps1 -Version $target -Publish" -ForegroundColor Yellow
  exit 0
}

# --- publish: pre-flight git checks ------------------------------------------
Write-Step 'Pre-flight git checks'
$branchRaw = git rev-parse --abbrev-ref HEAD
if ($LASTEXITCODE -ne 0) { Fail 'Unable to determine current git branch.' }
$branchNow = ($branchRaw | Out-String).Trim()
if ($branchNow -ne $Branch) { Fail "On branch '$branchNow' but expected '$Branch'. Checkout $Branch first." }
$statusRaw = git status --porcelain
if ($LASTEXITCODE -ne 0) { Fail 'Unable to read git working tree status.' }
$statusText = ($statusRaw | Out-String).Trim()
if ($statusText) { Fail 'Working tree is not clean. Commit or stash changes first.' }
git fetch --tags --quiet
$existing = (git tag --list $tag)
if ($existing) { Fail "Tag $tag already exists. Pick a new version." }
Write-Ok "On $Branch, clean tree, $tag is free"

# --- bump package.json (only if it changed) ----------------------------------
if ($current -ne $target) {
  Write-Step "Bumping package.json $current -> $target"
  # npm version keeps formatting/lockfile in sync; no extra git tag here.
  npm version $target --no-git-tag-version | Out-Null
  git add package.json package-lock.json
  git commit -m "release: v$target" | Out-Null
  Write-Ok 'Version committed'
} else {
  Write-Step "package.json already at $target - tagging current HEAD"
}

# --- tag and push ------------------------------------------------------------
Write-Step "Tagging $tag and pushing"
git tag -a $tag -m "M2_SCOUT $tag"
git push origin $Branch
git push origin $tag
Write-Ok "Pushed $Branch and $tag"

Write-Host ''
Write-Host "Release tag $tag pushed. GitHub Actions (release.yml) will now build the" -ForegroundColor Green
Write-Host 'NSIS installer and publish the GitHub Release. Track it under the repo Actions tab.' -ForegroundColor Green
