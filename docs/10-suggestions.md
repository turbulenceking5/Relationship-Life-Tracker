# Suggestions to make this app better

Ranked roughly by impact-to-effort. Rationale included so these can be
revisited/argued with, not just taken on faith.

## High impact, do soonish

1. **A single home dashboard.** Right now the natural design is five
   separate lists (events/expenses/replacements/repayments/documents).
   The single most valuable screen is one that merges "what's due or
   overdue across everything" into one glance — this is the difference
   between an app that gets opened daily and one that gets opened when
   remembered (i.e., rarely). Planned Phase 1.

2. **Push notifications for due dates.** A replacement/repayment tracker
   that requires you to remember to open it defeats its own purpose.
   iOS 16.4+ supports Web Push for home-screen-installed PWAs, so this is
   achievable without going native. This is arguably the single highest-
   leverage feature to add after the MVP. Planned Phase 2.

3. **Low-friction add-expense flow.** If logging an expense takes more
   than ~10 seconds, it stops happening consistently and the data becomes
   useless. Worth investing in smart defaults (remember last category,
   today's date, last payer) before investing in reporting features.

## Medium impact

4. **Expense splitting / "who owes who."** Right now expenses are just a
   log. A lot of the real value couples get from shared expense trackers
   (Splitwise etc.) is the running balance and settle-up flow. Planned
   Phase 3 — worth pulling forward if that's the primary use case rather
   than replacements/documents.

5. **Link documents to the thing they're about.** A flat document list
   becomes a junk drawer. Attaching the warranty PDF directly to the
   "boiler" replacement item, or the loan agreement to the repayment, is
   much more useful than search. Schema already supports this
   (`related_type`/`related_id`); just needs UI. Planned Phase 4.

6. **Recurring expenses/events.** Rent, subscriptions, birthdays,
   anniversaries — a lot of what goes into this app repeats. Auto-logging
   or auto-recurring these removes a chunk of manual re-entry.

## Lower priority but worth having eventually

7. **Face ID / Touch ID app lock.** This app will hold financial data and
   personal documents; an optional WebAuthn-based lock screen is cheap
   insurance for a shared iPhone screen glance-over scenario.

8. **iCal subscription feed.** Let Apple Calendar subscribe to a feed of
   upcoming due dates/events instead of duplicating a calendar inside the
   app.

9. **CSV export.** For taxes, budgeting elsewhere, or just as an escape
   hatch so data is never trapped in the app.

10. **Activity log.** "Who added/edited/deleted this and when" — mostly
    for transparency and trust between partners, and handy for undoing
    mistakes.

11. **iOS Shortcuts integration.** A Shortcuts action ("Hey Siri, log an
    expense") for quick capture without opening the app at all.

## Things deliberately not suggested (yet)

- **Bank/Open Banking integration** — large compliance and security
  surface for a two-person tool; CSV import (#9's inverse) gets most of
  the value far more cheaply.
- **Native iOS rewrite** — revisit only once the PWA has proven the
  feature set is right; rewriting before that risks optimizing the wrong
  thing.
- **Multi-currency conversion with live FX rates** — real complexity
  (which rate, when, rounding) for a feature most households won't need;
  simple per-entry currency tagging (already in the schema) covers the
  common case of "we're on holiday and paid in euros."
