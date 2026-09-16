# Roadmap

**Relationship Life Tracker** — a shared app for two partners to track life
events, expenses, replacement reminders (filters, batteries, subscriptions),
investment property rent, savings/spending goals, and reference documents
(warranties, contracts, receipts).

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
      its own saved/spent transaction log. See
      [`docs/12-feature-goals.md`](docs/12-feature-goals.md).
- [x] **Money tab**: Expenses, Replacements, and Repayments condensed into
      one tab with a segmented sub-nav, to stop the tab bar growing
      unbounded as more trackers get added.
- [x] **Repayments removed, rent moved to Money**: the Repayments feature
      (table + module) was deleted outright rather than relocated — see
      [`docs/06-feature-repayments.md`](docs/06-feature-repayments.md).
      Investment property rent tracking moved from the Goals tab into the
      Money tab as a third "Rent" segment (replacing "Repay"). See
      [`docs/13-feature-money-tab.md`](docs/13-feature-money-tab.md).
- [x] **Dialog close fix**: every add-item sheet across the app now has a
      visible ✕ close button and dismisses on tap-outside — previously a
      `<dialog>` had no way to be closed on iOS short of submitting the
      form, which is what the reported "cogwheel won't close" bug was.
- [x] **Recurring (yearly) events**: birthdays/anniversaries stored with
      their real historical date now correctly show as upcoming every
      year instead of sliding permanently into "Past". See
      [`docs/03-feature-events.md`](docs/03-feature-events.md).

## Phase 0 — Foundations ✅ (this session)

- [x] Roadmap + docs split into sub-parts
- [x] Supabase schema: households, members, events, expenses, replacement
      items, repayments (since removed), documents + row-level security
- [x] Private Storage bucket for uploaded documents/receipts
- [x] PWA shell: manifest, service worker, offline app icon, install prompt
- [x] Auth (email/password) + create-or-join household via invite code
- [x] Core CRUD screens for all five feature areas

Details: [`docs/09-setup-supabase.md`](docs/09-setup-supabase.md) for how the
backend is wired, [`docs/02-data-model.md`](docs/02-data-model.md) for the
schema.

## Phase 1 — Make it genuinely usable day-to-day

- [x] Home dashboard: "what's due" feed merging replacements + rent
      due/overdue, plus upcoming events and goal target dates, in one glance
- [x] Edit flows for every record type: events, expenses, replacement
      items, rent periods, documents (title/category/expiry — not the
      uploaded file itself), goals, and individual goal transactions.
      Each edit sheet mirrors its add form, pre-filled, and mutates via
      `updateRow` instead of `insertRow`.
- [ ] Search and category filters across expenses/documents
- [ ] Sort/group expenses by month, category, who paid
- [ ] Basic monthly spend total + per-category breakdown
- [ ] Empty-state and onboarding polish (first-run tour)

## Phase 2 — Reminders that actually reach you

- [x] Web Push notifications (iOS 16.4+ supports this for home-screen PWAs)
      for replacement due dates (originally repayment due dates too, before
      Repayments was removed) — see
      [`docs/11-push-notifications.md`](docs/11-push-notifications.md)
- [x] Overdue escalation — a daily repeat notification for as long as an
      item stays overdue (simple form of escalation; no separate tiers yet)
- [ ] Recurring expenses (rent, subscriptions) that auto-log each period
- [ ] Document expiry alerts (insurance, warranties, contracts)
- [ ] Digest option: a daily/weekly summary instead of per-item pings

## Phase 3 — Money features worth having

- [ ] "Who owes who" balance between partners (expense splitting, not just
      logging), with a settle-up action
- [ ] Multi-currency support (per-entry currency + household default)
- [ ] CSV export of expenses and goal transactions for taxes/records
- [ ] Simple charts: spend by category, spend over time

## Phase 4 — Documents that pull their weight

- [ ] Link a document to a specific replacement item, goal, or expense
      (e.g. attach the warranty PDF to the "boiler" replacement item)
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
- [ ] Dark mode / theming
- [ ] Wrap the PWA in Capacitor for a real App Store build, if ever wanted

## Suggestions for making it better

See [`docs/10-suggestions.md`](docs/10-suggestions.md) for the fuller
rationale behind these; the short list:

1. **One dashboard, not five apps.** The biggest risk with a tracker like
   this is partners stop opening it. A single "what needs attention today"
   home screen (due replacements, due rent, upcoming events/goal dates)
   matters more than any individual feature being deep.
2. **Low friction logging.** Add-expense should be a 2-tap flow (amount,
   category, done) with smart defaults (last-used category, today's date),
   not a full form every time.
3. **Shared accountability without nagging.** Show who added/paid for
   things, but keep tone neutral — this is a life-admin tool, not a
   scorekeeping tool.
4. **Notifications are the make-or-break feature** for replacements — a
   list nobody checks is just a diary. Prioritize Phase 2's push
   notifications early.
5. **Treat documents as attachments, not a filing cabinet.** They're most
   useful linked to the thing they're about (warranty → replacement item,
   contract → goal) rather than a flat pile to search through later.

## Non-goals (for now)

- Native iOS app / App Store distribution (revisit only if the PWA proves
  the concept and a native feel is genuinely needed)
- Bank account integration / Open Banking (heavy compliance lift for a
  two-person tool)
- Multi-tenant/team features beyond a household of two-ish people
