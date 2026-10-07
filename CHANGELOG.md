# Changelog

Human-facing counterpart to the in-app "What's new" dialog
(`app/js/changelog.js` — see [`docs/18-feature-changelog.md`](docs/18-feature-changelog.md)
for how that dialog decides what's unseen). Newest first. When shipping
a user-facing change, add an entry here **and** to
`app/js/changelog.js` — they cover the same events but for different
audiences (this one can be as technical as it needs to be; the in-app
one has to stay short enough to read on a phone).

## 2026-10-07 — Income category for money coming into your account

- **Added `income`** as a category option on bank statement
  transactions — but deliberately *not* to `expenses.js`'s shared
  `CATEGORIES` list: a logged expense is always an outflow, so "Income"
  would be a nonsensical option on the Add Expense form. New
  `STATEMENT_CATEGORIES` constant in `app/js/statements.js`
  (`[...CATEGORIES, 'income']`) is what the statement-side category
  pickers and keyword matcher use instead; `expenses.js`'s own
  `CATEGORIES` is untouched.
- **New `income` keywords** in `CATEGORY_KEYWORDS`: `salary`, `payroll`,
  `wages`, `centrelink`, `refund`, `reimbursement`, `cashback`,
  `dividend`, `interest credit`. Checked in the same single ordered
  pass as every other category.
- Income transactions never appear in the spend category-breakdown chart
  or the "Compared to last statement" trend (both already filter to
  `amount < 0`), so no chart/color changes were needed for this.
- **Known collision from this entry, fixed the same day** — see the
  entry directly below.

## 2026-10-07 — Fixed rent/income auto-categorization collision

- **`guessCategory(description, amount, rules)`** (`app/js/statements.js`)
  now takes the transaction's `amount` and uses its sign to gate which
  half of `STATEMENT_CATEGORIES` even gets checked, before a single
  keyword is matched: a negative amount (money out) only ever matches
  an expense category's keywords; a positive amount (money in) only
  ever matches `income`'s. Previously every category was checked
  against every transaction regardless of direction, in a fixed order
  with `rent` ahead of `income` — so a positive-amount incoming rent
  deposit from the BrackenRidge property's managing agent (anything
  containing "rental"/"real estate") matched `rent`'s keywords first
  and was saved as a confidently-wrong expense, never surfacing in
  "Needs review" to be caught.
- This is a general fix, not a one-off patch for the word "rental": it
  rules out the same collision for any other keyword an expense
  category and `income` happen to share, now or in the future. A
  positive-amount transaction that doesn't contain an actual income
  keyword now correctly lands in "Needs review" instead of being
  silently misfiled.
- Updated the one call site (`openUploadStatementSheet()`'s submit
  handler) and the explanatory comments on `CATEGORY_KEYWORDS`, its
  `income` entry, and `guessCategory()` itself.
- See [`docs/27-feature-bank-statements.md`](docs/27-feature-bank-statements.md)
  → "Auto-categorization and 'Needs review'".

## 2026-10-07 — Statement categorization now learns from your picks

- **New `bank_transaction_category_rules` table** (migration
  `0039_bank_transaction_category_rules.sql`): one row per merchant
  you've manually categorized (`merchant_key`, `category`), unique on
  `(user_id, merchant_key)`. Private per-user, owner-only RLS
  (`user_id = auth.uid()`), same shape as `bank_statements`/
  `bank_transactions` — not added to the `supabase_realtime`
  publication, same reasoning as those two.
- **`extractMerchantKey(description)`** (`app/js/statements.js`):
  extracts a stable key from a transaction's description — its leading
  word, with filler like "the"/"a" stripped — deliberately as simple as
  the existing static `CATEGORY_KEYWORDS` list, not a real normalizer.
  Correctly drops trailing store-number/suburb noise for chain merchants
  ("WOOLWORTHS 1234 BRISBANE" → `woolworths`), at the cost of only
  capturing the first word of a genuinely multi-word brand typed by hand.
- **`guessCategory()`** now takes an optional `rules` map and checks it
  *after* the static keyword list finds nothing — so a learned rule can
  never override a category the curated list already gets right.
- **Saving a manual pick learns the rule** (`learnCategoryRule()`), from
  both the bulk "Save changes" button and the "+ Add transaction"
  sheet — upserted via `(user_id, merchant_key)`, so recategorizing the
  same merchant later updates its existing rule rather than adding a
  second one.
- **Saving also sweeps your whole "Needs review" backlog**
  (`applyLearnedRulesToUnknown()`): every one of your `'unknown'`
  transactions, across every statement (not just the one you're
  looking at), gets re-checked against your full rule set and
  auto-categorized on any match. One pick can clear out every other
  occurrence of that merchant sitting unresolved anywhere, not just the
  transaction you touched.
- **Learned rules are also applied at upload time**: `guessCategory()`
  is called with this user's rules fetched fresh for every new
  statement upload, so a merchant you've already taught the app
  auto-categorizes on arrival instead of needing a manual pick again.
- Both the rule-saving and the backlog sweep are best-effort — a
  learning write failing never blocks or rolls back the category change
  that was actually requested.
- See [`docs/27-feature-bank-statements.md`](docs/27-feature-bank-statements.md)
  → "Learning from your picks".

