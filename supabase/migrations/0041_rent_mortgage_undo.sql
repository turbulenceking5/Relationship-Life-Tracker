-- "Undo" for an accidental "Mark as received"/"Mark as paid" on
-- BrackenRidge Rent/Mortgage. Marking a period paid auto-inserts the
-- next period's row (see rent.js's renderPaymentSection()) -- to undo
-- cleanly (not just flip `paid` back, but also remove that auto-created
-- next period if nobody's touched it yet) the just-marked row needs to
-- remember which row it spawned.
alter table public.rent_payments add column next_period_id uuid references public.rent_payments(id) on delete set null;
alter table public.mortgage_payments add column next_period_id uuid references public.mortgage_payments(id) on delete set null;
