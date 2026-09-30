# Changelog

Human-facing counterpart to the in-app "What's new" dialog
(`app/js/changelog.js` — see [`docs/18-feature-changelog.md`](docs/18-feature-changelog.md)
for how that dialog decides what's unseen). Newest first. When shipping
a user-facing change, add an entry here **and** to
`app/js/changelog.js` — they cover the same events but for different
audiences (this one can be as technical as it needs to be; the in-app
one has to stay short enough to read on a phone).

## 2026-09-30 — Document category filter chips + Drive filename prefix

- New category filter chips (All/Warranty/Contract/Receipt/ID/Other)
  above the Docs tab's search box, combining with the existing text
  search rather than replacing it.
- New uploads to Google Drive get a category prefix in the Drive-visible
  filename (e.g. `[Warranty] Boiler warranty.pdf`), so documents at least
  sort together by category if you ever browse the shared folder directly
  in Drive rather than through the app. Real Drive subfolders per
  category weren't used — they don't work with this app's OAuth scope
  without also needing a join step per category per partner; see
  [`docs/21-google-drive-documents.md`](docs/21-google-drive-documents.md)
  for why.

## 2026-09-30 — Documents move to Google Drive; any file, not just photos

- New document uploads now go to a shared Google Drive folder instead of
  Supabase Storage — see
  [`docs/21-google-drive-documents.md`](docs/21-google-drive-documents.md)
  for the full design, including why the second partner needs a one-time
  Google Picker step (`drive.file` OAuth scope only grants the app access
  to files a given user created, opened, or explicitly picked — a folder
  merely shared with their account isn't reachable via the API until
  they pick it once).
- Fixed the upload file input having `capture="environment"` set, which
  on Android forced the camera open directly instead of showing a file
  picker — PDFs and other non-image files were effectively unreachable.
  The input is now unrestricted (any file type) with no `capture`
  attribute.
- New `⚙️ Account & household → Documents storage` section: "Connect
  Google Drive" for whoever connects first (creates the shared folder in
  their own Drive, with an optional field to share it with your
  partner's Google account by email), and "Grant my account access" for
  the second partner (runs the Picker join flow above).
- Documents uploaded before this change keep working exactly as before
  against Supabase Storage — `documents.storage_provider` distinguishes
  old rows (`'supabase'`) from new ones (`'drive'`); `view`/`delete`
  branch on it. Migration `0024_google_drive_documents.sql` also adds
  `households.drive_folder_id`/`drive_folder_name`/`drive_connected_by`
  and a column-scoped `UPDATE` grant/policy for them (`households` never
  had a blanket `UPDATE` policy — same gap
  `0016_household_members_split_update.sql` hit and fixed the same way).
- Requires the repo owner to create a Google Cloud project (OAuth client
  ID + API key) — dashboard-only setup, documented in `app/js/config.js`
  and [`docs/21-google-drive-documents.md`](docs/21-google-drive-documents.md).
  Until that's done, the Docs tab shows a setup-needed message instead of
  failing silently.

## 2026-09-30 — Personal to-dos: a private reminder list

- New "My To-dos" segment in the Money tab: a reminder list scoped to you
  alone, invisible to your partner — the one feature in the app that
  isn't shared. Add a reminder (prompt, date, time, and doesn't-repeat/
  daily/weekly/monthly), mark it done, edit, or delete it.
- Push notifications for a due/overdue reminder go only to your own
  devices, not your partner's. A repeating reminder advances to its next
  occurrence after firing instead of nagging forever; a one-off is marked
  done.
- New `personal_todos` table (migration `0023_personal_todos.sql`), RLS
  restricted to its owner (`user_id = auth.uid()`) rather than the
  household-wide policy every other table uses.
- Known limitation: the reminder's chosen time of day isn't honored
  precisely yet — the daily notification check only runs once, at 8am
  Brisbane time, regardless of what time you picked. See
  [`docs/20-feature-personal-todos.md`](docs/20-feature-personal-todos.md).

## 2026-09-30 — Repeatable events: weekly, fortnightly, monthly, yearly

- Recurring events used to be yearly only (birthdays, anniversaries). The
  add/edit event form now has a "Repeats" dropdown — Doesn't repeat /
  Weekly / Fortnightly / Monthly / Yearly — good for a standing
  appointment or a chore reminder, not just an annual date.
- `thisYearOccurrence()` generalized into `currentOccurrence()` in
  `app/js/format.js`: yearly still maps onto this calendar year's
  month/day, monthly onto this calendar month's day (clamped to the
  month's last day), and weekly/fortnightly roll forward from the event's
  own anchor date in fixed 7/14-day steps. All three consumers (Events
  tab's Upcoming/Done split, the home dashboard's "Coming up" feed, and
  the `notify-due-items` push notification check) updated to match.
- New `recurring_interval` column on `events` (migration
  `0022_event_recurring_interval.sql`).

## 2026-09-28 — Monthly spend total + category breakdown

- New "This month" card on the Expenses tab (`monthlyBreakdown()` in
  `app/js/expenses.js`): total spent so far this calendar month, plus a
  category breakdown shown with the same contribution-bar/legend visual
  the Goals tab already uses for "who contributed how much" — just
  grouping by category instead of by person. A category keeps the same
  color month to month (tied to its fixed position in the categories
  list, not sort order). Hidden entirely when there's no spending yet
  this month.

## 2026-09-28 — Per-expense split override

- Any expense can now use a different split than the household default —
  the add/edit expense form (`app/js/expenses.js`) shows the same
  auto-complementing split inputs as the ⚙️ account sheet, prefilled with
  the household default. Left unchanged, the expense keeps tracking that
  default even if it's changed later; only deliberately changing it pins
  that one expense to its own split, shown on its card (e.g. "split Alex
  50/Sam 50").
- `computeBalance()` (`app/js/balance.js`) now checks each expense for an
  override before falling back to the household default, so a mix of
  overridden and default expenses balances correctly.
- New nullable `split_percent` / `split_percent_user_id` columns on
  `expenses` (migration `0020_expense_split_override.sql`).

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
