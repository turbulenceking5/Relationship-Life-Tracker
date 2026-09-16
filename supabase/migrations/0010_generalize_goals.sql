-- Generalize the wedding-only fund into a reusable "custom goal" concept
-- (name it, optionally target amount + date, track saved/spent against
-- it) so the Goals tab can hold any number of user-created goals, each
-- its own collapsible section, instead of one hardcoded wedding fund.
create table public.custom_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  target_amount numeric(12, 2),
  target_date date,
  currency text not null default 'AUD',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.custom_goals enable row level security;
create index custom_goals_household_idx on public.custom_goals (household_id, created_at);

create trigger custom_goals_set_updated_at
  before update on public.custom_goals
  for each row execute function public.set_updated_at();

create policy "custom_goals: members can manage"
  on public.custom_goals for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create table public.goal_transactions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.custom_goals(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  type text not null check (type in ('saved', 'spent')),
  title text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  transaction_date date not null default current_date,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.goal_transactions enable row level security;
create index goal_transactions_goal_idx on public.goal_transactions (goal_id, transaction_date desc);

create policy "goal_transactions: members can manage"
  on public.goal_transactions for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- Migrate any existing wedding fund data into the new generic tables
-- (safe to re-run: the join finds nothing once wedding_fund is gone).
insert into public.custom_goals (household_id, title, target_amount, target_date, currency, created_by, created_at)
select wf.household_id, 'Wedding Fund', wf.target_amount, wf.wedding_date, wf.currency,
  h.created_by, wf.updated_at
from public.wedding_fund wf
join public.households h on h.id = wf.household_id;

insert into public.goal_transactions (goal_id, household_id, type, title, amount, transaction_date, notes, created_by, created_at)
select cg.id, wt.household_id, wt.type, wt.title, wt.amount, wt.transaction_date, wt.notes, wt.created_by, wt.created_at
from public.wedding_transactions wt
join public.custom_goals cg on cg.household_id = wt.household_id and cg.title = 'Wedding Fund';

drop table public.wedding_transactions;
drop table public.wedding_fund;
