create table if not exists stripe_customers (
  user_id uuid references auth.users(id) on delete cascade primary key,
  stripe_customer_id text unique not null,
  created_at timestamptz default now()
);

alter table stripe_customers enable row level security;
create policy "users_own_customer" on stripe_customers
  for select to authenticated using (auth.uid() = user_id);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  agent_id text not null check (agent_id in ('planer','analityk','raport')),
  stripe_subscription_id text unique,
  stripe_price_id text,
  status text not null default 'inactive',
  current_period_end timestamptz,
  cancel_at_period_end boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, agent_id)
);

alter table subscriptions enable row level security;

create policy "users_own_subscriptions_select" on subscriptions
  for select to authenticated using (auth.uid() = user_id);

create policy "service_manage_subscriptions" on subscriptions
  for all to service_role using (true) with check (true);
