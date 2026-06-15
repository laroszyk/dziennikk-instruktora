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

async function authenticate(req: Request, supabase: ReturnType<typeof createClient>): Promise<boolean> {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return false;
  const masterKey = Deno.env.get("API_SECRET_KEY");
  if (masterKey && token === masterKey) return true;
  const { data } = await supabase.from("api_tokens").select("id").eq("token", token).maybeSingle();
  return !!data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  if (!await authenticate(req, supabase)) return json({ error: "Nieautoryzowany dostęp." }, 401);

  if (req.method !== "GET") return json({ error: "Metoda niedozwolona. Użyj GET." }, 405);

  const url = new URL(req.url);
  const data = url.searchParams.get("data") || new Date().toISOString().slice(0, 10);

  // Walidacja formatu daty
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return json({ error: "Nieprawidłowy format daty. Użyj YYYY-MM-DD." }, 400);
  }

  const [{ data: jData }, { data: kData }, { data: treningi, error }] = await Promise.all([
    supabase.from("jezdzcy").select("id, imie"),
    supabase.from("konie").select("id, imie"),
    supabase.from("treningi").select("*").eq("data", data).order("created_at", { ascending: true }),
  ]);

  if (error) return json({ error: error.message }, 500);

  const jById: Record<string, string> = Object.fromEntries((jData || []).map((r: { id: string; imie: string }) => [r.id, r.imie]));
  const kById: Record<string, string> = Object.fromEntries((kData || []).map((r: { id: string; imie: string }) => [r.id, r.imie]));

  const wpisy = (treningi || []).map((r: Record<string, unknown>) => ({
    id: r.id,
    data: r.data,
    jezdziec: jById[r.jezdziec_id as string] || "?",
    kon: kById[r.kon_id as string] || null,
    typ_jazdy: r.typ_jazdy,
    grupowa: r.grupowa,
    cwiczenia: r.cwiczenia,
    uwagi: r.uwagi,
    dobrze: r.dobrze,
    do_poprawy: r.do_poprawy,
    ocena: r.ocena,
  }));

  return json({ data, liczba: wpisy.length, treningi: wpisy });
});
