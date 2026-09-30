-- Re-wires notify-due-items (see docs/11-push-notifications.md) to the
-- due-date sources that actually exist today. It previously watched
-- replacement_items and repayments, both removed entirely; those columns
-- are already gone with the tables. This adds the same "have we already
-- notified for this today" column to every live due-date source so the
-- edge function can dedupe per calendar day the same way the old one did.
alter table public.rent_payments add column last_notified_date date;
alter table public.mortgage_payments add column last_notified_date date;
alter table public.events add column last_notified_date date;
alter table public.custom_goals add column last_notified_date date;
alter table public.documents add column last_notified_date date;