## 2026-10-07 — Three new expense categories: Food, Pet, Online Shopping

- **Added `food`, `pet`, and `online shopping`** to `CATEGORIES`
  (`app/js/expenses.js`), the shared taxonomy used by both expenses and
  statement transactions (`app/js/statements.js`). Appended at the end
  of the list rather than inserted earlier, since a category's chart
  color is its fixed array position — inserting one earlier would've
  silently reassigned every later category's color.
- **Dining/takeaway keywords moved from `leisure` to `food`** in
  `statements.js`'s auto-categorizer (`CATEGORY_KEYWORDS`): restaurants,
  cafes, Uber Eats/Menulog/DoorDash/Deliveroo, and fast-food chains now
  auto-categorize as Food instead of Leisure on future statement
  uploads. Doesn't retroactively touch anything already saved.
- **New `pet` keywords** (Petbarn, vets, etc.) and **`online shopping`
  keywords** (Amazon, eBay, AliExpress, etc.) added to the same
  auto-categorizer.
- **Chart color handling**: this app has exactly 8 fixed, CVD-checked
  categorical colors (`--series-1`..`--series-8`), and the category list
  just grew from 7 to 10. Rather than generate a 9th/10th hue that could
  collide with an earlier category's color, the two categories beyond
  the 8-color palette (`pet`, `online shopping`) share a neutral
  fallback swatch (`var(--text-muted)`) in the spending-breakdown
  charts — they're still fully distinct, selectable categories
  everywhere else. New shared `categoryColor(cat)` helper (exported from
  `expenses.js`) is the single source of truth for this, used by both
  the Expenses "This month" breakdown and the My Statements
  per-statement breakdown so the two charts can never disagree on a
  category's color.
- See [`docs/04-feature-expenses.md`](docs/04-feature-expenses.md) →
  "Monthly total + category breakdown" and
  [`docs/27-feature-bank-statements.md`](docs/27-feature-bank-statements.md)
  → "Auto-categorization and 'Needs review'".

## 2026-10-07 — Statement overview is now private, renamed "My Statements"

- **Statements are now private per-user, not shared across the
  household**: converted `bank_statements`/`bank_transactions` from
  `is_household_member(household_id)` RLS to owner-only
  (`uploaded_by = auth.uid()`, via the owning statement for
  `bank_transactions`), the same shape `personal_todos` already uses —
  migration `0038_bank_statements_private.sql`. Each partner now only
  ever sees their own uploaded statements and parsed transactions; there
  is no shared list either partner sees both halves of. Both tables were
  also dropped from the `supabase_realtime` publication (private
  per-user data has no partner to sync live to).
- **Renamed "Statement overview" to "My Statements"** in the Money tab's
  sub-nav (`app/js/money.js`), matching the "My To-dos" naming
  convention for the other private-per-user segment.
- **Known, accepted gap**: the uploaded statement *file* itself still
  lands in the one shared household Google Drive folder (unchanged —
  the narrow `drive.file` OAuth scope this app uses rules out a private
  per-partner subfolder, same constraint already documented for
  Documents), so it's technically visible to a partner who browses that
  folder directly in Drive, even though the app's own UI never shows
  their parsed transactions.
- See [`docs/27-feature-bank-statements.md`](docs/27-feature-bank-statements.md)
  → "Private per-user, not shared — like My To-dos".

## 2026-10-07 — Bulk category assignment on statement transactions

- **No more per-transaction Save, no more collapsed sections**: picking
  a category for a statement transaction used to save immediately and
  re-render the whole Statement overview tab — which, since nothing
  preserved `<details>` open/closed state across that rebuild, closed
  the very statement section you were working in on every single pick.
  `transactionRow()` (`app/js/statements.js`) no longer has a per-row
  Save button at all; picking a category just records it in that
  statement's own `pendingChanges` map (re-picking back to the original
  value removes it from the map, not queuing a no-op write), and one
  **"Save changes (N)"** button per statement commits everything
  pending in one batch. Categorize three, ten, or every transaction in
  a statement, then save once.
- **Open sections now survive a save**: `render()` captures which
  `<details>` are open before rebuilding and reopens the matching ones
  after — same trick `app.js`'s Realtime refresh guard already uses for
  the main app shell, except matched by a stable `data-key`
  (`stmt:<id>`/`needs:<id>`/`cat:<id>`) rather than summary text, since
  "Needs review (N)"/"All categorized transactions (N)"'s own counts
  change on exactly the save this needs to survive — text-matching
  would've silently failed for those two. Scroll position is restored
  the same way. Verified against two statements: opening one manually,
  saving a category inside it, and confirming it stays open while the
  untouched one stays closed exactly as before.
- See [`docs/27-feature-bank-statements.md`](docs/27-feature-bank-statements.md)
  → "Auto-categorization and 'Needs review'" and "Open sections survive
  a save — matched by key, not title".

## 2026-10-07 — Fixed PDF statement parsing: broken library + wrong amounts

Found by uploading a real statement and getting "$0.00 spent / No
transactions" with no error — reproduced end to end (real pdf.js
extraction plus `parsePdfTransactions()` run against the statement's
actual text) rather than guessed at from the code. Two separate bugs,
both in `app/js/statements.js`:

