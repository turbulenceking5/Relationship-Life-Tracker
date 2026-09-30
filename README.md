# Relationship Life Tracker

A shared app for two partners to track life events, expenses (with a
configurable "who owes who" balance), investment property rent, and
savings/spending goals — each with its own tasks and linked documents —
all in one place, kept in sync between both of you.

It's a **Progressive Web App**: install it on your iPhone straight from
Safari (Share → Add to Home Screen), no App Store needed. Data is shared
through a dedicated Supabase backend, so both partners see the same data
after joining the same household.

## Quick links

- [`ROADMAP.md`](ROADMAP.md) — phases, status, and suggestions for making
  the app better
- [`docs/`](docs/) — architecture, data model, and a spec per feature area
- [`docs/09-setup-supabase.md`](docs/09-setup-supabase.md) — running the
  app locally and installing it on an iPhone
- [`app/`](app/) — the app itself (plain HTML/CSS/JS, no build step)
- [`supabase/migrations/`](supabase/migrations/) — the database schema

## Running it

```sh
cd app
python3 -m http.server 8080
# open http://localhost:8080
```

See [`docs/09-setup-supabase.md`](docs/09-setup-supabase.md) for the full
setup story, including how to point the app at your own Supabase project
instead of the one it ships wired up to.
