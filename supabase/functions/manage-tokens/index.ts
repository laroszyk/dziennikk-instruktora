import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return "dziennik_" + Array.from(array).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isMaster(req: Request): boolean {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  const masterKey = Deno.env.get("API_SECRET_KEY");
  return !!masterKey && token === masterKey;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // POST — generuj token (publiczne, bez auth)
  if (req.method === "POST") {
    let body: { name?: string };
    try { body = await req.json(); } catch { return json({ error: "Nieprawidłowy JSON." }, 400); }
    if (!body.name?.trim()) return json({ error: "Pole 'name' jest wymagane." }, 400);

    const newToken = generateToken();
    const { data, error } = await supabase
      .from("api_tokens")
      .insert({ name: body.name.trim(), token: newToken })
      .select("id, name, created_at")
      .single();
    if (error) return json({ error: error.message }, 500);

    return json({
      message: "Token wygenerowany. Zapisz go — nie będzie pokazany ponownie.",
      token: newToken,
      id: data.id,
      name: data.name,
      created_at: data.created_at,
    }, 201);
  }

  // GET i DELETE — tylko master key
  if (!isMaster(req)) return json({ error: "Nieautoryzowany dostęp." }, 401);

  // GET — lista tokenów
  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("api_tokens")
      .select("id, name, token, created_at")
      .order("created_at", { ascending: false });
    if (error) return json({ error: error.message }, 500);
    const masked = (data || []).map((t: { id: string; name: string; token: string; created_at: string }) => ({
      id: t.id,
      name: t.name,
      token_preview: t.token.slice(0, 16) + "••••••••" + t.token.slice(-6),
      created_at: t.created_at,
    }));
    return json({ tokens: masked });
  }

  // DELETE — revoke
  if (req.method === "DELETE") {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return json({ error: "Parametr 'id' jest wymagany." }, 400);
    const { error } = await supabase.from("api_tokens").delete().eq("id", id);
    if (error) return json({ error: error.message }, 500);
    return json({ message: "Token usunięty." });
  }

  return json({ error: "Metoda niedozwolona." }, 405);
});
