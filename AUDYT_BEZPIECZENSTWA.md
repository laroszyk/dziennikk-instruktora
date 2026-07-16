# Audyt bezpieczeństwa — Dziennik Instruktora

Data: 15.07.2026 · Zakres: apka webowa (`deploy/`), Supabase (`asxvphinpnhjfrqibfka`), Strapi, buckety zdjęć.

## Podsumowanie

Apka ma dobre fundamenty (klucze AI i service-role trzymane serwerowo w Edge Functions, dane escapowane w większości miejsc), ale ma **jeden krytyczny wyciek sekretu** i **kilka zbyt luźnych uprawnień** w Supabase. Poniżej wg priorytetu.

---

## 🔴 KRYTYCZNE

### 1. Token API Strapi jest wystawiony po stronie przeglądarki
- `build.js` wstawia `STRAPI_TOKEN` do `config.js`, a `config.js` jest serwowany publicznie (`https://<twoja-domena>/config.js`). `app.js` używa go jako `Authorization: Bearer`.
- **Skutek:** każdy może otworzyć `config.js` w przeglądarce, skopiować token i wykonać dowolne `GET/POST/PUT/DELETE` na `/api/jezdzcy`, `/api/konie`, `/api/treningi` — czyli odczytać, zmienić lub **usunąć wszystkie dane**.
- Klasa ataku: *Broken Access Control / Secrets Exposure* (OWASP A01/A07).
- **Naprawa:**
  1. **Zrotuj token teraz** w Strapi → Settings → API Tokens (stary jest już publiczny).
  2. Nie wysyłaj tokena do przeglądarki. Najlepiej: przepuść zapytania do Strapi przez Supabase Edge Function (tak jak już działa Cwałek i checkout) — token zostaje na serwerze.
  3. Alternatywa minimalna: ustaw publiczną rolę Strapi na *tylko odczyt* i nie używaj tokena zapisu w kliencie.

---

## 🟠 WYSOKIE

### 2. Bucket `treningi-photos` pozwala anonimowo wgrywać i USUWAĆ pliki
- Polityki storage: `INSERT` i `DELETE` dla roli `public` (niezalogowani).
- **Skutek:** ktokolwiek bez konta może wrzucać obrazy do bucketu i **kasować istniejące zdjęcia treningów**.
- **Naprawa:** ogranicz `INSERT`/`DELETE` do roli `authenticated` (jak w buckecie `konie`), najlepiej z zawężeniem do własnych plików.

### 3. Zbyt luźne RLS na tabelach Supabase
- Tabele `konie`, `jezdzcy`, `treningi`, `cwiczenia`, `jezdziec_konie` mają politykę `ALL` z `USING(true) WITH CHECK(true)` dla `authenticated`.
- **Skutek:** każdy zalogowany użytkownik widzi i może zmieniać **dane wszystkich** instruktorów. Rejestracja jest otwarta, więc wystarczy założyć konto.
- Uwaga: dane przeniesiono do Strapi — jeśli te tabele są już nieużywane, **zablokuj je lub usuń**. Jeśli używane, dodaj politykę zawężającą do właściciela (`user_id = auth.uid()`).

---

## 🟡 ŚREDNIE

### 4. Publiczne buckety pozwalają listować pliki
- `konie`, `horse-photos`, `treningi-photos` mają szeroką politykę `SELECT` dla `public`, co pozwala wylistować wszystkie pliki (nie tylko otworzyć po znanym URL).
- **Naprawa:** usuń szeroki publiczny `SELECT` (dostęp po URL zdjęcia i tak działa) albo zawęź.

### 5. Resztkowy stored XSS (kilka nieescapowanych wartości)
- Większość danych idzie przez `esc()`, ale bez escapowania są: `k.foto` (`img src`), `k.fit`/`k.pos` (w atrybucie `style`), data notatki `n.d`, pole „lubi" jeźdźca.
- **Skutek:** w połączeniu z pkt 1 (atakujący może zapisać złośliwą wartość w Strapi) da się wykonać JS w przeglądarce instruktora i przejąć jego sesję.
- **Naprawa:** owiń te wartości w `esc()` oraz dodaj nagłówek CSP (pkt 6).

### 6. Brak nagłówków bezpieczeństwa
- `vercel.json` nie ustawia żadnych nagłówków.
- **Naprawa:** dodaj `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors` (clickjacking), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`.

---

## 🟢 NISKIE / hardening (z advisorów Supabase)

- **Ochrona przed wyciekłymi hasłami wyłączona** — włącz sprawdzanie HaveIBeenPwned w Auth.
- Funkcja `set_updated_at` (SECURITY DEFINER) wykonywalna przez `anon`/`authenticated` — rozważ `REVOKE EXECUTE` lub `SECURITY INVOKER`.
- `function_search_path_mutable` na kilku funkcjach — ustaw `search_path`.
- Rozszerzenie `vector` w schemacie `public` — przenieś do osobnego schematu.

---

## ✅ Co jest zrobione dobrze

- `SUPABASE_ANON_KEY` w `config.js` — **to jest OK**, klucz anon jest z założenia publiczny; bezpieczeństwo zapewnia RLS (dlatego ważny jest pkt 3).
- Klucze `SERVICE_ROLE`, `OPENAI`, `GROK` **nie** trafiają do przeglądarki — Cwałek i płatności idą przez Supabase Edge Functions. Wzorcowo.
- Sekrety są w `.gitignore` (`.env.local`, `config.js`) — nie ma ich w repo.
- HTML jest escapowany w większości miejsc (`esc()`).
- Buckety mają limity rozmiaru i whitelistę typów (tylko obrazy).
