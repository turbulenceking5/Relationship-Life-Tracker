-- Replacement Reminders feature removed entirely per explicit request.
-- No real data existed in it (0 rows), so this is a clean drop — the
-- app/js/replacements.js module and its Money-tab entry are removed in
-- the same change.
drop table public.replacement_items;
