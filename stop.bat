@echo off
title Invoice Parser - Stop
echo.
echo  =============================================
echo   Invoice Parser - Stopping...
echo  =============================================
echo.
cd /d "%~dp0"
echo  Duke ruajtur ndryshimet ne GitHub...
git add -A >nul 2>&1
git diff --cached --quiet >nul 2>&1
if errorlevel 1 (
  for /f "tokens=*" %%i in ('powershell -command "Get-Date -Format \"dd/MM/yyyy HH:mm\""') do set DT=%%i
  git commit -m "Auto-backup: %DT%" >nul 2>&1
  git push origin master >nul 2>&1
  echo  Ndryshimet u ruajten ne GitHub!
) else (
  echo  Ska ndryshime te reja per tu ruajtur.
)
echo.
npx kill-port 3000 2>nul
taskkill /F /FI "WINDOWTITLE eq InvoiceServer" 2>nul
taskkill /F /FI "WINDOWTITLE eq AutoSave" 2>nul
echo  Programi u ndal me sukses!
echo.
timeout /t 3 /nobreak >nul
