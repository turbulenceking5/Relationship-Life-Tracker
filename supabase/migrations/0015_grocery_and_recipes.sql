-- Two new Money-tab segments: a shared grocery list (simple checklist,
-- same shape as goal_tasks) and a recipe box. Ingredients/instructions
-- are stored as plain text[] columns on recipes rather than their own
-- join tables — each recipe just needs two ordered lists of lines with
-- no per-item metadata (no checkbox, no quantity column), so an array
-- column captures both the content and the order without the extra
-- table/RLS/CRUD overhead a real subtable would add.
create table public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  quantity text,
  is_done boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.grocery_items enable row level security;
create index grocery_items_household_idx on public.grocery_items (household_id, created_at);

create policy "grocery_items: members can manage"
  on public.grocery_items for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  ingredients text[] not null default '{}',
  instructions text[] not null default '{}',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recipes enable row level security;
create index recipes_household_idx on public.recipes (household_id, title);

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

create policy "recipes: members can manage"
  on public.recipes for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
