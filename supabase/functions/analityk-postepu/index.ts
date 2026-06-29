import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const AGENT_ID = "analityk";
const GROK_API_URL = "https://api.x.ai/v1/responses";
const MODEL = "grok-4.3";

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

async function checkSubscription(supabase: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("subscriptions")
    .select("status, current_period_end")
    .eq("user_id", userId)
    .eq("agent_id", AGENT_ID)
    .maybeSingle();
  if (!data) return false;
  if (data.status !== "active" && data.status !== "trialing") return false;
  if (data.current_period_end && new Date(data.current_period_end) < new Date()) return false;
  return true;
}

function buildSystemPrompt() {
  return `Jesteś Analityk — specjalistyczny asystent do analizy postępów jeźdźców.

Twoje zadania:
1. Generować szczegółowe raporty postępów dla konkretnych jeźdźców
2. Analizować trendy w ocenach, frekwencji i ćwiczeniach
3. Porównywać okresy (np. ostatni miesiąc vs poprzedni)
4. Identyfikować co się poprawiło i co wymaga uwagi
5. Tworzyć raporty gotowe do przekazania jeźdźcowi lub rodzicom

Format raportu:
- Ogólne podsumowanie (liczba treningów, średnia ocena)
- Postępy w konkretnych obszarach
- Mocne strony
- Obszary do dalszej pracy
- Rekomendacje

Styl: pozytywny i motywujący, ale rzetelny.
Odpowiadaj po polsku.

Gdy pytają o analizę, użyj narzędzia pobierz_treningi żeby pobrać historię.`;
}

const TOOLS = [
  {
    type: "function",
    name: "pobierz_treningi",
    description: "Pobiera treningi dla danego jeźdźca z zakresu dat.",
    parameters: {
      type: "object",
      properties: {
        imie: { type: "string", description: "Imię jeźdźca" },
        data_od: { type: "string", description: "Data od (YYYY-MM-DD)" },
        data_do: { type: "string", description: "Data do (YYYY-MM-DD)" },
      },
      required: ["imie"],
    },
  },
  {
    type: "function",
    name: "pobierz_profil",
    description: "Pobiera profil jeźdźca (poziom, umiejętności, obszary do poprawy).",
    parameters: {
      type: "object",
      properties: { imie: { type: "string" } },
      required: ["imie"],
    },
  },
  {
    type: "function",
    name: "lista_jezdzców",
    description: "Lista aktywnych jeźdźców.",
    parameters: { type: "object", properties: {} },
  },
];

async function executeTool(name: string, args: Record<string, string>, supabase: ReturnType<typeof createClient>) {
  if (name === "pobierz_treningi") {
    const { data: jData } = await supabase.from("jezdzcy").select("id, imie").ilike("imie", `%${args.imie}%`).limit(1).maybeSingle();
    if (!jData) return JSON.stringify({ error: `Nie znaleziono: ${args.imie}` });
    const { data: kData } = await supabase.from("konie").select("id, imie");
    const kById = Object.fromEntries((kData || []).map((r) => [r.id, r.imie]));
    let query = supabase.from("treningi").select("*").eq("jezdziec_id", jData.id).order("data", { ascending: false });
    if (args.data_od) query = query.gte("data", args.data_od);
    if (args.data_do) query = query.lte("data", args.data_do);
    const { data } = await query.limit(100);
    return JSON.stringify((data || []).map((r) => ({
      data: r.data, kon: kById[r.kon_id] || "—", typ: r.typ_jazdy,
      cwiczenia: r.cwiczenia, uwagi: r.uwagi, dobrze: r.dobrze,
      do_poprawy: r.do_poprawy, ocena: r.ocena,
    })));
  }
  if (name === "pobierz_profil") {
    const { data } = await supabase.from("jezdzcy").select("imie, poziom, jezdzi_od, umiejetnosci, do_poprawy, postawa, preferencje, notatki").ilike("imie", `%${args.imie}%`).limit(1).maybeSingle();
    return data ? JSON.stringify(data) : JSON.stringify({ error: `Nie znaleziono: ${args.imie}` });
  }
  if (name === "lista_jezdzców") {
    const { data } = await supabase.from("jezdzcy").select("imie, poziom").eq("aktywny", true);
    return JSON.stringify(data || []);
  }
  return JSON.stringify({ error: `Nieznane narzędzie: ${name}` });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json({ error: "Brak tokenu autoryzacji" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json({ error: "Nieautoryzowany" }, 401);

    const hasAccess = await checkSubscription(supabase, user.id);
    if (!hasAccess) return json({ error: "Brak aktywnej subskrypcji dla Analityka" }, 403);

    const grokKey = Deno.env.get("GROK_API_KEY");
    if (!grokKey) return json({ error: "Brak GROK_API_KEY" }, 500);

    const { messages } = await req.json();
    const input = [{ role: "system", content: buildSystemPrompt() }, ...(messages || [])];

    let currentInput = input;
    let finalText = "";
    let previousResponseId: string | undefined;

    for (let i = 0; i < 5; i++) {
      const reqBody: Record<string, unknown> = { model: MODEL, input: currentInput, tools: TOOLS };
      if (previousResponseId) reqBody.previous_response_id = previousResponseId;

      const res = await fetch(GROK_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${grokKey}` },
        body: JSON.stringify(reqBody),
      });
      if (!res.ok) return json({ error: `Grok error: ${await res.text()}` }, 500);

      const data = await res.json();
      previousResponseId = data.id;
      const toolCalls = (data.output || []).filter((o: { type: string }) => o.type === "function_call");
      const msgOut = (data.output || []).find((o: { type: string }) => o.type === "message");
      if (msgOut) finalText = msgOut.content?.[0]?.text || "";
      if (toolCalls.length === 0) break;

      const toolResults = [];
      for (const tc of toolCalls) {
        const args = JSON.parse(tc.arguments || "{}");
        const result = await executeTool(tc.name, args, supabase);
        toolResults.push({ type: "function_call_output", call_id: tc.call_id, output: result });
      }
      currentInput = toolResults;
    }

    return json({ reply: finalText });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
