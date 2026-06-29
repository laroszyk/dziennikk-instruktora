@echo off
cd /d "%~dp0"
echo === reset to remote ===
git fetch origin main
git reset --hard origin/main
echo === write v11 via node ===
node write_v11.js
if errorlevel 1 goto error
echo === commit and push ===
git add supabase\functions\chat-agent\index.ts
git commit -m "feat: chat-agent v11 - RAG + security check"
git push origin main
echo.
echo === SUCCESS! ===
goto end
:error
echo ERROR: node failed!
:end
pause
