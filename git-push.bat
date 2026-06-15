@echo off
cd /d "%~dp0"
echo [1/3] Dodawanie plikow...
git add -A
echo [2/3] Commit...
git commit -m "feat: add mcp-server, update app + supabase functions"
echo [3/3] Push do GitHub...
git push origin main
echo.
echo Gotowe! Sprawdz output powyzej.
pause
