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

  if (req.method !== "POST") return json({ error: "Metoda niedozwolona. Użyj POST." }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Nieprawidłowe JSON w body." }, 400);
  }

  const { jezdziec, kon, data, typ_jazdy, ocena, cwiczenia, uwagi, dobrze, do_poprawy } = body as {
    jezdziec?: string;
    kon?: string;
    data?: string;
    typ_jazdy?: string;
    ocena?: number;
    cwiczenia?: string[];
    uwagi?: string;
    dobrze?: string;
    do_poprawy?: string;
  };

  if (!jezdziec) return json({ error: "Pole 'jezdziec' jest wymagane." }, 400);

  // Szukaj jeźdźca
  const { data: jezdzcy, error: jErr } = await supabase
    .from("jezdzcy")
    .select("id, imie")
    .ilike("imie", `%${jezdziec}%`)
    .limit(5);

  if (jErr) return json({ error: jErr.message }, 500);
  if (!jezdzcy || jezdzcy.length === 0) return json({ error: `Nie znaleziono jeźdźca: "${jezdziec}".` }, 404);
  if (jezdzcy.length > 1) {
    return json({
      error: `Niejednoznaczne imię: "${jezdziec}". Podaj dokładniejsze imię.`,
      kandydaci: jezdzcy.map((j: { id: string; imie: string }) => j.imie),
    }, 400);
  }

  const jezdziecId = jezdzcy[0].id;

  // Opcjonalnie szukaj konia
  let konId: string | null = null;
  if (kon) {
    const { data: konie } = await supabase
      .from("konie")
      .select("id, imie")
      .ilike("imie", `%${kon}%`)
      .limit(5);

    if (konie && konie.length === 1) {
      konId = konie[0].id;
    } else if (konie && konie.length > 1) {
      return json({
        error: `Niejednoznaczna nazwa konia: "${kon}". Podaj dokładniejszą nazwę.`,
        kandydaci: konie.map((k: { id: string; imie: string }) => k.imie),
      }, 400);
    }
    // Jeśli nie znaleziono konia — ignorujemy (kon_id = null)
  }

  // Walidacja oceny
  if (ocena !== undefined && (typeof ocena !== "number" || ocena < 1 || ocena > 5)) {
    return json({ error: "Pole 'ocena' musi być liczbą całkowitą od 1 do 5." }, 400);
  }

  // Data domyślnie dzisiaj
  const { data: dateRow } = await supabase.rpc("select_current_date").single().catch(() => ({ data: null }));
  const dataWpisu = data || (dateRow as { select_current_date?: string } | null)?.select_current_date
    || new Date().toISOString().slice(0, 10);

  // Wstaw wpis
  const { data: inserted, error: insErr } = await supabase
    .from("treningi")
    .insert({
      jezdziec_id: jezdziecId,
      kon_id: konId,
      data: dataWpisu,
      typ_jazdy: typ_jazdy || "plac",
      grupowa: false,
      cwiczenia: cwiczenia || [],
      uwagi: uwagi || null,
      dobrze: dobrze || null,
      do_poprawy: do_poprawy || null,
      ocena: ocena || null,
    })
    .select("id, data, jezdziec_id, ocena")
    .single();

  if (insErr) return json({ error: insErr.message }, 500);

  return json({
    id: (inserted as { id: string }).id,
    data: (inserted as { data: string }).data,
    jezdziec: jezdzcy[0].imie,
    ocena: (inserted as { ocena: number | null }).ocena,
  });
});
