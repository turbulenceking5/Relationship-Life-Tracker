# Overview

## What this is

A shared app for two partners to keep track of the recurring "life admin"
that's easy to lose track of:

- **Events** — birthdays, anniversaries, appointments, move-in dates, etc.
- **Expenses** — shared spending, who paid, what category.
- **Replacements** — physical things that need swapping on a schedule
  (fridge water filter, tap filter, smoke alarm batteries, air filters)
  with a "next due" date computed from the last time it was done.
- **Repayments** — money owed by you or to you (loans, informal IOUs,
  instalment plans) with due dates and status.
- **Documents** — PDFs/photos of warranties, contracts, receipts, kept for
  future reference and optionally linked to the item they're about.

## Who it's for

Two people who want one shared source of truth instead of split notes apps,
group chats, and "did you already replace that filter?" conversations.

## How it works, in one paragraph

It's a **Progressive Web App (PWA)**: a website you add to your iPhone home
screen from Safari, which then behaves like an installed app (own icon,
full-screen, works offline for viewing). Data is stored in a shared
**Supabase** project (hosted Postgres database), so both partners' phones
read and write the same data after signing in and joining the same
"household." See [`01-architecture.md`](01-architecture.md) for the full
reasoning and [`09-setup-supabase.md`](09-setup-supabase.md) for how the
backend is configured.

## Where to look

| Doc | Covers |
|---|---|
| [`01-architecture.md`](01-architecture.md) | Why PWA + Supabase, how the pieces fit together |
| [`02-data-model.md`](02-data-model.md) | Database schema, tables, relationships |
| [`03-feature-events.md`](03-feature-events.md) | Events feature spec |
| [`04-feature-expenses.md`](04-feature-expenses.md) | Expenses feature spec |
| [`05-feature-replacements.md`](05-feature-replacements.md) | Replacement reminders spec |
| [`06-feature-repayments.md`](06-feature-repayments.md) | Repayments/loans spec |
| [`07-feature-documents.md`](07-feature-documents.md) | Document storage spec |
| [`08-auth-households.md`](08-auth-households.md) | Accounts, households, invite codes, permissions |
| [`09-setup-supabase.md`](09-setup-supabase.md) | Backend setup, running the app locally |
| [`10-suggestions.md`](10-suggestions.md) | Ideas to make the app better, with rationale |

The top-level [`ROADMAP.md`](../ROADMAP.md) tracks phases and status across
all of the above.
