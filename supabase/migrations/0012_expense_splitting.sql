-- "Who owes who" expense splitting: each household member has a
-- split_percent (how much of shared expenses they're responsible for,
-- not necessarily 50/50), and settlements record actual balancing
-- payments between members so the running balance can be reduced to
-- zero without touching the expenses log itself.
alter table public.household_members
  add column split_percent numeric(5, 2) not null default 50
  check (split_percent >= 0 and split_percent <= 100);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  from_user uuid not null references auth.users(id),
  to_user uuid not null references auth.users(id),
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'AUD',
  settlement_date date not null default current_date,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.settlements enable row level security;
create index settlements_household_idx on public.settlements (household_id, settlement_date desc);

create policy "settlements: members can manage"
  on public.settlements for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
