# UI patterns

Conventions used consistently across `app/js/*.js` — read this before
adding a new screen or form so it matches the rest of the app rather than
inventing a new pattern.

## Add-item sheets: always use `makeSheet()`

Every "add a thing" form (events, expenses, documents, rent periods,
goals, goal transactions, goal tasks, settle-up payments, plus the
account/settings sheet) is a native `<dialog>` built via `makeSheet()` in
`app/js/dom.js`:

```js
const { dialog, body } = makeSheet('Add expense');
// ...build a <form> as usual...
mount(body, form);
// later: openSheet(dialog) to show it, closeSheet(dialog) to hide it
```

**Never build a `<dialog>` by hand** (`h('dialog', {}, ...)`). A bare
`<dialog>` opened with `showModal()` has no way to be dismissed on iOS
short of submitting the form — no Escape key, tapping the backdrop does
nothing unless wired up explicitly. This was a real shipped bug (the
"cogwheel won't close" report) before `makeSheet()` existed. It bakes in:

- A visible ✕ close button in a `.sheet-header` row next to the title.
- Tap-outside-to-dismiss (a click listener that checks `e.target ===
  dialog`, since clicks on the sheet's own content bubble with a
  different target).

If a sheet needs to be appended outside its tab's normal container (the
account sheet is appended to `document.body` since it's opened from the
top bar, not from within a tab's content area), that's fine —
`makeSheet()` doesn't assume where its `dialog` ends up mounted, only
that `openSheet()`/`closeSheet()` are used to show/hide it.

## Section screens: `render(container, ctx)`

Every feature module exports an async `render(container, ctx)` that:

1. Fetches its own data (via `fetchRows`/`insertRow`/etc. from `crud.js`,
   or a direct `supabase.from(...)` call for a shape `crud.js` doesn't
   cover, like a single settings row).
2. Clears and rebuilds `container`'s contents from scratch (via `mount()`
   from `dom.js`, which clears before appending).
3. Re-calls itself (`render(container, ctx)`) after any mutation (add,
   delete, mark-as-paid, etc.) instead of trying to patch the DOM
   in place. This keeps every module simple at the cost of re-fetching
   more than strictly necessary — a deliberate simplicity-over-cleverness
   trade for an app this size.

`app.js` and `money.js` are the two exceptions that route between
multiple such modules rather than being one themselves.

### Inline edit forms need `data-editing`

Almost every edit flow is a `<dialog>` (via `makeSheet()`, above) — the
two exceptions are Goals' and Recipes' "Edit ___" buttons, which swap a
card's body for a form directly inside `main` rather than opening a
sheet. Because Realtime live sync (`app.js`'s `scheduleRefresh()`, see
[`24-live-sync-and-nudges.md`](24-live-sync-and-nudges.md)) can rebuild
`main` at any time in response to a partner's unrelated change, mark
that inline form's wrapper with `data-editing="true"` — the refresh
guard checks for it and skips the rebuild while it's present, same as it
already skips while a search box has focus. Skip this for anything that
opens a `<dialog>` instead; those live outside `main` and are never at risk.

## Card + pill conventions

- A list item is a `.card` containing a `.card-row` (title/meta on the
  left, amount/status on the right).
- A due-date-ish status uses `dueStatus()` from `format.js`, rendered as
  `<span class="pill {cls}">`, where `cls` is one of `ok` / `due-soon` /
  `overdue` (see `styles.css` for the color mapping).
- Destructive actions ("Delete") use `.btn.danger-text.small`; secondary
  actions ("Mark as paid", "Mark as received") use `.btn.secondary.small`.
- **A "Delete" button's `onclick` always starts with a `confirm('Delete
  this ___?')` guard**, returning early if it's cancelled, before calling
  `deleteRow()`. There's no undo anywhere in the app, so this is the only
  thing standing between a mis-tap on a phone and a permanently lost
  record. This was inconsistent for a while — Goals/Grocery List/Recipes
  had it, Expenses/Events/Rent/Documents/Personal to-dos didn't — before
  being made consistent everywhere; keep new delete buttons on this side
  of that line.
- `.actions-row` buttons use `.btn.small` (10px/14px padding, 0.85rem
  font — close to the ~44px tap-target guideline without visually
  bloating a row of three actions on one card) with a 10px gap, plus a
  little extra `margin-left` before `.btn.danger-text` specifically —
  Edit/Mark-done/Delete sitting edge-to-edge at a smaller size used to be
  an easy mis-tap, Delete especially.

## Submit buttons: always disable during the async request

**Every form's submit button disables itself and swaps to a "Saving…"
label for the duration of its `insertRow`/`updateRow` call**, via
`withBusyLabel(button, label)` in `app/js/dom.js`:

```js
const submitBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Save');
// ...
onsubmit: async (e) => {
  e.preventDefault();
  const restore = withBusyLabel(submitBtn, 'Saving…');
  try {
    await insertRow(...);
    closeSheet(dialog); // success — no need to call restore(), the sheet's gone
  } catch (err) {
    // show errorEl...
    restore();
  }
},
```

