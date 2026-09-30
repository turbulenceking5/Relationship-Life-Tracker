-- Generalizes events.recurring from "yearly only" (birthdays/
-- anniversaries) to a chosen cadence, so a repeating event can also be
-- weekly, fortnightly, or monthly (e.g. a standing appointment or chore
-- reminder), not just an annual one. `recurring` still means "does this
-- event repeat at all"; `recurring_interval` picks which cadence. Left
-- non-null (default 'yearly') even on non-recurring rows rather than
-- adding a cross-column check constraint -- the app only reads it when
-- recurring = true, so a stray default on a non-recurring row is
-- harmless and this needs no backfill for existing rows.
alter table public.events add column recurring_interval text not null default 'yearly'
  check (recurring_interval in ('weekly', 'fortnightly', 'monthly', 'yearly'));
