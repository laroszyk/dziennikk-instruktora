@echo off
cd /d "%~dp0"
echo === Dziennik Instruktora — commit i push ===
echo.

:: Usuń blokadę git jeśli istnieje
if exist ".git\index.lock" (
  del /f ".git\index.lock"
  echo [OK] Usunieto index.lock
)

:: Usuń pliki z trackowania git
git rm --cached config.js 2>nul
git rm -r --cached mcp-server\node_modules 2>nul
echo [OK] Odsledzono config.js i mcp-server/node_modules

:: Dodaj nowe i zmienione pliki
git add .gitignore
git add build.js
git add config.example.js
git add vercel.json
git add strapi-client.js
git add index.html
git add app.js
git add supabase\
echo [OK] Pliki dodane do stage

:: Commit
git -c user.email="la.roszyk@gmail.com" -c user.name="Luiza Roszyk" ^
  commit -m "fix: napraw zapis nowego jezdzca (mapowanie kolumn lubi -> preferencje)"
echo [OK] Commit utworzony

:: Push
git push origin main
echo.
echo === Gotowe! Sprawdz repo na GitHub ===
pause
