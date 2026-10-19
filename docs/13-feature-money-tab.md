# Feature: Money tab (Expenses / BrackenRidge / My Statements / Grocery List / Recipes)

Expenses, Replacement Reminders, and (originally) Repayments were
condensed into one **Money** tab with a segmented sub-nav after the tab
bar grew to 7 entries (once Goals shipped) and started feeling cluttered
on a phone-width screen. Repayments was later removed entirely (not
relocated — see [`06-feature-repayments.md`](06-feature-repayments.md)),
investment property rent tracking moved here from the Goals tab, and
Replacement Reminders was later removed too (not relocated — see
[`05-feature-replacements.md`](05-feature-replacements.md)). Grocery List,
Recipes, and My Statements were added later as more segments — none
strictly "money" in Grocery List/Recipes' case, but they're household
life-admin in the same spirit as rent, and adding a whole new top-level
tab per feature would recreate the exact tab-bar crowding this
consolidation exists to avoid.

My To-dos used to live here too (as a private, owner-only segment — see
[`20-feature-personal-todos.md`](20-feature-personal-todos.md)), on the
same "avoid tab-bar crowding" reasoning. It was later promoted to its own
top-level `todos` tab instead, at the household's own request — exactly
the reversal the "Nothing about the underlying modules is money.js-
specific" design below exists to make cheap when a tab-bar-crowding
tradeoff stops being the right call for one particular segment.

## How it works

`app/js/money.js` is a thin router, not a feature module in its own
right:

- It renders a `.segmented` control (Expenses / BrackenRidge /
  My Statements / Grocery List / Recipes) above a content area. With five
  segments (two long labels) the control no longer fits equal-width
  buttons on a phone screen, so `.segmented` scrolls horizontally instead
  of squeezing every button down to fit — see the "Why not one long
  scrolling page instead" section for how each segment stays independent.
- Each segment delegates straight to its own feature module —
  `expenses.js`, `rent.js`, `statements.js`, `grocery.js`, `recipes.js`
  — calling its `render(container, ctx)` exactly as the top-level tab
  router in `app.js` used to.
- `activeSub` is module-level state (same pattern as `currentTab` in
  `app.js`), so it's remembered for as long as the page stays loaded, but
  always starts back on "Expenses" after a full reload.
- The segment label is a literal string — "BrackenRidge" rather than a
  generic "Property" — since this household tracks a single specific
  property. If a second property is ever added, this label (and the
  per-row `property_label` fallback text in `rent.js`/`home.js`) should
  go back to something generic. The label dropped "Rent" once the
  segment grew to cover the mortgage too (see
  [`23-feature-rent-mortgage.md`](23-feature-rent-mortgage.md)) — it's
  the property's tab now, not just its rent.

Nothing about the underlying modules is money.js-specific — they're
unaware they're not top-level tabs. This is deliberate: it keeps the
condensation reversible (splitting them back into separate tabs later is
just an `app.js` TABS-array change — exactly what happened to My To-dos,
see above) and means their own docs
([`04-feature-expenses.md`](04-feature-expenses.md),
[`23-feature-rent-mortgage.md`](23-feature-rent-mortgage.md),
[`27-feature-bank-statements.md`](27-feature-bank-statements.md),
[`16-feature-grocery-list.md`](16-feature-grocery-list.md),
[`17-feature-recipes.md`](17-feature-recipes.md)) still describe their
behavior accurately. `rent.js` was extracted from the old
Goals tab into a standalone module with the same shape — see
[`23-feature-rent-mortgage.md`](23-feature-rent-mortgage.md) for how it
renders Rent and Mortgage as two sections sharing one helper, and why
their paid history is pulled into a collapsed section at the bottom
rather than sitting under each one's current periods.

## Home dashboard links

The home dashboard's cards link into specific sub-tabs — a tap on a due
rent period or mortgage payment should land on the BrackenRidge segment,
not default to Expenses (both use the same `rent` key since they're both
rendered by `rent.js`); a tap on "Grocery list" in "On your plate" should
land on Grocery List, not Expenses either. This works via `money.js`
exporting `setActiveSub(key)`, which `app.js`'s home-tab navigate
callback calls before switching to the `money` tab — see
[`22-feature-home-dashboard.md`](22-feature-home-dashboard.md) for the
full navigate callback and which keys route through `money.js` vs.
straight to a top-level tab. "Your to-dos" on the same dashboard section
now navigates straight to the top-level `todos` tab instead, same as any
other top-level tab.

## Why not one long scrolling page instead

Goals uses a single scrolling page with a stack of collapsible sections
rather than a segmented sub-nav. Money didn't follow that pattern because
each of its sections can independently grow long (an expense list in
particular), and stacking independently-long lists on one page would make
the add-flow ambiguous — it wouldn't be clear which section a tap on "+"
was adding to without a lot of scroll context. A segmented control keeps
exactly one section (and its own add action) in view at a time.
