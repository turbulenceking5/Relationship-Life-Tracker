# Relationship Life Tracker

A shared PWA for two partners to track life events, expenses (with a
configurable split and "who owes who" balance), an investment property's
rent, and user-created savings/spending goals — each with its own task
checklist and linked documents. No build step — plain HTML/CSS/JS,
deployed to GitHub Pages, backed by a dedicated Supabase project.

**Start here**: [`ROADMAP.md`](ROADMAP.md) for status/phases, then
[`docs/00-overview.md`](docs/00-overview.md) for the full docs index.
Don't duplicate content from `docs/` into this file — link to it instead
and keep this file short enough to actually stay read.

## Fast orientation

| Thing | Where |
|---|---|
| The app itself | `app/` — served as static files, no build step |
| Database schema | `supabase/migrations/*.sql`, applied via Supabase MCP tools, one file per change, never edited after the fact |
| Edge functions | `supabase/functions/` |
| Live app | https://turbulenceking5.github.io/Relationship-Life-Tracker/ |
| Deploy | `.github/workflows/deploy-pages.yml`, auto-runs on push to this branch under `app/**` |
| Supabase project | `relationship-life-tracker` (ref `crwsnztcnoyzviurkvbd`), its own dedicated project — **not** shared with any other app in the account |

## Conventions that matter

- **New DB change → new numbered migration file**, applied live via the
  Supabase MCP tools *and* committed to `supabase/migrations/`. Never
  edit an already-applied migration file after the fact — the repo file
  and the live database will silently drift apart.
- **New "add a thing" form → use `makeSheet()`** from `app/js/dom.js`,
  never a bare `<dialog>`. See [`docs/14-ui-patterns.md`](docs/14-ui-patterns.md).
- **New feature module → `export async function render(container, ctx)`**,
  matching every existing module in `app/js/`. See
  [`docs/14-ui-patterns.md`](docs/14-ui-patterns.md).
- **Test against a swapped-in mock `vendor/supabase.js`, then restore the
  real file before committing.** See
  [`docs/15-development-testing.md`](docs/15-development-testing.md) —
  read this before testing anything, it explains why and exactly how.
- Some bugs only show up against the real Supabase backend (RLS,
  PostgREST's schema-relationship discovery, GoTrue auth config), not the
  mock. If something looks right in a mock-driven test but wrong in the
  real app, suspect the backend layer first.
- Dashboard-only settings (Supabase Auth's email confirmation toggle,
  Site URL/Redirect URLs, GitHub Pages enablement) can't be changed via
  any available tool — they need the repo/project owner to click through
  the dashboard once. Say so plainly rather than working around it.
- Currency defaults to `AUD`; the household is in Australia/Brisbane
  (fixed UTC+10, no daylight saving) — the daily notification cron and
  any "today" logic should stay correct for that timezone specifically
  (see `todayStr()` in `app/js/format.js`, which already fixed a
  UTC-vs-local-date bug for this reason).

## Data sharing model (comes up often)

Every row is scoped to a `household_id` and gated by Postgres RLS, not
just app logic. Only people who've joined the same household (via its
invite code, shown in the ⚙️ account sheet) can see its data — a
different signup creates a separate, empty household. See
[`docs/08-auth-households.md`](docs/08-auth-households.md).
