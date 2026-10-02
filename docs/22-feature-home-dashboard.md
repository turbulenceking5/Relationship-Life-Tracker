# Feature: Home dashboard

## Purpose
The first thing either partner sees on opening the app — a glance at
what's due, what's coming up, and what's still on the list, each tapping
straight through to the tab that handles it. It's mostly a summary, not a
feature in its own right — every add/edit/delete action for the data it
displays still lives on its own tab — with one exception: the shared
sticky note (below) is actually edited here.

## How it works
`render(container, ctx, navigate)` fires ten `fetchRows`/helper calls in
parallel (`events`, `rent_payments`, `mortgage_payments`, `documents`,
`custom_goals`, `expenses`, `settlements`, household members,
`grocery_items`, `personal_todos`) and lays out five sections top to
bottom. Every section computes its own slice of that data independently —
there's no shared "due items" concept spanning sections, just five
separate questions asked of the same fetch.

### Shared sticky note
A single free-text note (`households.shared_note`) at the very top of the
page, editable by either partner — for a quick household message that
doesn't need its own expense/event/to-do row (e.g. "grabbed milk
already"). The "Save note" button only appears once the textarea's
content actually differs from what's saved, and `updateSharedNote()` (in
`household.js`) mutates `ctx.household` in place after saving — same
pattern `connectAsFirstPartner()` already uses for Google Drive — so the
note persists across tab switches without a re-fetch.

### Balance banner
Reuses `computeBalance()` from `balance.js` — the same "who owes who"
math behind Money → Expenses — and shows it here too, since the balance
is otherwise two taps deep from the screen people actually open daily.
Hidden entirely once the balance is settled (`balance.settled`). Tapping
it navigates to `expenses`.

### What's due
Merges unpaid/overdue rent periods, unpaid/overdue mortgage payments, and
documents past their expiry into **one** list sorted by due date
ascending, capped to 5 — not grouped by type, which would otherwise show
every rent period ahead of every mortgage period regardless of which was
actually more urgent, just because `rent_payments` happened to be fetched
first. Each item reuses the same status pill logic as its own tab
(`dueStatus()` for rent/mortgage, `expiryStatus()` for documents — see
[`07-feature-documents.md`](07-feature-documents.md) and
[`23-feature-rent-mortgage.md`](23-feature-rent-mortgage.md)). A rent or
mortgage card navigates to `rent`; a document card navigates to
`documents`. Each card also gets a "🔔 Remind" button that pushes a
one-line nudge to the other household member — see
[`24-live-sync-and-nudges.md`](24-live-sync-and-nudges.md) — wrapped in
its own `.actions-row` with `e.stopPropagation()` so tapping it doesn't
also trigger the card's own navigate-away `onclick`. Empty state is a
green checkmark "All caught up!" rather than a plain empty-state
message, the only section styled that way.

### Upcoming events
Maps every event onto its current-cycle occurrence via
`currentOccurrence()` (see
[`03-feature-events.md`](03-feature-events.md)), keeps only ones whose
occurrence hasn't happened yet (`_next >= today`) **and** hasn't been
manually marked done for that occurrence (`completed_occurrence !==
_next`), sorts ascending, and caps to 3. A recurring event whose
occurrence has already passed this cycle just drops off the list instead
of reappearing early with its next occurrence's date — same
"has-it-happened-yet-this-cycle" logic as the Events tab's Upcoming/Done
split, just without a Done section to move it into here. Each card
navigates to `events`.

### Upcoming goals
Goals with a `target_date` that hasn't passed yet
(`target_date >= today`), no cap. Unlike Events, there's no "Done"
section for goals to move into here — a goal whose date has passed just
drops off "Upcoming goals" entirely, since the home dashboard is a
what's-next glance, not a record of what's happened (the Goals tab itself
is where a goal's full history lives — see
[`12-feature-goals.md`](12-feature-goals.md)). Each card navigates to
`goals`.

### On your plate
A one-line-each glance at the two checklist-shaped segments that
otherwise have no presence on the home dashboard: a grocery-items-to-buy
count and a personal active-reminder count. The personal to-do count is
private by construction — RLS already restricts `personal_todos` to the
signed-in user's own rows (see
[`20-feature-personal-todos.md`](20-feature-personal-todos.md)), so this
fetch can only ever see their own, same as the My To-dos segment itself.
The whole section is omitted if both counts are zero, rather than showing
two "nothing to do" lines. Tapping either row navigates into the Money
tab's Grocery List or My To-dos segment respectively.

## Navigation
`home.js` never imports another feature module or switches tabs itself —
it calls the `navigate(key)` callback `app.js` passes in. For a plain
top-level tab (`events`, `goals`, `documents`) that's just
`currentTab = key; renderMainApp()`. For a Money-tab segment
(`expenses`, `rent`, `groceries`, `todos`) `app.js`'s navigate callback
first calls `money.js`'s exported `setActiveSub(key)` before switching to
the `money` tab, so e.g. tapping a rent due-card lands directly on the
BrackenRidge segment rather than defaulting to Expenses — see
[`13-feature-money-tab.md`](13-feature-money-tab.md) for how that handoff
works.

## Data
No table belongs to the home dashboard — it's a read-only aggregate view
over `events`, `rent_payments`, `mortgage_payments`, `documents`,
`custom_goals`, `expenses`, `settlements`, `household_members`,
`grocery_items`, and `personal_todos`. See
[`02-data-model.md`](02-data-model.md) for each table's own shape.

## UI notes
- Every section has its own `section-title` and empty state — a section
  with no items still renders (with a one-line empty message), it's
  never hidden entirely, except "On your plate" when both its counts are
  zero.
- No add/edit/delete action lives here. If a future section ever needs
  one, it should navigate to the owning tab's own form rather than
  duplicating it inline.
