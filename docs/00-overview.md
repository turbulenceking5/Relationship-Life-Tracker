# Overview

## What this is

A shared app for two partners to keep track of the recurring "life admin"
that's easy to lose track of:

- **Events** — birthdays, anniversaries, appointments, move-in dates, etc.
- **Expenses** — shared spending, who paid, what category, plus a
  configurable "who owes who" balance and settle-up action.
- **Rent** — tracking rent income from an investment property (currently
  "BrackenRidge") as a rolling ledger of due/paid periods.
- **Goals** — open-ended savings/spending trackers (a wedding fund, a
  holiday fund, etc.), each with its own target, transaction log, task
  checklist, and linked documents.
- **Documents** — PDFs/photos of warranties, contracts, receipts, kept for
  future reference and optionally linked to a goal.
- **Grocery List** — a shared shopping checklist.
- **Recipes** — a shared recipe box, each with ingredients and
  instructions, collapsible to save room.

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
| [`04-feature-expenses.md`](04-feature-expenses.md) | Expenses feature spec, including the "who owes who" balance |
| [`05-feature-replacements.md`](05-feature-replacements.md) | Replacement reminders spec (REMOVED — kept for history) |
| [`06-feature-repayments.md`](06-feature-repayments.md) | Repayments/loans spec (REMOVED — kept for history) |
| [`07-feature-documents.md`](07-feature-documents.md) | Document storage spec, including linking a document to a goal |
| [`08-auth-households.md`](08-auth-households.md) | Accounts, households, invite codes, permissions, expense split |
| [`09-setup-supabase.md`](09-setup-supabase.md) | Backend setup, running the app locally |
| [`10-suggestions.md`](10-suggestions.md) | Ideas to make the app better, with rationale |
| [`11-push-notifications.md`](11-push-notifications.md) | How push notifications work (currently has no active trigger) |
| [`12-feature-goals.md`](12-feature-goals.md) | User-created savings/spending goals, tasks and linked documents (the "Goals" tab) |
| [`13-feature-money-tab.md`](13-feature-money-tab.md) | Why/how Expenses and Rent are condensed into one "Money" tab |
| [`14-ui-patterns.md`](14-ui-patterns.md) | UI conventions to follow when adding a new screen or form |
| [`15-development-testing.md`](15-development-testing.md) | How to test changes locally without touching real data |
| [`16-feature-grocery-list.md`](16-feature-grocery-list.md) | Shared grocery checklist (Money tab's Grocery List segment) |
| [`17-feature-recipes.md`](17-feature-recipes.md) | Recipe box with ingredients/instructions (Money tab's Recipes segment) |

The top-level [`ROADMAP.md`](../ROADMAP.md) tracks phases and status across
all of the above. [`../CLAUDE.md`](../CLAUDE.md) is the short version for
picking this repo back up in a fresh session.
