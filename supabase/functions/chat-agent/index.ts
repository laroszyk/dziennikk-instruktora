import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GROK_API_URL = "https://api.x.ai/v1/responses";
const MODEL = "grok-4.3";

async function generateEmbedding(text, apiKey) {
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0]?.embedding ?? null;
  } catch { return null; }
}

async function hybridSearch(query, supabase, openaiKey, limit = 6) {
  const embedding = await generateEmbedding(query, openaiKey);
  if (!embedding) return "";
  const { data, error } = await supabase.rpc("search_treningi_hybrid", {
    query_embedding: embedding, query_text: query, match_count: limit,
  });
  if (error || !data?.length) return "";
  const { data: jData } = await supabase.from("jezdzcy").select("id, imie");
  const { data: kData } = await supabase.from("konie").select("id, imie");
  const jById = Object.fromEntries((jData || []).map((r) => [r.id, r.imie]));
  const kById = Object.fromEntries((kData || []).map((r) => [r.id, r.imie]));
  return data.map((r) =>
    `[${r.data}] ${jById[r.jezdziec_id] || "?"} na ${kById[r.kon_id] || "—"}: ${r.cwiczenia || ""} | dobrze: ${r.dobrze || ""} | do poprawy: ${r.do_poprawy || ""} | ocena: ${r.ocena ?? "—"}`
  ).join("\n");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOOLS = [
  {
    type: "function", name: "szukaj_treningi",
    description: "Semantycznie przeszukuje bazę treningów (wektorowo + tekstowo). Użyj gdy szukasz treningów po opisie lub tematyce.",
    parameters: { type: "object", properties: { zapytanie: { type: "string" } }, required: ["zapytanie"] },
  },
  {
    type: "function", name: "pobierz_treningi",
    description: "Pobiera treningi dla zakresu dat.",
    parameters: {
      type: "object",
      properties: {
        data_od: { type: "string" }, data_do: { type: "string" },
        jezdziec: { type: "string" },
      },
      required: ["data_od", "data_do"],
    },
  },
  {
    type: "function", name: "pobierz_jezdzca",
    description: "Pobiera pełny profil jeźdźca z ostatnimi 20 treningami.",
    parameters: { type: "object", properties: { imie: { type: "string" } }, required: ["imie"] },
  },
];

async function executeTool(name, args, supabase, openaiKey) {
  if (name === "szukaj_treningi") {
    if (!openaiKey) return JSON.stringify({ error: "Brak OPENAI_API_KEY" });
    const result = await hybridSearch(args.zapytanie || "", supabase, openaiKey, 10);
    return result || JSON.stringify({ info: "Brak wyników." });
  }
  if (name === "pobierz_treningi") {
    const { data_od, data_do, jezdziec } = args;
    const { data: jData } = await supabase.from("jezdzcy").select("id, imie");
    const { data: kData } = await supabase.from("konie").select("id, imie");
    const jById = Object.fromEntries((jData || []).map((r) => [r.id, r.imie]));
    const kById = Object.fromEntries((kData || []).map((r) => [r.id, r.imie]));
    let query = supabase.from("treningi").select("*").gte("data", data_od).lte("data", data_do).order("data", { ascending: false });
    if (jezdziec) {
      const id = Object.entries(jById).find(([, v]) => v.toLowerCase() === jezdziec.toLowerCase())?.[0];
      if (id) query = query.eq("jezdziec_id", id);
    }
    const { data, error } = await query;
    if (error) return JSON.stringify({ error: error.message });
    return JSON.stringify((data || []).map((r) => ({
      data: r.data, jezdziec: jById[r.jezdziec_id] || "?", kon: kById[r.kon_id] || "—",
      typ: r.typ_jazdy || "plac", grupowa: r.grupowa, cwiczenia: r.cwiczenia,
      uwagi: r.uwagi, dobrze: r.dobrze, do_poprawy: r.do_poprawy, ocena: r.ocena,
    })));
  }
  if (name === "pobierz_jezdzca") {
    const { imie } = args;
    const { data: jData } = await supabase.from("jezdzcy").select("*").ilike("imie", imie).single();
    if (!jData) return JSON.stringify({ error: `Nie znaleziono: ${imie}` });
    const { data: kData } = await supabase.from("konie").select("id, imie");
    const kById = Object.fromEntries((kData || []).map((r) => [r.id, r.imie]));
    const { data: treningi } = await supabase.from("treningi").select("*").eq("jezdziec_id", jData.id).order("data", { ascending: false }).limit(20);
    return JSON.stringify({
      imie: jData.imie, poziom: jData.poziom, jezdzi_od: jData.jezdzi_od,
      umiejetnosci: jData.umiejetnosci, do_poprawy: jData.do_poprawy,
      postawa: jData.postawa, preferencje: jData.preferencje, notatki: jData.notatki,
      ostatnie_treningi: (treningi || []).map((r) => ({
        data: r.data, kon: kById[r.kon_id] || "—", typ: r.typ_jazdy,
        cwiczenia: r.cwiczenia, uwagi: r.uwagi, dobrze: r.dobrze,
        do_poprawy: r.do_poprawy, ocena: r.ocena,
      })),
    });
  }
  return JSON.stringify({ error: `Nieznany tool: ${name}` });
}

function buildSystemPrompt(context, ragContext) {
  const dzienNazwa = new Date(context.selDay).toLocaleDateString("pl-PL", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  return `Jesteś Cwałek — wirtualny asystent stajni. Pomagasz instruktorowi jazdy konnej.

DZIEŃ: ${context.selDay} (${dzienNazwa})

TRENINGI: ${context.treningiDnia.length ? JSON.stringify(context.treningiDnia, null, 2) : "Brak."}

JEŹDŹCY: ${JSON.stringify(context.jezdzcy.map((j) => ({ imie: j.imie, poziom: j.poziom })))}

KONIE: ${JSON.stringify(context.konie.map((k) => ({ imie: k.imie, typ: k.typ })))}

Jeśli szukasz treningów po tematyce: użyj szukaj_treningi.
Jeśli potrzebujesz danych historycznych: użyj pobierz_treningi lub pobierz_jezdzca.
${ragContext ? `\n---\nPASUJĄCE WPISY Z BAZY:\n${ragContext}\n---\n` : ""}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const grokKey = Deno.env.get("GROK_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!grokKey) return new Response(JSON.stringify({ error: "Brak GROK_API_KEY" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const reqApiKey = req.headers.get("apikey") || req.headers.get("x-api-key") || "";
    if (anonKey && reqApiKey !== anonKey) {
      return new Response(JSON.stringify({ error: "Nieautoryzowany dostęp." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { messages, context } = await req.json();

    const lastUserMsg = [...(messages || [])].reverse().find((m) => m.role === "user");
    const lastUserText = typeof lastUserMsg?.content === "string" ? lastUserMsg.content : "";
    let ragContext = "";
    if (openaiKey && lastUserText) ragContext = await hybridSearch(lastUserText, supabase, openaiKey, 6);

    const systemPrompt = buildSystemPrompt(context, ragContext);
    const input = [{ role: "system", content: systemPrompt }, ...messages];

    let previousResponseId;
    let currentInput = input;
    let finalText = "";

    for (let i = 0; i < 5; i++) {
      const reqBody = { model: MODEL, input: currentInput, tools: TOOLS };
      if (previousResponseId) reqBody.previous_response_id = previousResponseId;

      const grokRes = await fetch(GROK_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${grokKey}` },
        body: JSON.stringify(reqBody),
      });
      if (!grokRes.ok) {
        const err = await grokRes.text();
        return new Response(JSON.stringify({ error: `Grok error: ${err}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const data = await grokRes.json();
      previousResponseId = data.id;
      const toolCalls = (data.output || []).filter((o) => o.type === "function_call");
      const msgOut = (data.output || []).find((o) => o.type === "message");
      if (msgOut) finalText = msgOut.content?.[0]?.text || "";
      if (toolCalls.length === 0) break;

      const toolResults = [];
      for (const tc of toolCalls) {
        const args = JSON.parse(tc.arguments || "{}");
        const result = await executeTool(tc.name, args, supabase, openaiKey);
        toolResults.push({ type: "function_call_output", call_id: tc.call_id, output: result });
      }
      currentInput = toolResults;
    }

    return new Response(JSON.stringify({ reply: finalText }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
