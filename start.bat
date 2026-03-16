@echo off
title Invoice Parser
echo.
echo  =============================================
echo   Invoice Parser - Starting...
echo  =============================================
echo.
cd /d "%~dp0"
start "AutoSave" /B node autosave.js
node server.js
