@echo off
REM ============================================================
REM M2_SCOUT launcher (Node.js / Electron port of M2 SEEK)
REM Usage:
REM   M2_SCOUT.cmd [folder]
REM ============================================================
setlocal
cd /d "%~dp0"

REM Install dependencies on first run
if not exist "node_modules\electron" (
  echo [M2_SCOUT] Installing dependencies ^(first run^)...
  call npm install
  if errorlevel 1 (
    echo [M2_SCOUT] npm install failed.
    exit /b 1
  )
)

REM Auto-repair: a partial/failed Electron install leaves the package folder
REM in place but without the binary. Re-extract it before launching.
if not exist "node_modules\electron\dist\electron.exe" (
  echo [M2_SCOUT] Repairing Electron binary ...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\repair-electron.ps1"
  if errorlevel 1 (
    echo [M2_SCOUT] Electron auto-repair failed. Run START.CMD for details.
    exit /b 1
  )
)

REM Launch with NO console window via the VBScript wrapper (start "" cmd /c
REM npm start leaves a command prompt open for the app's lifetime).
start "" wscript.exe //nologo "%~dp0run-hidden.vbs" %*