This was inconsistent for a while too — `documents.js`'s upload form and
`household.js`'s create/join forms had it, nothing else did — before
being made consistent everywhere. Without it, a double-tap on a flaky
connection fires the same insert/update twice before the first request
even resolves. Keep new forms on this side of that line, same as the
confirm-before-delete convention above.

## Collapsible sections: `<details class="goal-section">`

When a tab holds a growing list of independently-large items (Goals,
Recipes) rather than short list rows (Events, Expenses), wrap each item
in `<details class="goal-section"><summary>{title}</summary><div
class="goal-section-body">...</div></details>` instead of a plain
`.card`. Despite the class name (it shipped with Goals first), it's a
generic "collapsible card" — reused as-is for Recipes rather than
duplicated under a new class name. A single item starts expanded (`open:
items.length === 1`); two or more start collapsed, so the list doesn't
turn into an endless scroll.

Put Edit/Delete controls inside the expanded body, not on the collapsed
summary row — the collapsed view should show just the title. After a
save that changes the title (or anything the list is ordered/keyed by),
re-render the *whole* list, not just that item's body: the `<summary>`
text was set once from a plain string when the list was first built, so
mutating the underlying row object in place won't update it. See
`renderGoalBody()` in `goals.js` and `renderRecipeBody()` in
`recipes.js` for the pattern — the body-only re-render is fine for
edits that don't touch the summary (e.g. adding a transaction).

## Money amounts

Always format through `formatMoney(amount, currency)` from `format.js`
(uses `Intl.NumberFormat`), never string-concatenate a currency symbol —
it needs to work for whatever currency a given row/household uses, not
just the household default.

## Theming: OS-driven by default, overridable in-app

Light/dark is normally `@media (prefers-color-scheme: dark)` — no app
code involved. `app/js/theme.js` adds an **optional** override on top
(Theme: Auto/Light/Dark in the ⚙️ account sheet), stored in
`localStorage['theme']` and applied as `<html data-theme="light|dark">`.

Because of this, **every dark-mode CSS rule needs two copies**, not one:
one inside `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ... } }`
(the OS-driven case, skipped if explicitly forced to light) and one
under the unconditional `:root[data-theme="dark"] { ... }` (the forced
case, which must work even when the OS itself is light). Adding a new
dark-mode rule to `styles.css` means adding it in both places — see the
"Dark theme" and "Glow theme" comments there for the existing pattern to
copy. Forgetting the second copy means the rule silently only ever
applies when the OS itself is dark, breaking the forced-dark case.

The theme is applied twice on purpose: once by an inline `<script>` in
each HTML file's `<head>` (synchronous, before first paint, so there's
no flash of the wrong theme while `app.js` — an ES module — is still
loading), and once by `theme.js`'s `setTheme()` when the toggle is used
mid-session. Both read/write the same `localStorage` key.

## Accessibility: icon-only buttons need `aria-label`, decorative icons need `aria-hidden`

Same OS-driven-by-default philosophy as theming (below): respect the
browser's/OS's own accessibility signals rather than building a custom
in-app toggle for them.

- **Any button whose visible content is just an emoji/symbol with no
  adjacent text** (the ✕ sheet-close, the ⚙️ account button, every "+"
  FAB, the 💬 comment button, the 🗓️ .ics-download button) needs an
  `aria-label` — otherwise a screen reader announces only the emoji's
  Unicode name ("plus sign, button"), with no indication of what it
  does. A button whose count/label changes after the fact (the comment
  button's "💬 N") updates its `aria-label` via `setAttribute` alongside
  its `textContent`, not just once at render time.
- **A decorative icon sitting next to text that already says the same
  thing** (home.js's `.card-icon`, the tabbar's `.tab-icon` — a 🏠 next
  to the word "Home") gets `'aria-hidden': 'true'` instead, so it isn't
  announced redundantly on top of the text right next to it.
- **`prefers-reduced-motion: reduce` and `prefers-contrast: more`** are
  both honored globally in `styles.css` (a blanket
  animation/transition-duration override for the former, swapped
  `--text-muted`/`--border` values for the latter, mirroring the
  OS-driven-plus-forced-theme layering the dark-mode rules below already
  use) — not a manual in-app toggle, since there's no existing request
  for one and the OS setting already covers it.

## Color-by-person (categorical series)

When a UI needs to distinguish *who* did something by color — not a
due-date status, which uses the `ok`/`due-soon`/`overdue` pill classes
above — use the `--series-1` through `--series-8` custom properties in
`styles.css` (light and dark values both defined), never `--accent`/
`--accent-2` for this: those two aren't a validated color-blind-safe
pair (confirmed by running this app against the data-viz skill's
palette validator — they fail the CVD-separation and normal-vision
floor checks in both themes). `--series-1`/`--series-2` are the first
two slots of a fixed, validated 8-color categorical order.

Assign slots by sorting contributors on a **stable key** (e.g.
`user_id`), never by fetch order or how recently they acted — the same
person should keep the same color across renders. See
`contributionBreakdown()` in `app/js/goals.js` for the pattern (a
stacked bar + always-visible legend naming each person, their amount,
and their share — identity is never color-alone).
