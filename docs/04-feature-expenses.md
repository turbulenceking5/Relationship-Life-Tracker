# Feature: Expenses

> Now one of three sections in the "Money" tab, not its own top-level
> tab — see [`13-feature-money-tab.md`](13-feature-money-tab.md). Nothing
> about this feature's own behavior changed.

## Purpose
Shared log of spending — what was bought, how much, who paid, and when —
so both partners have one shared record instead of separate banking apps
and guesswork.

## MVP (Phase 0, shipped)
- List expenses, most recent first, showing amount/category/who
  paid/date.
- Add an expense: title, amount, currency (defaults to household
  default), category, who paid, date, notes.
- Edit an expense (any field except who created it).
- Delete an expense.
- Running total of all logged expenses shown at the top of the list.

## Search (shipped)
A plain text filter above the list (`app/js/expenses.js`) matches title,
category, notes, or who paid, case-insensitive substring — filters the
already-fetched list client-side rather than re-querying per keystroke,
so typing doesn't hit the network. The running total and balance banner
stay based on the full list regardless of search; search is for finding
a specific expense, not for scoping what counts toward the balance.
Hidden entirely when the household has no expenses yet. Category-only
filter chips (part of Phase 1's original plan) weren't added on top of
this — see the same reasoning in
[`07-feature-documents.md`](07-feature-documents.md).

## "Who owes who" balance (Phase 3, shipped)
Each household member has a `split_percent` (see
[`08-auth-households.md`](08-auth-households.md) → Expense split, editable
from the ⚙️ account sheet) — the share of every logged expense they're
responsible for. It doesn't have to be 50/50; it's whatever the two
partners agree, e.g. 65/35.

- The Expenses tab shows a balance banner ("Alex owes Sam $X") computed
  as: for each member, `total paid by them − their split_percent share
  of all logged expenses`, then netted against any recorded settlements.
  With exactly two members this collapses to one number; the feature
  only activates once a household has two members (a solo household just
  sees the total-logged banner).
- **Settle up** logs a `settlements` row — a direct payment between the
  two partners — without touching the `expenses` log itself, since a
  settlement isn't a purchase. This is what lets the balance return to
  "you're all settled up" without deleting or editing any expense.
- A sub-cent residual (percentage splits rarely divide a dollar amount
  into whole cents) is treated as settled rather than showing a
  perpetual $0.01 balance — see `computeBalance()` in `app/js/balance.js`.
- Settlement history is listed (and individually deletable, in case of a
  mistake) below the expense list.

### Per-expense split override (shipped)
An individual expense can use a different split than the household
default — e.g. a mostly-one-person purchase logged 50/50 by default, but
"bought myself a gift" logged 100/0. The add/edit expense form
(`buildSplitField()` in `app/js/expenses.js`) shows the same
auto-complementing pair of number inputs as the ⚙️ account sheet's
household-default split, prefilled with that default; only shown once a
household has two members, same restriction as the balance feature
itself.

Left unchanged, the expense stores no override at all (`split_percent` /
`split_percent_user_id` both null on the row) — it keeps tracking the
household's `split_percent` setting even if that setting is changed
later. Only an expense someone deliberately typed a different number into
pins to that specific split forever, shown on its card as e.g. "split
Alex 50/Sam 50". `computeBalance()` in `app/js/balance.js` checks each
expense for an override before falling back to the household default,
so a mix of overridden and default expenses in the same list balances
correctly.

## Monthly total + category breakdown (shipped)
A "This month" card sits between the running total and the balance
banner (`monthlyBreakdown()` in `app/js/expenses.js`): total spent so far
this calendar month, plus a category breakdown using the same
contribution-bar/legend visual as a goal's contributor breakdown
(`contributionBreakdown()` in `goals.js`) — just grouping by category
instead of by who contributed. A category's color comes from its fixed
position in the `CATEGORIES` list, not sort order, so it stays the same
color month to month even as which categories have spending changes.
Hidden entirely when there's no spending this month yet.

## Phase 1 (remaining)
- Filter by category and by date range (this month / last month / custom).
- Smart defaults on the add form: last-used category, today's date
  pre-filled, remember last payer.

## Recurring expenses (shipped)
A collapsible "Recurring expenses" section (open by default once it has
any) sits above the search box in `app/js/expenses.js`, backed by a new
`recurring_expenses` table — same fields as a one-off expense plus
`interval_days` and `next_due_date` (the same rolling-period shape as
`rent_payments`/`mortgage_payments`), and `active` so a subscription can
be paused without deleting its history of already-logged expenses.

Unlike rent/mortgage, there's no user "mark as done" action — a
subscription should log itself with nobody needing to open the app. A
daily `pg_cron` job (`process-recurring-expenses-daily`, migration
`0019_recurring_expenses.sql`) calls a `process_recurring_expenses()`
Postgres function that inserts one `expenses` row per period that's come
due (looping if a template was paused a while or a cron run was ever
missed, so no period silently disappears) and advances `next_due_date`
past today. It's pure SQL — unlike `notify-due-items` there's no HTTP
call or shared secret involved, since it never leaves the database.

## Phase 3 (remaining)
- Multi-currency: convert to household default currency for totals while
  keeping the original entry currency visible.
- CSV export.
- Simple charts (spend by category, spend over time) — see
  [`10-suggestions.md`](10-suggestions.md).

## Data
See `expenses` and `settlements` tables in
[`02-data-model.md`](02-data-model.md), and `split_percent` on
`household_members`.

## UI notes
- Adding an expense should be the single lowest-friction action in the
  whole app — it's the thing most likely to be logged constantly.
- Show who paid using their display name/emoji from `profiles`, not a raw
  ID.
