# Feature: Statement overview (Money tab)

A new segment in the Money tab (alongside Expenses, BrackenRidge, Grocery
List, Recipes, My To-dos): upload a bank statement, have the app parse it
into individual transactions, auto-categorize what it confidently can, and
surface anything it's unsure about for a partner to assign a category to
by hand — plus a per-statement spending breakdown and a trend comparison
against the previous statement, in the spirit of apps like Buddy.

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
October 2025.pdf`. The Statement overview tab has an "Open the shared
Drive folder" link rather than a dedicated one; anyone browsing the
folder directly in Drive still sees statements cluster together by name.

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
keyword map (`CATEGORY_KEYWORDS`) onto the **same `CATEGORIES` list
expenses use** (`groceries`/`bills`/`rent`/`transport`/`household`/
`leisure`/`other`), exported from `app/js/expenses.js` specifically so
this doesn't fork into a second, slightly-different taxonomy to keep in
sync by hand. Deliberately not a learned/ML classifier — a short,
readable keyword list that's easy to extend as real statements turn up
merchants it misses.

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

New tables (migration `0037_bank_statements.sql`):
- `bank_statements` — one row per represented **period**, not per
  upload (see "One upload, one or more periods" above — a multi-month
  upload produces several rows sharing one Drive file): period
  month/year, label, original + Drive filename, `drive_file_id`/
  `drive_web_view_link`, who uploaded it.
- `bank_transactions` — one row per parsed (or manually added)
  transaction: `statement_id` (cascades on delete), date, description,
  signed amount, `category` (nullable), `status`
  (`'unknown'`/`'categorized'`), `categorized_by`.

Both are household-scoped with the same RLS policy shape as every other
shared table (`is_household_member(household_id)`), and both are added
to the `supabase_realtime` publication — a partner categorizing a
transaction or uploading a new statement shows up live on the other
phone, same as the rest of the Money tab
([`24-live-sync-and-nudges.md`](24-live-sync-and-nudges.md)).

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
- The keyword categorizer only knows the merchants in `CATEGORY_KEYWORDS`
  — expect a first upload from a new bank to land mostly in "Needs
  review" until the list grows from real use.
