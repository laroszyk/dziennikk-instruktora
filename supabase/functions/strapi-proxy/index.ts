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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // 1. Autoryzacja — tylko zalogowany użytkownik Supabase
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json({ error: "Brak tokenu autoryzacji" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json({ error: "Nieautoryzowany" }, 401);

    // 2. Konfiguracja Strapi z sekretów funkcji
    const STRAPI_URL = Deno.env.get("STRAPI_URL");
    const STRAPI_TOKEN = Deno.env.get("STRAPI_TOKEN");
    if (!STRAPI_URL || !STRAPI_TOKEN) {
      return json({ error: "Konfiguracja serwera: brak STRAPI_URL lub STRAPI_TOKEN" }, 500);
    }

    // 3. Walidacja żądania
    const { method, path, data } = await req.json();
    const m = String(method || "").toUpperCase();
    if (!ALLOWED_METHODS.has(m)) return json({ error: `Niedozwolona metoda: ${method}` }, 400);
    if (typeof path !== "string" || !ALLOWED_PATH.test(path)) {
      return json({ error: `Niedozwolona ścieżka: ${path}` }, 400);
    }

    // 4. Przekazanie do Strapi z tokenem po stronie serwera
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
    return new Response(text, {
      status: upstream.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
