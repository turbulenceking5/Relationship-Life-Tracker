-- Rent income ledger for an investment property: one row per period.
-- "Mark as received" (in the app) sets paid/paid_date and inserts the
-- next period's row automatically, so there's always an upcoming row to
-- answer "has this month been paid yet?".
create table public.rent_payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  property_label text,
  due_date date not null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'AUD',
  paid boolean not null default false,
  paid_date date,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rent_payments enable row level security;
create index rent_payments_household_idx on public.rent_payments (household_id, due_date);

create trigger rent_payments_set_updated_at
  before update on public.rent_payments
  for each row execute function public.set_updated_at();

create policy "rent_payments: members can manage"
  on public.rent_payments for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- Wedding fund: one settings row per household (target + date), plus a
-- transaction log of money saved toward it and money spent on the
-- wedding itself, kept separate so "saved so far" and "spent so far" can
-- both be shown against the target.
create table public.wedding_fund (
  household_id uuid primary key references public.households(id) on delete cascade,
  wedding_date date,
  target_amount numeric(12, 2),
  currency text not null default 'AUD',
  updated_at timestamptz not null default now()
);

alter table public.wedding_fund enable row level security;

create trigger wedding_fund_set_updated_at
  before update on public.wedding_fund
  for each row execute function public.set_updated_at();

create policy "wedding_fund: members can manage"
  on public.wedding_fund for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create table public.wedding_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  type text not null check (type in ('saved', 'spent')),
  title text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  transaction_date date not null default current_date,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.wedding_transactions enable row level security;
create index wedding_transactions_household_idx on public.wedding_transactions (household_id, transaction_date desc);

create policy "wedding_transactions: members can manage"
  on public.wedding_transactions for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
