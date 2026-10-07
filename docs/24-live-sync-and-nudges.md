# Feature: Live sync, remind-your-partner, and the weekly digest

## Purpose
Three related features for keeping two phones feeling like one shared
app rather than two separate copies that happen to hit the same
database: changes show up live without a reload, an overdue item can be
nudged to your partner with one tap, and a weekly push recaps the week
without anyone having to go looking for it.

## Live sync (Realtime)
Before this, nothing refreshed on its own — if your partner added an
expense while you had the Expenses tab open, you wouldn't see it until
you switched tabs or reloaded. `app/js/realtime.js` opens one Supabase
Realtime channel per household (`subscribeHousehold(householdId,
onChange)`), subscribed to `postgres_changes` on every shared-list table:
`events`, `expenses`, `recurring_expenses`, `custom_goals`,
`goal_transactions`, `goal_tasks`, `rent_payments`, `mortgage_payments`,
`documents`, `grocery_items`, `recipes`, `settlements`, and `households`
(for the shared sticky note) — each filtered to that one household's
rows. `personal_todos`, `bank_statements`/`bank_transactions`, and
`bank_transaction_category_rules` are deliberately excluded: all four
are private per user (RLS already restricts each to its own owner —
see [`27-feature-bank-statements.md`](27-feature-bank-statements.md)
for the statements tables), so there's nothing cross-partner to sync.
`item_comments` is excluded too, for a different
reason — its thread only ever shows inside an open comment sheet (see
[`04-feature-expenses.md`](04-feature-expenses.md) → "Comment thread"),
which lives outside `main` like every other `<dialog>`, so a live
refresh of `main` wouldn't reach it anyway.

`app.js` owns what happens with each change (`scheduleRefresh()`):
- A change to `households` merges the new row into `ctx.household` in
  place (same pattern the Google Drive connect flow and the sticky note
  save already use) before anything else happens, since `home.js` reads
  `ctx.household.shared_note` directly rather than re-fetching it.
- Debounced 400ms so a burst of changes (e.g. several recurring expenses
  logging at once) triggers one re-render, not one per row.
- Skipped entirely while the focused element is an `<input>`/`<textarea>`
  inside `main` — i.e. someone's typing in a search box. Every add/edit
  form is a `<dialog>` appended to `document.body`, outside `main`, so a
  live refresh never interrupts filling one out; it only guards the
  handful of inline search fields (Expenses/Documents/Recipes/Grocery
  List) from having their typed query yanked out mid-keystroke. The next
  own action (switching tabs, clearing search) picks up the missed
  change anyway.
- Also skipped while a `[data-editing]` card is open — Goals' and
  Recipes' inline "Edit ___" forms are the one exception to "every
  edit flow is a `<dialog>`" above (they render straight into `main`),
  so a plain activeElement check wouldn't catch someone reading the form
  before they've focused a field in it. Both mark their edit-form
  wrapper with `data-editing="true"` for this reason.
- `renderMainApp()` always rebuilds `main` from scratch, which would
  otherwise collapse every open `<details>` section and reset scroll
  position on every live update. Both are captured (by each open
  `<details>`'s `<summary>` text) before the rebuild and restored after.

Enabling this needed one migration
(`0029_enable_realtime_publication.sql`) adding those tables to the
`supabase_realtime` publication — Realtime only broadcasts changes for
tables explicitly in that publication. Row Level Security still gates
what each subscribing client actually receives; this only controls what
Realtime watches, it doesn't bypass row security (consistent with every
other table's access boundary — see
[`08-auth-households.md`](08-auth-households.md)).

## "🔔 Remind" nudge
A button on each card in the home dashboard's "What's due" list (overdue
rent/mortgage/documents) sends your partner a one-tap push instead of
texting them separately — "BrackenRidge Rent is overdue 3d", etc. Calls
the `remind-partner` edge function via `remindPartner()` in
`notifications.js`.

Unlike every other edge function in this app, `remind-partner` is called
directly by a logged-in user (via `supabase.functions.invoke()`), not by
`pg_cron`, so it's deployed with the default JWT verification
(`verify_jwt = true`) rather than the shared-secret header pattern
`notify-due-items` uses. It still does its own authorization check
beyond "is this a valid session": it looks up `household_members` using
a client scoped to the *caller's own* JWT, so that table's own RLS
policy ("members can view roster") is what actually confirms they
belong to the household being nudged — a user can't invoke this for a
household they're not in, same boundary as everywhere else, enforced the
same way. Only once that's confirmed does it switch to a service-role
client, needed because `push_subscriptions` restricts a user to reading
only their own rows (`user_id = auth.uid()`) — there's no way to look up
a partner's subscriptions without it, same reason `notify-due-items`
needs service-role access.

A 5-minute per-household cooldown (`households.last_reminded_at`,
migration `0032_household_last_reminded_at.sql`) guards against
unlimited push spam; this is a manual, one-tap action between two
trusted partners, not a public endpoint, so the cooldown is generous —
it's there for the "acrimonious split, still technically a member" case,
not day-to-day use. The button also disables for a few seconds after
each tap to stop an accidental double-send.

**CORS**: this is the only edge function in this app invoked directly
from a browser (every other one is `pg_cron`-only). The real request
carries an `Authorization` header, which makes the browser send a
preflight `OPTIONS` request first — without explicit
`Access-Control-Allow-Origin`/`-Headers` and an `OPTIONS` branch
returning them, that preflight fails and the actual request never goes
out, regardless of whether the function's own logic is correct. (This
was missed when the function first shipped — the nudge button appeared
to work client-side, since nothing in the UI surfaces a failed
`fetch`/CORS error loudly, but no push was ever actually sent.)

## Weekly digest
A new `weekly-digest` edge function, scheduled once a week (Sunday 18:00
Australia/Brisbane — `0 8 * * 0` UTC, via
`0030_schedule_weekly_digest.sql`) using the same `pg_cron` +
shared-secret pattern as `notify-due-items`. One push per household:

> **Your week together**
> $214.30 spent together · $50.00 saved toward your goals · 2 events
> coming up

Deliberately light and non-competitive — no "who spent more," no streaks
or scores between the two partners, just a glance back at the week. If a
household logged nothing, it still gets a push ("nothing logged on
Expenses") rather than being silently skipped, so the digest stays a
reliable weekly habit rather than something that only shows up some
weeks.

## Data
No new tables. `0029` only changes the `supabase_realtime` publication
membership; `0030` only adds a `pg_cron` job. See
[`02-data-model.md`](02-data-model.md) for the tables these features
read from.

## Testing note
Realtime and the two edge functions all need the real Supabase backend
to exercise meaningfully — the mock (`vendor/supabase.js` swapped for
local testing, see
[`15-development-testing.md`](15-development-testing.md)) only stubs
`channel()`/`removeChannel()`/`functions.invoke()` so the app doesn't
throw when these run against it, not real socket/push behavior. Treat a
mock-only pass on this feature as "doesn't crash," not "verified
working" — confirm live sync and the remind nudge against two real
signed-in devices before trusting them.
