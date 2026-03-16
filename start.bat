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

:: Gjenero SSH key automatikisht nese nuk ekziston
if not exist "%USERPROFILE%\.ssh\id_ed25519" (
    echo  Duke gjeneruar SSH key ^(vetem here e pare^)...
    ssh-keygen -t ed25519 -f "%USERPROFILE%\.ssh\id_ed25519" -N "" -q
    echo  SSH key u krijua!
    echo.
)

echo  Duke hapur tunelin publik...
start "Tunnel" ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -i "%USERPROFILE%\.ssh\id_ed25519" -R fatura-ms:80:localhost:3000 serveo.net

timeout /t 4 /nobreak >nul

echo  =============================================
echo   LINK PUBLIK (i perhershem):
echo   https://fatura-ms.serveo.net
echo  =============================================
echo.
echo  Nese eshte here e pare: shiko dritaren
echo  "Tunnel" dhe ndiq udhezimin e serveo-s per
echo  te regjistruar cmelin (nje here per gjithmone).
echo.
echo  Mbylle kete dritare per te ndalur serverin.
echo.
pause
