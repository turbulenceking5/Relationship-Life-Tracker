# Feature: Repayments

## Purpose
Track money owed — by you or to you — separately from day-to-day
expenses: loans, informal IOUs, instalment plans, money lent to/borrowed
from family or each other.

## MVP (Phase 0, shipped)
- List repayments, grouped by status (active first, then paid/cancelled),
  sorted by due date.
- Add a repayment: title, direction (owed by us / owed to us),
  counterparty, total amount, remaining amount, currency, due date,
  recurring flag + frequency, notes.
- Mark as paid (sets status to `paid`, remaining amount to 0).
- Delete a repayment.

## Phase 1
- Edit a repayment.
- Auto-flag as `overdue` in the UI (and later, in Phase 2, via
  notification) when `due_date` has passed and status is still `active`.
- Partial payment: reduce `remaining_amount` by an amount rather than only
  "fully paid."

## Phase 2
- Due-date and overdue-escalation push notifications.

## Phase 3
- Proper instalment schedules (a repayment made of N scheduled payments,
  each trackable) instead of a single due date + remaining amount.

## Phase 4
- Attach supporting documents (loan agreement, payment confirmations).

## Data
See `repayments` table in [`02-data-model.md`](02-data-model.md).

## UI notes
- Keep `direction` visually obvious (color/icon) — "we owe" and "we're
  owed" should never be confusable at a glance.
