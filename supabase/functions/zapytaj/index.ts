import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

const TOOLS = [
  {
    type: "function",
    name: "pobierz_treningi",
    description: "Pobiera treningi z bazy danych dla podanego zakresu dat i opcjonalnie konkretnego jeźdźca.",
    parameters: {
      type: "object",
      properties: {
        data_od: { type: "string", description: "Data początkowa w formacie YYYY-MM-DD" },
        data_do: { type: "string", description: "Data końcowa w formacie YYYY-MM-DD" },
        jezdziec: { type: "string", description: "Imię jeźdźca (opcjonalnie)" },
      },
      required: ["data_od", "data_do"],
    },
  },
  {
    type: "function",
    name: "pobierz_jezdzca",
    description: "Pobiera pełny profil jeźdźca: poziom, umiejętności, rzeczy do poprawy, postawę, preferencje, notatki oraz ostatnie 20 treningów.",
    parameters: {
      type: "object",
      properties: {
        imie: { type: "string", description: "Imię jeźdźca" },
      },
      required: ["imie"],
    },
  },
];

async function executeTool(
  name: string,
  args: Record<string, string>,
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  if (name === "pobierz_treningi") {
    const { data_od, data_do, jezdziec } = args;
    const { data: jData } = await supabase.from("jezdzcy").select("id, imie");
    const { data: kData } = await supabase.from("konie").select("id, imie");
    const jById: Record<string, string> = Object.fromEntries((jData || []).map((r: { id: string; imie: string }) => [r.id, r.imie]));
    const kById: Record<string, string> = Object.fromEntries((kData || []).map((r: { id: string; imie: string }) => [r.id, r.imie]));

    let query = supabase.from("treningi").select("*").gte("data", data_od).lte("data", data_do).order("data", { ascending: false });
    if (jezdziec) {
      const jezdziecId = Object.entries(jById).find(([, v]) => v.toLowerCase() === jezdziec.toLowerCase())?.[0];
      if (jezdziecId) query = query.eq("jezdziec_id", jezdziecId);
    }

    const { data, error } = await query;
    if (error) return JSON.stringify({ error: error.message });

    return JSON.stringify((data || []).map((r: Record<string, unknown>) => ({
      data: r.data, jezdziec: jById[r.jezdziec_id as string] || "?",
      kon: kById[r.kon_id as string] || "—", typ: r.typ_jazdy,
      cwiczenia: r.cwiczenia, uwagi: r.uwagi, dobrze: r.dobrze,
      do_poprawy: r.do_poprawy, ocena: r.ocena,
    })));
  }

  if (name === "pobierz_jezdzca") {
    const { imie } = args;
    const { data: jData } = await supabase.from("jezdzcy").select("*").ilike("imie", imie).single();
    if (!jData) return JSON.stringify({ error: `Nie znaleziono jeźdźca: ${imie}` });

    const { data: kData } = await supabase.from("konie").select("id, imie");
    const kById: Record<string, string> = Object.fromEntries((kData || []).map((r: { id: string; imie: string }) => [r.id, r.imie]));

    const { data: treningi } = await supabase.from("treningi").select("*").eq("jezdziec_id", jData.id).order("data", { ascending: false }).limit(20);

    return JSON.stringify({
      imie: jData.imie, poziom: jData.poziom, jezdzi_od: jData.jezdzi_od,
      umiejetnosci: jData.umiejetnosci, do_poprawy: jData.do_poprawy,
      postawa: jData.postawa, preferencje: jData.preferencje, notatki: jData.notatki,
      ostatnie_treningi: (treningi || []).map((r: Record<string, unknown>) => ({
        data: r.data, kon: kById[r.kon_id as string] || "—",
        typ: r.typ_jazdy, cwiczenia: r.cwiczenia, uwagi: r.uwagi,
        dobrze: r.dobrze, do_poprawy: r.do_poprawy, ocena: r.ocena,
      })),
    });
  }

  return JSON.stringify({ error: `Nieznany tool: ${name}` });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  const apiKey = Deno.env.get("API_SECRET_KEY");
  if (!apiKey || token !== apiKey) return json({ error: "Nieautoryzowany dostęp." }, 401);

  if (req.method !== "POST") return json({ error: "Metoda niedozwolona. Użyj POST." }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: { pytanie?: string; data?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Nieprawidłowe JSON w body." }, 400);
  }

  const { pytanie, data } = body;
  if (!pytanie) return json({ error: "Pole 'pytanie' jest wymagane." }, 400);

  // Pobierz kontekst dnia
  const dzien = data || new Date().toISOString().slice(0, 10);

  const { data: jData } = await supabase.from("jezdzcy").select("id, imie, poziom");
  const { data: kData } = await supabase.from("konie").select("id, imie, typ");
  const jById: Record<string, string> = Object.fromEntries((jData || []).map((r: { id: string; imie: string }) => [r.id, r.imie]));
  const kById: Record<string, string> = Object.fromEntries((kData || []).map((r: { id: string; imie: string }) => [r.id, r.imie]));

  const { data: treningiDnia } = await supabase.from("treningi").select("*").eq("data", dzien);
  const treningiCtx = (treningiDnia || []).map((r: Record<string, unknown>) => ({
    jezdziec: jById[r.jezdziec_id as string] || "?",
    kon: kById[r.kon_id as string] || "—",
    typ: r.typ_jazdy, cwiczenia: r.cwiczenia,
    uwagi: r.uwagi, dobrze: r.dobrze, do_poprawy: r.do_poprawy, ocena: r.ocena,
  }));

  const dzienNazwa = new Date(dzien).toLocaleDateString("pl-PL", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const systemPrompt = `Jesteś Cwałek — wirtualny asystent stajni. Pomagasz instruktorowi jazdy konnej prowadzić dziennik treningów.

Twój charakter:
- Ciepły, konkretny, z nutką humoru — ale zawsze na temat
- Znasz się na jeźdźcach, koniach i ćwiczeniach
- Odpowiadasz po polsku, krótko i treściwie (2–5 zdań, chyba że prosisz o pełne podsumowanie)
- Gdy potrzebujesz danych spoza bieżącego dnia, używasz dostępnych narzędzi
- Nie wymyślasz danych — jeśli ich nie masz, mówisz wprost i proponujesz użycie narzędzia

BIEŻĄCY DZIEŃ: ${dzien} (${dzienNazwa})

TRENINGI BIEŻĄCEGO DNIA:
${treningiCtx.length ? JSON.stringify(treningiCtx, null, 2) : "Brak treningów w tym dniu."}

JEŹDŹCY (lista):
${JSON.stringify((jData || []).map((j: { imie: string; poziom?: string }) => ({ imie: j.imie, poziom: j.poziom })))}

KONIE (lista):
${JSON.stringify((kData || []).map((k: { imie: string; typ?: string }) => ({ imie: k.imie, typ: k.typ })))}

Jeśli pytanie dotyczy innego dnia lub historii, użyj narzędzi pobierz_treningi lub pobierz_jezdzca.`;

  const grokKey = Deno.env.get("GROK_API_KEY");
  if (!grokKey) return json({ error: "Brak klucza GROK_API_KEY" }, 500);

  const input: unknown[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: pytanie },
  ];

  let previousResponseId: string | undefined;
  let currentInput = input;
  let finalText = "";

  for (let i = 0; i < 5; i++) {
    const reqBody: Record<string, unknown> = { model: MODEL, input: currentInput, tools: TOOLS };
    if (previousResponseId) reqBody.previous_response_id = previousResponseId;

    const grokRes = await fetch(GROK_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${grokKey}` },
      body: JSON.stringify(reqBody),
    });

    if (!grokRes.ok) {
      const err = await grokRes.text();
      return json({ error: `Grok API error: ${err}` }, 500);
    }

    const grokData = await grokRes.json();
    previousResponseId = grokData.id;

    const toolCalls = (grokData.output || []).filter((o: { type: string }) => o.type === "function_call");
    const messageOutput = (grokData.output || []).find((o: { type: string }) => o.type === "message");

    if (messageOutput) finalText = messageOutput.content?.[0]?.text || "";
    if (toolCalls.length === 0) break;

    const toolResults: unknown[] = [];
    for (const tc of toolCalls) {
      const args = JSON.parse(tc.arguments || "{}");
      const result = await executeTool(tc.name, args, supabase);
      toolResults.push({ type: "function_call_output", call_id: tc.call_id, output: result });
    }
    currentInput = toolResults;
  }

  return json({ odpowiedz: finalText });
});
