# Roadmap

**Relationship Life Tracker** — a shared app for two partners to track life
events, expenses (with a configurable "who owes who" balance), investment
property rent, savings/spending goals (with tasks and linked documents),
and reference documents (warranties, contracts, receipts).

Platform decision: a **PWA** (installable HTML/JS app, added to the iPhone
home screen via Safari — no App Store account needed) backed by a shared
**Supabase** project (Postgres + Auth + Storage) so both partners see the
same live data on their own phones. See [`docs/01-architecture.md`](docs/01-architecture.md)
for why.

Detailed docs live in [`docs/`](docs/) — this file is the map of phases and
status. Check items off as they land.

## Shipped outside the original phases

- [x] **Goals tab**: originally investment property rent tracking + a
      single hardcoded wedding fund; reworked into a generic system where
      either partner can create any number of named goals (title +
      optional target amount/date), each its own collapsible section with
      its own saved/spent transaction log, task checklist, and linked
      documents. See [`docs/12-feature-goals.md`](docs/12-feature-goals.md).
- [x] **Money tab**: Expenses, Replacements, and Repayments condensed into
      one tab with a segmented sub-nav, to stop the tab bar growing
      unbounded as more trackers get added. Replacements and Repayments
      were both later removed entirely (not relocated), and the Rent
      segment moved in from the Goals tab, so the tab now has just
      Expenses and BrackenRidge Rent.
- [x] **Repayments removed**: the Repayments feature (table + module) was
      deleted outright rather than relocated — see
      [`docs/06-feature-repayments.md`](docs/06-feature-repayments.md).
      Investment property rent tracking moved from the Goals tab into the
      Money tab in the same change. See
      [`docs/13-feature-money-tab.md`](docs/13-feature-money-tab.md).
- [x] **Replacements removed, Money tab pared to two segments**: the
      Replacement Reminders feature (table + module) was deleted outright,
      same as Repayments before it — see
      [`docs/05-feature-replacements.md`](docs/05-feature-replacements.md).
      The Rent segment was renamed to "BrackenRidge Rent" (the household's
      one actual property) now that there's room for a longer label.
- [x] **Goal tasks and linked documents**: each goal now also has a plain
      checklist (`goal_tasks`, check off as done) alongside its money
      ledger, and can have documents uploaded/linked to it directly (same
      `documents` table as the Docs tab, tagged via `related_type`/
      `related_id`). See [`docs/12-feature-goals.md`](docs/12-feature-goals.md).
- [x] **Goal contribution bar**: a stacked bar above each goal's
      transaction list shows how much each household member has
      contributed (by `created_by` on `saved` transactions), with a
      legend naming each person, amount and share. Colors come from a
      new validated categorical palette (`--series-1`...`--series-8` in
      `styles.css`) rather than the app's `--accent`/`--accent-2` pair,
      which failed color-blind-safety validation for this use. See
      [`docs/12-feature-goals.md`](docs/12-feature-goals.md) and the
      color-by-person pattern in
      [`docs/14-ui-patterns.md`](docs/14-ui-patterns.md).
- [x] **In-app theme toggle**: Theme: Auto/Light/Dark in the ⚙️ account
      sheet, on top of the existing OS-driven dark mode — "Auto" (default)
      behaves exactly as before, "Light"/"Dark" force it via
      `<html data-theme="...">` regardless of the device's own setting,
      persisted in `localStorage` and applied pre-paint (no flash) via a
      small inline script in each HTML file. See `app/js/theme.js` and
      the "Theming" section in
      [`docs/14-ui-patterns.md`](docs/14-ui-patterns.md).
- [x] **Dialog close fix**: every add-item sheet across the app now has a
      visible ✕ close button and dismisses on tap-outside — previously a
      `<dialog>` had no way to be closed on iOS short of submitting the
      form, which is what the reported "cogwheel won't close" bug was.
- [x] **Recurring (yearly) events**: birthdays/anniversaries stored with
      their real historical date now correctly show as upcoming every
      year instead of sliding permanently into "Past". See
      [`docs/03-feature-events.md`](docs/03-feature-events.md).
- [x] **Dark-mode glow theme**: a neon-on-black visual treatment (glowing
      card borders, gradient category pills, glowing tab icons) applied
      only when the device is in dark mode — the light theme is untouched.
- [x] **Events split into Upcoming/Done by calendar year**: a recurring
      event whose date has already passed *this* year (e.g. a January
      birthday, viewed in September) now shows under "Done" with the date
      it actually happened, instead of being folded back into "Upcoming"
      under a misleading next-year date and mixed in with things
      genuinely still coming up before year-end. New
      `thisYearOccurrence()` in `format.js`. See
      [`docs/03-feature-events.md`](docs/03-feature-events.md).
- [x] **Home dashboard drops passed events/goals instead of showing them
      early**: the "Coming up" feed now also uses `thisYearOccurrence()`
      for events (replacing `nextOccurrence()`, since removed as
      unused) — a birthday already gone by this year just disappears
      from the dashboard instead of jumping the queue with next year's
      date. Goals with a passed target date drop off the same feed. See
      [`docs/03-feature-events.md`](docs/03-feature-events.md) and
      [`docs/12-feature-goals.md`](docs/12-feature-goals.md).
