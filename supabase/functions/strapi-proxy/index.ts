// strapi-proxy — serwerowy pośrednik do Strapi.
// Token Strapi NIE trafia do przeglądarki: leży jako sekret funkcji (STRAPI_TOKEN).
// Wywoływać tylko przez zalogowanego użytkownika (weryfikacja JWT Supabase).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Dozwolone metody i kolekcje (allowlista — blokuje SSRF/nadużycia).
const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "DELETE"]);
const ALLOWED_PATH = /^\/api\/(jezdzcy|konie|treningi|cwiczenia|jezdziec-konie)(\/|\?|$)/;

// Statusy, które NIE mogą mieć ciała odpowiedzi (spec Fetch/Deno).
// Strapi zwraca 204 przy udanym DELETE — bez tego wyjątku Response rzuca
// "Response with null body status cannot have body".
const NULL_BODY_STATUS = new Set([101, 204, 205, 304]);

// Adres Strapi wpisany na stałe (to publiczny URL, nie sekret) — eliminuje
// błędy wynikające z literówki/spacji w sekrecie STRAPI_URL.
const STRAPI_URL = "https://strapi-production-6bf4.up.railway.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let stage = "start";
  try {
    // 1. Autoryzacja — tylko zalogowany użytkownik Supabase
    stage = "auth";
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json({ error: "Brak tokenu autoryzacji" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json({ error: "Nieautoryzowany" }, 401);

    // 2. Token Strapi z sekretu funkcji
    stage = "config";
    const STRAPI_TOKEN = (Deno.env.get("STRAPI_TOKEN") || "").trim();
    if (!STRAPI_TOKEN) {
      return json({ error: "Konfiguracja serwera: brak sekretu STRAPI_TOKEN" }, 500);
    }

    // 3. Walidacja żądania
    stage = "validate";
    const { method, path, data } = await req.json();
    const m = String(method || "").toUpperCase();
    if (!ALLOWED_METHODS.has(m)) return json({ error: `Niedozwolona metoda: ${method}` }, 400);
    if (typeof path !== "string" || !ALLOWED_PATH.test(path)) {
      return json({ error: `Niedozwolona ścieżka: ${path}` }, 400);
    }

    // 4. Przekazanie do Strapi z tokenem po stronie serwera
    stage = "fetch";
    const upstream = await fetch(`${STRAPI_URL}${path}`, {
      method: m,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${STRAPI_TOKEN}`,
      },
      body: (m === "POST" || m === "PUT") && data !== undefined
        ? JSON.stringify({ data })
        : undefined,
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      console.error("Strapi upstream error", upstream.status, path, text.slice(0, 500));
    }
    // Statusy bez ciała (np. 204 po DELETE) muszą mieć body === null.
    const respBody = NULL_BODY_STATUS.has(upstream.status) ? null : text;
    return new Response(respBody, {
      status: upstream.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("strapi-proxy exception", stage, String(err));
    return json({ error: `[${stage}] ${String(err)}` }, 500);
  }
});
