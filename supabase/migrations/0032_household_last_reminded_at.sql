-- Cooldown tracking for the remind-partner edge function (see
-- supabase/functions/remind-partner/index.ts) -- a cheap per-household
-- throttle against unlimited push spam, not a general rate limiter.
alter table public.households add column last_reminded_at timestamptz;
