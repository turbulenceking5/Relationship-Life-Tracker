# Feature: Money tab (Expenses / BrackenRidge Rent)

Expenses, Replacement Reminders, and (originally) Repayments were
condensed into one **Money** tab with a segmented sub-nav after the tab
bar grew to 7 entries (once Goals shipped) and started feeling cluttered
on a phone-width screen. Repayments was later removed entirely (not
relocated — see [`06-feature-repayments.md`](06-feature-repayments.md)),
investment property rent tracking moved here from the Goals tab, and
Replacement Reminders was later removed too (not relocated — see
[`05-feature-replacements.md`](05-feature-replacements.md)), so the
current sub-nav is just Expenses and BrackenRidge Rent.

## How it works

`app/js/money.js` is a thin router, not a feature module in its own
right:

- It renders a `.segmented` control (Expenses / BrackenRidge Rent) above
  a content area.
- Each segment delegates straight to its own feature module —
  `expenses.js`, `rent.js` — calling its `render(container, ctx)` exactly
  as the top-level tab router in `app.js` used to.
- `activeSub` is module-level state (same pattern as `currentTab` in
  `app.js`), so it's remembered for as long as the page stays loaded, but
  always starts back on "Expenses" after a full reload.
- The segment label is a literal string — "BrackenRidge Rent" rather than
  a generic "Rent" — since this household tracks a single specific
  property. If a second property is ever added, this label (and the
  per-row `property_label` fallback text in `rent.js`/`home.js`) should
  go back to something generic.

Nothing about the underlying modules is money.js-specific — they're
unaware they're not top-level tabs. This is deliberate: it keeps the
condensation reversible (splitting them back into separate tabs later is
just an `app.js` TABS-array change) and means their own docs
([`04-feature-expenses.md`](04-feature-expenses.md)) still describe
their behavior accurately. `rent.js` was extracted from the old Goals tab
into a standalone module with the same shape.

## Home dashboard links

The home dashboard's "What's due" cards link into specific sub-tabs (a
tap on a due rent period should land on the Rent segment, not default to
Expenses). This works via `money.js` exporting `setActiveSub(key)`, which
`app.js`'s home-tab navigate callback calls before switching to the
`money` tab:

```js
if (key === 'expenses' || key === 'rent') {
  const moneyMod = await import('./money.js');
  moneyMod.setActiveSub(key);
  currentTab = 'money';
}
```

## Why not one long scrolling page instead

Goals uses a single scrolling page with a stack of collapsible sections
rather than a segmented sub-nav. Money didn't follow that pattern because
each of its sections can independently grow long (an expense list in
particular), and stacking independently-long lists on one page would make
the add-flow ambiguous — it wouldn't be clear which section a tap on "+"
was adding to without a lot of scroll context. A segmented control keeps
exactly one section (and its own add action) in view at a time.
