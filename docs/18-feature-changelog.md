# Feature: Changelog ("What's new" dialog)

## Purpose
A shared PWA with no app-store update notes needs its own way to tell
Calum and Natasha "here's what changed" — otherwise a shipped feature
just silently appears (or doesn't, behind a stale service-worker cache)
with no explanation. This shows a dialog on app load listing everything
shipped since that browser last dismissed it.

## How it works
- `app/js/changelog.js` exports a hand-maintained `CHANGELOG_ENTRIES`
  array — `{ id, date, title, items }`, newest `id` last in the source
  file (for readability), but `getUnseenEntries()` returns them newest
  first since that's the only order the dialog displays in.
- `id` is a plain incrementing integer, not a semantic version — "is
  there anything unseen" is just `entry.id > lastSeenId`. Never reuse or
  renumber an id once shipped, or a browser that already saw it will see
  it again (harmless) or one that hasn't will skip it (not harmless).
- The last-seen id is stored in `localStorage['changelogLastSeenId']` —
  per browser/device, not per household member or synced anywhere,
  matching the same pattern `theme.js` uses for its own preference.
  Nothing server-side tracks who's seen what.
- `app.js`'s `afterAuth()` calls `showChangelogIfUnseen()` once per app
  load (page load, or the `SIGNED_IN` auth event) — not from
  `renderMainApp()`, which also runs on every tab switch and would
  otherwise show the dialog constantly. If there's nothing unseen, this
  is a no-op.
- The dialog is a `makeSheet()` sheet like any other (see
  [`14-ui-patterns.md`](14-ui-patterns.md)). Closing it any way — the
  "Got it" button, the sheet's own ✕, tap-outside — marks everything
  seen; there's no "remind me later," since dismissing without reading
  isn't meaningfully different from reading and moving on.

## Maintaining it
When a change is actually visible to Calum/Natasha (a new feature, a
fixed bug they'd have noticed, a renamed tab), add one bullet to the
current dated entry in `app/js/changelog.js` — or a new entry if it's a
new day's work — **and** the matching entry in
[`../CHANGELOG.md`](../CHANGELOG.md). The two aren't generated from each
other on purpose: the root `CHANGELOG.md` is for anyone reading the repo
(can be as technical as it needs to be — table names, root causes), the
in-app one is for two people glancing at their phone (short, plain
language, no implementation detail). Skip purely internal changes
(refactors, doc fixes, a migration with no visible effect) in both —
neither is a commit log.

## Data
No table — this is entirely a static, hand-maintained JS array plus
`localStorage`, not a database feature. Nothing in `02-data-model.md`
covers it.

## UI notes
- Keep each entry's `items` to plain, short, user-facing language — no
  file names, table names, or "root cause" explanations. That register
  belongs in `CHANGELOG.md`, not here.
