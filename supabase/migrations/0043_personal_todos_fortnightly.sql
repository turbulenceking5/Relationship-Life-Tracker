-- Adds 'fortnightly' as a repeat_frequency option for personal_todos,
-- matching the option events.js already offers for recurring events (see
-- REPEAT_OPTIONS in app/js/events.js). The client (app/js/personal-todos.js)
-- and notify-due-items (supabase/functions/notify-due-items/index.ts) both
-- already know how to advance a 'fortnightly' row (+14 days, same addDays/
-- addDaysUTC helper used for 'weekly') -- this migration only needed to
-- catch up the check constraint that was still rejecting the value.
alter table public.personal_todos drop constraint personal_todos_repeat_frequency_check;
alter table public.personal_todos add constraint personal_todos_repeat_frequency_check
  check (repeat_frequency in ('none', 'daily', 'weekly', 'fortnightly', 'monthly'));
