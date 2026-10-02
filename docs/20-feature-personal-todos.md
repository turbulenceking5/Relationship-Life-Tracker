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
  one-off reminder stays visible in Done rather than disappearing). For a
  repeating reminder this instead advances it to its next occurrence and
  keeps it active — see "Marking done by hand" below.
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

`remind_time` is honored precisely: `notify-due-items` polls every 15
minutes (see [`11-push-notifications.md`](11-push-notifications.md)) and
fires a reminder due today only once the clock reaches its own
`remind_time`, rather than always waiting for a fixed daily check — a
6:30am reminder notifies at 6:30am (within the 15-minute poll
granularity), not whenever the next shared daily check happens to run.
An overdue reminder (from a previous day) still fires on the very next
poll regardless of time of day, same escalate-immediately behavior as
rent/mortgage/goals/documents. Every other source keeps firing once a
day at a fixed 08:00 Australia/Brisbane despite the poll running more
often — see `DAILY_CHECK_TIME`/`pastDailyCheck` in
`supabase/functions/notify-due-items/index.ts` for how that's gated,
since only `personal_todos` has a time-of-day of its own to honor.

## Marking done by hand (fixed)
The "Mark done" button used to call `updateRow(TABLE, row.id, { is_done:
true })` unconditionally — for a repeating reminder that permanently
stopped it, while letting the push notification fire it instead
correctly advanced `remind_date` and kept it active (see "Push
notifications" above). Same button, two different outcomes depending on
who/what triggered it.

`personal-todos.js` now mirrors `notify-due-items`' own
`nextOccurrencePatch()` logic client-side: ticking off a repeating
reminder advances `remind_date` (daily +1 day, weekly +7 days, monthly to
next month clamped to its last day) and leaves it in Active, exactly as
if the push notification had fired it. Only a non-repeating
(`repeat_frequency === 'none'`) reminder actually becomes `is_done`. The
button itself reads "Done for now" rather than "Mark done" when the
reminder repeats, so the different (non-permanent) behavior is signaled
rather than silently assumed.

## Data
See `personal_todos` table in [`02-data-model.md`](02-data-model.md).

## UI notes
- No due-status pill once a reminder is done — the strikethrough on its
  prompt already signals that.
- The Active/Done split mirrors the Grocery List's To buy/In cart pattern
  (`app/js/grocery.js`) — same underlying shape (an `is_done` boolean
  list), just with a due date and repeat cadence added on top. Unlike
  Grocery List, though, a repeating reminder never actually reaches
  `is_done` by hand — see "Marking done by hand" above.
