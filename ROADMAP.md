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
- [x] **Fixed the expense split silently never saving**: `household_members`
      had no `UPDATE` RLS policy, so `updateSplitPercents()`'s writes were
      silently dropped by RLS (0 rows affected, no error) — the account
      sheet's "Split saved" message was never true, and every balance
      calculation kept using the schema default of 50/50 regardless of
      what was entered. Fixed with a column-scoped grant (`split_percent`
      only) plus a matching policy, rather than a blanket `UPDATE` grant —
      verified directly with an RLS-simulated SQL update in both
      directions (updating your own row and your partner's) before
      trusting it fixed. See
      [`docs/08-auth-households.md`](docs/08-auth-households.md).
- [x] **Mortgage payments added alongside Rent**: the BrackenRidge segment
      (renamed from "BrackenRidge Rent," since it now covers both cash
      flows) shows Rent and Mortgage as two stacked sections on one page,
      each its own due/paid list with its own "+ Add" button — sharing
      one `renderPaymentSection()` helper in `rent.js` since the two
      tables (`rent_payments`/new `mortgage_payments`) are otherwise
      identical in shape. Mortgage payments due/overdue also show on the
      home dashboard's "What's due" feed alongside rent. See
      [`docs/23-feature-rent-mortgage.md`](docs/23-feature-rent-mortgage.md).
- [x] **Rent/Mortgage paid history collapsed into a "History" section**:
      paid periods for both used to sit right below their own section's
      unpaid ones, so Rent's growing history pushed Mortgage's current
      periods off screen. Both now pull their paid periods into a single
      History section at the bottom, each collapsed behind its own
      `<details>` (closed by default) — one tap away, not clogging the
      scroll between the two current sections. See
      [`docs/23-feature-rent-mortgage.md`](docs/23-feature-rent-mortgage.md).
- [x] **In-app "What's new" changelog**: a dialog on app load lists
      everything shipped since that browser last dismissed it, sourced
      from a hand-maintained array in `app/js/changelog.js`
      (`localStorage`-tracked, per device, no new table). A
      [`CHANGELOG.md`](CHANGELOG.md) at the repo root is its
      human-facing counterpart for anyone reading the repo. See
      [`docs/18-feature-changelog.md`](docs/18-feature-changelog.md) for
      how the two relate and how to keep both updated going forward.
- [x] **Home dashboard: events and goals split apart**: "Coming up" was
      one list mixing events and goals; now "Upcoming events" and
      "Upcoming goals" are separate sections, each with its own
      empty-state message. See
      [`docs/22-feature-home-dashboard.md`](docs/22-feature-home-dashboard.md).
- [x] **Home dashboard: "What's due" sorted by date across types**: rent,
      mortgage, and expiring documents used to be shown grouped by type
      (every rent period before every mortgage period, regardless of
      which was actually more urgent); now merged into one list sorted
      by date. See
      [`docs/22-feature-home-dashboard.md`](docs/22-feature-home-dashboard.md).
- [x] **Repeatable events beyond yearly**: recurring events were yearly
      only (birthdays/anniversaries); a "Repeats" dropdown now also offers
      weekly, fortnightly, and monthly, for things like a standing
      appointment or a chore reminder. See
      [`docs/03-feature-events.md`](docs/03-feature-events.md).
- [x] **Personal to-dos**: a private reminder list, invisible to the
      other household member — the one feature in the app scoped to a
      single user rather than the whole household. Lives as a "My
      To-dos" segment in the Money tab, with its own push notifications
      (sent only to the owner's devices). See
      [`docs/20-feature-personal-todos.md`](docs/20-feature-personal-todos.md).
- [x] **Documents move to Google Drive; any file, not just photos**: new
      uploads are stored in one shared Google Drive folder instead of
      Supabase Storage, connected from `⚙️ Account & household →
      Documents storage`. Along the way, fixed the upload file input
      forcing Android straight into the camera (a `capture` attribute
      that made PDFs/other files effectively unreachable) — it now
      accepts any file type. Existing documents keep working unchanged.
      See [`docs/21-google-drive-documents.md`](docs/21-google-drive-documents.md).
- [x] **Confirm before delete, everywhere**: expenses, settlements,
      recurring expenses, events, rent/mortgage periods, documents, and
      personal to-dos now all ask "Delete this ___?" before deleting —
      previously only Goals, Grocery List, and Recipes did, so a mis-tap
      on any other tab deleted a record immediately with no way back.
- [x] **Lower-friction add-expense form**: Amount now comes first in the
      Add/Edit expense sheet (ahead of Title), the category defaults to
      whatever was picked last time instead of always resetting to the
      first category, and every money amount field across the app
      (expenses, rent/mortgage, goals, settle-up) sets
      `inputmode="decimal"` so iOS shows a numeric keypad instead of the
      full keyboard. See [`04-feature-expenses.md`](docs/04-feature-expenses.md).
- [x] **Home dashboard surfaces the expense balance and checklists**: the
      "who owes who" balance (previously only visible on Money → Expenses)
      now also shows at the top of Home when unsettled, and a new "On your
      plate" section links to the Grocery List and My To-dos with a live
      count, so those two checklist-shaped segments aren't invisible from
      the one screen people actually open daily.
- [x] **Document category filter chips + Drive filename prefix**: chips
      (All/Warranty/Contract/Receipt/ID/Other) on the Docs tab alongside
      search; new Drive uploads get a category prefix in the filename
      (e.g. `[Warranty] Boiler warranty.pdf`). Real Drive subfolders per
      category weren't used — they don't work with this app's narrow
      OAuth scope without a join step per category per partner. See
      [`docs/21-google-drive-documents.md`](docs/21-google-drive-documents.md).

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
- [x] Search across expenses/documents — a plain text filter, not
      category chips on top of it (a search box already covers "find the
      boiler warranty" as well as a chip row would). See
      [`04-feature-expenses.md`](docs/04-feature-expenses.md) and
      [`07-feature-documents.md`](docs/07-feature-documents.md).
- [x] Sort/group expenses by month, category, who paid — expenses now
      group into collapsible per-month sections (current month open,
      older months collapsed), same pattern as Goals/Recipes. Category
      and payer sort weren't added on top — a month is the grouping
      people actually look for ("what did we spend in March"), and
      search/the per-category "This month" breakdown already cover the
      other two. See [`04-feature-expenses.md`](docs/04-feature-expenses.md).
- [x] Basic monthly spend total + per-category breakdown — a "This
      month" card with a contribution-bar/legend visual on the Expenses
      tab. See [`04-feature-expenses.md`](docs/04-feature-expenses.md).
- [x] Empty-state and onboarding polish (first-run tour) — a one-time
      "Welcome" dialog (`app/js/onboarding.js`) explains the five tabs and
      where the invite code lives, shown once per browser before the
      "What's new" dialog on first load.
- [x] **UX audit fixes batch**: grocery items can now be edited (title,
      quantity, category) instead of delete-and-re-add, and gained a
      search box; a recipe's ingredients can be pushed straight onto the
      Grocery List with one tap, auto-categorized; a repeating personal
      to-do marked done by hand now correctly advances to its next
      occurrence instead of stopping permanently (it used to behave
      differently from the same reminder firing via push); every form's
      submit button now disables with a "Saving…" state during its
      request; expense/grocery/event cards show who added them
      (`created_by`) when that differs from who it's otherwise
      attributed to — directly the "show who added/paid for things"
      suggestion above; and `.actions-row` tap targets got bigger, with
      extra spacing before Delete specifically. See
      [`docs/16-feature-grocery-list.md`](docs/16-feature-grocery-list.md),
      [`docs/17-feature-recipes.md`](docs/17-feature-recipes.md),
      [`docs/20-feature-personal-todos.md`](docs/20-feature-personal-todos.md),
      and [`docs/14-ui-patterns.md`](docs/14-ui-patterns.md).
- [x] **Shared note, event-goal links, chore rotation, goal celebrations,
      rent streak**: a free-text sticky note on Home either partner can
      edit (`households.shared_note`); a recurring event can alternate
      between the two household members each occurrence instead of
      always showing the same person (`events.rotate_assignee` +
      `assignee_user_id`, parity computed client-side, no per-occurrence
      storage); an event can link to a goal
      (`events.related_goal_id`); reaching a savings goal plays a
      one-time confetti celebration; and rent/mortgage shows a quiet
      "paid on time N periods running" line once a streak actually
      exists. Along the way, fixed a latent bug where
      `getMyHousehold()` never selected the Google Drive columns, so a
      page reload after connecting Drive incorrectly re-prompted to
      connect it again. See
      [`docs/03-feature-events.md`](docs/03-feature-events.md),
      [`docs/12-feature-goals.md`](docs/12-feature-goals.md),
      [`docs/22-feature-home-dashboard.md`](docs/22-feature-home-dashboard.md),
      and [`docs/23-feature-rent-mortgage.md`](docs/23-feature-rent-mortgage.md).
- [x] **Live sync across phones (Realtime) + a "🔔 Remind" nudge**: every
      shared-list table now broadcasts changes via Supabase Realtime, so
      an add/edit/delete on one phone shows up on the other without a
      reload (`app/js/realtime.js`); and a "🔔 Remind" button on each
      overdue "What's due" card sends a one-tap push to your partner
      instead of texting them separately (new `remind-partner` edge
      function — the first one in this app called directly by a user
      rather than by `pg_cron`). See
      [`docs/24-live-sync-and-nudges.md`](docs/24-live-sync-and-nudges.md).
- [x] **Finish/close a goal**: a "Finish goal"/"Reopen goal" button,
      independent of hitting the target — previously a goal with no
      target amount (a plain checklist-style goal) had no way to be
      marked done, and even a goal with one stayed open forever once
      reached unless deleted outright. Closed goals move into a
      collapsed "Closed goals" section, same pattern as Events'
      Upcoming/Done split. See
      [`docs/12-feature-goals.md`](docs/12-feature-goals.md).
- [x] **Bug-fix batch from a 3-agent audit**: fixed the "🔔 Remind" nudge
      silently not working in any real browser (missing CORS headers —
      see [`docs/24-live-sync-and-nudges.md`](docs/24-live-sync-and-nudges.md)),
      Realtime live sync clobbering an in-progress Goals/Recipes inline
      edit or collapsing an open section, a coincidental-constant bug in
      `events.js`'s repeat-select default, and a real latent
      UTC-vs-local-date bug in `rent.js`'s "mark as paid" flow (found
      while deduplicating a hand-rolled `addDays()` into `format.js`).
      Also: documents now show "added by," search boxes added to Events
      and My To-dos, and a per-household cooldown on the remind nudge.
- [x] **Proactively ask to enable push notifications**: previously the
      only way to turn them on was finding the toggle in ⚙️ Account &
      household. Now asked once per browser, chained onto the existing
      onboarding → changelog dialog sequence, but only when it's
      actually one tap away (push supported, app installed to the home
      screen, not already on) — declining isn't permanent, the manual
      toggle still works either way. See
      [`docs/11-push-notifications.md`](docs/11-push-notifications.md).
- [x] **Leave a household, or remove a member**: previously there was
      no way to cut off a household member's access short of hand-running
      SQL in the Supabase dashboard. A new "Household members" section
      in ⚙️ Account & household offers "Leave household" on your own
      row, and "Remove" on the other member's row if you're the one who
      created the household — enforced server-side via a new
      `SECURITY DEFINER` RPC, not just a hidden button. See
      [`docs/08-auth-households.md`](docs/08-auth-households.md).
- [x] **Comment thread on expenses and events**: a new 💬 button on
      every expense and event card opens a thread of plain-text comments
      — a back-and-forth note on one specific record instead of a text
      message outside the app. One shared module/table
      (`app/js/comments.js`, `item_comments`) backs both, keyed by a
      polymorphic `entity_type`/`entity_id` pair rather than duplicated
      per feature. See
      [`docs/04-feature-expenses.md`](docs/04-feature-expenses.md) and
      [`docs/03-feature-events.md`](docs/03-feature-events.md).
- [x] **Chore fairness tally**: a rotating recurring event now shows a
      running "Alex 5 · Sam 4" tally of turns taken so far, next to "It's
      your turn" — derived arithmetic on the existing cycle count, no new
      data needed since the rotation was already fully deterministic.
      See [`docs/03-feature-events.md`](docs/03-feature-events.md).
- [x] **Download an event as .ics**: a "📅 .ics" button on every event
      card downloads that one occurrence as a calendar file, built
      client-side with no backend change (`app/js/ics.js`), for
      importing into Apple/Google/Outlook Calendar. See
      [`docs/03-feature-events.md`](docs/03-feature-events.md).
- [x] **Automatic backup to Google Drive**: once Drive is connected,
      household data now backs up there as a dated JSON file roughly
      weekly, plus a manual "Back up now" button — opportunistic
      (triggered on app open), not a real `pg_cron` job, since this
      app's Drive access is deliberately client-only with no
      server-side credential to run one. See
      [`docs/25-feature-backup.md`](docs/25-feature-backup.md).
- [x] **Accessibility pass**: every icon-only button (every "+" FAB, the
      💬 comment button, the 📅 .ics download button) now has an
      `aria-label`; a decorative icon next to text saying the same thing
      is `aria-hidden`; `styles.css` now honors `prefers-reduced-motion`
      and `prefers-contrast: more` globally, same OS-driven-by-default
      approach as dark mode — no new in-app toggle. See
      [`docs/14-ui-patterns.md`](docs/14-ui-patterns.md).

## Phase 2 — Reminders that actually reach you

- [x] Web Push notifications (iOS 16.4+ supports this for home-screen PWAs)
      — originally for replacement and repayment due dates, both since
      removed; now wired up to rent, mortgage, goal target dates, document
      expiry, and events instead — see
      [`docs/11-push-notifications.md`](docs/11-push-notifications.md) and
      [`docs/19-notification-sources.md`](docs/19-notification-sources.md)
- [x] Overdue escalation — a daily repeat notification for as long as an
      item stays overdue (simple form of escalation; no separate tiers yet)
- [x] Recurring expenses (subscriptions, insurance) that auto-log each
      period via a daily `pg_cron` job, no user action needed — see
      [`04-feature-expenses.md`](docs/04-feature-expenses.md)
- [x] Document expiry alerts (insurance, warranties, contracts) — a status
      pill, surfacing on the home dashboard's "What's due", and a push
      notification once actually expired. See
      [`07-feature-documents.md`](docs/07-feature-documents.md).
- [x] **Weekly digest**: a once-a-week "state of us" push (total spent,
      total saved toward goals, events coming up) alongside the
      per-item pings, not instead of them — see
      [`24-live-sync-and-nudges.md`](docs/24-live-sync-and-nudges.md).
      Not user-configurable yet (fixed Sunday evening, no opt-out beyond
      disabling push entirely).

## Phase 3 — Money features worth having

- [x] "Who owes who" balance between partners, with a configurable split
      (not just 50/50 — each member has a `split_percent`, editable from
      the ⚙️ account sheet) and a "Settle up" action that logs a
      balancing payment. See
      [`docs/04-feature-expenses.md`](docs/04-feature-expenses.md).
- [x] **Personal expenses — don't split at all**: a "Personal expense"
      checkbox on the add/edit expense form excludes it from the "who
      owes who" balance entirely, instead of needing a dishonest 100/0
      split to fake the same thing. Still counts toward the "This
      month" total and category breakdown. See
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
- [ ] iCal **feed** you can subscribe to from Apple Calendar for due
      dates (a live, auth-free endpoint covering every future
      occurrence) — distinct from the per-event one-off `.ics` download
      already shipped in Phase 1, which only ever covers one occurrence
      at a time
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
