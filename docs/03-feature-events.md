# Feature: Events

## Purpose
Shared calendar of things worth remembering: birthdays, anniversaries,
appointments, renewal dates, move-in dates — anything date-based that
isn't an expense or a replacement.

## MVP (Phase 0, shipped)
- List upcoming events, soonest first, with past events collapsed below.
- Add an event: title, optional description, category, date.
- Edit an event (title, date, category, recurring, description).
- Delete an event.

## Recurring events (shipped)
A `recurring` checkbox marks an event as yearly (auto-checked when
category is `birthday` or `anniversary`, but always editable). `event_date`
stays the original/historical date — a birthday keeps its real birth year
rather than being rewritten — and the app computes each recurring event's
next occurrence at render time (`nextOccurrence()` in `format.js`) to
decide whether it's upcoming and what to sort by. Without this, an event
stored with a real historical year (birth year, wedding year) would
permanently sit in "Past" once that literal date went by. See
[`02-data-model.md`](02-data-model.md).

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
- Sort by `event_date` ascending for "upcoming," descending for "past."
