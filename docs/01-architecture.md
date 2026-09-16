# Architecture

## Platform choice: PWA over native

| | PWA (chosen) | Native iOS (Swift) |
|---|---|---|
| Distribution | Add to Home Screen from Safari, today, free | Needs Xcode, Apple Developer account ($99/yr), App Store review |
| Iteration speed | Edit + reload | Build, sign, submit, wait for review for updates outside TestFlight |
| Offline support | Yes, via Service Worker | Yes, native |
| Push notifications | Supported on iOS 16.4+ for home-screen-installed PWAs | Supported |
| Feel | Very close to native for a forms/list app like this | Fully native |
| Cost to build/maintain | Low — one codebase, no App Store account needed | Higher |

For a two-person life-admin tool, the PWA gets 90% of the value at a
fraction of the cost and lets us ship and iterate immediately. Native is a
possible Phase 5 stretch (e.g. via Capacitor wrapping the same web app) if
the PWA proves itself and a true App Store presence is wanted later.

## High-level components

```
┌─────────────────────────────┐
│   iPhone Home Screen PWA    │
│  (app/ — HTML/CSS/JS, no    │
│   build step, Supabase JS   │
│   client loaded from a CDN) │
└──────────────┬───────────────┘
               │ HTTPS (REST/Realtime via supabase-js)
               ▼
┌─────────────────────────────┐
│         Supabase            │
│  ─ Postgres (data)          │
│  ─ Auth (email/password)    │
│  ─ Storage (documents/      │
│    receipts, private bucket)│
│  ─ Row Level Security       │
│    (household-scoped access)│
└─────────────────────────────┘
```

## Why Supabase for the backend

- Postgres gives real relational data (events/expenses/etc. all reference a
  household) instead of ad-hoc per-device storage.
- Built-in Auth means each partner has their own login instead of sharing a
  device password.
- Row Level Security (RLS) enforces "only members of a household can see
  that household's data" at the database level — not just in app code —
  so the anon API key can be safely embedded in client-side JS.
- Storage gives private file hosting for documents/receipts with the same
  RLS model.
- No server to run or deploy — the "backend" is entirely managed.

## Why no build step for the frontend

The app is plain HTML/CSS/JS with ES modules, loading `@supabase/supabase-js`
from a CDN (jsDelivr). This means:

- No Node toolchain required to run or edit it — just a static file server.
- Easy to understand and modify file-by-file.
- Trivial to host anywhere that serves static files (GitHub Pages,
  Netlify, Vercel, Cloudflare Pages, or even a Raspberry Pi).

If the app grows enough to want component reuse/state management at scale,
migrating to a small framework (e.g. Preact) is a reasonable Phase 3+ call
documented as a decision to revisit, not a decision made now.

## Multi-tenancy model: households

Data isn't scoped per-user, it's scoped per-**household** (a household
currently means "you and your partner," but the model supports more
members or multiple households per person later). See
[`08-auth-households.md`](08-auth-households.md) for the full model.

## Security notes

- The Supabase **anon/publishable key** is meant to be public — it's safe
  to ship in client JS because RLS policies (not the key) are what
  actually gate access. Never put the **service role key** in client code.
- All feature tables carry a `household_id` and RLS policies that check
  the requesting user is a member of that household before allowing
  select/insert/update/delete.
- Household creation/joining goes through two `SECURITY DEFINER` Postgres
  functions (`create_household`, `join_household`) rather than direct table
  inserts, so an invite code is required server-side to join — a client
  can't just insert itself into an arbitrary household's membership list.
