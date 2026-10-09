# Feature: Expenses

> Now one of three sections in the "Money" tab, not its own top-level
> tab — see [`13-feature-money-tab.md`](13-feature-money-tab.md). Nothing
> about this feature's own behavior changed.

## Purpose
Shared log of spending — what was bought, how much, who paid, and when —
so both partners have one shared record instead of separate banking apps
and guesswork.

## MVP (Phase 0, shipped)
- List expenses, most recent first, showing amount/category/who
  paid/date.
- Add an expense: title, amount, currency (defaults to household
  default), category, who paid, date, notes.
- Edit an expense (any field except who created it).
- Delete an expense.
- Running total of all logged expenses shown at the top of the list.

## Search (shipped)
A plain text filter above the list (`app/js/expenses.js`) matches title,
category, notes, or who paid, case-insensitive substring — filters the
already-fetched list client-side rather than re-querying per keystroke,
so typing doesn't hit the network. The running total and balance banner
stay based on the full list regardless of search; search is for finding
a specific expense, not for scoping what counts toward the balance.
Hidden entirely when the household has no expenses yet. Category-only
filter chips (part of Phase 1's original plan) weren't added on top of
this — see the same reasoning in
[`07-feature-documents.md`](07-feature-documents.md).

## "Who owes who" balance (Phase 3, shipped)
Each household member has a `split_percent` (see
[`08-auth-households.md`](08-auth-households.md) → Expense split, editable
from the ⚙️ account sheet) — the share of every logged expense they're
responsible for. It doesn't have to be 50/50; it's whatever the two
partners agree, e.g. 65/35.

- The Expenses tab shows a balance banner ("Alex owes Sam $X") computed
  as: for each member, `total paid by them − their split_percent share
  of all logged expenses`, then netted against any recorded settlements.
  With exactly two members this collapses to one number; the feature
  only activates once a household has two members (a solo household just
  sees the total-logged banner).
- **Settle up** logs a `settlements` row — a direct payment between the
  two partners — without touching the `expenses` log itself, since a
  settlement isn't a purchase. This is what lets the balance return to
  "you're all settled up" without deleting or editing any expense.
- A sub-cent residual (percentage splits rarely divide a dollar amount
  into whole cents) is treated as settled rather than showing a
  perpetual $0.01 balance — see `computeBalance()` in `app/js/balance.js`.
- Settlement history is listed (and individually deletable, in case of a
  mistake) below the expense list.

### Per-expense split override (shipped)
An individual expense can use a different split than the household
default — e.g. a mostly-one-person purchase logged 50/50 by default, but
"bought myself a gift" logged 100/0. The add/edit expense form
(`buildSplitField()` in `app/js/expenses.js`) shows the same
auto-complementing pair of number inputs as the ⚙️ account sheet's
household-default split, prefilled with that default; only shown once a
household has two members, same restriction as the balance feature
itself.

Left unchanged, the expense stores no override at all (`split_percent` /
`split_percent_user_id` both null on the row) — it keeps tracking the
household's `split_percent` setting even if that setting is changed
later. Only an expense someone deliberately typed a different number into
pins to that specific split forever, shown on its card as e.g. "split
Alex 50/Sam 50". `computeBalance()` in `app/js/balance.js` checks each
expense for an override before falling back to the household default,
so a mix of overridden and default expenses in the same list balances
correctly.

### Personal expenses — don't split at all (shipped)
Distinct from the split override above, which still splits an expense
just at a different ratio: a "Personal expense — don't split with my
partner" checkbox (`buildPersonalToggle()` in `app/js/expenses.js`) on
the add/edit form excludes the expense from the "who owes who" balance
entirely, for a purchase one partner wants to log without it loading
the shared balance at all — a gift for someone else, say, without
needing a dishonest 100/0 split entry. Sets `is_personal` on the row;
`computeBalance()` in `app/js/balance.js` skips any expense with
`is_personal` set before it ever enters either partner's
paid/owed totals — it's not that the split works out to "fully the
payer's," it never participates in the balance calculation at all.

Checking it hides the split field (moot once an expense isn't being
split), shown on its card as "· personal" in place of the split note.
Still counts toward the "This month" total and category breakdown below
— a personal purchase is still real spending, just not shared spending.

## Comment thread (shipped)
A 💬 button on every expense card (and every event card — see
[`03-feature-events.md`](03-feature-events.md)) opens a thread of
plain-text comments, for a back-and-forth note on one specific record
("did we ever get reimbursed for this?") instead of a text message
outside the app. Backed by a new `item_comments` table (migration
`0035_item_comments.sql`) and a shared module, `app/js/comments.js`
(`openCommentsSheet()`), rather than duplicated per feature — the thread
UI itself doesn't care which table the parent row lives in, only the
`entity_type`/`entity_id` pair it's passed.

`entity_type`/`entity_id` is a plain polymorphic reference, not a real
foreign key, since it points at rows in either `expenses` or `events`;
any household member can post or delete any comment, the same
shared-trust model the rest of the app already uses (anyone can edit or
delete anyone's expense or event). The card's "💬 N" badge comes from one
`getCommentCounts()` query per tab render, grouped client-side by
`entity_id`, rather than a query per card. Deleting the parent expense or
event also deletes its thread (`deleteCommentsFor()`) — there's no
DB-level cascade for a polymorphic reference, so the app does it
explicitly before the row itself is deleted.

## Monthly total + category breakdown (shipped)
A "This month" card sits between the running total and the balance
banner (`monthlyBreakdown()` in `app/js/expenses.js`): total spent so far
this calendar month, plus a category breakdown using the same
contribution-bar/legend visual as a goal's contributor breakdown
(`contributionBreakdown()` in `goals.js`) — just grouping by category
instead of by who contributed. A category's color comes from its fixed
position in the `CATEGORIES` list, not sort order, so it stays the same
color month to month even as which categories have spending changes.
Hidden entirely when there's no spending this month yet.

`CATEGORIES` is `groceries`, `bills`, `rent`, `transport`, `household`,
`leisure`, `other`, `food`, `pet`, `online shopping` — new categories are
always appended at the end, never inserted earlier, since inserting one
would shift every later category's array position and silently
reassign its chart color. This app defines exactly 8 fixed, CVD-checked
categorical colors (`--series-1`..`--series-8` in `styles.css`); with 10
categories now on the list, the 9th and 10th (`pet`, `online shopping`)
don't get a 9th/10th generated hue — per the data-viz palette rule, that
risks colliding with an earlier category's color the moment the list
grows further, so they fold into a shared neutral (`var(--text-muted)`)
instead. `categoryColor(cat)` (exported from `expenses.js`) is the one
place this mapping lives, shared by this file's breakdown and
`statements.js`'s, so the two charts can never color the same category
differently.

## Custom categories (shipped)

A "Manage categories" link (next to the "This month" card) opens a
sheet (`openManageCategoriesSheet()`, exported from `app/js/expenses.js`
so `statements.js` can open the exact same one) where a household can
add its own category on top of the hardcoded `CATEGORIES` list —
household-shared (`custom_categories` table, see "Data" below), so
either partner's addition shows up for both, same as the rest of this
app's shared lists.

Every `<select>` that offers a category — here and on My Statements —
reads a merged list instead of the bare `CATEGORIES` constant:
`categoryNames` (a module-private `let` in `expenses.js`, refreshed
once per `render()` via `mergeCategories(await fetchCustomCategories(
ctx.household.id))`) for this file's own forms, and
`STATEMENT_CATEGORIES` (`statements.js`'s own refreshed-per-render `let`,
built the same way plus its own `income` entry on top) for the
statement-side ones. Neither is computed once and cached forever — a
household's custom categories live in the database and can change at
any time (including from the other partner's phone), so each file
re-fetches and re-merges on every tab render instead of going stale
until a full page reload.

A custom category declares a **direction** (`'out'` for an expense,
`'in'` for income) when added — the Add Expense form never exposes or
needs this (a logged expense is always an outflow), but the table
itself is shared with My Statements, where a direction-aware category
genuinely matters (see `CATEGORY_DIRECTION` in
[`27-feature-bank-statements.md`](27-feature-bank-statements.md)).
Deleting a custom category removes it from future pickers but doesn't
touch anything already saved under its name — same "stop offering it
going forward, don't retroactively change history" tolerance the rest
of this app's deletes already use.

A custom category never gets a `categoryColor()` hue of its own (see
"Monthly total + category breakdown" above) — it folds into the shared
neutral along with anything else past the 8th fixed color, exactly like
`pet`/`online shopping` already do.

## Sort/group by month (shipped)
The expense list groups into collapsible per-month sections (`<details
class="goal-section">`, same pattern as Goals/Recipes) instead of one
flat reverse-chronological list — the current calendar month starts open,
every other month starts collapsed, each section's summary shows its
count and subtotal. Search still filters across all months first; every
month with a surviving match forces itself open (a hit shouldn't hide
inside a collapsed month). Category and payer sort weren't added on top:
a month is the grouping people actually reach for ("what did we spend in
March"), and the search box plus the "This month" category breakdown
above the list already cover filtering by category or who paid.

## Smart add-expense defaults (shipped)
Amount is now the first field in the Add/Edit expense sheet (ahead of
Title) — see "Adding an expense should be the lowest-friction action in
the app" below. The category select defaults to whatever was picked on
this household's last add, not always the first entry in `CATEGORIES`,
via a plain `localStorage` key (`lastExpenseCategory:<household_id>`,
set in `app/js/expenses.js`) — no new table, same tolerance for storage
being unavailable as `theme.js`/`changelog.js`. "Remember last payer"
wasn't added: it already defaults to "you" (`ctx.user.id`), which is
right far more often than whoever paid last time.

## Phase 1 (remaining)
- Filter by category and by date range (this month / last month / custom)
  — the "This month" breakdown and new month grouping cover the common
  case; an explicit filter is still open for a custom range.

## Recurring expenses (shipped)
A collapsible "Recurring expenses" section (open by default once it has
any) sits above the search box in `app/js/expenses.js`, backed by a new
`recurring_expenses` table — same fields as a one-off expense plus
`interval_days` and `next_due_date` (the same rolling-period shape as
`rent_payments`/`mortgage_payments`), and `active` so a subscription can
be paused without deleting its history of already-logged expenses.

Unlike rent/mortgage, there's no user "mark as done" action — a
subscription should log itself with nobody needing to open the app. A
daily `pg_cron` job (`process-recurring-expenses-daily`, migration
`0019_recurring_expenses.sql`) calls a `process_recurring_expenses()`
Postgres function that inserts one `expenses` row per period that's come
due (looping if a template was paused a while or a cron run was ever
missed, so no period silently disappears) and advances `next_due_date`
past today. It's pure SQL — unlike `notify-due-items` there's no HTTP
call or shared secret involved, since it never leaves the database.

## CSV export (shipped)
An "Export CSV" action (`exportExpensesCsv()` in `app/js/expenses.js`,
next to the running total) downloads the household's full expense list —
not just whatever's currently filtered by search — as
`expenses-<today>.csv`: date, title, category, amount, currency, paid
by (resolved to a display name), split (the household default, or the
specific override shown on the card, e.g. "Alex 70/Sam 30"), and notes.
Built with a small local `toCsv()`/`downloadCsv()` pair in the new
`app/js/csv.js` — no library, same Blob + temporary `<a download>`
element approach used elsewhere in the app for client-side downloads.
Fields containing a comma, quote, or newline are quoted per RFC 4180,
with internal quotes doubled.

## Phase 3 (remaining)
- Multi-currency: convert to household default currency for totals while
  keeping the original entry currency visible.
- Simple charts (spend by category, spend over time) for *this tab's own*
  `expenses` data — see [`10-suggestions.md`](10-suggestions.md). The
  analogous charts (a spending trend line, a "By Category" bar chart,
  and a PDF export) already shipped for My Statements' bank-transaction
  data instead — see
  [`27-feature-bank-statements.md`](27-feature-bank-statements.md) →
  "Spending trend chart" and "'By Category' bar chart + PDF export" —
  but that's a different, private-per-user data source, not this tab's
  shared `expenses` table.

## Data
See `expenses`, `settlements`, and `custom_categories` tables in
[`02-data-model.md`](02-data-model.md), and `split_percent` on
`household_members`.

## UI notes
- Adding an expense should be the single lowest-friction action in the
  whole app — it's the thing most likely to be logged constantly.
- Show who paid using their display name/emoji from `profiles`, not a raw
  ID.
