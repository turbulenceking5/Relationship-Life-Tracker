# Feature: Recipes

## Purpose
A shared recipe box in the Money tab's **Recipes** segment (see
[`13-feature-money-tab.md`](13-feature-money-tab.md) for why it lives
there rather than as its own top-level tab). Each recipe has a title
plus two subgroups: **Ingredients** and **Instructions**.

## How it works
- Add/edit a recipe with three fields: title, an ingredients textarea,
  and an instructions textarea — one entry per line in each, split and
  stored as a plain list (`text[]` columns, no separate join tables; see
  [`02-data-model.md`](02-data-model.md) for why). Ingredients render as
  a bulleted list, instructions as a numbered list.
- Each recipe is a collapsible `<details class="goal-section">` (the
  same generic collapsible-card pattern Goals uses — see
  [`14-ui-patterns.md`](14-ui-patterns.md)), so a growing recipe
  collection doesn't turn into an endless scroll: minimize a recipe you
  aren't looking at right now, expand the one you are. A single recipe
  starts expanded; two or more start collapsed.
- Edit/delete live inside the expanded body (mirrors the Goals edit
  pattern) rather than as buttons on the collapsed summary row, so the
  collapsed view stays just the title.
- A search box (shown once there's more than zero recipes) filters by
  title, matching the Expenses/Documents/Grocery List pattern.

## Add ingredients to Grocery List (shipped)
A "+ Add ingredients to Grocery List" button sits above a recipe's
Instructions section (only shown when it has ingredients) and inserts
every ingredient line as its own `grocery_items` row via
`guessCategory()` (imported from `grocery.js`) — the same auto-
categorization the Grocery List's own add form uses, so "500g beef
mince" lands under Meat without anyone touching a dropdown. The button
shows a transient "Added N items ✓" confirmation (2 seconds) rather than
navigating away, since you're usually mid-meal-planning and still on the
recipe. See [`16-feature-grocery-list.md`](16-feature-grocery-list.md).

## Data
See `recipes` table in [`02-data-model.md`](02-data-model.md).

## UI notes
- Recipes are ordered alphabetically by title (`fetchRows(..., 'title',
  true)`), not by recency — a recipe box is looked up by name, not
  browsed by "what did I add most recently."
