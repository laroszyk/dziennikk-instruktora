@echo off
cd /d "%~dp0"
git add -A
git commit -m "update"
git push origin main
echo.
echo Gotowe! Mozesz zamknac to okno.
pause
