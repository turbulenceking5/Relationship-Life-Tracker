# What actually triggers a push notification

Companion to [`11-push-notifications.md`](11-push-notifications.md), which
covers the plumbing (cron, edge function, service worker, Vault secrets).
This doc covers what `notify-due-items` (`supabase/functions/notify-due-items/index.ts`)
actually scans, now that it's wired up to real due-date sources instead of
running daily and sending nothing.

## Sources scanned

The edge function itself is polled every 15 minutes (see
[`11-push-notifications.md`](11-push-notifications.md)), but only
`personal_todos` actually uses that granularity — every other source
still only checks/fires once a day, gated behind a fixed
`DAILY_CHECK_TIME` of 08:00 Australia/Brisbane in the function itself.

| Source | Trigger | Checked | Escalates while overdue? |
|---|---|---|---|
| `rent_payments` (unpaid rows) | `due_date` today or in the past | Once/day at 08:00 Brisbane | Yes — notifies again every day it stays unpaid |
| `mortgage_payments` (unpaid rows) | `due_date` today or in the past | Once/day at 08:00 Brisbane | Yes |
| `custom_goals` (with a `target_date`) | `target_date` today or in the past, **and** not already fully saved (`saved >= target_amount`, when a target amount is set) | Once/day at 08:00 Brisbane | Yes, until the goal is fully funded |
| `documents` (with an `expiry_date`) | `expiry_date` today or in the past | Once/day at 08:00 Brisbane | Yes |
| `events` | `currentOccurrence(event_date, recurring, recurring_interval)` falls exactly on today, and `completed_occurrence` doesn't already match that occurrence | Once/day at 08:00 Brisbane | No — a birthday that's passed isn't "overdue," so this fires once, on the day, not daily afterward |
| `personal_todos` (not done) | `remind_date` in the past (fires immediately), or `remind_date` today **and** the clock has reached that row's own `remind_time` | Every 15-minute poll | Yes, until marked done — see [`20-feature-personal-todos.md`](20-feature-personal-todos.md) for how a repeating one advances instead of escalating forever |

Every source except `events` reuses the same "due today or overdue"
threshold as the in-app pill (`dueStatus()` in `app/js/format.js`) — not
the 14-day "due soon" window the pill also shows. The visual pill already
gives advance warning when someone opens the app; the push notification is
the "this is now actually due" escalation, matching how rent/mortgage
already worked before this was wired up.

## Why goals check "already fully saved"

Rent and mortgage naturally stop escalating once marked paid (a new period
is created with a fresh due date). A goal has no equivalent "done" action —
you don't mark a savings goal "paid." Renotifying forever once its
`target_date` passes would be pure nag with no way to silence it short of
editing the date. So the edge function treats a goal whose saved total (sum
of `goal_transactions` where `type = 'saved'`, matching the "Saved so far"
figure `goals.js` already shows) has reached `target_amount` as done,
the same implicit signal the Goals tab itself uses — see
[`12-feature-goals.md`](12-feature-goals.md).

## Deduplication

Each source table got a `last_notified_date` column (migration
`0018_notification_sources.sql`; `personal_todos` got its own copy in
`0023_personal_todos.sql`) so a row that already triggered a notification
today doesn't trigger a second one from a re-run later the same day. It's
set the moment an item is judged due — not only after a push actually
sends — so a household (or, for `personal_todos`, a single user) with
zero registered devices still doesn't get renotified tomorrow for
something it was already (silently) notified about today.

## Timezone

All date (and, for `personal_todos`, time-of-day) comparisons use
`Australia/Brisbane`'s calendar date/clock at the moment the function
runs (`Intl.DateTimeFormat` with that timezone, not a hardcoded UTC+10
offset), matching `todayStr()` in `app/js/format.js` and the reasoning in
[`11-push-notifications.md`](11-push-notifications.md) for why the fixed
daily sources' `DAILY_CHECK_TIME` is 08:00 specifically.
