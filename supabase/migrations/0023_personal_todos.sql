-- Personal to-do list: private per-user reminders, invisible to the other
-- household member (unlike every other table, which is shared across the
-- household). Each row is a prompt ("what it says"), a date+time to send
-- it as a push notification, and an optional repeat frequency. See
-- docs/20-feature-personal-todos.md.
create table public.personal_todos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null,
  remind_date date not null,
  remind_time time not null default '09:00',
  repeat_frequency text not null default 'none' check (repeat_frequency in ('none', 'daily', 'weekly', 'monthly')),
  is_done boolean not null default false,
  last_notified_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.personal_todos enable row level security;
create index personal_todos_user_idx on public.personal_todos (user_id);

create trigger personal_todos_set_updated_at
  before update on public.personal_todos
  for each row execute function public.set_updated_at();

-- Private to the owner, not shared with the rest of the household like
-- every other table — still gated on household membership too, purely so
-- a household_id can't be forged to point at a household the user isn't
-- actually in.
create policy "personal_todos: owner only"
  on public.personal_todos for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_household_member(household_id));