- **pdf.js never actually loaded, for anyone.** `ensurePdfJsLoaded()`
  requested `pdf.min.js`/`pdf.worker.min.js` from cdnjs via a classic
  `<script src>` — those paths 404 for this pdf.js version; cdnjs only
  ships the `.mjs` (ES module) build here. Because
  `parseStatementFile()`'s broad `try/catch` returns `[]` on any
  failure (correct for a genuinely unreadable scanned PDF, not for a
  broken library URL), this failed completely silently — every PDF
  upload "succeeded" with zero transactions, indistinguishable from a
  scanned statement. Fixed by loading the `.mjs` build via dynamic
  `import()` (confirmed to actually exist via cdnjs's own file listing
  first) instead of a script tag, and by `console.warn`-ing the real
  error on a parse failure instead of swallowing it without a trace.
- **The running balance was being recorded as the transaction amount.**
  A standard AU bank statement shape (`Date | Description | Withdrawal
  | Deposit | Balance`) puts two dollar amounts on each transaction
  line; `parsePdfTransactions()` picked the *last* one — the balance —
  as the transaction amount, leaving the real amount stuck in the
  description text instead. Every transaction from a statement with a
  balance column got a plausible-looking but entirely wrong amount,
  with nothing to catch it. Fixed: with more than one number on a
  line, the second-to-last is now the amount and the last is the
  (dropped) balance; with exactly one number, unchanged. See
  [`docs/27-feature-bank-statements.md`](docs/27-feature-bank-statements.md)
  → "Two real bugs found testing against an actual statement".

## 2026-10-07 — Statement overview: upload, parse, and categorize bank statements

- **New Money tab segment, "Statement overview"**: upload a bank
  statement (CSV or PDF, `app/js/statements.js`) and it's parsed
  client-side into individual transactions, auto-categorized against the
  same `CATEGORIES` list Expenses uses (now exported from
  `app/js/expenses.js`) via a plain keyword map. CSV parsing handles both
  a single signed Amount column and separate Debit/Credit columns, with
  or without a header row; PDF parsing lazily loads pdf.js from cdnjs and
  scans extracted text for `<date> ... <amount>` lines — best-effort,
  since it only works on a text-based PDF (not a scanned one).
- **"Needs review"**: anything the keyword matcher can't place lands
  with `status = 'unknown'` in an open-by-default section with an
  inline category picker — picking one updates it in place via Realtime
  the same as everything else in the Money tab. Already-categorized
  transactions sit in a collapsed section below, editable the same way.
- **Per-statement report**: a spend/received total, a category
  breakdown using the same contribution-bar visual as Expenses' "This
  month" card, and a "Compared to last statement" trend per category
  (rises of 15%+ flagged, drops shown as a quiet win) — a lightweight
  Buddy-style insight without a real analytics pipeline.
- **New tables**: `bank_statements`, `bank_transactions` (migration
  `0037_bank_statements.sql`), household-scoped RLS, added to the
  `supabase_realtime` publication.
- **Why no new "Bank Statements" Drive subfolder**: statements upload
  into the household's existing shared Drive folder (same one Documents/
  backups use), renamed to their period and prefixed `[Bank Statement]`
  — a dedicated subfolder would hit the same `drive.file`
  per-partner-access fork-into-duplicates problem already documented for
  Documents' category folders. See
  [`docs/27-feature-bank-statements.md`](docs/27-feature-bank-statements.md).
- **Period(s) detected, not asked, and split correctly across months**:
  the upload sheet originally pre-filled an editable "Statement
  month"/"Year" pair for the uploader to check on every single upload —
  removed. Worse, it also forced the *whole* upload under one guessed
  month, which is wrong for a statement that spans more than one
  calendar month (a billing-cycle export, a multi-month history dump).
  `splitIntoPeriods()` now groups the parsed transactions by the
  calendar month each one's own date actually falls in, and the upload
  creates one `bank_statements` row **per represented month**, not one
  row per upload — all sharing the same underlying Drive file (one
  file, uploaded once; its name reflects the full span, e.g.
  `"[Bank Statement] February 2026 – April 2026.pdf"`), each with its
  own exact month as its label for reporting/trend purposes. The status
  line under the file picker reports what was detected — one period
  ("Found 4 transactions for March 2026") or several ("Found 87
  transactions across 2 periods: October 2026 (52), November 2026
  (35)") — rather than asking for confirmation. Deleting one period
  from a multi-period upload only deletes that period's row; the
  shared Drive file is only removed once no other period still
  references it. There's no edit-period action afterward — a wrong
  guess means correcting it by hand or deleting that period and
  re-uploading. See
  [`docs/27-feature-bank-statements.md`](docs/27-feature-bank-statements.md)
  → "One upload, one or more periods — detected, never asked".

## 2026-10-06 — Rolling retention on Drive backups

- **Keep only the last 10 backups**: `pruneOldBackups()` in
  `app/js/backup.js` runs after every successful backup and deletes
  anything past the 10 most recent `Backup *.json` files in the
  household's Drive folder (`listFilesInFolder()`, a new export in
  `app/js/googleDrive.js`, scoped to the household's folder + name
  prefix). File *size* was never a concern (every backed-up table is
  small text rows — no file blobs — so even years of regular use stays
  in the tens of KB to low single-digit MB range); file *count* was: an
  unbounded weekly trail would eventually clutter the same folder the
  household's actual documents live in. 10 backups at the current
  ~weekly cadence is roughly 2-3 months of point-in-time history.
  Pruning failure is logged and swallowed, not thrown — the backup
  itself already succeeded by that point. See
  [`docs/25-feature-backup.md`](docs/25-feature-backup.md).

