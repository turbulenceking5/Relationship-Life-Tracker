# Feature: My Statements (Money tab)

A segment in the Money tab (alongside Expenses, BrackenRidge, Grocery
List, Recipes, My To-dos): upload a bank statement, have the app parse it
into individual transactions, auto-categorize what it confidently can, and
surface anything it's unsure about for you to assign a category to
by hand — plus a per-statement spending breakdown and a trend comparison
against the previous statement, in the spirit of apps like Buddy.

## Private per-user, not shared — like My To-dos

Unlike every other Money tab segment, statements and their transactions
are **private to the uploader**: each partner only ever sees their own
uploaded statements, never their partner's — added in migration
`0038_bank_statements_private.sql`, which converts the original
household-shared design (`0037_bank_statements.sql`) to the same
owner-only RLS shape `personal_todos` already uses (see
[`20-feature-personal-todos.md`](20-feature-personal-todos.md)). In
practice this means each person's "My Statements" tab shows only their
own section — there's no single shared list either partner can see both
halves of, so "two sections, Calum and Natasha" exists at the
whole-household level (each of them has their own), not as something
either person sees both of at once.

`bank_statements` already had an `uploaded_by` column (added for
attribution in `0037_bank_statements.sql`, never used for access control
until now); `bank_transactions` has no user column of its own, so
ownership is checked via its statement's `uploaded_by` with an `exists`
subquery. Both policies still also require `is_household_member
(household_id)` in their `with check`, same as `personal_todos` — purely
so a `household_id`/`statement_id` can't be forged to point at a
household the user isn't actually in; the real privacy boundary is the
ownership check. Both tables were also dropped from the
`supabase_realtime` publication (private-per-user data has no partner to
sync live to).

**One nuance worth knowing**: only the parsed *data* (the `bank_statements`/
`bank_transactions` rows) is private. The uploaded statement *file* itself
still lands in the one shared household Google Drive folder (see below for
why), so a partner who opens that shared folder directly in Drive could
still see a `[Bank Statement] ...` filename and open it — the app's own UI
just never shows their parsed transactions. There's no way to give each
partner a private Drive subfolder under the `drive.file` OAuth scope this
app uses (see the next section), so this is an accepted, documented gap
rather than a bug.

## Why this is NOT a new "Bank Statements (current year)" Drive subfolder

The original ask was for a dedicated Drive folder the app creates for
this. That collides with a constraint already documented for Documents
(see [`21-google-drive-documents.md`](21-google-drive-documents.md)):
this app's Google Drive access uses the narrow `drive.file` OAuth scope,
which only grants a given user's token access to a file/folder **that
token itself** created, opened, or picked. Whichever partner's browser
first uploads a statement would silently create a folder the *other*
partner's token has no access to — their next upload would fail to find
it and fork into a second, duplicate folder, exactly the problem
Documents' category-subfolder idea was rejected over.

