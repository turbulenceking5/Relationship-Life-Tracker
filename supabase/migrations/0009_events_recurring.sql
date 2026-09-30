-- Birthdays/anniversaries stored with their real historical date (e.g.
-- actual birth year) need to recur every year on that month/day, not sit
-- in "Past" forever once that literal date has gone by. event_date stays
-- the original/historical date for reference; the app computes each
-- recurring event's next occurrence at render time (see nextOccurrence()
-- in app/js/format.js) rather than storing a separate "next date" column
-- that would need upkeep.
alter table public.events add column recurring boolean not null default false;
