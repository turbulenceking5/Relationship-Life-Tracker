-- Enables Postgres Changes (Realtime) for every shared-list table, so a
-- partner's add/edit/delete on one phone shows up on the other without a
-- manual reload -- see app/js/realtime.js and docs/24-live-sync-and-nudges.md.
-- `personal_todos` is deliberately excluded (private per-user, RLS
-- already restricts it to its own owner, nothing cross-partner to sync).
-- RLS still gates what each subscribing client actually receives -- this
-- only adds these tables to the publication Realtime watches, it doesn't
-- bypass row security.
alter publication supabase_realtime add table
  public.events,
  public.expenses,
  public.recurring_expenses,
  public.custom_goals,
  public.goal_transactions,
  public.goal_tasks,
  public.rent_payments,
  public.mortgage_payments,
  public.documents,
  public.grocery_items,
  public.recipes,
  public.settlements,
  public.households;
