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

Two different "what's the relevant date" functions exist in `format.js`,
each for a different purpose:
- `thisYearOccurrence()` maps a recurring event onto *this* year's
  month/day and never rolls forward — used by the Events tab itself to
  split Upcoming (this year's occurrence is still ahead) from **Done**
  (it's already happened this year, e.g. a birthday in January by the
  time September rolls around). Without this, a passed recurring event
  would either wrongly sit in "Done" forever (if compared against its
  literal stored year) or get silently folded back into "Upcoming" under
  a confusing next-year date, mixed in with things still actually coming
  up this year.
- `nextOccurrence()` rolls forward to next year once this year's date has
  passed — used by the home dashboard's "Coming up" feed, whose job is
  "what's genuinely next," not "what's left in this calendar year."

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
