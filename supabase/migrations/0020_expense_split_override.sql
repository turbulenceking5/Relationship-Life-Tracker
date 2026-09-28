-- Per-expense split override. household_members.split_percent is the
-- household-wide default ("who owes who" for shared expenses in
-- general); this lets a single expense use a different split instead
-- (e.g. a mostly-one-person purchase logged 50/50 by default, but "I
-- bought myself a gift" logged 100/0). Keyed to a specific user (not
-- "first member") so it stays unambiguous regardless of member query
-- order, and both columns are null unless explicitly overridden -- an
-- expense left at the default keeps tracking the household setting even
-- if that setting changes later, rather than freezing in the value that
-- happened to be the default at the time it was logged.
alter table public.expenses add column split_percent numeric(5, 2) check (split_percent is null or (split_percent >= 0 and split_percent <= 100));
alter table public.expenses add column split_percent_user_id uuid references auth.users(id);
