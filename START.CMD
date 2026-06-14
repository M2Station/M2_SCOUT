@echo off
REM ============================================================
REM  M2_SCOUT - START launcher
REM  1) Checks required programs and components
REM  2) Installs anything missing
REM  3) Launches M2_SCOUT (Electron port of M2 SEEK)
REM
REM  Usage:  START.CMD [folder]
REM ============================================================
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title M2_SCOUT Launcher
set "TOOLS_DIR=%~dp0TOOLS"

echo ============================================================
echo  M2_SCOUT - Startup and Dependency Check
echo ============================================================
echo.

call :check_node  || goto :fail
call :check_tools
call :check_deps  || goto :fail
call :launch

echo.
echo Done. M2_SCOUT is starting in a new window.
endlocal
exit /b 0


REM ------------------------------------------------------------
REM 1) Node.js / npm
REM ------------------------------------------------------------
:check_node
echo [1/4] Checking Node.js ...
where node >nul 2>nul
if not errorlevel 1 goto :node_ok

echo       Node.js not found. Attempting install via winget ...
where winget >nul 2>nul
if errorlevel 1 (
  echo [ERROR] winget is not available on this machine.
  echo         Please install Node.js LTS manually from:
  echo         https://nodejs.org/en/download
  exit /b 1
)
winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
REM winget does not refresh PATH for the current shell - add the default location
set "PATH=%ProgramFiles%\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js still not detected after install.
  echo         Close this window and run START.CMD again.
  exit /b 1
)

:node_ok
for /f "delims=" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
echo       Node.js !NODE_VER! OK
echo.
exit /b 0


REM ------------------------------------------------------------
REM 2) Search tools: rg.exe / fd.exe / cscope.exe
REM ------------------------------------------------------------
:check_tools
echo [2/4] Checking search tools: rg / fd / cscope ...
set "NEED_EXTRACT="
if not exist "%TOOLS_DIR%\rg.exe"     set "NEED_EXTRACT=1"
if not exist "%TOOLS_DIR%\fd.exe"     set "NEED_EXTRACT=1"
if not exist "%TOOLS_DIR%\cscope.exe" set "NEED_EXTRACT=1"
if defined NEED_EXTRACT call :extract_tools

REM Make the tools resolvable by the app through PATH
set "PATH=%TOOLS_DIR%;%PATH%"
for %%T in (rg.exe fd.exe cscope.exe) do call :report_tool "%%T"
echo.
exit /b 0

:extract_tools
echo       Some tools are missing - extracting from TOOLS\ZIP ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=$env:TOOLS_DIR; $z=Join-Path $t 'ZIP'; $a=if($env:PROCESSOR_ARCHITECTURE -eq 'ARM64'){'aarch64'}else{'x86_64'}; function Ex($p,$e){ $dest=Join-Path $t $e; if(Test-Path $dest){Write-Host ('       [ok] '+$e); return}; $zip=Get-ChildItem $z -Filter $p -ErrorAction SilentlyContinue | Select-Object -First 1; if(-not $zip){Write-Host ('       [skip] no archive matched '+$p); return}; $tmp=Join-Path $env:TEMP ('m2scout_'+[IO.Path]::GetRandomFileName()); Expand-Archive -LiteralPath $zip.FullName -DestinationPath $tmp -Force; $f=Get-ChildItem $tmp -Recurse -Filter $e | Select-Object -First 1; if($f){Copy-Item $f.FullName $dest -Force; Write-Host ('       [extracted] '+$e)}else{Write-Host ('       [warn] '+$e+' not found in archive')}; Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }; Ex ('ripgrep*'+$a+'*.zip') 'rg.exe'; Ex ('fd*'+$a+'*.zip') 'fd.exe'; Ex 'cscope*.zip' 'cscope.exe'"
exit /b 0

:report_tool
if exist "%TOOLS_DIR%\%~1" (
  echo       %~1 OK
) else (
  echo       [warn] %~1 not available - some features may not work
)
exit /b 0


REM ------------------------------------------------------------
REM 3) npm dependencies (Electron)
REM ------------------------------------------------------------
:check_deps
echo [3/4] Checking npm dependencies ...
if exist "node_modules\electron" goto :deps_ok
echo       Installing dependencies ^(first run, this may take a while^) ...
call npm install
if errorlevel 1 (
  echo [ERROR] npm install failed.
  exit /b 1
)
goto :deps_done
:deps_ok
echo       node_modules OK
:deps_done
echo.
exit /b 0


REM ------------------------------------------------------------
REM 4) Launch M2_SCOUT
REM ------------------------------------------------------------
:launch
echo [4/4] Launching M2_SCOUT ...
start "" cmd /c npm start -- %*
exit /b 0


REM ------------------------------------------------------------
REM Failure handler
REM ------------------------------------------------------------
:fail
echo.
echo [ABORT] Startup failed. See the messages above.
pause
endlocal
exit /b 1
