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
- **Contribution bar**: above the transaction list, a stacked bar
  breaks down total `saved` amount by who logged it (`created_by`),
  with a legend naming each contributor, their amount, and their
  percentage share. Only appears once there's at least one `saved`
  transaction; a household member with $0 saved doesn't get an empty
  segment. Colors are assigned from a fixed, CVD-safe categorical order
  (`--series-1`...`--series-8` in `styles.css`) keyed to each member's
  stable `user_id` — not fetch or transaction order — so a given person
  keeps the same color across renders. See `contributionBreakdown()` in
  `app/js/goals.js`.
- **Tasks**: a plain checklist within the goal ("book venue," "get
  quotes"), independent of the money side — a goal can track both a
  savings/spend ledger and a to-do list toward the same target. Each
  task is a title and a checkbox; checking it off just flips `is_done`,
  it doesn't get deleted or archived, so the finished list stays visible
  (struck through) for context.
- **Documents**: upload a file (or the same upload flow as the Docs tab)
  scoped to this goal via the `documents` table's `related_type`/
  `related_id` columns. A document added from within a goal also shows
  up in the top-level Docs tab, tagged "linked to `<goal title>`" — it's
  the same table and the same file, just filtered two different ways.
- **Edit goal** lets you rename a goal or change its target
  amount/date, and delete the goal entirely (which cascades to its
  transactions and tasks — but not its linked documents, which stay in
  the Docs tab, just no longer tagged as linked to anything).
- A goal with a target date surfaces on the home dashboard's "Coming up"
  with a day countdown, and drops off that feed once its target date has
  passed (it doesn't move to a "Done" list the way Events does — the
  goal itself, and its progress, still lives on the Goals tab).
- **Finish/close a goal (shipped)**: a "Finish goal"/"Reopen goal" button
  (next to "Edit goal") sets or clears `custom_goals.closed_at`. Unlike
  everything else on this tab, closing isn't tied to hitting the target —
  a goal with no `target_amount` at all (a plain checklist-style goal)
  had no way to be marked done before this, and a goal that *does* have
  a target otherwise stays open forever once reached unless someone
  deletes it outright (losing its history). A closed goal moves into its
  own collapsed "Closed goals" section at the bottom of the tab — same
  reasoning as Events' Upcoming/Done split and Rent's History section —
  and drops off the home dashboard's "Upcoming goals" and
  `notify-due-items`'s target-date escalation, same as a deleted goal
  would, but without losing its transactions/tasks/documents. Still
  fully viewable and editable while closed (Reopen undoes it), since
  closing is just "filed away," not locked.
- An event can be linked to a goal (`events.related_goal_id`) — see
  [`03-feature-events.md`](03-feature-events.md).
- **Milestone celebration (shipped)**: the first time a goal's `saved`
  total reaches its `target_amount`, its card plays a one-time CSS
  confetti burst (`.confetti-burst` in `styles.css`). Gated by a
  `localStorage` flag per goal ID (`maybeCelebrate()` in `goals.js`) so
  it plays once per goal per browser, not on every render — the "🎉 Goal
  reached!" text itself isn't one-time, it shows any time the goal is at
  or past target.
- **Export CSV**: next to "+ Add transaction" in each goal's Transactions
  section, downloads just that goal's `goal_transactions` as
  `goal-<slugified-title>-transactions.csv` — date, type (Saved/Spent),
  title, amount, notes, and who logged it (resolved to a display name).
  Only shown once the goal has at least one transaction. Uses the same
  `toCsv()`/`downloadCsv()` helpers in `app/js/csv.js` as the Expenses
  tab's export, kept per-goal rather than one combined export since
  tax-time records are usually wanted per goal (e.g. "receipts for the
  Europe trip").

## Data

Tables: `custom_goals` (one row per goal — title, target_amount,
target_date, currency), `goal_transactions` (saved/spent entries against
a goal), and `goal_tasks` (checklist items, `is_done` boolean). Documents
use the existing `documents` table via `related_type = 'goal'` and
`related_id = <goal id>` rather than a goal-specific table. See
[`02-data-model.md`](02-data-model.md) for columns. All follow the same
household-scoped RLS pattern as every other table.

`custom_goals`/`goal_transactions` replaced the earlier single-purpose
`wedding_fund`/`wedding_transactions` tables — existing wedding fund data
was migrated in as a goal titled "Wedding Fund" rather than lost.

## Push notifications (shipped)

A goal with a `target_date` that's due today or overdue, and not yet
fully saved toward its `target_amount`, notifies via `notify-due-items` —
see [`19-notification-sources.md`](19-notification-sources.md) for the
exact rule and why "fully saved" is what stops it escalating forever.

## Possible follow-ups (not built)

- Reordering goals or tasks, or pinning a goal open by default regardless
  of count.
- Deleting a goal could optionally offer to also delete (not just
  unlink) its documents — currently they're left in place deliberately,
  since a document might matter even after the goal it was for is gone.
