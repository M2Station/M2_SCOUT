@echo off
REM ============================================================
REM M2_SCOUT - remove the Explorer right-click search menu.
REM Double-click this file to uninstall.
REM ============================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0context-menu.ps1" -Uninstall
echo.
pause
