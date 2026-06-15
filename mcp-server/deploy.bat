@echo off
cd /d "%~dp0"
echo [1/2] Instalowanie zaleznosci...
call npm install
echo.
echo [2/2] Wdrazanie na Vercel...
call npx vercel deploy --prod
echo.
pause
