# Feature: Replacement Reminders

> Now one of three sections in the "Money" tab, not its own top-level
> tab — see [`13-feature-money-tab.md`](13-feature-money-tab.md). Nothing
> about this feature's own behavior changed.

## Purpose
The "did we change the tap filter yet?" problem. Track physical things
that need periodic replacing, and know at a glance what's due or overdue.

Examples: tap water filter, fridge water filter, smoke alarm batteries,
air/HVAC filter, car oil change, toothbrush heads, water softener salt,
boiler service.

## MVP (Phase 0, shipped)
- List replacement items sorted by soonest `next_due_date`, with overdue
  items visually flagged.
- Add an item: name, category, last replaced date (defaults to today),
  interval in days.
- "Mark as replaced today" action — sets `last_replaced_date` to today,
  which recomputes `next_due_date` automatically (it's a generated
  column, see [`02-data-model.md`](02-data-model.md)).
- Delete an item.

## Phase 1
- Edit an item (rename, change interval).
- Common interval presets in the add form (e.g. "every 3 months," "every
  30 days," "every 6 months," "every year") alongside a custom days input.
- Group by category (kitchen / safety / car / other).

## Phase 2 (shipped)
- [x] Push notification when an item becomes due, repeating daily while it
  stays overdue. See [`11-push-notifications.md`](11-push-notifications.md).
- [ ] Optional "snooze" (push due date back by N days without marking as
  replaced) for things that can wait.

## Phase 4
- Attach a document (manual, warranty, purchase receipt) to a replacement
  item.

## Data
See `replacement_items` table in [`02-data-model.md`](02-data-model.md).
`next_due_date` is server-computed — the app never sets it directly, which
keeps "mark as replaced" a one-field update with no client-side date math.

## UI notes
- The whole point of this feature is a fast glance answering "what's
  overdue." It surfaces in the home dashboard's "What's due" section.
