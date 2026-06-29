# Konfiguracja Stripe — Dziennik Instruktora

## 1. Uruchom migrację SQL w Supabase

SQL Editor → New query → wklej zawartość `supabase/migrations/002_subscriptions.sql` → Run

---

## 2. Utwórz produkty w Stripe Dashboard

Wejdź na https://dashboard.stripe.com → Products → Add product

| Produkt             | Cena    | Interwał  | Waluta |
|---------------------|---------|-----------|--------|
| Planer treningów    | 9,00    | monthly   | PLN    |
| Analityk postępów   | 9,00    | monthly   | PLN    |
| Raport miesięczny   | 12,00   | monthly   | PLN    |

Zapisz **Price ID** każdego produktu (wyglądają jak `price_1Abc...`).

---

## 3. Dodaj zmienne środowiskowe w Supabase

Supabase → Project Settings → Edge Functions → Secrets → Add secret

| Nazwa                    | Wartość                              |
|--------------------------|--------------------------------------|
| `STRIPE_SECRET_KEY`      | `sk_live_...` (ze Stripe → API keys) |
| `STRIPE_WEBHOOK_SECRET`  | uzupełnisz po kroku 4                |
| `STRIPE_PRICE_PLANER`    | `price_...` (Planer treningów)       |
| `STRIPE_PRICE_ANALITYK`  | `price_...` (Analityk postępów)      |
| `STRIPE_PRICE_RAPORT`    | `price_...` (Raport miesięczny)      |

---

## 4. Skonfiguruj Stripe Webhook

Stripe Dashboard → Developers → Webhooks → Add endpoint

- **URL:** `https://asxvphinpnhjfrqibfka.supabase.co/functions/v1/stripe-webhook`
- **Events do nasłuchiwania:**
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

Po utworzeniu → skopiuj **Signing secret** (`whsec_...`) → wklej jako `STRIPE_WEBHOOK_SECRET` w Supabase.

---

## 5. Deploy Edge Functions

```bash
cd deploy
supabase functions deploy create-checkout
supabase functions deploy stripe-webhook
supabase functions deploy planer-treningow
supabase functions deploy analityk-postepu
supabase functions deploy raport-miesieczny
```

Lub przez Supabase Dashboard → Edge Functions → Deploy.

---

## 6. Testowanie

1. Zaloguj się do aplikacji
2. Kliknij zakładkę ✨ Agenci
3. Kliknij „Subskrybuj" przy dowolnym agencie
4. Użyj karty testowej Stripe: `4242 4242 4242 4242`, data: `12/34`, CVV: `123`
5. Po przekierowaniu z powrotem — agent powinien być odblokowany

---

## Klucze testowe vs produkcyjne

- Do testów używaj `sk_test_...` i `price_...` z trybu testowego Stripe
- Na produkcję przełącz na `sk_live_...`
