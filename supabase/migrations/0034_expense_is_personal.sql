-- A "personal, not split" toggle on an expense -- distinct from the
-- existing per-expense split override (split_percent/
-- split_percent_user_id), which still splits the expense just at a
-- different ratio. is_personal excludes the expense from the "who owes
-- who" balance entirely: logged for the payer's own record (still
-- counts toward "This month" totals/category breakdown), but never
-- loads the shared balance and never needs a split entered at all.
alter table public.expenses add column is_personal boolean not null default false;
