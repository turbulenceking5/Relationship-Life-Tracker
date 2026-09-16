# Roadmap

**Relationship Life Tracker** — a shared app for two partners to track life
events, expenses, replacement reminders (filters, batteries, subscriptions),
repayments/loans, and reference documents (warranties, contracts, receipts).

Platform decision: a **PWA** (installable HTML/JS app, added to the iPhone
home screen via Safari — no App Store account needed) backed by a shared
**Supabase** project (Postgres + Auth + Storage) so both partners see the
same live data on their own phones. See [`docs/01-architecture.md`](docs/01-architecture.md)
for why.

Detailed docs live in [`docs/`](docs/) — this file is the map of phases and
status. Check items off as they land.

## Shipped outside the original phases

- [x] **Goals tab**: investment property rent tracking (rolling ledger,
      fortnightly by default) + wedding fund (savings goal, spend log,
      countdown) — added after real usage surfaced these as needed. See
      [`docs/12-feature-goals.md`](docs/12-feature-goals.md).
- [x] **Money tab**: Expenses, Replacements, and Repayments condensed into
      one tab with a segmented sub-nav, to stop the tab bar growing
      unbounded as more trackers get added.
- [x] **Dialog close fix**: every add-item sheet across the app now has a
      visible ✕ close button and dismisses on tap-outside — previously a
      `<dialog>` had no way to be closed on iOS short of submitting the
      form, which is what the reported "cogwheel won't close" bug was.

## Phase 0 — Foundations ✅ (this session)

- [x] Roadmap + docs split into sub-parts
- [x] Supabase schema: households, members, events, expenses, replacement
      items, repayments, documents + row-level security
- [x] Private Storage bucket for uploaded documents/receipts
- [x] PWA shell: manifest, service worker, offline app icon, install prompt
- [x] Auth (email/password) + create-or-join household via invite code
- [x] Core CRUD screens for all five feature areas

Details: [`docs/09-setup-supabase.md`](docs/09-setup-supabase.md) for how the
backend is wired, [`docs/02-data-model.md`](docs/02-data-model.md) for the
schema.

## Phase 1 — Make it genuinely usable day-to-day

- [x] Home dashboard: "what's due" feed merging replacements + repayments
      due/overdue, plus upcoming events, in one glance
- [ ] Edit/delete flows for every record type (MVP ships create, list, and
      delete for everything, plus mark-replaced/mark-paid; full field
      editing is the next priority)
- [ ] Search and category filters across expenses/documents
- [ ] Sort/group expenses by month, category, who paid
- [ ] Basic monthly spend total + per-category breakdown
- [ ] Empty-state and onboarding polish (first-run tour)

## Phase 2 — Reminders that actually reach you

- [x] Web Push notifications (iOS 16.4+ supports this for home-screen PWAs)
      for replacement due dates and repayment due dates — see
      [`docs/11-push-notifications.md`](docs/11-push-notifications.md)
- [x] Overdue escalation — a daily repeat notification for as long as an
      item stays overdue (simple form of escalation; no separate tiers yet)
- [ ] Recurring expenses (rent, subscriptions) that auto-log each period
- [ ] Document expiry alerts (insurance, warranties, contracts)
- [ ] Digest option: a daily/weekly summary instead of per-item pings

## Phase 3 — Money features worth having

- [ ] "Who owes who" balance between partners (expense splitting, not just
      logging), with a settle-up action
- [ ] Repayment schedules with installments, not just one due date
- [ ] Multi-currency support (per-entry currency + household default)
- [ ] CSV export of expenses and repayments for taxes/records
- [ ] Simple charts: spend by category, spend over time

## Phase 4 — Documents that pull their weight

- [ ] Link a document to a specific replacement item, repayment, or expense
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
   home screen (due replacements, due repayments, upcoming events) matters
   more than any individual feature being deep.
2. **Low friction logging.** Add-expense should be a 2-tap flow (amount,
   category, done) with smart defaults (last-used category, today's date),
   not a full form every time.
3. **Shared accountability without nagging.** Show who added/paid for
   things, but keep tone neutral — this is a life-admin tool, not a
   scorekeeping tool.
4. **Notifications are the make-or-break feature** for replacements and
   repayments — a list nobody checks is just a diary. Prioritize Phase 2's
   push notifications early.
5. **Treat documents as attachments, not a filing cabinet.** They're most
   useful linked to the thing they're about (warranty → replacement item,
   contract → repayment) rather than a flat pile to search through later.

## Non-goals (for now)

- Native iOS app / App Store distribution (revisit only if the PWA proves
  the concept and a native feel is genuinely needed)
- Bank account integration / Open Banking (heavy compliance lift for a
  two-person tool)
- Multi-tenant/team features beyond a household of two-ish people
