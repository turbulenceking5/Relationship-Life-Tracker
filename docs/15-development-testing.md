# Development & testing workflow

How every feature in this app has actually been verified before shipping
— there's no automated test suite committed to the repo (deliberately, for
an app this size), but there is a repeatable manual process worth writing
down.

## Running the app locally

```sh
cd app
python3 -m http.server 8080   # or: npx serve .
```

Open `http://localhost:8080`. This talks to the **real** Supabase backend
(see `app/js/config.js`) — there's no local/offline backend, so testing
locally still reads and writes real data unless you swap the client (see
below).

## Testing without touching real data: the vendor swap

`app/js/vendor/supabase.js` is a single vendored file that the whole app
imports through `app/js/supabaseClient.js`. Because it's just a plain
file (not a package-manager dependency), it can be temporarily swapped
for an in-memory mock to exercise the UI without hitting the real
database:

1. Back up the real file: `cp app/js/vendor/supabase.js /tmp/supabase.real.js.bak`
2. Replace it with a small mock exposing `window.supabase.createClient()`
   returning an object with the subset of the `auth` / `from()` / `rpc()`
   / `storage` API surface the screen under test actually calls. A
   minimal in-memory query builder (supporting `select/eq/order/insert/
   update/upsert/delete/single/maybeSingle`) covers nearly everything —
   see any commit in this repo's history that touched `goals.js` or
   `events.js` for a working example to copy from.
3. Serve `app/` and drive it with Playwright (already installed in the
   Claude Code sandbox this app has been developed in — see below).
4. **Always restore the real file before committing**:
   `cp /tmp/supabase.real.js.bak app/js/vendor/supabase.js`, then verify
   `wc -c` matches the original size before `git add`. Committing the
   mock by accident would silently break the deployed app.

This is why the mock is never checked into the repo — it only ever
exists as a scratch file during a testing session.

## Playwright conventions used throughout

- Launch with the pre-installed Chromium:
  `chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })`
  (path may shift with the pinned version — check `/opt/pw-browsers/` if
  a launch fails).
- Drive the real sign-up → create-household → use-a-tab flow end to end
  rather than seeding state directly, since that's exactly what a real
  user does and catches integration bugs the unit-level mock alone
  wouldn't (e.g. the `household_members` ↔ `profiles` embedding bug,
  found by clicking through to Expenses rather than by reasoning about
  the schema).
- Capture a screenshot after each meaningful step and actually look at it
  (via the Read tool) — several real bugs in this app were only visible
  in a screenshot, not in the returned JSON/text (e.g. a missing button
  label, a mis-colored pill).
- Use `page.pageerror`/`page.console` listeners from the start of every
  test; an uncaught exception is often the real signal, not a timeout
  three steps later.

## What real usage has caught that testing alone didn't

Several shipped bugs were only found once the app was actually being
used against the real Supabase backend, not the mock — worth remembering
that the mock validates *logic*, not the *real backend's* behavior:

- The `household_members` → `profiles` embedding needing an explicit
  foreign key (PostgREST-specific; the mock doesn't model relationship
  discovery, so it silently "worked" while the real backend 404'd).
- Supabase's email confirmation flow requiring `emailRedirectTo` and a
  configured Site URL/Redirect URL allowlist (dashboard-only settings)
  before a signup confirmation link goes anywhere useful.
- Supabase's default email sender's rate limit, hit only after enough
  real signup attempts in a short window.

When something looks right in a mock-driven test but wrong in the actual
app, suspect the backend/platform layer (RLS, PostgREST schema cache,
GoTrue auth config) before suspecting the client code.
