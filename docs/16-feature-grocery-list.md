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
- Edit an item (title, quantity, category) via the same sheet pattern
  every other list uses. This list used to be the one exception — "no
  edit flow, delete-and-re-add" — but that meant fixing a typo also threw
  away the auto-guessed category, which wasn't worth the "keep it light"
  tradeoff once weighed against every other list already having one.
- A search box (shown once there's at least one item) filters by title or
  quantity, matching the Expenses/Documents/Recipes pattern.
- Each item shows who added it (`created_by`) when a household has more
  than one member's items mixed in.

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

## Importing from a recipe (shipped)
A recipe's "+ Add ingredients to Grocery List" button (see
[`17-feature-recipes.md`](17-feature-recipes.md)) inserts every
ingredient line as its own grocery item, run through `guessCategory()`
(exported from this module) exactly as if it had been typed into the add
form — so "500g beef mince" lands under Meat automatically. Each line
goes in as the item's whole title (quantity and all) rather than trying
to split it into a separate quantity field, since a recipe line is
already written the way you'd want it to read on the shopping list.

## Data
See `grocery_items` table in [`02-data-model.md`](02-data-model.md).

## UI notes
- Keep the add form to the two fields above — anything heavier and
  people will go back to texting each other instead.
