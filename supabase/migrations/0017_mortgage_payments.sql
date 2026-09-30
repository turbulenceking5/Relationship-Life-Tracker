-- Mirrors rent_payments exactly (same rolling-period shape: a due period,
-- "mark as paid" both closes it out and auto-creates the next one), but
-- for the outgoing mortgage payment on the same investment property
-- rather than the incoming rent. Kept as its own table rather than a
-- signed-amount column on rent_payments so each stays a simple due/paid
-- list — a household member checks off "did I pay the mortgage this
-- month" the same one-tap way they check off "did the rent come in,"
-- without the two being coupled to the same period or amount.
create table public.mortgage_payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  property_label text,
  due_date date not null,
  amount numeric(12, 2) not null,
  currency text not null default 'AUD',
  interval_days integer not null default 30,
  paid boolean not null default false,
  paid_date date,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mortgage_payments enable row level security;
create index mortgage_payments_household_idx on public.mortgage_payments (household_id, due_date);

create trigger mortgage_payments_set_updated_at
  before update on public.mortgage_payments
  for each row execute function public.set_updated_at();

create policy "mortgage_payments: members can manage"
  on public.mortgage_payments for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
