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
- Delete an expense.
- Running total of all logged expenses shown at the top of the list.

## Phase 1
- Edit an expense.
- Filter by category and by date range (this month / last month / custom).
- Monthly total and per-category breakdown.
- Smart defaults on the add form: last-used category, today's date
  pre-filled, remember last payer.

## Phase 2
- Recurring expenses (rent, subscriptions) that auto-log on schedule
  instead of being re-entered manually.

## Phase 3
- "Who owes who" balance: if expenses are meant to be split (e.g. 50/50),
  track the running balance between partners and offer a "settle up"
  action that logs a balancing transfer.
- Multi-currency: convert to household default currency for totals while
  keeping the original entry currency visible.
- CSV export.
- Simple charts (spend by category, spend over time) — see
  [`10-suggestions.md`](10-suggestions.md).

## Data
See `expenses` table in [`02-data-model.md`](02-data-model.md).

## UI notes
- Adding an expense should be the single lowest-friction action in the
  whole app — it's the thing most likely to be logged constantly.
- Show who paid using their display name/emoji from `profiles`, not a raw
  ID.
