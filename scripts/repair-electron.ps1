# ============================================================
#  M2_SCOUT - Electron auto-repair
#
#  Fixes the common "Electron failed to install correctly"
#  problem where `npm install` leaves node_modules\electron in
#  place but the binary (dist\electron.exe) is missing or only
#  partially extracted. This happens when the package's bundled
#  `extract-zip` step is interrupted or extracts incompletely.
#
#  Strategy (no network needed if the zip is already cached):
#    1. Read the required Electron version from package.json.
#    2. If dist\electron.exe already exists -> nothing to do.
#    3. Otherwise locate the cached release zip (downloading it
#       via Electron's own install script if absent).
#    4. Re-extract it with the reliable Expand-Archive cmdlet and
#       (re)write path.txt so Electron can resolve the binary.
#
#  Usage:
#    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\repair-electron.ps1
#
#  Exit codes: 0 = ok / repaired, 1 = unrecoverable failure.
# ============================================================
[CmdletBinding()]
param(
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$msg) {
    if (-not $Quiet) { Write-Host "       $msg" }
}

# Repo root = parent of this script's folder.
$root = Split-Path -Parent $PSScriptRoot
$electronDir = Join-Path $root 'node_modules\electron'
$distExe = Join-Path $electronDir 'dist\electron.exe'
$pathTxt = Join-Path $electronDir 'path.txt'

# The electron package itself must be present first.
if (-not (Test-Path $electronDir)) {
    Write-Step '[skip] node_modules\electron not installed yet (run npm install).'
    exit 0
}

# Already healthy? Make sure path.txt is present too.
if (Test-Path $distExe) {
    if (-not (Test-Path $pathTxt)) {
        Set-Content -Path $pathTxt -Value 'electron.exe' -NoNewline
    }
    Write-Step '[ok] Electron binary present.'
    exit 0
}

Write-Step '[repair] Electron binary missing - attempting auto-repair ...'

# 1) Determine required version + architecture.
try {
    $pkg = Get-Content (Join-Path $electronDir 'package.json') -Raw | ConvertFrom-Json
    $version = $pkg.version
} catch {
    Write-Step "[error] Cannot read electron package version: $($_.Exception.Message)"
    exit 1
}

$arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
$zipName = "electron-v$version-win32-$arch.zip"
Write-Step "[repair] Target: $zipName"

# 2) Find the cached release zip (Electron caches under %LOCALAPPDATA%\electron\Cache).
function Find-CachedZip {
    $cacheRoot = if ($env:electron_config_cache) { $env:electron_config_cache }
                 else { Join-Path $env:LOCALAPPDATA 'electron\Cache' }
    if (-not (Test-Path $cacheRoot)) { return $null }
    Get-ChildItem $cacheRoot -Recurse -Filter $zipName -ErrorAction SilentlyContinue |
        Select-Object -First 1
}

$zip = Find-CachedZip

# 3) No cached zip -> let Electron's own install script download it.
if (-not $zip) {
    Write-Step '[repair] No cached archive - downloading via Electron install script ...'
    $installJs = Join-Path $electronDir 'install.js'
    if (Test-Path $installJs) {
        $env:force_no_cache = 'true'
        try {
            & node $installJs 2>&1 | Out-Null
        } catch {
            # The install script may fail at the (broken) extract step; the
            # download itself still populates the cache, which is all we need.
        } finally {
            Remove-Item Env:\force_no_cache -ErrorAction SilentlyContinue
        }
    }
    $zip = Find-CachedZip
}

if (-not $zip) {
    Write-Step '[error] Could not obtain the Electron archive (offline?).'
    Write-Step '        Connect to the internet and run START.CMD again.'
    exit 1
}

# 4) Verify the archive is complete, then extract with Expand-Archive.
try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $za = [System.IO.Compression.ZipFile]::OpenRead($zip.FullName)
    $entryCount = $za.Entries.Count
    $za.Dispose()
} catch {
    Write-Step "[error] Cached archive is corrupt: $($_.Exception.Message)"
    Write-Step '        Delete it and run START.CMD again to re-download.'
    exit 1
}

if ($entryCount -lt 10) {
    Write-Step "[error] Cached archive looks incomplete ($entryCount entries)."
    exit 1
}

$distDir = Join-Path $electronDir 'dist'
try {
    if (Test-Path $distDir) { Remove-Item $distDir -Recurse -Force }
    Expand-Archive -LiteralPath $zip.FullName -DestinationPath $distDir -Force
} catch {
    Write-Step "[error] Extraction failed: $($_.Exception.Message)"
    exit 1
}

if (-not (Test-Path $distExe)) {
    Write-Step '[error] electron.exe still missing after extraction.'
    exit 1
}

# 5) Point path.txt at the binary so require('electron') resolves it.
Set-Content -Path $pathTxt -Value 'electron.exe' -NoNewline
Write-Step '[ok] Electron repaired successfully.'
exit 0
