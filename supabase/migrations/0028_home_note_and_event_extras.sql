-- Three independent additions from a UX-research pass, bundled into one
-- migration since they're small and unrelated to each other:
--
-- 1. households.shared_note: a single freeform sticky-note field either
--    partner can edit, shown at the top of the Home dashboard (Cozi-style
--    shared message board). No new table -- one household-scoped value.
--    Already covered by the existing "households: members can update
--    their household's drive folder" RLS policy (is_household_member(id),
--    column-agnostic), so no new policy needed.
-- 2. events.rotate_assignee / events.assignee_user_id: lets a recurring
--    event (e.g. "Bin day") alternate who's responsible each occurrence
--    instead of defaulting to one person. assignee_user_id holds the
--    anchor assignee (whose turn it is on the event's own anchor
--    occurrence); whose turn it currently is is computed client-side from
--    occurrenceCycleCount() in app/js/format.js, not stored per-occurrence.
-- 3. events.related_goal_id: optionally links an event to a goal (e.g.
--    "Anniversary dinner" -> "Anniversary fund"), mirroring the
--    documents.related_type/related_id pattern already used for
--    goal-linked documents -- see docs/03-feature-events.md and
--    docs/12-feature-goals.md.
alter table public.households add column shared_note text;

alter table public.events add column rotate_assignee boolean not null default false;
alter table public.events add column assignee_user_id uuid references auth.users(id) on delete set null;
alter table public.events add column related_goal_id uuid references public.custom_goals(id) on delete set null;
