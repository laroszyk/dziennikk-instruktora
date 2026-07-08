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

async function generateEmbedding(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return json({ error: "Brak OPENAI_API_KEY" }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { id } = await req.json();
    if (!id) return json({ error: "Pole 'id' jest wymagane." }, 400);

    // Pobierz wpis treningowy
    const { data: trening, error } = await supabase
      .from("treningi")
      .select("id, uwagi, cwiczenia, dobrze, do_poprawy")
      .eq("id", id)
      .single();

    if (error || !trening) return json({ error: "Nie znaleziono wpisu." }, 404);

    // Zbuduj tekst do embeddowania
    const parts = [
      trening.uwagi,
      Array.isArray(trening.cwiczenia) ? trening.cwiczenia.join(" ") : "",
      trening.dobrze,
      trening.do_poprawy,
    ].filter(Boolean);

    const text = parts.join(" ").trim();

    if (!text) return json({ skipped: true, reason: "Brak tekstu do embeddowania." });

    const embedding = await generateEmbedding(text, openaiKey);
    if (!embedding) return json({ error: "Nie udało się wygenerować embeddingu." }, 500);

    // Zapisz embedding
    const { error: updateError } = await supabase
      .from("treningi")
      .update({ embedding })
      .eq("id", id);

    if (updateError) return json({ error: updateError.message }, 500);

    return json({ ok: true, id, dimensions: embedding.length });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
