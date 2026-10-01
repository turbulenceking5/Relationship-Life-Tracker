-- Lets a grocery item be tagged with a store-aisle category (produce,
-- meat, dairy, etc.) so the To buy list can group items the way you'd
-- actually walk the shop, rather than one flat list in add-order. Plain
-- text with no CHECK constraint, same as documents.category (see
-- docs/02-data-model.md) — the category list itself lives app-side in
-- GROCERY_CATEGORIES (app/js/grocery.js), so adding one later is a
-- one-line change needing no migration.
alter table public.grocery_items add column category text not null default 'other';
