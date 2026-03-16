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
timeout /t 2 /nobreak >nul

echo  Server lokal:  http://localhost:3000
echo.
echo  Duke krijuar link publik te perhershem...
echo.

start "Tunnel" /B ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -R fatura-ms:80:localhost:3000 serveo.net

timeout /t 3 /nobreak >nul

echo  =============================================
echo   LINK PUBLIK (i perhershem):
echo   https://fatura-ms.serveo.net
echo  =============================================
echo.
echo  Dergo kete link tek perdoruesit.
echo  Mbylle kete dritare per te ndalur serverin.
echo.
pause
