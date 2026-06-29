import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const AGENT_ID = "planer";
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

async function fetchRiderData(supabase: ReturnType<typeof createClient>, imie: string) {
  const { data: jData } = await supabase.from("jezdzcy").select("*").ilike("imie", `%${imie}%`).limit(1).maybeSingle();
  if (!jData) return null;
  const { data: kData } = await supabase.from("konie").select("id, imie");
  const kById = Object.fromEntries((kData || []).map((r) => [r.id, r.imie]));
  const { data: treningi } = await supabase.from("treningi").select("*").eq("jezdziec_id", jData.id).order("data", { ascending: false }).limit(30);
  return {
    imie: jData.imie,
    poziom: jData.poziom,
    jezdzi_od: jData.jezdzi_od,
    umiejetnosci: jData.umiejetnosci,
    do_poprawy: jData.do_poprawy,
    postawa: jData.postawa,
    preferencje: jData.preferencje,
    notatki: jData.notatki,
    ostatnie_treningi: (treningi || []).map((r) => ({
      data: r.data,
      kon: kById[r.kon_id] || "—",
      typ: r.typ_jazdy,
      cwiczenia: r.cwiczenia,
      uwagi: r.uwagi,
      dobrze: r.dobrze,
      do_poprawy: r.do_poprawy,
      ocena: r.ocena,
    })),
  };
}

async function fetchAllRiders(supabase: ReturnType<typeof createClient>) {
  const { data: jezdzcy } = await supabase.from("jezdzcy").select("imie, poziom, umiejetnosci, do_poprawy, preferencje").eq("aktywny", true);
  return jezdzcy || [];
}

function buildSystemPrompt() {
  return `Jesteś Planer — specjalistyczny asystent planowania treningów jeździeckich dla instruktora.

Twoje zadania:
1. Analizować historię treningów konkretnego jeźdźca
2. Tworzyć szczegółowe plany treningowe na 2–4 tygodnie
3. Dobierać ćwiczenia do poziomu, celów i obszarów do poprawy
4. Uwzględniać aspekty psychologiczne (np. lęk, motywacja)
5. Sugerować odpowiednie konie na każdą sesję

Format planu:
- Tydzień po tygodniu z konkretnymi ćwiczeniami
- Progresja trudności
- Wskazówki dla instruktora

Dostępne typy zajęć: plac, lonża, teren.
Odpowiadaj po polsku. Bądź konkretny i praktyczny — plan powinien być gotowy do użycia.

Gdy użytkownik prosi o plan, najpierw pobierz dane jeźdźca narzędziem pobierz_jezdzca, potem ułóż plan.`;
}

const TOOLS = [
  {
    type: "function",
    name: "pobierz_jezdzca",
    description: "Pobiera pełny profil jeźdźca z historią treningów.",
    parameters: {
      type: "object",
      properties: { imie: { type: "string", description: "Imię jeźdźca" } },
      required: ["imie"],
    },
  },
  {
    type: "function",
    name: "lista_jezdzców",
    description: "Zwraca listę aktywnych jeźdźców.",
    parameters: { type: "object", properties: {} },
  },
];

async function executeTool(name: string, args: Record<string, string>, supabase: ReturnType<typeof createClient>) {
  if (name === "pobierz_jezdzca") {
    const data = await fetchRiderData(supabase, args.imie || "");
    return data ? JSON.stringify(data) : JSON.stringify({ error: `Nie znaleziono jeźdźca: ${args.imie}` });
  }
  if (name === "lista_jezdzców") {
    const data = await fetchAllRiders(supabase);
    return JSON.stringify(data);
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
    if (!hasAccess) return json({ error: "Brak aktywnej subskrypcji dla Planera" }, 403);

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
