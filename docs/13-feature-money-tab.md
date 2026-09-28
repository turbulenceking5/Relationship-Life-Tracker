# Feature: Money tab (Expenses / BrackenRidge / Grocery List / Recipes)

Expenses, Replacement Reminders, and (originally) Repayments were
condensed into one **Money** tab with a segmented sub-nav after the tab
bar grew to 7 entries (once Goals shipped) and started feeling cluttered
on a phone-width screen. Repayments was later removed entirely (not
relocated — see [`06-feature-repayments.md`](06-feature-repayments.md)),
investment property rent tracking moved here from the Goals tab, and
Replacement Reminders was later removed too (not relocated — see
[`05-feature-replacements.md`](05-feature-replacements.md)). Grocery List
and Recipes were added later as two more segments — not strictly "money"
either, but they're household life-admin in the same spirit as rent, and
adding a whole new top-level tab per household chore would recreate the
exact tab-bar crowding this consolidation exists to avoid.

## How it works

`app/js/money.js` is a thin router, not a feature module in its own
right:

- It renders a `.segmented` control (Expenses / BrackenRidge /
  Grocery List / Recipes) above a content area. With four segments
  (one a long label) the control no longer fits equal-width buttons on a
  phone screen, so `.segmented` scrolls horizontally instead of
  squeezing every button down to fit — see the "Why not one long
  scrolling page instead" section for how each segment stays independent.
- Each segment delegates straight to its own feature module —
  `expenses.js`, `rent.js`, `grocery.js`, `recipes.js` — calling its
  `render(container, ctx)` exactly as the top-level tab router in
  `app.js` used to.
- `activeSub` is module-level state (same pattern as `currentTab` in
  `app.js`), so it's remembered for as long as the page stays loaded, but
  always starts back on "Expenses" after a full reload.
- The segment label is a literal string — "BrackenRidge" rather than a
  generic "Property" — since this household tracks a single specific
  property. If a second property is ever added, this label (and the
  per-row `property_label` fallback text in `rent.js`/`home.js`) should
  go back to something generic. The label dropped "Rent" once the
  segment grew to cover the mortgage too (see below) — it's the
  property's tab now, not just its rent.

Nothing about the underlying modules is money.js-specific — they're
unaware they're not top-level tabs. This is deliberate: it keeps the
condensation reversible (splitting them back into separate tabs later is
just an `app.js` TABS-array change) and means their own docs
([`04-feature-expenses.md`](04-feature-expenses.md)) still describe
their behavior accurately. `rent.js` was extracted from the old Goals tab
into a standalone module with the same shape.

### `rent.js`: Rent and Mortgage, one page, two sections

`rent.js` itself renders two stacked sections — **Rent** (money in) and
**Mortgage** (money out) — for the same property, each with its own
due/paid list, its own "+ Add" button, and its own "Mark as
received"/"Mark as paid" action. Both are driven by one shared
`renderPaymentSection(section, ctx, config)` helper parameterized by
table name (`rent_payments` / `mortgage_payments`), wording, default
cadence (fortnightly vs. monthly), and amount color (`owed_to_us` green
vs. `owed_by_us` red, the same classes the expense balance uses) — the
two tables are otherwise identical in shape (see
[`02-data-model.md`](02-data-model.md)), so duplicating ~140 lines of
near-identical add/edit/card logic for the second one wasn't worth it.

This does stack two independently-long lists on one page, which is
exactly what the "Why not one long scrolling page instead" section below
argues against for the Money tab as a whole — it doesn't apply here
because each section carries its own explicit, clearly-labeled add
button directly above its own list ("+ Add rent period" / "+ Add
mortgage payment"), never a single shared FAB, so there's no ambiguity
about which list a tap on "+" adds to. Same reasoning Goals already
relies on for its own per-section "+ Add transaction"/"+ Add task"
buttons.

## Home dashboard links

The home dashboard's "What's due" cards link into specific sub-tabs (a
tap on a due rent period or mortgage payment should land on the
BrackenRidge segment, not default to Expenses — both use the same `rent`
key since they're both rendered by `rent.js`). This works via `money.js`
exporting `setActiveSub(key)`, which `app.js`'s home-tab navigate
callback calls before switching to the `money` tab:

```js
if (key === 'expenses' || key === 'rent') {
  const moneyMod = await import('./money.js');
  moneyMod.setActiveSub(key);
  currentTab = 'money';
}
```

## Why not one long scrolling page instead

Goals uses a single scrolling page with a stack of collapsible sections
rather than a segmented sub-nav. Money didn't follow that pattern because
each of its sections can independently grow long (an expense list in
particular), and stacking independently-long lists on one page would make
the add-flow ambiguous — it wouldn't be clear which section a tap on "+"
was adding to without a lot of scroll context. A segmented control keeps
exactly one section (and its own add action) in view at a time.
