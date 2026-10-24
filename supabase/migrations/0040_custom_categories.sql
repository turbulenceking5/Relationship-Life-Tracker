-- User-added categories, on top of the hardcoded CATEGORIES list in
-- app/js/expenses.js. Household-shared (every member can add one, and
-- every member sees all of them) -- the same taxonomy both Expenses and
-- My Statements already share, so a new category is useful to whichever
-- partner picks it, same as the hardcoded ones. `direction` mirrors
-- statements.js's CATEGORY_DIRECTION ('out' = expense, 'in' = income);
-- Expenses itself only ever offers 'out' categories (a logged expense is
-- always an outflow), so the picker there doesn't expose this column at
-- all -- it's only meaningful once a category reaches My Statements'
-- merged list. See docs/27-feature-bank-statements.md and
-- docs/04-feature-expenses.md.
create table public.custom_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  direction text not null default 'out' check (direction in ('out', 'in')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (household_id, name)
);

alter table public.custom_categories enable row level security;

create policy "custom_categories: household members"
  on public.custom_categories for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- Shared-list table, same as expenses/grocery_items/etc -- a partner
-- adding a category should show up live on the other phone's pickers.
alter publication supabase_realtime add table public.custom_categories;
