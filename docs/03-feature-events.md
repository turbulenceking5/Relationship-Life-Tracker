# Feature: Events

## Purpose
Shared calendar of things worth remembering: birthdays, anniversaries,
appointments, renewal dates, move-in dates — anything date-based that
isn't an expense or a replacement.

## MVP (Phase 0, shipped)
- List upcoming events, soonest first, with events already done this
  year collapsed below under "Done."
- Add an event: title, optional description, category, date.
- Edit an event (title, date, category, recurring, description).
- Delete an event.

## Recurring events (shipped)
A "Repeats" dropdown on the add/edit form picks the cadence — **weekly**,
**fortnightly**, **monthly**, or **yearly** — or "Doesn't repeat". It
auto-selects yearly when category is `birthday` or `anniversary` (always
editable). `event_date` stays the original/historical date — a birthday
keeps its real birth year rather than being rewritten; for a
weekly/fortnightly/monthly event it's just the first occurrence, the
anchor the cadence counts forward from.

`currentOccurrence()` in `format.js` maps a recurring event onto its
occurrence within the **current cycle** for its interval, and never rolls
forward into the next cycle — a yearly event maps onto this calendar
year's month/day, monthly onto this calendar month's day-of-month
(clamped to the month's last day), and weekly/fortnightly roll forward
from the event's own anchor date in fixed 7/14-day steps (there's no
calendar-aligned "week" concept elsewhere in the app to snap to instead).
Both consumers use it the same way — a recurring event whose occurrence
has already passed this cycle is treated as "not upcoming," not silently
rolled forward to its next occurrence's date:
- The Events tab splits on it: this cycle's occurrence still ahead goes in
  **Upcoming**, already happened goes in **Done** (shown with the date it
  actually happened, e.g. a monthly bill's occurrence earlier this month).
- The home dashboard's "Coming up" feed filters on it too: a passed
  occurrence just drops off the list instead of showing up early with its
  next occurrence's date. It reappears there once the next cycle actually
  arrives and `currentOccurrence()` recomputes against it.

## Mark done (shipped)
An event can be marked done by hand, independent of its date — for a
future-dated event handled early, or to dismiss an overdue one-off without
deleting it. `events.completed_occurrence` stores the *occurrence* date
that was marked done (not a plain boolean): comparing it against the
freshly-computed `currentOccurrence()` each render means a recurring
event's "done" state is tied to one specific cycle and naturally reverts
to "not done" once the next cycle begins, with no reset logic needed. A
non-recurring event has only one occurrence (`event_date` itself), so the
same mechanism works for it too.

The toggle only appears when it's meaningful: once an occurrence's date
has actually passed, there's nothing left to "undo" to (the date
comparison alone already puts it in Done), so only a manually-completed,
not-yet-due event shows "Mark not done" — a naturally overdue one just
loses the one-way "Mark done" action instead of showing an always-present
toggle that'd sometimes be a no-op. The home dashboard's "Coming up" feed
and the `notify-due-items` push notification both skip an event whose
current occurrence has been marked done, even if the date hasn't arrived
yet.

## Chore rotation (shipped)
A recurring event can alternate between the two household members each
occurrence instead of always showing the same person — useful for bin
day, taking out recycling, etc. Toggled via "Alternate between us" on the
add/edit form, only offered when the event repeats and the household has
exactly two members. `events.rotate_assignee` (boolean) +
`events.assignee_user_id` (the anchor assignee) is all that's stored — no
per-occurrence row. Whose turn it is right now is computed client-side
(`turnLabel()` in `events.js`) from `occurrenceCycleCount()` in
`format.js`, a companion to `currentOccurrence()` that returns the number
of full cycles elapsed since the anchor date instead of mapping onto a
date: an even cycle count stays with the anchor assignee, odd flips to
the other member. Shown on the card as "It's _Name_'s turn", suppressed
once the occurrence is done (nothing to rotate on a completed one).

Below that, a fairness tally ("Alex 5 · Sam 4") counts how many turns
each person has had so far — unlike the turn label, shown whether or not
the current occurrence is done, since it's a running count rather than a
right-now status. Since the rotation itself is fully deterministic
(strict alternation by cycle parity, no stored history of actual swaps
or skips), the tally is just arithmetic on `occurrenceCycleCount()`
(`fairnessTally()` in `events.js`) rather than a real log: the anchor
cycle through the current one split as evenly as possible between the
anchor assignee and the other member.

## Link an event to a goal (shipped)
`events.related_goal_id` (`on delete set null`, same pattern as
`documents.related_type/related_id`) optionally links an event to one of
the household's goals — e.g. an "Anniversary dinner" event linked to a
Wedding Fund goal. Picked from a "Link to a goal" select on the add/edit
form; shown on the card as "linked to _Goal title_" when set.

## Comment thread (shipped)
A 💬 button on every event card opens a thread of plain-text comments
(`app/js/comments.js`, shared with Expenses) — see
[`04-feature-expenses.md`](04-feature-expenses.md) → "Comment thread" for
the full writeup, since the module and table are the same for both.
Deleting an event also deletes its comments (`deleteCommentsFor()`),
since `item_comments` has no DB-level cascade for its polymorphic
`entity_id`.

## Phase 1
- Category filter chips (birthday / anniversary / appointment / other).

## Push notifications (shipped, same-day only)
An event notifies via `notify-due-items` on the day it falls (including a
recurring event's `currentOccurrence()`, whatever its interval), not N
days ahead — see [`19-notification-sources.md`](19-notification-sources.md).
Doesn't escalate the way an unpaid bill does, since a past event date
isn't something to keep chasing.

## Phase 2+
- Merge into the home dashboard's "coming up" feed.
- Optional reminder notification N days *before* the event (currently
  same-day only).
- iCal export/subscribe feed (Phase 5).

## Data
See `events` table in [`02-data-model.md`](02-data-model.md).

## UI notes
- Keep add-event to a single short form — this should never feel heavier
  than typing it into a notes app, or it won't get used.
- Sort ascending within "Upcoming," descending (most recent first) within
  "Done."
