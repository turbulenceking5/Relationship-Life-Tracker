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
A `recurring` checkbox marks an event as yearly (auto-checked when
category is `birthday` or `anniversary`, but always editable). `event_date`
stays the original/historical date — a birthday keeps its real birth year
rather than being rewritten.

`thisYearOccurrence()` in `format.js` maps a recurring event onto *this*
year's month/day and never rolls forward into next year. Both consumers
use it the same way — a recurring event whose date has already passed
this year is treated as "not upcoming," not silently rolled forward to a
next-year date:
- The Events tab splits on it: this year's occurrence still ahead goes in
  **Upcoming**, already happened goes in **Done** (shown with the date it
  actually happened, e.g. a birthday in January by the time September
  rolls around).
- The home dashboard's "Coming up" feed filters on it too: a passed
  recurring event just drops off the list instead of showing up early
  with next year's date. It reappears there once the new year actually
  arrives and `thisYearOccurrence()` recomputes against the current year.

## Phase 1
- Category filter chips (birthday / anniversary / appointment / other).

## Phase 2+
- Merge into the home dashboard's "coming up" feed.
- Optional reminder notification N days before (Phase 2 push notifications).
- iCal export/subscribe feed (Phase 5).

## Data
See `events` table in [`02-data-model.md`](02-data-model.md).

## UI notes
- Keep add-event to a single short form — this should never feel heavier
  than typing it into a notes app, or it won't get used.
- Sort ascending within "Upcoming," descending (most recent first) within
  "Done."