## 2026-10-06 — Fixed Google Drive uploads/backup failing with "Google scripts did not load in time"

- **Service worker stopped intercepting third-party script loads**:
  `service-worker.js`'s fetch handler only ever bypassed its own
  cache-first pipeline for `*.supabase.co` requests — every other
  cross-origin request, including the two Google Identity
  Services/API script tags `index.html` loads for Drive
  (`accounts.google.com/gsi/client`, `apis.google.com/js/api.js`), got
  routed through the service worker's own `fetch()`/`cache.match()`
  instead of the browser's normal script-loading path. That's a known
  source of a cross-origin `<script>` load silently failing or hanging
  on some engines, and the `cache.put()` was already origin-gated to
  same-origin responses only, so none of this ever bought anything for
  a third-party request. Generalized the bypass from "Supabase only" to
  "any non-same-origin request." See
  [`docs/21-google-drive-documents.md`](docs/21-google-drive-documents.md)
  → "Known failure mode."
- If uploads/backup still fail with this error after updating, it's no
  longer something the app's code controls — a content blocker or
  network policy is blocking Google's own domains outright, same
  category as this project's other dashboard-only limitations.

## 2026-10-06 — Dropped the text label on the .ics download button

- The per-event `.ics` download button (`app/js/events.js`) now shows
  just the `🗓️` icon, not `🗓️ .ics` — the visible ".ics" text was
  redundant now that the icon itself reads clearly; the button's
  `aria-label` ("Download to calendar (.ics)") already covers screen
  readers, so nothing accessibility-relevant changed.

## 2026-10-06 — Fixed the Events icon looking like a stuck date

- **Calendar emoji (📅) replaced with 🗓️**: the Events tab icon, the
  "appointment" category icon on Home, and the per-event ".ics" download
  button all used `📅` (U+1F4C5 CALENDAR) as a generic calendar/events
  icon — on some devices/fonts that glyph's artwork bakes in a fixed,
  specific date (unrelated to any real date in the app), which read as
  a stuck or wrong date repeated identically everywhere the icon
  appeared. Swapped for `🗓️` (U+1F5D3 SPIRAL CALENDAR) in `app/js/app.js`,
  `app/js/home.js`, and `app/js/events.js`, which renders as a generic
  calendar with no baked-in date on every major platform.

## 2026-10-04 — Pre-signup "Add to Home Screen" interstitial

- **Install prompt before auth**: a brand-new visitor in a regular
  browser tab now sees an install interstitial *before* the sign-up/log-in
  screen even loads (`app/js/installPrompt.js`,
  `renderInstallInterstitial()` in `app.js`) — on Chromium browsers
  (Android Chrome, desktop Chrome/Edge) a real "Install app" button via
  the captured `beforeinstallprompt` event; on iOS Safari (which has no
  such event) manual "Share → Add to Home Screen" instructions; on
  anything else (nothing actionable to offer) it's skipped entirely.
  Shown once per browser, like onboarding/changelog/the push-notification
  prompt. See [`docs/26-feature-install-prompt.md`](docs/26-feature-install-prompt.md)
  for why the check briefly (up to 500ms, first boot only) waits for the
  `beforeinstallprompt` event rather than checking for it immediately —
  a real race that would otherwise make the native install button
  permanently unreachable.

## 2026-10-04 — Accessibility pass

- **Icon-only button labels**: every button whose visible content is
  just an emoji/symbol with no adjacent text (every "+" FAB, the 💬
  comment button, the 🗓️ .ics-download button) now has an `aria-label`,
  so a screen reader announces what it does instead of just the emoji's
  Unicode name. The comment button's label updates alongside its count.
