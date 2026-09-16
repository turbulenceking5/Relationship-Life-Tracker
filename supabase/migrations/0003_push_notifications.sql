-- Push notification infrastructure for replacement/repayment due-date
-- reminders (Phase 2). See docs/11-push-notifications.md for the full
-- design, including why secrets are stored in Vault rather than committed
-- here or set as plain edge function env vars.

create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table public.replacement_items add column last_notified_date date;
alter table public.repayments add column last_notified_date date;

-- One row per browser/device push subscription. A user can have several
-- (phone + another device); household_id is denormalized here purely so
-- the notify-due-items edge function can look up "who to notify for this
-- household" in one query without joining through household_members.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
create index push_subscriptions_household_idx on public.push_subscriptions (household_id);

create policy "push_subscriptions: user manages own"
  on public.push_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_household_member(household_id));

-- Lets the notify-due-items edge function (using its auto-injected
-- service-role key) read the VAPID keypair and the cron shared secret out
-- of Vault. Restricted to service_role only — no client, including a
-- signed-in user, can call this.
create or replace function public.get_edge_secrets()
returns table (vapid_public_key text, vapid_private_key text, vapid_subject text, cron_secret text)
language sql
security definer
set search_path = public, vault
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public_key'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private_key'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_subject'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret');
$$;

revoke execute on function public.get_edge_secrets() from public, anon, authenticated;
grant execute on function public.get_edge_secrets() to service_role;
