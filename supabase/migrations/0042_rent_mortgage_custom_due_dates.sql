-- Some periods don't land on a fixed day-count interval -- e.g.
-- BrackenRidge rent is actually credited on the 15th and the 30th of
-- each month (the agent's own fixed processing dates), which drifts
-- under a rolling N-day interval since months aren't all the same
-- length. due_days_of_month stores an explicit, sorted list of
-- calendar days instead; when set, "Mark as paid" rolls to the next
-- listed day (wrapping into next month, clamped to that month's last
-- day) rather than adding interval_days. Exactly one of interval_days/
-- due_days_of_month is ever populated per row -- interval_days is
-- relaxed to nullable so a dates-mode row can leave it unset instead of
-- carrying a stale, unused number.
alter table public.rent_payments add column due_days_of_month smallint[];
alter table public.mortgage_payments add column due_days_of_month smallint[];

alter table public.rent_payments alter column interval_days drop not null;
alter table public.mortgage_payments alter column interval_days drop not null;

alter table public.rent_payments drop constraint rent_payments_interval_days_check;
alter table public.rent_payments add constraint rent_payments_interval_days_check
  check (interval_days is null or interval_days > 0);

alter table public.rent_payments add constraint rent_payments_cadence_check
  check (interval_days is not null or due_days_of_month is not null);
alter table public.mortgage_payments add constraint mortgage_payments_cadence_check
  check (interval_days is not null or due_days_of_month is not null);
