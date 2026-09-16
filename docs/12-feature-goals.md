# Feature: Goals (rent tracking + wedding fund)

Added after the MVP shipped, in response to two specific asks that didn't
fit neatly into the existing feature areas: tracking rent income from an
investment property, and tracking savings/spend toward a wedding. Both
live together under one "Goals" tab rather than as two more tabs, to keep
the tab bar from growing indefinitely as more one-off trackers get added.

## Investment property rent

**Purpose**: know at a glance whether this month's rent has come in yet,
without maintaining a spreadsheet.

- Each row is one rent period: property label (optional — useful once
  there's more than one property), due date, amount, paid/unpaid.
- **"Mark as received"** does two things in one action: marks the current
  period paid (with today's date), and inserts *next* month's row
  automatically (same property/amount, due date +1 month). This is what
  makes it a rolling ledger instead of a one-off reminder — there's always
  exactly one upcoming unpaid period waiting, without re-entering it every
  month.
- Unpaid periods use the same due/overdue color coding as replacements
  and repayments, and surface on the home dashboard's "What's due" when
  due soon or overdue.

## Wedding fund

**Purpose**: a savings goal (target amount + date) plus a running log of
money saved toward it and money spent on it — not the same thing as the
household's day-to-day Expenses tab, since wedding costs are earmarked
against a specific goal rather than general spending.

- One goal per household: wedding date + target amount. Editable any time
  via "Edit goal".
- Transactions are typed `saved` (money set aside toward the target) or
  `spent` (money actually spent on the wedding). The summary card shows
  target, saved so far, spent so far, and remaining-to-save
  (`target − saved`, floored at zero) — spent isn't subtracted from
  saved, since money can be spent from what's already been saved without
  changing how much more there is left to save toward the target.
- The wedding date shows a day countdown, and surfaces on the home
  dashboard's "Coming up" once a date is set.

## Data

New tables: `rent_payments`, `wedding_fund` (one settings row per
household), `wedding_transactions`. See
[`02-data-model.md`](02-data-model.md) for columns. All follow the same
household-scoped RLS pattern as every other table.

## Possible follow-ups (not built)

- Multiple named properties with per-property rent history (schema
  already supports it loosely via the free-text `property_label`; a
  dedicated `properties` table would be the next step if this grows
  past one property).
- Push notifications for overdue rent, reusing the existing
  `notify-due-items` edge function (see
  [`11-push-notifications.md`](11-push-notifications.md)) — not wired up
  yet, since that function currently only scans `replacement_items` and
  `repayments`.
- A "snooze"/partial-payment concept for rent, mirroring the ideas
  already listed for repayments in [`06-feature-repayments.md`](06-feature-repayments.md).
