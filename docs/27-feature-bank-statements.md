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

## Rename-to-period

"Rename the file to the listed months and year" is implemented as: on
choosing a file, the app immediately parses it client-side and guesses
the statement's period from whichever calendar month most of its parsed
transactions fall in (a statement period often spans a day or two into
the next month). That guess pre-fills a month/year picker the user can
correct before upload — same "smart default, still editable" pattern as
the add-expense form's remembered last category
([`04-feature-expenses.md`](04-feature-expenses.md)). The Drive filename
and the in-app statement label both come from that confirmed month/year,
not the original filename.

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
non-empty) with an inline category picker + Save per transaction —
picking a category sets `status = 'categorized'` and `categorized_by`.
Already-categorized transactions sit in a collapsed "All categorized
transactions" section below, using the same row/picker so a wrong guess
can be corrected just as easily as an unknown one assigned.

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
- `bank_statements` — one row per upload: period month/year, label,
  original + Drive filename, `drive_file_id`/`drive_web_view_link`,
  who uploaded it.
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
as `removeDocument()` in `documents.js`) and the `bank_statements` row;
its transactions cascade via the real FK (unlike the polymorphic
`item_comments` table, no manual delete-children step is needed here).

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
