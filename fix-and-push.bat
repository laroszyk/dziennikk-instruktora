@echo off
cd /d "%~dp0"
echo === Usuwanie config.js z Git (zostaje lokalnie) ===
git rm --cached config.js 2>nul
echo === Dodawanie plikow ===
git add .gitignore build.js vercel.json config.example.js
git status --short
echo === Commit ===
git commit -m "security: klucze tylko w .env.local, config.js gitignored"
echo === Push ===
git push origin main
echo.
echo === SUCCESS! ===
pause
