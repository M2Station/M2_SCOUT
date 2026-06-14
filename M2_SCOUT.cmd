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

start "" cmd /c npm start -- %*
