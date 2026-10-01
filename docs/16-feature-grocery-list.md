# Feature: Grocery List

## Purpose
A shared shopping list — one place either partner can add "we're out of
X" as they think of it, instead of a text thread. Lives in the Money
tab's **Grocery List** segment (see
[`13-feature-money-tab.md`](13-feature-money-tab.md) for why grocery
shopping sits alongside expenses/rent rather than as its own top-level
tab — same tab-bar-crowding reasoning).

## How it works
- Add an item: a title, an optional free-text quantity (e.g. "2L", "x3"),
  and a category — no separate quantity/unit fields, since a grocery list
  entry is read once at the shop and then thrown away, not analyzed later.
- Checking an item's checkbox marks it bought (`is_done`) and moves it
  from **To buy** into **In cart**, struck through.
- **Clear bought items** (shown only once something's checked off) bulk-
  deletes everything in "In cart" — the normal way to reset the list
  after a shop, rather than deleting items one at a time.
- No edit flow — same reasoning as `goal_tasks`: fixing a typo on a
  one-line item is a delete-and-re-add, not worth a whole edit sheet.

## Categories (shipped)
Each item gets a category from a fixed list in `GROCERY_CATEGORIES`
(`app/js/grocery.js`): produce, meat, dairy, bakery, frozen, pantry,
household, other. "To buy" is grouped into a section per category, in that
same shop-aisle order (not alphabetical), so the list reads the way you'd
actually walk the store rather than in whatever order items were added.
"In cart" stays a flat list below — it's just a holding area before
**Clear bought items**, not something read section-by-section while
shopping. `category` is plain text with no CHECK constraint (same as
`documents.category`), so adding another category later is a one-line app
change, no migration needed.

As the item name is typed on the add form, `guessCategory()` matches it
against a keyword list (`CATEGORY_KEYWORDS`, both in `app/js/grocery.js`)
and auto-fills the category dropdown — "Milk" lands on Dairy, "Chicken
breast" on Meat, with no need to touch the dropdown. Anything the keyword
list doesn't recognize just stays on **Other**, the normal catch-all
category, with the dropdown sitting right there to pick the right one by
hand — auto-categorizing is a convenience on top of manual picking, not a
replacement for it. Picking a category manually stops the guess from
overwriting it on further typing, so a deliberate choice always sticks.

## Data
See `grocery_items` table in [`02-data-model.md`](02-data-model.md).

## UI notes
- Keep the add form to the two fields above — anything heavier and
  people will go back to texting each other instead.
