@echo off
echo Diagnostyka...
echo.

node --version
if errorlevel 1 (
    echo BLAD: Node.js nie znaleziony w PATH.
    echo Zainstaluj Node.js ze strony https://nodejs.org
    pause
    exit /b 1
)

npx --version
if errorlevel 1 (
    echo BLAD: npx niedostepny.
    pause
    exit /b 1
)

echo.
echo Logowanie do Supabase (otworzy sie przeglądarka)...
npx supabase@latest login
echo.

echo Wdrazam create-checkout...
npx supabase@latest functions deploy create-checkout --project-ref asxvphinpnhjfrqibfka
echo.

echo Wdrazam stripe-webhook...
npx supabase@latest functions deploy stripe-webhook --project-ref asxvphinpnhjfrqibfka
echo.

echo Wdrazam manage-tokens...
npx supabase@latest functions deploy manage-tokens --project-ref asxvphinpnhjfrqibfka
echo.

echo GOTOWE. Mozesz zamknac to okno.
pause
