# Feature: Rent & Mortgage (BrackenRidge)

## Purpose
Tracks both cash flows on the household's one investment property as
rolling ledgers of due/paid periods: rent income (money in) and the
mortgage payment (money out). Lives in the Money tab's **BrackenRidge**
segment (`rent.js`) — see
[`13-feature-money-tab.md`](13-feature-money-tab.md) for why rent sits
alongside Expenses/Grocery List/Recipes/My To-dos in one consolidated tab
rather than as its own top-level entry, and for how `money.js` routes
into this module. `rent.js` was originally scoped to rent only and lived
under the Goals tab; it was extracted into a standalone module when
mortgage payments were added alongside it.

## How it works
`rent.js` renders **Rent** and **Mortgage** for the same property as two
sections, each with its own "+ Add" button and its own "Mark as
received"/"Mark as paid" action. Both are driven by one shared
`renderPaymentSection(currentEl, historyEl, ctx, config)` helper
parameterized by table name (`rent_payments` / `mortgage_payments`),
wording, default cadence (fortnightly vs. monthly), and amount color
(`owed_to_us` green vs. `owed_by_us` red — the same classes the expense
balance uses) — the two tables are otherwise identical in shape (see
[`02-data-model.md`](02-data-model.md)), so duplicating ~140 lines of
near-identical add/edit/card logic for the second one wasn't worth it.

Each call to `renderPaymentSection` mounts into **two** containers, not
one: `currentEl` gets the add button and unpaid periods (what you'd
actually act on), `historyEl` gets paid periods collapsed behind a
`<details class="goal-section">` (the same generic collapsible-card
pattern Goals and Recipes use — see
[`14-ui-patterns.md`](14-ui-patterns.md)), summarized as e.g. "Rent
history (12)". `render()` lays out both current sections first, then one
**History** section at the very bottom holding both collapsibles. This
split exists because the two were originally one list each (current
periods followed immediately by up to 10 paid ones) — with two tables on
one page, Rent's paid history sat between Rent's current periods and
Mortgage's, pushing Mortgage off screen on a normal household's history.
Pulling all history to the bottom, collapsed, means scrolling from Rent's
current periods to Mortgage's is uninterrupted, and the history is still
one tap away, not deleted or hidden behind a different tab.

Two current sections plus one history section still stacks
independently-long lists on one page, which is what money.js's "Why not
one long scrolling page instead" reasoning (see
[`13-feature-money-tab.md`](13-feature-money-tab.md)) argues against for
the Money tab as a whole — it doesn't apply here because each current
section carries its own explicit, clearly-labeled add button directly
above its own list ("+ Add rent period" / "+ Add mortgage payment"),
never a single shared FAB, so there's no ambiguity about which list a tap
on "+" adds to; and history is collapsed by default, so it contributes
one line to the scroll, not a list's worth. Same reasoning Goals already
relies on for its own per-section "+ Add transaction"/"+ Add task"
buttons.

The segment label itself is a literal string — "BrackenRidge" rather than
a generic "Property" — since this household tracks a single specific
property. If a second property is ever added, this label (and the
per-row `property_label` fallback text in `rent.js`/`home.js`) should go
back to something generic. The label dropped "Rent" once the segment grew
to cover the mortgage too — it's the property's tab now, not just its
rent.

## Home dashboard
Unpaid/overdue rent and mortgage periods both feed into the home
dashboard's merged "What's due" list (sorted by date alongside expiring
documents — see
[`22-feature-home-dashboard.md`](22-feature-home-dashboard.md)). Tapping
either kind of card there calls `navigate('rent')`, which lands on the
BrackenRidge segment specifically (both rent and mortgage share that one
`rent` key, since both are rendered by this same module) rather than
defaulting to Expenses.

## Push notifications
Both tables are scanned daily by `notify-due-items`, escalating (renotify
every day) while a period stays unpaid past its due date — see
[`19-notification-sources.md`](19-notification-sources.md).

## Data
See `rent_payments` and `mortgage_payments` tables in
[`02-data-model.md`](02-data-model.md) — both share the same shape
(`due_date`, `amount`, `currency`, `interval_days`, `paid`, `paid_date`,
`property_label`, `last_notified_date`).

## UI notes
- Keep Rent and Mortgage visually distinct (icon, color) even though they
  share one rendering helper — a glance at "What's due" or this page
  should never require reading the label to tell money in from money out.