- [x] **Grocery List and Recipes added to the Money tab**: two more
      segments alongside Expenses/BrackenRidge Rent. Grocery List is a
      shared checklist (item + optional quantity, check off as bought,
      bulk "Clear bought items"). Recipes is a collapsible recipe box —
      each recipe has a title plus Ingredients/Instructions subgroups,
      and collapses to just its title (same `<details class="goal-
      section">` pattern as Goals) so a growing collection doesn't turn
      into an endless scroll. The `.segmented` control now scrolls
      horizontally instead of squeezing four segments into equal-width
      buttons. See [`docs/16-feature-grocery-list.md`](docs/16-feature-grocery-list.md)
      and [`docs/17-feature-recipes.md`](docs/17-feature-recipes.md).
      Along the way, fixed a latent bug in `goals.js` where renaming a
      goal updated the database but not its collapsed `<summary>` title
      (same root cause the new recipes.js code had to get right the
      first time) — both now re-render the whole list after a title
      change instead of just the edited section's body.

## Phase 0 — Foundations ✅ (this session)

- [x] Roadmap + docs split into sub-parts
- [x] Supabase schema: households, members, events, expenses, replacement
      items (since removed), repayments (since removed), documents +
      row-level security
- [x] Private Storage bucket for uploaded documents/receipts
- [x] PWA shell: manifest, service worker, offline app icon, install prompt
- [x] Auth (email/password) + create-or-join household via invite code
- [x] Core CRUD screens for all five feature areas

Details: [`docs/09-setup-supabase.md`](docs/09-setup-supabase.md) for how the
backend is wired, [`docs/02-data-model.md`](docs/02-data-model.md) for the
schema.

## Phase 1 — Make it genuinely usable day-to-day

- [x] Home dashboard: "what's due" feed merging rent due/overdue, plus
      upcoming events and goal target dates, in one glance
- [x] Edit flows for every record type: events, expenses, replacement
      items (since removed), rent periods, documents (title/category/
      expiry — not the uploaded file itself), goals, and individual goal
      transactions. Each edit sheet mirrors its add form, pre-filled, and
      mutates via `updateRow` instead of `insertRow`.
- [ ] Search and category filters across expenses/documents
- [ ] Sort/group expenses by month, category, who paid
- [ ] Basic monthly spend total + per-category breakdown
- [ ] Empty-state and onboarding polish (first-run tour)

## Phase 2 — Reminders that actually reach you

- [x] Web Push notifications (iOS 16.4+ supports this for home-screen PWAs)
      — originally for replacement and repayment due dates, both since
      removed, so the plumbing works but nothing currently triggers it —
      see [`docs/11-push-notifications.md`](docs/11-push-notifications.md)
- [x] Overdue escalation — a daily repeat notification for as long as an
      item stays overdue (simple form of escalation; no separate tiers yet)
- [ ] Recurring expenses (rent, subscriptions) that auto-log each period
- [ ] Document expiry alerts (insurance, warranties, contracts)
- [ ] Digest option: a daily/weekly summary instead of per-item pings

## Phase 3 — Money features worth having

- [x] "Who owes who" balance between partners, with a configurable split
      (not just 50/50 — each member has a `split_percent`, editable from
      the ⚙️ account sheet) and a "Settle up" action that logs a
      balancing payment. See
      [`docs/04-feature-expenses.md`](docs/04-feature-expenses.md).
- [ ] Multi-currency support (per-entry currency + household default)
- [ ] CSV export of expenses and goal transactions for taxes/records
- [ ] Simple charts: spend by category, spend over time

## Phase 4 — Documents that pull their weight

- [x] Link a document to a goal (shipped, see
      [`docs/12-feature-goals.md`](docs/12-feature-goals.md)); linking to
      an expense or event too is a possible follow-up
- [ ] Thumbnail previews for images/PDFs in the documents list
- [ ] Tags and full-text search over document titles/notes
- [ ] Bulk export/download of all documents (zip) as a personal backup

## Phase 5 — Nice-to-haves / stretch

- [ ] Shared shopping/errand list
- [ ] iCal feed you can subscribe to from Apple Calendar for due dates
- [ ] iOS Shortcuts integration for quick voice add ("log an expense")
- [ ] Face ID / Touch ID app lock (WebAuthn) since this holds financial data
- [ ] Support a second household (e.g. tracking things with family too)
- [ ] Activity log — who added/edited/deleted what, for transparency
- [ ] Bank statement CSV import to auto-suggest expenses
- [ ] Wrap the PWA in Capacitor for a real App Store build, if ever wanted

## Suggestions for making it better

See [`docs/10-suggestions.md`](docs/10-suggestions.md) for the fuller
rationale behind these; the short list:

1. **One dashboard, not five apps.** The biggest risk with a tracker like
   this is partners stop opening it. A single "what needs attention today"
   home screen (due rent, upcoming events/goal dates) matters more than
   any individual feature being deep.
2. **Low friction logging.** Add-expense should be a 2-tap flow (amount,
   category, done) with smart defaults (last-used category, today's date),
   not a full form every time.
3. **Shared accountability without nagging.** Show who added/paid for
   things, but keep tone neutral — this is a life-admin tool, not a
   scorekeeping tool.
4. **Notifications are the make-or-break feature** for due-date tracking
   — a list nobody checks is just a diary. The plumbing is built; it
   currently has nothing wired up to trigger it (see
   [`docs/11-push-notifications.md`](docs/11-push-notifications.md)).
5. **Treat documents as attachments, not a filing cabinet.** They're most
   useful linked to the thing they're about (contract → goal) rather than
   a flat pile to search through later.

## Non-goals (for now)

- Native iOS app / App Store distribution (revisit only if the PWA proves
  the concept and a native feel is genuinely needed)
- Bank account integration / Open Banking (heavy compliance lift for a
  two-person tool)
- Multi-tenant/team features beyond a household of two-ish people
