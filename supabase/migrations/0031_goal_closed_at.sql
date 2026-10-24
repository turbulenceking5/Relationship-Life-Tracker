-- Lets a goal be finished/closed by hand, independent of whether its
-- target was ever hit -- a goal with no target_amount (just a plain
-- checklist-style goal) had no way to be marked done at all before this,
-- and even a goal with a target stays open forever once reached unless
-- someone deletes it outright (losing its history). Nullable timestamp
-- rather than a boolean so "closed on" has a date to show, same
-- reasoning as events.completed_occurrence.
alter table public.custom_goals add column closed_at timestamptz;
