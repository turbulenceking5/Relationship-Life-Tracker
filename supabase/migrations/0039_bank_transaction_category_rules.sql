-- Learned merchant -> category rules: when you manually categorize a
-- bank transaction the static CATEGORY_KEYWORDS list (app/js/
-- statements.js) didn't recognize, that pick is remembered per-merchant
-- so the next transaction from the same merchant auto-categorizes too,
-- instead of landing in "Needs review" every single time. Private to
-- the user who made the pick, same shape as bank_statements/
-- bank_transactions (0038_bank_statements_private.sql) and
-- personal_todos — see docs/27-feature-bank-statements.md.
create table public.bank_transaction_category_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_key text not null,
  category text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, merchant_key)
);

alter table public.bank_transaction_category_rules enable row level security;
create index bank_transaction_category_rules_user_idx on public.bank_transaction_category_rules (user_id);

create trigger bank_transaction_category_rules_set_updated_at
  before update on public.bank_transaction_category_rules
  for each row execute function public.set_updated_at();

-- Owner-only, same shape as bank_statements/bank_transactions and
-- personal_todos — also gated on household membership purely so
-- household_id can't be forged to point at a household the user isn't
-- actually in; the real access boundary is user_id.
create policy "bank_transaction_category_rules: owner only"
  on public.bank_transaction_category_rules for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_household_member(household_id));

-- Not added to supabase_realtime: private per-user data, no partner to
-- sync to (same reasoning as 0038).
