import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Auth
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json({ error: "Brak tokenu autoryzacji" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return json({ error: "Nieautoryzowany" }, 401);

    // Body
    const { agent_id } = await req.json();

    const PRICE_IDS: Record<string, string | undefined> = {
      planer: Deno.env.get("STRIPE_PRICE_PLANER"),
      analityk: Deno.env.get("STRIPE_PRICE_ANALITYK"),
      raport: Deno.env.get("STRIPE_PRICE_RAPORT"),
    };

    const priceId = PRICE_IDS[agent_id];
    if (!priceId) return json({ error: `Nieznany agent lub brak price ID: ${agent_id}` }, 400);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2024-04-10",
    });

    // Pobierz lub utwórz Stripe Customer
    let stripeCustomerId: string;
    const { data: existing } = await supabase
      .from("stripe_customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing?.stripe_customer_id) {
      stripeCustomerId = existing.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      });
      stripeCustomerId = customer.id;
      await supabase.from("stripe_customers").insert({
        user_id: user.id,
        stripe_customer_id: stripeCustomerId,
      });
    }

    // URL bazowy — nagłówek origin lub fallback
    const origin = req.headers.get("origin") || "https://dziennik-instruktora.vercel.app";

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}?payment=success&agent=${agent_id}`,
      cancel_url: `${origin}?payment=cancel&agent=${agent_id}`,
      subscription_data: {
        metadata: { user_id: user.id, agent_id },
      },
    });

    return json({ url: session.url });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