- **Decorative icons hidden from screen readers**: an icon sitting next
  to text that already says the same thing (home.js's `.card-icon`, the
  tabbar's `.tab-icon`) is now `aria-hidden`, so it isn't announced
  redundantly on top of the text beside it.
- **Reduced motion / increased contrast**: `styles.css` now honors
  `prefers-reduced-motion: reduce` (a blanket animation/transition
  override, and the goal-celebration confetti hidden outright) and
  `prefers-contrast: more` (higher-contrast muted-text/border colors, in
  both light and dark) globally, the same OS-driven-by-default
  philosophy as the existing dark-mode handling — no new in-app toggle.
  See [`docs/14-ui-patterns.md`](docs/14-ui-patterns.md).

## 2026-10-04 — Automatic backup to Google Drive

Migration `0036_household_last_backup_at.sql` adds
`households.last_backup_at`.

- **Automatic backup**: once Google Drive is connected, household data
  (expenses, events, goals, grocery list, recipes, document metadata,
  etc.) now backs up there as a dated JSON file roughly once a week
  (`app/js/backup.js`, `backupHouseholdIfDue()`), triggered
  opportunistically on app open rather than a true server-scheduled job
  — see [`docs/25-feature-backup.md`](docs/25-feature-backup.md) for why
  (short version: this app's Drive access is deliberately client-only,
  with no refresh token ever persisted anywhere, so there's no
  server-side credential a cron job could use). A new "Back up now"
  button in ⚙️ Account & household → Documents storage runs one
  immediately, and the section now shows when the last backup happened.

## 2026-10-04 — Download an event as .ics

- **Per-event .ics download**: a new "🗓️" button on every event
  card downloads that one occurrence as a single-date `.ics` file
  (`app/js/ics.js`, built entirely client-side — no backend change), for
  importing into Apple/Google/Outlook Calendar. Only the one occurrence
  currently on the card, not a subscribable feed of every future
  occurrence — that's still the separate Phase 5 "iCal feed" stretch
  goal. See [`docs/03-feature-events.md`](docs/03-feature-events.md).

## 2026-10-04 — Chore fairness tally

- **Fairness tally**: a rotating recurring event (`rotate_assignee`) now
  shows a running "Alex 5 · Sam 4" tally next to "It's _Name_'s turn"
  (`fairnessTally()` in `app/js/events.js`) — how many turns each person
  has had so far, not just whose turn it is right now. No new data or
  migration: the rotation is already fully deterministic (strict
  alternation by cycle parity), so the tally is derived arithmetic on
  the existing `occurrenceCycleCount()`, same as the turn label itself.
  Shown whether or not the current occurrence is done, unlike the turn
  label, since it's a running count rather than a right-now status. See
  [`docs/03-feature-events.md`](docs/03-feature-events.md).

## 2026-10-04 — Comment thread on expenses and events

Migration `0035_item_comments.sql` adds the `item_comments` table.

- **Comment thread**: a new 💬 button on every expense and event card
  opens a thread of plain text comments (`app/js/comments.js`,
  `openCommentsSheet()`), shared across the household — a running
  back-and-forth note on a specific record instead of a text message
  outside the app. `item_comments` uses a polymorphic
  `entity_type`/`entity_id` pair rather than a foreign key, since it
  attaches to rows in either of two different tables; any household
  member can post or delete any comment, same shared-trust model as
  every other table in the app.
- The card badge ("💬 N") comes from one `getCommentCounts()` query per
  tab render (grouped client-side by `entity_id`), not one query per
  card — same N+1-avoidance pattern as everything else in this app.
- Deleting an expense or event also deletes its comment thread
  (`deleteCommentsFor()`), since there's no DB-level cascade for a
  polymorphic reference.

See [`docs/04-feature-expenses.md`](docs/04-feature-expenses.md) and
[`docs/03-feature-events.md`](docs/03-feature-events.md).

## 2026-10-04 — Log a personal expense without splitting it

Migration `0034_expense_is_personal.sql` adds `expenses.is_personal`.

- **Personal expenses — don't split at all**: distinct from the existing
  per-expense split override (`buildSplitField()`), which still splits
  an expense just at a different ratio, a new "Personal expense — don't
  split with my partner" checkbox on the add/edit form
  (`buildPersonalToggle()` in `app/js/expenses.js`) excludes the expense
  from the "who owes who" balance entirely. `computeBalance()` in
  `balance.js` skips any expense with `is_personal` set before it ever
  enters either partner's paid/owed totals. Checking it hides the split
  field (moot once an expense isn't being split); shown on the card as
  "· personal" in place of a split note. Still counts toward the "This
  month" total and category breakdown — a personal purchase is still
  real spending, just not shared spending.

## 2026-10-04 — Leave a household, or remove a member

Migration `0033_remove_household_member.sql` adds a
`remove_household_member(p_user_id)` RPC.

- **Leave a household, or remove a member**: previously there was no
  way to cut off a household member's access short of the project owner
  hand-running SQL in the dashboard — a household that split up would
  leave an ex-partner as a full member indefinitely. A new "Household
  members" section in ⚙️ Account & household lists the roster with
  "Leave household" on your own row, and "Remove" on the other
  member's row if you're the one who created the household.
  `remove_household_member()` is `SECURITY DEFINER` (same pattern as
  `create_household`/`join_household`) — the owner-only restriction on
  removing someone else is enforced there, server-side, not just by the
  button being hidden client-side. After leaving, the account sheet
  closes and the app re-runs its normal post-auth check, routing to the
  create/join screen exactly as it would for a brand-new account.

## 2026-10-04 — Proactively ask to enable push notifications

- **A one-time prompt for push notifications**: previously the only way
  to turn on due-date push notifications was to find it in ⚙️ Account &
  household — easy to never notice, and nothing ever asked. `app.js` now
  chains a third dialog onto the existing onboarding → changelog sequence
  on load (same "only one dialog open at once" pattern both already
  use): once per browser, only when it's actually one tap away — push
  supported, the app installed to the home screen (`isStandalone()`,
  since `enablePush()` requires it), and not already enabled — it asks
  "Enable notifications" or "Not now." `shouldShowPushPrompt()`/
  `markPushPromptSeen()` in `notifications.js` track the once-per-browser
  part the same way `onboarding.js`/`changelog.js` already do. Declining
  isn't permanent; the manual toggle in the account sheet still works
  either way. Deliberately doesn't nag anyone who hasn't installed the
  app yet — that's a separate problem (a pre-signup "Add to Home Screen"
  walkthrough would be the real fix), not one this prompt should paper
  over.

## 2026-10-04 — Bug-fix batch from a 3-agent audit

Three parallel research agents (security/RLS, code-quality/tech-debt,
external feature research) were run against the app as it stood after
the live-sync/remind/digest/goal-close batches. This entry covers the
confirmed bugs and small cleanups that came back; the new feature ideas
ship separately as their own entries.

- **Fixed `remind-partner`'s missing CORS headers**: it's the only edge
  function invoked directly from a browser (every other one is
  `pg_cron`-only), and without `Access-Control-Allow-Origin`/`-Headers`
  and an `OPTIONS` branch, the browser's own preflight request — sent
  because the real request carries an `Authorization` header — failed
  before the function's code ever ran. The "🔔 Remind" button has likely
  been non-functional in every real browser since it shipped. Also added
  a 5-minute per-household cooldown (`households.last_reminded_at`,
  migration `0032`) against unlimited push spam.
- **Fixed Realtime live-sync clobbering an in-progress inline edit**:
  Goals' and Recipes' "Edit ___" forms render directly into the page
  (unlike every other edit flow, which is a `<dialog>`) — a partner's
  unrelated change during the 400ms debounce window could silently
  revert an open edit form before anyone had even focused a field in it.
  `app.js`'s `scheduleRefresh()` now also skips while a `[data-editing]`
  card is open, and preserves scroll position and open `<details>`
  sections (by summary text) across any live-triggered re-render instead
  of resetting them.
- **Fixed a coincidental-constant bug in `events.js`**: the add-event
  form's "Repeats" default was computed from an always-true constant
  expression that only produced the right answer because of an
  unrelated coincidence (the category select's own default happening to
  match). Both selects now derive their initial value from the same
  named `initialCategory`, so they can't drift apart if either one's
  default logic changes later.
- **Documents now show "added by"**, matching every other card type —
  `uploaded_by` was already stored but never read.
- **Documents' upload form uses the shared `withBusyLabel()` helper**
  instead of hand-rolled disable logic; its edit form (which had no
  submit-disable at all) got one too.
- **Search boxes added to Events and My To-dos**, matching every other
  list (Expenses/Grocery List/Recipes/Documents already had one, with no
  principled reason these two didn't).
- **Fixed a real latent date bug while deduplicating `addDays()`**:
  `rent.js`'s copy used `toISOString()`, which converts to UTC — for
  anyone east of UTC (Brisbane included, per this app's own household),
  local midnight can land on the *previous* UTC day, so "mark as paid →
  next period" was silently computing the next due date one day early.
  `personal-todos.js` had its own correct, local-time copy already; both
  now share one `addDays()` in `format.js`, fixed.
- **Consolidated `dueStatus()`/`expiryStatus()`'s day-threshold logic**
  into one `dayThresholdStatus()` in `format.js` — the two were
  duplicated copies of the same overdue/due-soon/ok bucketing with only
  the label wording differing; a threshold change now updates both.

## 2026-10-02 — Finish or close a goal

Migration `0031_goal_closed_at.sql` adds `custom_goals.closed_at`.

- **Finish/close a goal**: a "Finish goal"/"Reopen goal" button (next to
  "Edit goal") sets or clears `closed_at`. Not tied to hitting the
  target — a goal with no `target_amount` (a plain checklist-style goal)
  had no way to be marked done at all before this, and a goal that does
  have a target otherwise stays open forever once reached unless someone
  deletes it outright and loses its history. A closed goal moves into
  its own collapsed "Closed goals" section at the bottom of the Goals
  tab (same pattern as Events' Upcoming/Done split and Rent's History
  section), drops off the home dashboard's "Upcoming goals" and
  `notify-due-items`'s target-date escalation, but stays fully viewable
  and editable — Reopen undoes it any time.

## 2026-10-02 — Live sync, remind-your-partner, and a weekly digest

Migration `0029_enable_realtime_publication.sql` adds every shared-list
table to the `supabase_realtime` publication. Migration
`0030_schedule_weekly_digest.sql` schedules the new `weekly-digest` edge
function. New edge function `remind-partner` (client-callable, JWT-verified,
unlike every other edge function so far).

- **Live refresh across phones (Realtime)**: `app/js/realtime.js` opens
  one Supabase Realtime channel per household, listening for
  `postgres_changes` on every shared table (`events`, `expenses`,
  `recurring_expenses`, `custom_goals`, `goal_transactions`,
  `goal_tasks`, `rent_payments`, `mortgage_payments`, `documents`,
  `grocery_items`, `recipes`, `settlements`, `households`) filtered to
  that household's id. `app.js` debounces incoming changes (400ms, to
  collapse a burst into one re-render) and re-renders the current tab —
  skipped while the cursor is in an inline search box (every add/edit
  form is a `<dialog>` outside `main`, so this never interrupts filling
  one out) so a live update can't yank typed text out from under
  someone. `personal_todos` is deliberately excluded — it's private per
  user, so there's nothing cross-partner to sync. RLS still gates what
  each client actually receives; this only adds these tables to what
  Realtime watches.
- **"🔔 Remind" nudge on overdue items**: a button on each "What's due"
  card on Home calls a new `remind-partner` edge function, which looks
  up the *other* household member's push subscriptions (a user can only
  read their own via RLS, so this needs the function's service-role
  client) and sends them a one-line push — "BrackenRidge Rent is overdue
  3d", etc. — instead of texting them separately. Membership in the
  household being nudged is verified via a client scoped to the caller's
  own JWT (so `household_members`' own RLS does the actual gatekeeping),
  before the service-role client is used for anything.
- **Weekly "state of us" digest**: a new `weekly-digest` edge function,
  scheduled once a week (Sunday 18:00 Australia/Brisbane) via the same
  `pg_cron` + shared-secret pattern as `notify-due-items`. One push per
  household recapping the last 7 days — total spent, total saved toward
  goals, events coming up in the next 7 — deliberately light and
  non-competitive, same framing as the on-time streak badge.

## 2026-10-02 — Shared note, event-goal links, chore rotation, goal celebrations, rent streak

Migration `0028_home_note_and_event_extras.sql` adds `households.shared_note`,
`events.rotate_assignee`, `events.assignee_user_id`, and
`events.related_goal_id`.

- **Shared sticky note on Home**: a single free-text note
  (`households.shared_note`) editable by either partner, shown at the top
  of the Home tab — for quick household messages ("grabbed milk
  already"). Saved via `updateSharedNote()` in `household.js`; the "Save
  note" button only appears once the text has actually changed. Updates
  `ctx.household` in place after saving (same pattern
  `connectAsFirstPartner()` already used for Google Drive) so the note
  persists across tab switches without a re-fetch.
  While touching `getMyHousehold()`'s select for this, also fixed a
  latent bug: it never selected the Drive columns
  (`drive_folder_id`/`drive_folder_name`/`drive_connected_by`), so a page
  reload after connecting Drive would lose that state and incorrectly
  re-prompt to connect it again — it only worked within a session because
  `connectAsFirstPartner()` mutates `ctx.household` in place.
- **Chore rotation on recurring events**: a recurring event can now
  alternate between exactly two household members each occurrence
  (`rotate_assignee` boolean + `assignee_user_id` anchor), shown as "It's
  _Name_'s turn" on its card, suppressed once the occurrence is marked
  done. No per-occurrence storage — parity is computed client-side from
  the new `occurrenceCycleCount()` helper in `format.js` (even cycles
  since the anchor stay with the anchor assignee, odd cycles flip).
  Rotation is only offered when the event repeats and the household has
  exactly two members.
- **Link an event to a goal**: `events.related_goal_id` (same
  `on delete set null` pattern as `documents.related_type/related_id`),
  surfaced as a "Link to a goal" select on the add/edit form and "linked
  to _Goal_" text on the card.
- **Goal milestone celebration**: a one-time confetti burst
  (`.confetti-burst` in `styles.css`) when a goal's saved total first
  reaches its target, gated by a `localStorage` flag per goal ID so it
  plays once per goal per browser. The "🎉 Goal reached!" text itself
  still shows every time the goal is at or past target, not just once.
- **Rent/mortgage on-time streak**: a quiet "✓ Paid on time N periods
  running" line in `rent.js`, computed from existing
  `paid_date`/`due_date` history with no new input, shown only once
  there's an actual streak (2+) to avoid noise. Deliberately has no "at
  risk" countdown or per-partner scoring.

## 2026-10-02 — Grocery edit flow, recipe import, submit-disable, added-by labels

A batch of UX-audit fixes, implemented together:

- **Grocery item edit flow**: `grocery.js` gained an edit sheet (title,
  quantity, category) — previously the only list without one, meaning a
  typo meant delete-and-re-add (and losing the auto-guessed category).
  Also added a search box, matching Expenses/Documents/Recipes.
- **Recipe → Grocery List import**: a new "+ Add ingredients to Grocery
  List" button on each recipe inserts every ingredient line as a grocery
  item, run through the existing `guessCategory()` keyword-matcher so
  "500g beef mince" lands under Meat automatically. See
  [`docs/17-feature-recipes.md`](docs/17-feature-recipes.md) and
  [`docs/16-feature-grocery-list.md`](docs/16-feature-grocery-list.md).
- **Fixed personal to-do "Mark done" on a repeating reminder**: it was
  calling `{ is_done: true }` unconditionally, permanently stopping a
  daily/weekly/monthly reminder — the advance-to-next-occurrence logic
  only existed server-side in `notify-due-items`, so a reminder ticked
  off by hand behaved differently from one the push notification fired.
  `personal-todos.js` now mirrors that logic client-side
  (`nextOccurrencePatch()`); the button reads "Done for now" instead of
  "Mark done" for a repeating reminder, to signal the difference. See
  [`docs/20-feature-personal-todos.md`](docs/20-feature-personal-todos.md).
- **Submit-disable on every form**: added the disable-button-during-submit
  pattern (`withBusyLabel()`, new in `dom.js`) to every form that was
  missing it — events, expenses (all 5 forms), goals (all 5 forms),
  rent/mortgage (both), grocery, recipes, personal-todos — matching what
  `documents.js`/`household.js` already did. Prevents a double-tap on a
  slow connection from double-inserting a row.
- **"Added by" attribution**: expense, grocery, and event cards now show
  who added the row (`created_by`) when that differs from who it's
  otherwise attributed to (`paid_by` for expenses) — previously only
  Goals' contribution breakdown showed this, despite every table already
  capturing it.
- **Bigger tap targets**: `.btn.small` padding increased (6px/12px →
  10px/14px) and `.actions-row` gap widened, with extra spacing before a
  destructive action specifically — the Edit/Mark-done/Delete row on
  every card was under the ~44px touch-target guideline and easy to
  mis-tap, especially near Delete.
- **Numeric keypad fixes**: the per-expense split-percent inputs and the
  custom recurrence "Days" inputs never got `inputmode` set, so editing
  either still popped the full iOS keyboard instead of a numeric one.

## 2026-10-02 — Personal to-do reminders now fire at their own set time

- `notify-due-items` used to run once a day, at a fixed 08:00 Australia/
  Brisbane, so a My To-dos reminder set for e.g. 6:30am still only ever
  notified at 8am along with everything else — a known, documented
  limitation (see `docs/20-feature-personal-todos.md`).
- The pg_cron schedule (`0027_notify_poll_frequency.sql`) now polls every
  15 minutes instead of once a day. `personal_todos` is checked against
  its own `remind_time` on every poll; every other source
  (rent/mortgage/goals/documents/events) still only fires once a day, at
  a fixed 08:00, via a new `DAILY_CHECK_TIME`/`pastDailyCheck` gate added
  to `supabase/functions/notify-due-items/index.ts` so the more frequent
  poll doesn't change their behavior.
- An overdue personal to-do (from a previous day) still fires on the very
  next poll regardless of time, same escalate-immediately behavior as
  before — only a reminder due *today* now waits for its own set time.

## 2026-10-01 — Auto-categorize grocery items

- Typing an item's name on the Add grocery item form now guesses its
  category automatically via a keyword match (`guessCategory()` /
  `CATEGORY_KEYWORDS` in `app/js/grocery.js`) — "Milk" lands on Dairy,
  "Chicken breast" on Meat, etc.
- Anything the keyword list doesn't recognize falls back to (and stays on)
  `other`; the category dropdown is always there, editable, so picking the
  right category for an unrecognized item is one tap away. Picking a
  category by hand stops the auto-guess from overwriting it on further
  typing. See [`docs/16-feature-grocery-list.md`](docs/16-feature-grocery-list.md).

## 2026-10-01 — Grocery list categories

- New `category` column on `grocery_items` (plain text, default `'other'`,
  no CHECK constraint — same pattern as `documents.category`), picked from
  a fixed list in `app/js/grocery.js`: produce, meat, dairy, bakery,
  frozen, pantry, household, other.
- The "To buy" list is now grouped into a section per category, in that
  same shop-aisle order, instead of one flat list in add-order. "In cart"
  stays flat, since it's just a holding area before "Clear bought items".
  See [`docs/16-feature-grocery-list.md`](docs/16-feature-grocery-list.md).

## 2026-10-01 — Mark events as done

- Any event (recurring or one-off) can now be marked done by hand from its
  card in the Events tab, independent of whether its own date has passed —
  useful for a future-dated event handled early, or to dismiss an overdue
  one-off without deleting it.
- New `events.completed_occurrence` column (date, nullable) stores the
  *occurrence* that was marked done rather than a plain boolean, so a
  recurring event's "done" status is tied to one specific cycle and
  naturally reverts to "not done" once `currentOccurrence()` moves on to
  the next cycle — no reset logic needed. See
  [`docs/03-feature-events.md`](docs/03-feature-events.md).
- The "Mark not done" toggle only appears when undoing it would actually
  do something — once an occurrence's date has genuinely passed, only the
  one-way "Mark done" action is removed rather than showing an
  always-present toggle that'd sometimes be a no-op.
- The home dashboard's "Upcoming events" feed and the `notify-due-items`
  push notification both skip an event already marked done for its
  current occurrence, even if the date hasn't arrived yet.

## 2026-10-01 — Confirm-before-delete, home dashboard glance, faster expense entry

- Every "Delete" button in the app now confirms first — previously only
  Goals, Grocery List, and Recipes did; Expenses, Events, Rent/Mortgage,
  Documents, and Personal to-dos deleted immediately on tap. See the new
  convention note in
  [`docs/14-ui-patterns.md`](docs/14-ui-patterns.md).
- Home now shows the expense "who owes who" balance (previously only on
  Money → Expenses) and a new "On your plate" section linking to the
  Grocery List and My To-dos with a live item count.
- The Add expense form puts Amount first, remembers the last category you
  picked instead of always resetting to the first one, and every money
  field in the app now brings up a numeric keypad on iOS
  (`inputmode="decimal"`).
- Expenses are now grouped into collapsible month sections (current month
  open, older months collapsed) instead of one long flat list — see
  [`docs/04-feature-expenses.md`](docs/04-feature-expenses.md).
- A one-time "Welcome" dialog now explains the five tabs and where the
  invite code lives, shown once per browser on first load, right before
  the existing "What's new" dialog.

## 2026-10-01 — New document category: Sophie

- Added `sophie` to `DOCUMENT_CATEGORIES` in `app/js/documents.js` — shows
  up in the add/edit category select and the filter chips automatically,
  since all three read from that one list.

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
