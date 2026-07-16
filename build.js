// build.js — uruchamiany przez Vercel przed deploymentem
// Czyta zmienne środowiskowe i generuje config.js
// Lokalnie: node build.js (potrzebuje .env.local wczytanego ręcznie lub przez dotenv)

const fs = require("fs");
const path = require("path");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const STRAPI_URL = process.env.STRAPI_URL || "https://strapi-production-6bf4.up.railway.app";
const STRAPI_TOKEN = process.env.STRAPI_TOKEN || "";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("BLAD: Brak zmiennych SUPABASE_URL lub SUPABASE_ANON_KEY");
  console.error("Dodaj je w Vercel -> Settings -> Environment Variables");
  process.exit(1);
}

// UWAGA: STRAPI_TOKEN celowo NIE trafia do config.js — token jest sekretem
// funkcji Supabase "strapi-proxy" i zostaje po stronie serwera.
const config = `// Ten plik jest GENEROWANY automatycznie przez build.js
// NIE edytuj recznie - zmiany sie nadpisza przy nastepnym buildzie
const SUPABASE_URL = "${SUPABASE_URL}";
const SUPABASE_ANON_KEY = "${SUPABASE_ANON_KEY}";
`;

const outputPath = path.join(__dirname, "config.js");
fs.writeFileSync(outputPath, config, "utf8");
console.log("OK: config.js wygenerowany z env vars");
