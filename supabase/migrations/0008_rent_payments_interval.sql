-- Rent was assumed monthly; in practice (and per Australian rental norms)
-- it's usually weekly or fortnightly. Store the cadence per row so
-- "Mark as received" can roll to the correct next due date, and default
-- to fortnightly (14 days) since that's the common case.
alter table public.rent_payments add column interval_days integer not null default 14 check (interval_days > 0);
