# Feature: Money tab (Expenses / Replacements / Repayments)

Expenses, Replacement Reminders, and Repayments were originally three
separate top-level tabs. They were condensed into one **Money** tab with
a segmented sub-nav after the tab bar grew to 7 entries (once Goals
shipped) and started feeling cluttered on a phone-width screen.

## How it works

`app/js/money.js` is a thin router, not a feature module in its own
right:

- It renders a `.segmented` control (Expenses / Replace / Repay) above a
  content area.
- Each segment delegates straight to the existing, unmodified feature
  module — `expenses.js`, `replacements.js`, `repayments.js` — calling
  its `render(container, ctx)` exactly as the top-level tab router in
  `app.js` used to.
- `activeSub` is module-level state (same pattern as `currentTab` in
  `app.js`), so it's remembered for as long as the page stays loaded, but
  always starts back on "Expenses" after a full reload.

Nothing about the three underlying modules changed — they're unaware
they're no longer top-level tabs. This is deliberate: it keeps the
condensation reversible (splitting them back into separate tabs later is
just an `app.js` TABS-array change) and means their own docs
([`04-feature-expenses.md`](04-feature-expenses.md),
[`05-feature-replacements.md`](05-feature-replacements.md),
[`06-feature-repayments.md`](06-feature-repayments.md)) still describe
their behavior accurately.

## Home dashboard links

The home dashboard's "What's due" cards link into specific sub-tabs (a
tap on a due repayment should land on the Repay segment, not default to
Expenses). This works via `money.js` exporting `setActiveSub(key)`, which
`app.js`'s home-tab navigate callback calls before switching to the
`money` tab:

```js
if (key === 'expenses' || key === 'replacements' || key === 'repayments') {
  const moneyMod = await import('./money.js');
  moneyMod.setActiveSub(key);
  currentTab = 'money';
}
```

## Why not one long scrolling page instead

Goals (rent + wedding) uses a single scrolling page with two stacked
sections rather than a segmented sub-nav. Money didn't follow that
pattern because each of its three sections can independently grow long
(an expense list in particular), and stacking three independently-long
lists on one page would make the FAB/add-flow ambiguous — it wouldn't be
clear which section a tap on "+" was adding to without a lot of scroll
context. A segmented control keeps exactly one section (and its own FAB)
in view at a time.
