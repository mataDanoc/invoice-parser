@echo off
title Invoice Parser - Stop
echo.
echo  =============================================
echo   Invoice Parser - Stopping...
echo  =============================================
echo.
npx kill-port 3000 2>nul
taskkill /F /FI "WINDOWTITLE eq InvoiceServer" 2>nul
echo.
echo  Programi u ndal me sukses!
echo.
timeout /t 3 /nobreak >nul
