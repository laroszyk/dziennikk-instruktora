import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const AGENT_ID = "raport";
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
  const teraz = new Date();
  const miesiac = teraz.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
  return `Jesteś Raportysta — specjalistyczny asystent do generowania miesięcznych raportów działalności stajni.

Dzisiaj: ${teraz.toISOString().slice(0, 10)} (${miesiac})

Twoje zadania:
1. Generować kompleksowe raporty miesięczne
2. Analizować obciążenie koni i aktywność jeźdźców
3. Podsumowywać osiągnięcia i wyzwania miesiąca
4. Dawać rekomendacje na kolejny miesiąc

Format raportu:
## Raport za [miesiąc]
### Podsumowanie
- Łączna liczba treningów / jeźdźców / koni
### Aktywność jeźdźców
- Tabela: imię | liczba treningów | średnia ocena | regularność
### Obciążenie koni
- Tabela: koń | liczba treningów | jeźdźcy
### Highlights miesiąca
### Wyzwania i obszary do uwagi
### Rekomendacje na kolejny miesiąc

Odpowiadaj po polsku. Raport powinien być gotowy do skopiowania i wysłania.

Gdy prosisz o raport, użyj narzędzia pobierz_dane_miesiaca żeby pobrać dane.`;
}

const TOOLS = [
  {
    type: "function",
    name: "pobierz_dane_miesiaca",
    description: "Pobiera wszystkie treningi z danego miesiąca wraz z danymi jeźdźców i koni.",
    parameters: {
      type: "object",
      properties: {
        rok: { type: "number", description: "Rok (np. 2026)" },
        miesiac: { type: "number", description: "Miesiąc 1-12" },
      },
      required: ["rok", "miesiac"],
    },
  },
];

async function executeTool(name: string, args: Record<string, number>, supabase: ReturnType<typeof createClient>) {
  if (name === "pobierz_dane_miesiaca") {
    const { rok, miesiac } = args;
    const od = `${rok}-${String(miesiac).padStart(2, "0")}-01`;
    const nastepny = miesiac === 12 ? `${rok + 1}-01-01` : `${rok}-${String(miesiac + 1).padStart(2, "0")}-01`;

    const [jezdzcy, konie, treningi] = await Promise.all([
      supabase.from("jezdzcy").select("id, imie, poziom").eq("aktywny", true),
      supabase.from("konie").select("id, imie"),
      supabase.from("treningi").select("*").gte("data", od).lt("data", nastepny).order("data"),
    ]);

    const jById = Object.fromEntries((jezdzcy.data || []).map((r) => [r.id, { imie: r.imie, poziom: r.poziom }]));
    const kById = Object.fromEntries((konie.data || []).map((r) => [r.id, r.imie]));

    const treningiMapped = (treningi.data || []).map((r) => ({
      data: r.data,
      jezdziec: jById[r.jezdziec_id]?.imie || "?",
      kon: kById[r.kon_id] || "—",
      typ: r.typ_jazdy,
      grupowa: r.grupowa,
      cwiczenia: r.cwiczenia,
      dobrze: r.dobrze,
      do_poprawy: r.do_poprawy,
      ocena: r.ocena,
    }));

    return JSON.stringify({
      okres: `${od} — ${nastepny}`,
      lacznie_treningow: treningiMapped.length,
      jezdzcy: jezdzcy.data?.map((j) => j.imie) || [],
      konie: konie.data?.map((k) => k.imie) || [],
      treningi: treningiMapped,
    });
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
    if (!hasAccess) return json({ error: "Brak aktywnej subskrypcji dla Raportu miesięcznego" }, 403);

    const grokKey = Deno.env.get("GROK_API_KEY");
    if (!grokKey) return json({ error: "Brak GROK_API_KEY" }, 500);

    const { messages } = await req.json();

    // Jeśli to pierwsza wiadomość — auto-generuj raport bieżącego miesiąca
    const userMessages = (messages || []).filter((m: { role: string }) => m.role === "user");
    let inputMessages = [...(messages || [])];
    if (userMessages.length === 0) {
      const teraz = new Date();
      inputMessages = [{
        role: "user",
        content: `Wygeneruj raport za ${teraz.toLocaleDateString("pl-PL", { month: "long", year: "numeric" })} (rok ${teraz.getFullYear()}, miesiąc ${teraz.getMonth() + 1}).`,
      }];
    }

    const input = [{ role: "system", content: buildSystemPrompt() }, ...inputMessages];
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
