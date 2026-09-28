# Changelog

Human-facing counterpart to the in-app "What's new" dialog
(`app/js/changelog.js` — see [`docs/18-feature-changelog.md`](docs/18-feature-changelog.md)
for how that dialog decides what's unseen). Newest first. When shipping
a user-facing change, add an entry here **and** to
`app/js/changelog.js` — they cover the same events but for different
audiences (this one can be as technical as it needs to be; the in-app
one has to stay short enough to read on a phone).

## 2026-09-28 — Mortgage tracking, changelog, and a real expense-split fix

- BrackenRidge now tracks the mortgage payment alongside rent, not just
  the rent — a `mortgage_payments` table (mirrors `rent_payments`) and a
  Mortgage section next to Rent in `rent.js`.
- Paid rent/mortgage periods moved out of the main scroll into a
  collapsed "History" section at the bottom of the BrackenRidge segment,
  so a long payment history doesn't push the other section's current
  periods off screen.
- Added this changelog: an in-app "What's new" dialog on load (via
  `app/js/changelog.js`) plus this file.
- Fixed the expense split silently never saving — `household_members`
  had no `UPDATE` RLS policy, so changing the split away from 50/50
  looked like it worked but was never actually written.

## 2026-09-18 — Grocery list, recipes, and a smarter Events tab

- Added Grocery List and Recipes segments to the Money tab.
- Events tab: split into "Upcoming" and "Done" for the current year,
  instead of a recurring event that already happened this year sitting
  in "Upcoming" with a misleading next-year date.
- Home dashboard: passed events and goals now drop off the "Coming up"
  feed instead of showing early with a future-looking date.
- Added an in-app Light/Dark/Auto theme toggle, independent of the
  device's own dark-mode setting.

## 2026-09-16 — Money tab, editing, and dark mode

- Consolidated Expenses/Rent/Replacements/Repayments into a Money tab
  with a segmented sub-nav, and reworked Goals into a generic
  user-created-goal container.
- Added edit flows for every record type (previously delete-and-re-add
  was the only fix for a typo).
- Added a configurable expense split ("who owes who" balance) instead
  of assuming 50/50.
- Added recurring yearly events for birthdays/anniversaries.
- Added a dark-mode "glow" visual theme.
