@echo off
REM ============================================================
REM M2_SCOUT - install the Explorer right-click search menu.
REM Adds a current-user (HKCU) menu entry - no admin required.
REM Double-click this file to install.
REM ============================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0context-menu.ps1"
echo.
pause
