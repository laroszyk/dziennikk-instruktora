import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Brak stripe-signature", { status: 400 });

  const body = await req.text();

  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!stripeSecretKey || !webhookSecret) {
      console.error("Brak STRIPE_SECRET_KEY lub STRIPE_WEBHOOK_SECRET w env");
      return new Response("Konfiguracja serwera: brak kluczy Stripe", { status: 500 });
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-04-10" });

    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret
    );

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated"
    ) {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id;
      const agentId = sub.metadata?.agent_id;

      if (!userId || !agentId) {
        console.warn("Brak user_id lub agent_id w metadata subskrypcji:", sub.id);
        return new Response("Missing metadata", { status: 400 });
      }

      const { error } = await supabase.from("subscriptions").upsert({
        user_id: userId,
        agent_id: agentId,
        stripe_subscription_id: sub.id,
        stripe_price_id: sub.items.data[0]?.price.id ?? null,
        status: sub.status,
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        cancel_at_period_end: sub.cancel_at_period_end,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,agent_id" });

      if (error) console.error("Błąd upsert subskrypcji:", error);
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id;
      const agentId = sub.metadata?.agent_id;

      if (userId && agentId) {
        await supabase.from("subscriptions").upsert({
          user_id: userId,
          agent_id: agentId,
          stripe_subscription_id: sub.id,
          status: "canceled",
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,agent_id" });
      }
    }

    return new Response("ok");
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(String(err), { status: 400 });
  }
});
