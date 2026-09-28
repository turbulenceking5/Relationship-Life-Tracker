# Changelog

Human-facing counterpart to the in-app "What's new" dialog
(`app/js/changelog.js` — see [`docs/18-feature-changelog.md`](docs/18-feature-changelog.md)
for how that dialog decides what's unseen). Newest first. When shipping
a user-facing change, add an entry here **and** to
`app/js/changelog.js` — they cover the same events but for different
audiences (this one can be as technical as it needs to be; the in-app
one has to stay short enough to read on a phone).

## 2026-09-28 — Recurring expenses

- New "Recurring expenses" section on the Expenses tab
  (`app/js/expenses.js`) for subscriptions, insurance, or anything else
  that repeats on a schedule — set an amount, category, and how often
  (weekly/monthly/yearly/custom), and it logs itself as a regular expense
  each period with no one needing to open the app. Pause a template
  without losing its already-logged history, or delete it outright.
- New `recurring_expenses` table (migration `0019_recurring_expenses.sql`)
  and a daily `pg_cron` job (`process-recurring-expenses-daily`) that
  calls a `process_recurring_expenses()` Postgres function — pure SQL, no
  edge function or HTTP call involved, since it never leaves the
  database. Catches up every skipped period if a template was paused for
  a while.

## 2026-09-28 — Push notifications are actually wired up now

- `notify-due-items` (the daily edge function behind push notifications,
  see [`docs/11-push-notifications.md`](docs/11-push-notifications.md))
  used to run every day and send nothing — it watched two features
  (replacements, repayments) that were removed a while back. It now scans
  every live due-date source instead: unpaid rent, unpaid mortgage, a
  goal's target date (skipped once fully saved), an expired document, and
  same-day events (birthdays/anniversaries included). See
  [`docs/19-notification-sources.md`](docs/19-notification-sources.md)
  for exactly what triggers each one.
- New `last_notified_date` column on `rent_payments`, `mortgage_payments`,
  `custom_goals`, `documents`, and `events` (migration
  `0018_notification_sources.sql`) so each item notifies at most once per
  calendar day, escalating daily while it stays overdue — except events,
  which only notify on the day itself.

## 2026-09-28 — Search, document expiry alerts, and a smarter What's due

- Added a search box to Expenses (`app/js/expenses.js`) and Documents
  (`app/js/documents.js`) — matches title/category/notes/paid-by for
  expenses, title/category/linked-goal for documents, case-insensitive
  substring, filtering the already-fetched list client-side. Hidden
  entirely when the list is empty.
- Documents with an `expiry_date` now show a status pill (`Expires in
  Nd` / `Expired Nd ago`) once within 14 days of expiring or already
  past it, via a new `expiryStatus()` in `documents.js` (same
  overdue/due-soon/ok thresholds as `dueStatus()`, expiry-appropriate
  wording). An expiring/expired document also feeds into the home
  dashboard's "What's due".
- The home dashboard's "What's due" feed now merges rent, mortgage, and
  expiring documents into one list sorted by date, instead of showing
  every rent period before every mortgage period regardless of which is
  actually more urgent.

## 2026-09-28 — Home tab: events and goals split apart

- The Home tab's "Coming up" feed is now two separate sections,
  "Upcoming events" and "Upcoming goals", instead of one list mixing
  both record types together. Each keeps its own empty-state message
  when it has nothing to show.

## 2026-09-28 — Mortgage tracking, changelog, and a real expense-split fix

- BrackenRidge now tracks the mortgage payment alongside rent, not just
  the rent — a `mortgage_payments` table (mirrors `rent_payments`) and a
  Mortgage section next to Rent in `rent.js`.
- Paid rent/mortgage periods moved out of the main scroll into a
  collapsed "History" section at the bottom of the BrackenRidge segment,
  so a long payment history doesn't push the other section's current
  periods off screen.
- Added this changelog: an in-app "What's new" dialog on load (via
  `app/js/changelog.js`) plus this file.
- Fixed the expense split silently never saving — `household_members`
  had no `UPDATE` RLS policy, so changing the split away from 50/50
  looked like it worked but was never actually written.

## 2026-09-18 — Grocery list, recipes, and a smarter Events tab

- Added Grocery List and Recipes segments to the Money tab.
- Events tab: split into "Upcoming" and "Done" for the current year,
  instead of a recurring event that already happened this year sitting
  in "Upcoming" with a misleading next-year date.
- Home dashboard: passed events and goals now drop off the "Coming up"
  feed instead of showing early with a future-looking date.
- Added an in-app Light/Dark/Auto theme toggle, independent of the
  device's own dark-mode setting.

## 2026-09-16 — Money tab, editing, and dark mode

- Consolidated Expenses/Rent/Replacements/Repayments into a Money tab
  with a segmented sub-nav, and reworked Goals into a generic
  user-created-goal container.
- Added edit flows for every record type (previously delete-and-re-add
  was the only fix for a typo).
- Added a configurable expense split ("who owes who" balance) instead
  of assuming 50/50.
- Added recurring yearly events for birthdays/anniversaries.
- Added a dark-mode "glow" visual theme.
