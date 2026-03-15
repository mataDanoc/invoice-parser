@echo off
title Invoice Parser
echo.
echo  =============================================
echo   Invoice Parser - Starting...
echo  =============================================
echo.
cd /d "%~dp0"
start "AutoSave" /B node autosave.js
start "InvoiceServer" /B node server.js
timeout /t 3 /nobreak >nul
echo  Server is running on http://localhost:3000
echo.
echo  Creating public link for friends...
echo  (This may take a few seconds)
echo.
npx cloudflared tunnel --url http://localhost:3000
pause
