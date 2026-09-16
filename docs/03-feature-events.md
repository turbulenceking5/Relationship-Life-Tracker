# Feature: Events

## Purpose
Shared calendar of things worth remembering: birthdays, anniversaries,
appointments, renewal dates, move-in dates — anything date-based that
isn't an expense or a replacement.

## MVP (Phase 0, shipped)
- List upcoming events, soonest first, with past events collapsed below.
- Add an event: title, optional description, category, date.
- Delete an event.

## Phase 1
- Edit an event.
- Recurring events (yearly for birthdays/anniversaries) without needing to
  re-add every year.
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
