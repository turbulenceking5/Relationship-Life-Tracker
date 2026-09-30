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
