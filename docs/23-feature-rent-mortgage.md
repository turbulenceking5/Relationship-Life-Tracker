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

## Undo a mistaken "Mark as received"/"Mark as paid"

A paid card in the history section gets an "Undo" button alongside Edit
and Delete. "Mark as received"/"Mark as paid" does two things at once —
closes out the current period (`paid: true`, `paid_date`) *and*
auto-inserts the next period's row — so undoing it has to reverse both,
not just flip `paid` back and leave the auto-created next period
sitting there as an orphaned extra.

`rent_payments`/`mortgage_payments` each have a `next_period_id` column
(added in `0041_rent_mortgage_undo.sql`) set on the row *being* marked
paid, pointing at the row it just spawned — captured by inserting the
next period first, then including its returned `id` in the same update
that sets `paid`/`paid_date`. Undo looks that row up: if it's still
sitting there unpaid, exactly as auto-created (nobody's acted on it
since), it's deleted and the confirm text says so ("This also removes
the next period it created"); if it's already been marked paid itself
(the household kept going normally after the mistake) or already
deleted by hand, it's left alone — only this row's own `paid`/
`paid_date`/`next_period_id` get reverted, and the confirm text doesn't
mention removing anything. Never guesses by matching on due date/amount
instead of the stored id — the only two states this branches on are "the
exact spawned row still exists and is still untouched" or not, nothing
in between gets deleted automatically.

`next_period_id` is `null` on any row from before this existed,
including ones already marked paid at the time — Undo on one of those
just reverts the row with the simple confirm text, same as any row
whose spawned period isn't removable for the reasons above. There's
nothing to backfill: the original next-period row for an old entry
can't be reconstructed from `due_date`/`interval_days` alone with any
confidence (the real next row might since have been edited, paid, or
deleted), so guessing would risk deleting the wrong thing.

That simple revert can leave two unpaid cards showing at once — the
row just reverted, plus whatever unpaid period already existed
alongside it (most likely the real "next period", just not one Undo
can prove is the one it spawned). When reverting this way leaves
*exactly one* other unpaid period in the same table, Undo offers to
remove it too, in a second confirm that states that row's own due
date and amount so the person can check it's actually the duplicate
before agreeing — still never an automatic match on date/amount, just
the decision handed to a person who can see both rows. With two or
more other unpaid periods left, nothing extra is offered; sorting that
out is left to Edit/Delete by hand, since picking one to remove
wouldn't be unambiguous.

## On-time streak
Each `currentEl` section shows a quiet "✓ Paid on time N periods running"
line above its "+ Add" button once there's an actual streak (2+) — fewer
than that would just be noise. Computed entirely from existing
`paid_date`/`due_date` history (no new column): walks paid periods
most-recent-first and counts while `paid_date <= due_date`, stopping at
the first late (or unpaid-turned-late) one. Deliberately has no "streak at
risk" countdown and doesn't score the two partners against each other —
just a shared, low-key nudge, not another thing to feel anxious about.

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
`next_period_id`, `property_label`, `last_notified_date`).

## UI notes
- Keep Rent and Mortgage visually distinct (icon, color) even though they
  share one rendering helper — a glance at "What's due" or this page
  should never require reading the label to tell money in from money out.
