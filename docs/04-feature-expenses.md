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

## Phase 1
- Filter by category and by date range (this month / last month / custom).
- Monthly total and per-category breakdown.
- Smart defaults on the add form: last-used category, today's date
  pre-filled, remember last payer.

## Phase 2
- Recurring expenses (rent, subscriptions) that auto-log on schedule
  instead of being re-entered manually.

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

## Phase 1 (remaining)
- Filter by category and by date range (this month / last month / custom).
- Monthly total and per-category breakdown.
- Smart defaults on the add form: last-used category, today's date
  pre-filled, remember last payer.

## Phase 2
- Recurring expenses (rent, subscriptions) that auto-log on schedule
  instead of being re-entered manually.

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
