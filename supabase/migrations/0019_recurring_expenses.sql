-- Recurring expenses (subscriptions, insurance, anything that repeats on
-- a schedule) auto-log a new `expenses` row each period instead of being
-- re-entered by hand every time. Mirrors the rent_payments/
-- mortgage_payments rolling-period shape (a due date + an interval), but
-- unlike those there's no user "mark as done" action to advance it -- a
-- recurring expense should log itself with no one having to remember to
-- open the app -- so a pg_cron job drives it server-side instead of a
-- client action.
create table public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'AUD',
  category text,
  paid_by uuid references auth.users(id),
  interval_days integer not null default 30 check (interval_days > 0),
  next_due_date date not null,
  notes text,
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recurring_expenses enable row level security;
create index recurring_expenses_household_idx on public.recurring_expenses (household_id, next_due_date);

create trigger recurring_expenses_set_updated_at
  before update on public.recurring_expenses
  for each row execute function public.set_updated_at();

create policy "recurring_expenses: members can manage"
  on public.recurring_expenses for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- Logs one `expenses` row per period that's come due (looping, so a
-- template that was paused for a while or a missed cron run still gets
-- every skipped period logged rather than silently losing them), then
-- advances next_due_date past today. SECURITY DEFINER with a fixed
-- search_path since it runs unattended via pg_cron, not a signed-in user.
create or replace function public.process_recurring_expenses()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  next_date date;
begin
  for r in select * from public.recurring_expenses where active and next_due_date <= current_date loop
    next_date := r.next_due_date;
    while next_date <= current_date loop
      insert into public.expenses (household_id, title, amount, currency, category, paid_by, expense_date, notes, created_by)
      values (r.household_id, r.title, r.amount, r.currency, r.category, r.paid_by, next_date, r.notes, r.created_by);
      next_date := next_date + r.interval_days;
    end loop;
    update public.recurring_expenses set next_due_date = next_date where id = r.id;
  end loop;
end;
$$;

revoke execute on function public.process_recurring_expenses() from public, anon, authenticated;
grant execute on function public.process_recurring_expenses() to service_role, postgres;

-- Runs daily at the same time as the due-item notification check (see
-- 0005_localize_australia.sql for why 22:00 UTC = 08:00 Australia/
-- Brisbane year-round). Pure SQL, so unlike notify-due-items this needs
-- no HTTP call or shared secret.
select cron.schedule(
  'process-recurring-expenses-daily',
  '0 22 * * *',
  $$select public.process_recurring_expenses();$$
);