So statements go into the same one shared root folder Documents and
backups already use, renamed to their period and prefixed
`[Bank Statement]` (same filename-prefix-for-sorting convention as
Documents' `[Warranty]`/`[Receipt]` prefixes) — e.g. `[Bank Statement]
October 2025.pdf`. The My Statements tab has an "Open the shared
Drive folder" link rather than a dedicated one; anyone browsing the
folder directly in Drive still sees statements cluster together by name
(including a partner's — see "Private per-user, not shared" above for
why that's a known, accepted gap).

## One upload, one or more periods — detected, never asked

The upload sheet originally pre-filled an editable month/year picker
for the uploader to check before every single upload — that's exactly
the friction a one-tap upload shouldn't have, so it's gone entirely.
Worse, forcing a *single* guessed month onto the whole upload was
simply wrong for a statement that spans more than one calendar month —
a billing-cycle export running e.g. the 15th to the 15th, or a
multi-month history dump both produce transactions on both sides of a
month boundary, and whichever side lost the "most transactions" vote
would get filed under the wrong month entirely.

So instead, `splitIntoPeriods()` (`app/js/statements.js`) groups the
parsed transactions by the calendar month each one's own date actually
falls in, and the upload creates **one `bank_statements` row per
represented month**, not one row per upload. All of them share the
*same* underlying Drive file (one file, uploaded once) — its name
reflects the full span (`"[Bank Statement] February 2026 – April
2026.pdf"` for a 3-month statement), while each row's own `label` is
its single exact month (`"March 2026"`), since that's what the
per-period spending report and "Compared to last statement" trend
actually group and compare by. A single-month upload is just the
one-row case of the same logic, so there's no special-casing it.

The status line underneath the file picker reports what was detected —
`"Found 42 transactions for March 2026"` for one period, or `"Found 87
transactions across 2 periods: October 2026 (52), November 2026
(35)"`— rather than asking for confirmation. A file with no extractable
transactions (a scanned PDF, say) falls back to a single row for the
current calendar month rather than leaving the period undefined.

There's no edit-period action after the fact — if the heuristic gets a
transaction's date wrong (mis-parsed by `parseCsvStatement()`/
`parsePdfTransactions()`), the fix is "+ Add transaction" on the
correct period's card plus deleting the wrong one by hand, or deleting
and re-uploading if it's more than a one-off. Deleting one period
belonging to a multi-period upload only deletes that period's row (and
its own transactions) — the shared Drive file is only actually removed
once no other period row still points at it (checked in
`statementSection()`'s delete handler), so deleting one month out of a
multi-month statement doesn't dangle every other month's "Open file in
Drive" link.

## Parsing: CSV is reliable, PDF is best-effort

- **CSV** (`parseCsvStatement()` in `app/js/statements.js`): handles
  both common export shapes — one signed Amount column, or separate
  Debit/Credit columns (detected from a header row naming them
  explicitly) — with or without a header row, and tolerates quoted
  cells. A `looksNumeric()` gate (strict money-shaped regex) stops a
  description like "WOOLWORTHS 1234 BRISBANE" from being mistaken for a
  numeric column just because it contains digits, and any extra numeric
  cell (most commonly a running Balance column) is dropped from the
  description rather than glued onto the end of it.
- **PDF** (`parsePdfTransactions()`): lazily loads pdf.js from cdnjs the
  first time a PDF is uploaded (not a static `<script>` tag in
  `index.html` — most sessions never touch this), extracts page text,
  and scans each line for a `<date> ... <amount>[CR|DR]` shape. This
  only works on a text-based PDF (what most banks actually generate); a
  scanned/photographed statement has no extractable text and comes back
  with zero transactions. That's not a dead end — the statement still
  uploads, and "+ Add transaction" on its card covers filling it in by
  hand.
- Both are inherently heuristic. A whole-statement sign flip (if a
  bank's export convention differs from "negative = money out") would
  not be caught by the categorization review workflow below — worth a
  glance at the "Spent"/"Received" totals after a first upload from a
  new source.

### Two real bugs found testing against an actual statement (fixed)

Both of these were caught the same way: uploading a real ING PDF
statement and getting "$0.00 spent / No transactions" with no error
shown — reproduced end to end (pdf.js extraction + `parsePdfTransactions()`
run against the statement's real text) rather than guessed at from the
code alone.

1. **pdf.js never actually loaded, for anyone, ever.**
   `ensurePdfJsLoaded()` requested `pdf.min.js`/`pdf.worker.min.js` from
   cdnjs via a classic `<script src>` tag — those files don't exist for
   this pdf.js version; cdnjs only ships the `.mjs` (ES module) build
   at this path, so both requests 404'd. Because `parseStatementFile()`
   wraps everything in a single broad `try/catch` that returns `[]` on
   any failure (originally reasoned as "best-effort, falls back to
   manual entry" — true for a *genuinely* unreadable scanned PDF, not
   for a totally broken library URL), this failed **completely
   silently**: every PDF upload "succeeded" with zero transactions,
   indistinguishable from a scanned/image-only statement. Fixed by
   loading the `.mjs` build via dynamic `import()` instead of a script
   tag (`pdf.min.mjs`/`pdf.worker.min.mjs`, confirmed to actually exist
   via `cdnjs.com`'s own file listing for this version), and by logging
   the real error (`console.warn`) when parsing fails instead of
   swallowing it without a trace — a future tooling break like this one
   should leave *something* to go on.
2. **The running balance was being recorded as the transaction amount.**
   A very standard AU bank statement shape is `Date | Description |
   Withdrawal | Deposit | Balance` — once the above bug was fixed and
   real transaction lines started reaching `parsePdfTransactions()`,
   each line had *two* dollar amounts (the actual withdrawal/deposit,
   then the running balance), and the code picked `amounts[amounts.length
   - 1]` — the **last** one, i.e. the balance — as "the" transaction
   amount, with the real amount left dangling in the description text
   instead. Every transaction from a statement with a balance column
   would get the wrong amount (a plausible-looking but entirely wrong
   four-figure number) with no error or validation to catch it. Fixed:
   when a line has more than one number, the second-to-last is now
   treated as the amount and the last as the balance (dropped from the
   description along with everything after it); with exactly one
   number, it's unambiguously the amount, same as before. This is a
   heuristic, same as everything else in this section — a bank that
   shows a balance *before* the amount, or shows two real amount
   columns with neither being a balance, would need different handling,
   but no such statement has turned up yet.

## Auto-categorization and "Needs review"

`guessCategory()` matches a transaction's description against a plain
keyword map (`CATEGORY_KEYWORDS`) onto `STATEMENT_CATEGORIES` — the
**same `CATEGORIES` list expenses use** (`groceries`/`bills`/`rent`/
`transport`/`household`/`leisure`/`other`/`food`/`pet`/`online
shopping`), exported from `app/js/expenses.js` specifically so this
doesn't fork into a second, slightly-different taxonomy to keep in sync
by hand, **plus one extra: `income`**. `income` only exists in
`statements.js`'s own `STATEMENT_CATEGORIES` (`[...CATEGORIES,
'income']`), not in `expenses.js`'s `CATEGORIES` itself — a logged
expense is always an outflow, so "Income" would be a nonsensical option
on the Add Expense form; a bank transaction can be either direction,
so it gets the one category the other feature doesn't need. Deliberately
not a learned/ML classifier — a short, readable keyword list that's
easy to extend as real statements turn up merchants it misses.

`income` keywords (`salary`, `payroll`, `centrelink`, `refund`,
`reimbursement`, `cashback`, `dividend`, `interest credit`, …) are
checked against the transaction's description, but — unlike every
expense category — only ever for a **positive-amount** transaction.
`guessCategory(description, amount, rules)` gates which half of
`STATEMENT_CATEGORIES` even gets checked before a single keyword is
matched: a negative amount (money out) only ever matches an expense
category's keywords, a positive amount (money in) only ever matches
`income`'s. This is what stops a word two categories happen to
share — `rent`'s `rental` keyword and an incoming rent deposit from the
BrackenRidge property's managing agent (e.g. "RENTAL INCOME" or "REAL
ESTATE AGENCY RENT DEPOSIT") both contain "rental"/"real estate" — from
colliding: a rent *payment* (negative) can only ever match `rent`, and
a rent *deposit* (positive) can only ever match `income`, regardless of
which keyword list happens to contain the same word. A positive-amount
transaction that doesn't contain an actual income keyword (plain
"RENTAL INCOME" alone, say) correctly lands in "Needs review" rather
than being silently misfiled as an expense — this is a general rule,
not a one-off patch for this specific wording, so it rules out the same
collision for any other keyword an expense category and `income`
happen to share, now or in the future.

Dining/takeaway keywords (restaurants, cafes, Uber Eats/Menulog/
DoorDash/Deliveroo, fast food chains) moved from `leisure` into the new
`food` category once it existed — "ate at a restaurant" belongs there
more than next to "went to the movies," which is what `leisure` is left
with. This only affects **future** parses; it doesn't retroactively
re-categorize transactions already saved under `leisure`.

Only 8 fixed categorical colors exist for the spending-breakdown chart
(see [`04-feature-expenses.md`](04-feature-expenses.md) → "Monthly total
+ category breakdown"); with 10 categories now in the list, `pet` and
`online shopping` share a neutral fallback swatch in the chart rather
than being assigned a 9th/10th hue that could collide with an earlier
category's color — they're still fully distinct, selectable categories
everywhere else (the picker, "Needs review," keyword matching), just not
individually color-coded in the bar/legend.

Anything that doesn't match a keyword gets `status = 'unknown'` and
shows up in a "Needs review" section (open by default whenever it's
non-empty) with an inline category picker per transaction. Picking a
category doesn't save it immediately — there's no per-row Save button
at all. Instead, every pick in a statement (across both "Needs review"
and the collapsed "All categorized transactions" section below it, same
row/picker so a wrong guess is corrected the same way) is recorded in
that statement's own `pendingChanges` map (`statementSection()` in
`app/js/statements.js`), and one **"Save changes (N)"** button in the
statement's own actions row commits all of them in a single batch —
re-picking back to a transaction's original category removes it from
the pending set rather than queuing a no-op write. This replaced an
earlier one-Save-per-transaction design for two reasons at once:
categorizing several transactions used to mean clicking Save, and
sitting through a tab re-render, once per transaction; and that re-render
(`render()` always rebuilds the whole tab, see below) used to collapse
the very statement section you were working in back to closed every
single time, since nothing preserved which sections had been manually
opened.

### Learning from your picks

Picking a category for something the static keyword list above didn't
catch is a real signal: that merchant will show up again, and without
this it would land in "Needs review" every single time. Saving a
manual pick (either the bulk "Save changes" button, or the "+ Add
transaction" sheet) also upserts a row into
`bank_transaction_category_rules` — `extractMerchantKey()` pulls a
stable key out of the description (the leading word, with common filler
like "the"/"a" stripped), paired with the category you picked, one rule
per merchant per user. `guessCategory()` checks your rules after the
static `CATEGORY_KEYWORDS` list finds nothing, so the next transaction
from that merchant — in a future upload — auto-categorizes instead of
landing in "Needs review" again.

Saving also **sweeps your whole "Needs review" backlog**, not just the
transaction you just picked: `applyLearnedRulesToUnknown()` re-checks
every one of your `'unknown'` transactions, across every statement, not
just the one you're looking at, against your full rule set (including
the rule you just learned) and auto-categorizes any match. Pick a
category for one "MYSTERY MERCHANT" transaction and every other
transaction from that same merchant sitting unresolved anywhere — this
statement, an older one — gets fixed in the same save, not just the one
you touched.

This is deliberately as simple as the static keyword list it extends —
a leading-word match, not a real classifier — and it only ever adds a
*second* source of matches below the static list, never overrides it:
a description the static list already resolves correctly never reaches
the rules check at all, so a loosely-keyed learned rule (say, "big" from
a merchant you typed by hand) can't un-categorize something the curated
list already gets right. Both the rule-saving and the backlog sweep are
best-effort (`.catch(() => {})` at each call site) — a learning write
failing never blocks or rolls back the category change you actually
asked to save.

`extractMerchantKey()` and the matching loops in `guessCategory()` and
`applyLearnedRulesToUnknown()` guard against a degenerate key —
shorter than 2 characters, or a description that's nothing but filler
("The", " A ", "An" alone) — ever being learned or matched on. A
`merchant_key` that short or generic isn't a merchant signal: the
matching itself is a plain `description.includes(key)` substring
check, and in JavaScript every string includes `''`, while almost
every real description contains any single letter somewhere (e.g. a
rule keyed on `'x'` would wrongly match "NETFLIX.COM" or "COLES
EXPRESS"). Without the guard, one such rule — from a blank/near-blank
description slipping through (the manual "+ Add transaction"
description field's `required` attribute doesn't actually stop a
whitespace-only value) or a stray short pick — would silently override
every other unmatched transaction's category on every future
save/sweep. The floor is 2, not higher, so a real short brand name you
teach it (e.g. "bp", also in the static `transport` keyword list) still
works.

Private to the user who made the pick, same RLS shape as
`bank_statements`/`bank_transactions` (`user_id = auth.uid()`, see
migration `0039_bank_transaction_category_rules.sql`) — your partner
builds up their own rules from their own picks, not yours.

### Open sections survive a save — matched by key, not title

`render()` rebuilds the whole tab from scratch on every save (same
"re-fetch and redraw" pattern as every other feature module, see
[`14-ui-patterns.md`](14-ui-patterns.md)), which would otherwise reset
every `<details>` — the statement itself, "Needs review", "All
categorized transactions" — back to its default open/closed state and
jump scroll to the top, on every single "Save changes" click. Fixed the
same way `app.js`'s own Realtime refresh guard already does for the
main app shell: capture which `<details>` are open before rebuilding,
reopen the matching ones after. The one difference from `app.js`'s
version: that one matches by summary *text*, which works there because
an event or goal's title doesn't change between renders — it would
silently fail here, since "Needs review (N)" and "All categorized
transactions (N)"'s own counts change on exactly the save this needs to
survive. So each `<details>` instead carries a stable `data-key`
(`stmt:<id>`, `needs:<id>`, `cat:<id>`) that `render()` matches against
instead of relying on text at all.

## Spending trend chart (Month / Year / Custom)

Above the statement list, `renderSpendingTrendChart()` (new module
`app/js/statementsChart.js`) plots the signed-in user's total Spent and
Received per period as a plain inline-SVG line chart — the first real
chart in this app (everything else is the `.contribution-bar` segmented
bar); no charting library, no canvas, consistent with the app's
zero-dependency, no-build-step approach. A `.segmented` toggle (the same
markup/class pattern as every other sub-nav in this app) switches between:

- **Month** (default) — one point per calendar month that actually has a
  transaction, spanning the real data range.
- **Year** — one point per represented calendar year.
- **Custom** — a Start/End date pair (defaulting to the earliest/latest
  transaction date on file the first time it's shown) plus an Apply
  button; bucketed by month within the applied range.

Buckets are built purely from each transaction's own `txn_date`, never
from a `bank_statements` row's `period_month`/`period_year` — the same
reasoning as "One upload, one or more periods" above: a multi-month
statement's individual transactions can land on real dates outside that
statement's own label, so the transaction date is the only reliable
ground truth for a time series.

Colors are `var(--accent)` (Spent) / `var(--accent-2)` (Received), not
`var(--danger)` — spending isn't inherently bad, and `--danger` is
reserved elsewhere for overdue/alert states. Since `--accent`/`--accent-2`
aren't a validated color-blind-safe pair (unlike `--series-1`...`--series-8`,
see docs/14-ui-patterns.md), the Received line is also dashed and both
are named in a text legend — identity is never color-alone. The chosen
range mode (and any applied Custom dates) lives in module-level variables
inside `statementsChart.js` itself, the same pattern `money.js` uses for
its own `activeSub` — otherwise it would silently reset to Month on every
single save, since `render()` below re-mounts this chart on every rebuild.

## Yearly view: condensing statements by calendar year

The Monthly/Yearly `.segmented` toggle beneath the chart switches the
statement list itself between today's one-card-per-statement view
("Monthly", unchanged) and one read-only rollup card per represented
`period_year` ("Yearly"). A yearly card concatenates the transactions of
every statement sharing that year and feeds the union through the exact
same `categoryBreakdown()`/`trendVsPrevious()` helpers the monthly cards
already use (the latter via an optional `comparisonLabel` parameter —
"last year" instead of the default "last statement" — so the per-row
wording doesn't say "statement" while comparing two calendar years).
Deliberately read-only: no category picker, no "+ Add transaction", no
Delete, no "Open file in Drive" at the year level, since editing operates
on individual statements/transactions and a year is just a rollup of
several — a card instead carries one line pointing back to Monthly for
that. Like Monthly's own `stmt:<id>`/`needs:<id>`/`cat:<id>` keys, each
yearly card carries `data-key="year:<year>"` so `render()`'s open-state
preservation (see below) keeps it remembered across re-renders. The
chosen view mode is a module-level `let` in `statements.js`, same pattern
as the chart's own state and as `money.js`'s `activeSub`.

## Report: category breakdown + trend vs. the previous statement

Each statement's card shows:
- Total spent / received that period.
- A category breakdown using the same contribution-bar/legend visual as
  the Expenses tab's "This month" card
  ([`04-feature-expenses.md`](04-feature-expenses.md)) and a goal's
  contributor breakdown — spend only, grouped by category, colored from
  the same fixed `CATEGORIES` position so a category keeps its color
  statement to statement.
- "Compared to last statement": each category's spend this period vs.
  the immediately preceding statement (by period, not upload order), as
  a plain ↑/↓ list. A rise of 15% or more is called out ("— worth a
  look"); a drop is shown as a quiet win. A category with no spend in
  either statement is left out rather than shown as a meaningless 0%.
  This is the lightweight "improvements or not" insight, Buddy-style,
  without needing a real analytics pipeline for a two-person household.

## Data

New tables (migration `0037_bank_statements.sql`, plus
`0039_bank_transaction_category_rules.sql`):
- `bank_statements` — one row per represented **period**, not per
  upload (see "One upload, one or more periods" above — a multi-month
  upload produces several rows sharing one Drive file): period
  month/year, label, original + Drive filename, `drive_file_id`/
  `drive_web_view_link`, who uploaded it.
- `bank_transactions` — one row per parsed (or manually added)
  transaction: `statement_id` (cascades on delete), date, description,
  signed amount, `category` (nullable), `status`
  (`'unknown'`/`'categorized'`), `categorized_by`.
- `bank_transaction_category_rules` — one row per merchant you've
  manually categorized (see "Learning from your picks" above):
  `merchant_key`, `category`, unique on `(user_id, merchant_key)`.

All three are scoped to `household_id`, but — unlike every other table in
this list — gated by **owner-only** RLS (`uploaded_by = auth.uid()` for
`bank_statements`, `user_id = auth.uid()` for the other two, see
"Private per-user, not shared" above), not
`is_household_member(household_id)`. None are in the
`supabase_realtime` publication: private-per-user data has no partner to
sync live to, same as `personal_todos`
([`24-live-sync-and-nudges.md`](24-live-sync-and-nudges.md) covers only
the shared tables).

Deleting a statement deletes its Drive file (best-effort, same tolerance
as `removeDocument()` in `documents.js`) **only if no other period row
from the same upload still references that `drive_file_id`** — see
"One upload, one or more periods" above — and always deletes the
`bank_statements` row itself; its transactions cascade via the real FK
(unlike the polymorphic `item_comments` table, no manual delete-children
step is needed here).

## Not done (possible follow-ups)

- No "turn this into a logged expense" action — a bank transaction stays
  in its own table, separate from the manually-logged `expenses`
  that feed the "who owes who" balance. Wiring the two together (e.g. a
  one-tap "log as expense" on a categorized transaction) is a natural
  follow-up but was left out to avoid double-counting/split questions
  this feature wasn't asked to solve.
- No OCR for scanned/image PDFs — out of scope for a client-only PWA;
  export a CSV from online banking instead for reliable parsing.
- The static keyword list (`CATEGORY_KEYWORDS`) only knows the merchants
  hardcoded into it — but every manual pick now teaches the app that
  merchant going forward, see "Learning from your picks" above, so a
  first upload from a new bank landing mostly in "Needs review" gets
  better on its own as you categorize, not just when the hardcoded list
  grows from a future code change.
- Learned rules key on a single leading word (`extractMerchantKey()`),
  so a genuinely two-word brand name you type by hand (not already in
  the static list) only ever learns its first word — good enough to
  recognize "the same merchant again" for most real descriptions, not a
  real NLP normalizer. A bad rule is no longer stuck waiting for you to
  stumble across a matching transaction to overwrite it — see "Manage
  learned categories" below.

### Manage learned categories

A "Manage learned categories" link (`render()`, next to "Open the
shared Drive folder") opens a sheet (`openManageRulesSheet()`) listing
every one of your own `bank_transaction_category_rules` rows —
`merchant_key` plus its current category, with a category `<select>`
(from `STATEMENT_CATEGORIES`, so `income` is pickable too) and a Save
button per row (`ruleRow()`), plus a Delete button to remove a bad rule
outright. Both are independent per-row actions, not a batch like
`statementSection()`'s transaction picker — there's no backlog of
unsaved picks to accumulate here, so there's nothing a bulk button
would add. Saving or deleting re-fetches and remounts just the sheet's
own body; it doesn't need to re-run the whole tab's `render()`, since
this table only ever affects *future* auto-categorization, never
anything already on screen.
