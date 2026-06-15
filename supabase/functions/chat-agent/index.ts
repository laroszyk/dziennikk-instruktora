import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GROK_API_URL = "https://api.x.ai/v1/responses";
const MODEL = "grok-4.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ===== Tools =====

const TOOLS = [
  {
    type: "function",
    name: "pobierz_treningi",
    description: "Pobiera treningi z bazy danych dla podanego zakresu dat i opcjonalnie konkretnego jeźdźca. Użyj gdy potrzebujesz danych historycznych spoza bieżącego dnia.",
    parameters: {
      type: "object",
      properties: {
        data_od: { type: "string", description: "Data początkowa w formacie YYYY-MM-DD" },
        data_do: { type: "string", description: "Data końcowa w formacie YYYY-MM-DD" },
        jezdziec: { type: "string", description: "Imię jeźdźca (opcjonalnie, filtruje wyniki)" },
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

// ===== Tool execution =====

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

    let query = supabase
      .from("treningi")
      .select("*")
      .gte("data", data_od)
      .lte("data", data_do)
      .order("data", { ascending: false });

    if (jezdziec) {
      const jezdziecId = Object.entries(jById).find(([, v]) => v.toLowerCase() === jezdziec.toLowerCase())?.[0];
      if (jezdziecId) query = query.eq("jezdziec_id", jezdziecId);
    }

    const { data, error } = await query;
    if (error) return JSON.stringify({ error: error.message });

    const result = (data || []).map((r: Record<string, unknown>) => ({
      data: r.data,
      jezdziec: jById[r.jezdziec_id as string] || "?",
      kon: kById[r.kon_id as string] || "—",
      typ: r.typ_jazdy || "plac",
      grupowa: r.grupowa,
      cwiczenia: r.cwiczenia,
      uwagi: r.uwagi,
      dobrze: r.dobrze,
      do_poprawy: r.do_poprawy,
      ocena: r.ocena,
    }));

    return JSON.stringify(result);
  }

  if (name === "pobierz_jezdzca") {
    const { imie } = args;

    const { data: jData } = await supabase
      .from("jezdzcy")
      .select("*")
      .ilike("imie", imie)
      .single();

    if (!jData) return JSON.stringify({ error: `Nie znaleziono jeźdźca: ${imie}` });

    const { data: kData } = await supabase.from("konie").select("id, imie");
    const kById: Record<string, string> = Object.fromEntries((kData || []).map((r: { id: string; imie: string }) => [r.id, r.imie]));

    const { data: treningi } = await supabase
      .from("treningi")
      .select("*")
      .eq("jezdziec_id", jData.id)
      .order("data", { ascending: false })
      .limit(20);

    return JSON.stringify({
      imie: jData.imie,
      poziom: jData.poziom,
      jezdzi_od: jData.jezdzi_od,
      umiejetnosci: jData.umiejetnosci,
      do_poprawy: jData.do_poprawy,
      postawa: jData.postawa,
      preferencje: jData.preferencje,
      notatki: jData.notatki,
      ostatnie_treningi: (treningi || []).map((r: Record<string, unknown>) => ({
        data: r.data,
        kon: kById[r.kon_id as string] || "—",
        typ: r.typ_jazdy,
        cwiczenia: r.cwiczenia,
        uwagi: r.uwagi,
        dobrze: r.dobrze,
        do_poprawy: r.do_poprawy,
        ocena: r.ocena,
      })),
    });
  }

  return JSON.stringify({ error: `Nieznany tool: ${name}` });
}

// ===== System prompt =====

function buildSystemPrompt(context: {
  selDay: string;
  treningiDnia: unknown[];
  jezdzcy: unknown[];
  konie: unknown[];
}): string {
  const dzienNazwa = new Date(context.selDay).toLocaleDateString("pl-PL", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return `Jesteś Cwałek — wirtualny asystent stajni. Pomagasz instruktorowi jazdy konnej prowadzić dziennik treningów.

Twój charakter:
- Ciepły, konkretny, z nutką humoru — ale zawsze na temat
- Znasz się na jeźdźcach, koniach i ćwiczeniach
- Odpowiadasz po polsku, krótko i treściwie (2–5 zdań, chyba że prosisz o pełne podsumowanie)
- Gdy potrzebujesz danych spoza bieżącego dnia, używasz dostępnych narzędzi
- Nie wymyślasz danych — jeśli ich nie masz, mówisz wprost i proponujesz użycie narzędzia

BIEŻĄCY DZIEŃ: ${context.selDay} (${dzienNazwa})

TRENINGI BIEŻĄCEGO DNIA:
${context.treningiDnia.length
  ? JSON.stringify(context.treningiDnia, null, 2)
  : "Brak treningów w tym dniu."}

JEŹDŹCY (lista):
${JSON.stringify((context.jezdzcy as Array<{ imie?: string; poziom?: string }>).map(j => ({ imie: (j as { imie?: string }).imie, poziom: (j as { poziom?: string }).poziom })))}

KONIE (lista):
${JSON.stringify((context.konie as Array<{ imie?: string; typ?: string }>).map(k => ({ imie: (k as { imie?: string }).imie, typ: (k as { typ?: string }).typ })))}

Jeśli pytanie dotyczy innego dnia lub historii, użyj narzędzi pobierz_treningi lub pobierz_jezdzca.

---
PRZYKŁADY (few-shot) — tak właśnie odpowiadasz:

Przykład 1 — ocena bieżącego dnia:
User: "Jak poszło dziś Kasi?"
Cwałek: "Kasia dziś solidnie — ocena 4/5. Pracowała nad anglezowaniem w rytmie, koń szedł równo. Do poprawy zostaje jeszcze praca łydką przy zakrętach. Dobry trening! 🐴"

Przykład 2 — analiza postępów (wymaga danych historycznych → tool call):
User: "Czy Marta robi postępy?"
Cwałek: [wywołuje pobierz_treningi lub pobierz_jezdzca] → "Marta w ostatnim miesiącu miała 6 treningów — oceny wahają się od 2 do 4. Widać wyraźny postęp w galopie, ale równowaga w kłusie nadal kuleje. Proponuję więcej ćwiczeń bez strzemion. 💪"

Przykład 3 — propozycja ćwiczeń:
User: "Co zaproponować Kubie na następny trening?"
Cwałek: "Kuba ostatnio dobrze reagował na lonżę — warto to ciągnąć. Proponuję: koła 20 m w kłusie bez strzemion, potem przejścia kłus–galop. Cel: lepsza równowaga i pewność siedzenia. 🎯"
---`;
}

// ===== Main handler =====

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const grokKey = Deno.env.get("GROK_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!grokKey) {
      return new Response(JSON.stringify({ error: "Brak klucza GROK_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();
    const { messages, context } = body;

    const systemPrompt = buildSystemPrompt(context);

    const input: unknown[] = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    let previousResponseId: string | undefined;
    let currentInput = input;
    let finalText = "";

    for (let i = 0; i < 5; i++) {
      const reqBody: Record<string, unknown> = {
        model: MODEL,
        input: currentInput,
        tools: TOOLS,
      };
      if (previousResponseId) {
        reqBody.previous_response_id = previousResponseId;
      }

      const grokRes = await fetch(GROK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${grokKey}`,
        },
        body: JSON.stringify(reqBody),
      });

      if (!grokRes.ok) {
        const err = await grokRes.text();
        return new Response(JSON.stringify({ error: `Grok API error: ${err}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await grokRes.json();
      previousResponseId = data.id;

      const toolCalls = (data.output || []).filter((o: { type: string }) => o.type === "function_call");
      const messageOutput = (data.output || []).find((o: { type: string }) => o.type === "message");

      if (messageOutput) {
        finalText = messageOutput.content?.[0]?.text || "";
      }

      if (toolCalls.length === 0) break;

      const toolResults: unknown[] = [];
      for (const tc of toolCalls) {
        const args = JSON.parse(tc.arguments || "{}");
        const result = await executeTool(tc.name, args, supabase);
        toolResults.push({
          type: "function_call_output",
          call_id: tc.call_id,
          output: result,
        });
      }

      currentInput = toolResults;
    }

    return new Response(JSON.stringify({ reply: finalText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
