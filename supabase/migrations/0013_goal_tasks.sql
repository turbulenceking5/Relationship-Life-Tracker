-- Checklist items within a goal ("book venue", "get quotes") — separate
-- from goal_transactions (which is money), so a goal can track both a
-- savings/spend ledger and a to-do list toward the same target.
create table public.goal_tasks (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.custom_goals(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.goal_tasks enable row level security;
create index goal_tasks_goal_idx on public.goal_tasks (goal_id, created_at);

create policy "goal_tasks: members can manage"
  on public.goal_tasks for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
