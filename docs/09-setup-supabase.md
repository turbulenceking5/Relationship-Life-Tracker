# Setup: Supabase & running the app

## Backend

The app uses its own dedicated Supabase project (kept separate from any
other projects in the account) so its schema, storage and auth users never
mix with unrelated apps:

- Project name: `relationship-life-tracker`
- Region: `eu-west-2` (London)
- Schema: [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql),
  hardening follow-up in [`0002_harden_functions.sql`](../supabase/migrations/0002_harden_functions.sql)
- Storage: one private bucket, `documents`

The app's Supabase project URL and **publishable** API key are set in
[`app/js/config.js`](../app/js/config.js). That key is meant to be public —
see [`01-architecture.md`](01-architecture.md#security-notes) for why it's
safe to ship in client code. If you ever need to point the app at a
different Supabase project (e.g. your own copy), that's the only file to
change, plus re-running the migrations against the new project.

### Re-running the schema elsewhere

If you fork this app or want your own backend instead of the shared one:

1. Create a new Supabase project.
2. Run `supabase/migrations/0001_init.sql` then `0002_harden_functions.sql`
   against it (via the SQL editor, the Supabase CLI, or the Supabase MCP
   tools if you're using Claude Code).
3. Update `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `app/js/config.js`.

### Known accepted advisories

Supabase's security linter flags the `create_household`, `join_household`,
`is_household_member` and `shares_household` functions as callable by
`authenticated` clients via RPC. This is intentional — see the comments in
`0002_harden_functions.sql` — `is_household_member`/`shares_household` must
stay callable because Postgres requires the querying role to hold `EXECUTE`
on any function used inside an RLS policy, and `create_household`/
`join_household` are meant to be called by any logged-in user.

One optional hardening step this repo doesn't automate: enabling
Supabase Auth's "leaked password protection" (checks new passwords against
HaveIBeenPwned) is a one-click toggle in the Supabase dashboard under
Authentication → Policies, not something the migrations can set.

## Running the app locally

The app is plain static files — no build step, no `npm install` needed to
run it. Any static file server works, e.g. from the `app/` directory:

```sh
python3 -m http.server 8080
# or: npx serve .
```

Then open `http://localhost:8080` in a browser. Note: ES module imports and
the service worker require serving over `http(s)://`, not `file://`.

### Installing on an iPhone

1. Deploy `app/` somewhere reachable over HTTPS (GitHub Pages, Netlify,
   Vercel, Cloudflare Pages all work with zero config for static files —
   just point them at the `app/` directory).
2. Open the URL in Safari on the iPhone.
3. Tap the Share icon → "Add to Home Screen."

It now behaves like an installed app: its own icon, full-screen (no Safari
chrome), and works offline for viewing previously-loaded data (see
`app/service-worker.js` — it caches the app shell but never caches
Supabase API/auth/storage calls, so data is always live when online).

## Third-party code

`app/js/vendor/supabase.js` is the official `@supabase/supabase-js` UMD
build, vendored directly into the repo (MIT licensed, see
`app/js/vendor/supabase-js.LICENSE`) rather than loaded from a CDN at
runtime. This means the app has no runtime dependency on any third-party
CDN being reachable — everything it needs ships in this repo.
