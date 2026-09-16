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

## Card + pill conventions

- A list item is a `.card` containing a `.card-row` (title/meta on the
  left, amount/status on the right).
- A due-date-ish status uses `dueStatus()` from `format.js`, rendered as
  `<span class="pill {cls}">`, where `cls` is one of `ok` / `due-soon` /
  `overdue` (see `styles.css` for the color mapping).
- Destructive actions ("Delete") use `.btn.danger-text.small`; secondary
  actions ("Mark as paid", "Mark as received") use `.btn.secondary.small`.

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
