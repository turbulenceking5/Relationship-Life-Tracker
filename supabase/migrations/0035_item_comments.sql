-- Comment thread on an expense or event -- a running back-and-forth note
-- attached to a specific record ("did we ever get reimbursed for this?",
-- "who's picking up the cake?") instead of needing a text message outside
-- the app. `entity_type`/`entity_id` is a plain polymorphic reference (no
-- FK, since it points at one of two different tables) -- same
-- shared-household trust model as every other table: any member can
-- delete any comment, not just their own. The app deletes a record's
-- comments itself when that record is deleted (there's no DB-level
-- cascade for a polymorphic reference), see deleteCommentsFor() in
-- app/js/comments.js.
create table public.item_comments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  entity_type text not null check (entity_type in ('expense', 'event')),
  entity_id uuid not null,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.item_comments enable row level security;
create index item_comments_entity_idx on public.item_comments (entity_type, entity_id);

create policy "item_comments: household members"
  on public.item_comments for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
