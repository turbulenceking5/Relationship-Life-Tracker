# Feature: Personal To-dos

## Purpose
A private reminder list for one partner, invisible to the other —
"call the vet," "renew registration," anything that's yours to remember
rather than a shared household record. Every other table in this app is
scoped to the household; this is the one exception, scoped to a single
user.

## MVP (shipped)
- List your own reminders, split into **Active** and **Done**, soonest
  first within Active.
- Add a reminder: a free-text prompt, a date, a time, and how often it
  repeats (doesn't repeat / daily / weekly / monthly).
- Edit a reminder (all fields).
- Mark a reminder done/active again, without deleting it (so a completed
  one-off reminder stays visible in Done rather than disappearing).
- Delete a reminder.
- Surfaced as a "My To-dos" segment in the Money tab's sub-nav — see
  "Why it lives in the Money tab" below.

## Privacy model
`personal_todos` has an "owner only" RLS policy — `user_id = auth.uid()`
— rather than the household-wide `is_household_member(household_id)`
policy every other table uses (see
[`08-auth-households.md`](08-auth-households.md)). The client's
`fetchRows()` still filters only by `household_id` (its normal signature,
shared with every other module — see `app/js/crud.js`); it doesn't need
a `user_id` filter too, because RLS already narrows the result to the
signed-in user's own rows regardless of what the query asks for. The
same pattern already exists for `push_subscriptions` (see
[`02-data-model.md`](02-data-model.md)).

## Why it lives in the Money tab
A wholly private, non-money feature living under "Money" looks odd at
first, but a new top-level tab per feature is exactly what the Money
tab's original consolidation (and Grocery List/Recipes joining it later)
exists to avoid — see [`13-feature-money-tab.md`](13-feature-money-tab.md).
The segment is labeled "My To-dos", not just "To-dos", to signal at a
glance that it's personal, not shared like every segment beside it.

## Push notifications (shipped, with a known limitation)
A reminder due today or overdue notifies via `notify-due-items`, same
escalation model as rent/mortgage/goals/documents (keeps notifying daily
until marked done) — see
[`19-notification-sources.md`](19-notification-sources.md). Unlike every
other source, the push goes to **only the owning user's own devices**
(`push_subscriptions` filtered by `user_id`, not just `household_id`) —
this is the one notification a partner should never see.

What happens after it fires depends on `repeat_frequency`:
- `none`: the reminder is marked done, same as ticking it off by hand.
- `daily`/`weekly`/`monthly`: `remind_date` advances to its next
  occurrence (monthly clamps to the target month's last day, same trick
  as `currentOccurrence()` in `app/js/format.js`) and the reminder stays
  active.

**Known limitation**: `remind_time` is stored and shown in the UI, but
nothing currently delivers a notification at that specific time of day.
`notify-due-items` only runs once daily, at 08:00 Australia/Brisbane (see
[`11-push-notifications.md`](11-push-notifications.md)) — every due
reminder fires at that single check regardless of the time it was set
for. Precise time-of-day delivery would need either a much more frequent
cron (checking every 15–30 minutes, say) or a per-reminder scheduled
trigger, neither of which exists yet. `remind_time` is still useful today
for sorting the Active list and for a plan to build that later.

## Data
See `personal_todos` table in [`02-data-model.md`](02-data-model.md).

## UI notes
- No due-status pill once a reminder is done — the strikethrough on its
  prompt already signals that.
- The Active/Done split and "Mark done"/"Mark active" toggle mirror the
  Grocery List's To buy/In cart pattern (`app/js/grocery.js`) — same
  underlying shape (an `is_done` boolean list), just with a due date and
  repeat cadence added on top.
