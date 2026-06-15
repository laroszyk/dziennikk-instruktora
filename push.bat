@echo off
cd /d "%~dp0"
if exist ".git\index.lock" del ".git\index.lock"
git add -A
git commit -m "update"
git push origin main
echo.
echo Gotowe! Mozesz zamknac to okno.
pause
