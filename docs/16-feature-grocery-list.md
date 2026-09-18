# Feature: Grocery List

## Purpose
A shared shopping list — one place either partner can add "we're out of
X" as they think of it, instead of a text thread. Lives in the Money
tab's **Grocery List** segment (see
[`13-feature-money-tab.md`](13-feature-money-tab.md) for why grocery
shopping sits alongside expenses/rent rather than as its own top-level
tab — same tab-bar-crowding reasoning).

## How it works
- Add an item: a title and an optional free-text quantity (e.g. "2L",
  "x3") — no separate quantity/unit fields, since a grocery list entry
  is read once at the shop and then thrown away, not analyzed later.
- Checking an item's checkbox marks it bought (`is_done`) and moves it
  from **To buy** into **In cart**, struck through.
- **Clear bought items** (shown only once something's checked off) bulk-
  deletes everything in "In cart" — the normal way to reset the list
  after a shop, rather than deleting items one at a time.
- No edit flow — same reasoning as `goal_tasks`: fixing a typo on a
  one-line item is a delete-and-re-add, not worth a whole edit sheet.

## Data
See `grocery_items` table in [`02-data-model.md`](02-data-model.md).

## UI notes
- Keep the add form to the two fields above — anything heavier and
  people will go back to texting each other instead.
