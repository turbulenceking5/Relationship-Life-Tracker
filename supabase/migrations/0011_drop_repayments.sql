-- Repayments feature removed entirely per explicit request (not
-- relocated elsewhere). No real data existed in it, so this is a clean
-- drop — the app/js/repayments.js module and its Money-tab entry are
-- removed in the same change.
drop table public.repayments;
