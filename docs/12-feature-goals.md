# Feature: Goals

> Rent tracking moved to the "Money" tab (see
> [`13-feature-money-tab.md`](13-feature-money-tab.md)) and Repayments was
> removed entirely. This tab was reworked from a single hardcoded "wedding
> fund" tracker into a generic system: create any number of named goals,
> each its own collapsible section.

## Purpose

A place for open-ended savings/spending goals that don't fit the
day-to-day Expenses tab — a wedding fund, a holiday fund, a house
deposit, whatever either partner wants to track separately with its own
target and running ledger.

- **+ Add goal** creates a new goal: a title, and an optional target
  amount and target date (either or both can be left blank — a goal
  doesn't need a number or a date to be worth tracking).
- Each goal renders as its own collapsible `<details>` section, titled
  with the goal's name. When there's exactly one goal it starts expanded;
  with more than one, they start collapsed so the tab stays scannable as
  goals accumulate.
- Inside a goal: target amount (if set), saved so far, spent so far, and
  remaining-to-save (`target − saved`, floored at zero — spending doesn't
  reduce what's already been saved). If a target date is set, a countdown
  banner shows above the summary.
- Transactions are typed `saved` (money set aside toward the target) or
  `spent` (money actually spent against the goal), each with a title,
  amount, date, and optional notes — each editable and deletable
  individually.
- **Edit goal** lets you rename a goal or change its target
  amount/date, and delete the goal entirely (which cascades to its
  transactions).
- A goal with a target date surfaces on the home dashboard's "Coming up"
  with a day countdown.

## Data

Tables: `custom_goals` (one row per goal — title, target_amount,
target_date, currency) and `goal_transactions` (saved/spent entries
against a goal). See [`02-data-model.md`](02-data-model.md) for columns.
Both follow the same household-scoped RLS pattern as every other table.

These replaced the earlier single-purpose `wedding_fund` /
`wedding_transactions` tables — existing wedding fund data was migrated
into `custom_goals`/`goal_transactions` as a goal titled "Wedding Fund"
rather than lost.

## Possible follow-ups (not built)

- Push notifications for an approaching goal target date, reusing the
  existing `notify-due-items` edge function (see
  [`11-push-notifications.md`](11-push-notifications.md)) — not wired up
  yet.
- Reordering goals, or pinning one open by default regardless of count.
