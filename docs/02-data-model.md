# Data Model

Full SQL lives in [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql).
This doc is the readable version.

## Entity overview

```
auth.users (Supabase-managed)
     │ 1
     │
     ▼ 1
 profiles ──────────────────────────────────────────┐
     │                                                │
     │ member of (N:M via household_members)          │ display name
     ▼                                                │
 households ──1:N── events                            │
     │        ──1:N── expenses ─────────── paid_by ───┤
     │        ──1:N── settlements ── from_user/to_user ┘
     │        ──1:N── rent_payments
     │        ──1:N── custom_goals ──1:N── goal_transactions
     │                             ──1:N── goal_tasks
     │        ──1:N── documents ── related_type/related_id ──▶ (goal, optionally)
     │
     └──1:N── household_members (join table to auth.users)
```

## Tables

### `profiles`
One row per user, auto-created on signup. Lets the UI show "Alex added
this" instead of a raw UUID.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | = `auth.users.id` |
| `display_name` | text | defaults to the part of the email before `@` |
| `avatar_emoji` | text | small personal touch, optional |
| `created_at` | timestamptz | |

### `households`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | e.g. "Alex & Sam" |
| `invite_code` | text unique | short code shared out-of-band to join |
| `default_currency` | text | e.g. `AUD`, prefills new entries |
| `created_by` | uuid → auth.users | |
| `created_at` | timestamptz | |

### `household_members`
| column | type | notes |
|---|---|---|
| `household_id` | uuid → households | PK part 1 |
| `user_id` | uuid → auth.users | PK part 2 |
| `role` | text | `owner` \| `member` |
| `split_percent` | numeric(5,2) | default 50; this member's share of shared expenses, see [`04-feature-expenses.md`](04-feature-expenses.md) |
| `joined_at` | timestamptz | |

`user_id` also carries a second foreign key to `profiles.id` (in addition
to `auth.users.id`), added in `0006_fix_household_members_profiles_relationship.sql`.
Both point at the same underlying row, but PostgREST needs a direct FK
within the exposed `public` schema to embed `profiles` inside a
`household_members` query (used by `getHouseholdMembers()` to show "paid
by" names) — `auth.users` isn't exposed at all, so without this the
embed failed with "Could not find a relationship."

### `events`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `household_id` | uuid → households | |
| `title` | text | required |
| `description` | text | optional |
| `category` | text | e.g. `birthday`, `anniversary`, `appointment` |
| `event_date` | date | required — kept as the original/historical date even for recurring events |
| `recurring` | boolean | default false; yearly if true — see [`03-feature-events.md`](03-feature-events.md) |
| `created_by` | uuid → auth.users | |
| `created_at` / `updated_at` | timestamptz | |

### `expenses`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `household_id` | uuid → households | |
| `title` | text | required |
| `amount` | numeric(12,2) | required |
| `currency` | text | default `AUD` |
| `category` | text | e.g. `groceries`, `bills`, `rent` |
| `paid_by` | uuid → auth.users | who paid |
| `expense_date` | date | required |
| `notes` | text | optional |
| `created_by` | uuid → auth.users | |
| `created_at` / `updated_at` | timestamptz | |

### `settlements`
See [`04-feature-expenses.md`](04-feature-expenses.md). A direct balancing
payment between two household members — separate from `expenses` since
it isn't a purchase, just money moving between partners to zero out
the running "who owes who" balance.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `household_id` | uuid → households | |
| `from_user` | uuid → auth.users | who paid |
| `to_user` | uuid → auth.users | who received it |
| `amount` | numeric(12,2) | required, > 0 |
| `currency` | text | default `AUD` |
| `settlement_date` | date | default today |
| `notes` | text | optional |
| `created_by` | uuid → auth.users | |
| `created_at` | timestamptz | |

### `documents`
Metadata row; the actual file lives in Supabase Storage under the
`documents` bucket at `documents/{household_id}/{uuid}-{filename}`.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `household_id` | uuid → households | |
| `title` | text | required |
| `category` | text | e.g. `warranty`, `contract`, `receipt`, `id` |
| `file_path` | text | Storage object path |
| `file_name` | text | original filename |
| `mime_type` | text | |
| `related_type` | text | optional: `goal` (only value currently wired up; `expense` \| `event` reserved for later) |
| `related_id` | uuid | optional FK-by-convention to the row above |
| `expiry_date` | date | optional, for things like insurance |
| `notes` | text | optional |
| `uploaded_by` | uuid → auth.users | |
| `created_at` | timestamptz | |

`related_type`/`related_id` are a loose polymorphic reference — see
[`07-feature-documents.md`](07-feature-documents.md) for the shipped
goal-linking use of it, and [`12-feature-goals.md`](12-feature-goals.md)
for how a goal surfaces its linked documents.

### `push_subscriptions`
One row per browser/device Web Push subscription. See
[`11-push-notifications.md`](11-push-notifications.md) for the full
push-notification design.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `household_id` | uuid → households | denormalized for a single-query lookup of "who to notify" |
| `user_id` | uuid → auth.users | |
| `endpoint` | text, unique | the push service URL the browser gave us |
| `p256dh` / `auth_key` | text | the subscription's encryption keys |
| `created_at` | timestamptz | |

### `rent_payments`
See [`13-feature-money-tab.md`](13-feature-money-tab.md) (surfaced via the
Money tab's Rent segment). One row per rent period; "mark as received"
inserts the next period's row automatically.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `household_id` | uuid → households | |
| `property_label` | text | optional, e.g. "12 Smith St" |
| `due_date` | date | required |
| `amount` | numeric(12,2) | |
| `currency` | text | default `AUD` |
| `interval_days` | integer | default 14 (fortnightly); carried forward to the auto-generated next period |
| `paid` | boolean | default false |
| `paid_date` | date | set when marked received |
| `notes` | text | optional |
| `created_by` | uuid → auth.users | |
| `created_at` / `updated_at` | timestamptz | |

### `custom_goals`
See [`12-feature-goals.md`](12-feature-goals.md). One row per user-created
goal (any number per household — a wedding fund, a holiday fund, etc.).

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `household_id` | uuid → households | |
| `title` | text | required, e.g. "Wedding Fund" |
| `target_amount` | numeric(12,2) | optional |
| `target_date` | date | optional |
| `currency` | text | default `AUD` |
| `created_by` | uuid → auth.users | |
| `created_at` / `updated_at` | timestamptz | |

### `goal_transactions`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `goal_id` | uuid → custom_goals, on delete cascade | |
| `household_id` | uuid → households | |
| `type` | text | `saved` \| `spent` |
| `title` | text | required |
| `amount` | numeric(12,2) | |
| `transaction_date` | date | default today |
| `notes` | text | optional |
| `created_by` | uuid → auth.users | |
| `created_at` | timestamptz | |

### `goal_tasks`
See [`12-feature-goals.md`](12-feature-goals.md). A plain checklist item
within a goal — independent of `goal_transactions`, since a goal can
track a to-do list and a money ledger at the same time.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `goal_id` | uuid → custom_goals, on delete cascade | |
| `household_id` | uuid → households | |
| `title` | text | required |
| `is_done` | boolean | default false |
| `created_by` | uuid → auth.users | |
| `created_at` | timestamptz | |

## Row Level Security summary

Every table above (except `auth.users`, which Supabase manages) has RLS
enabled. The rule is uniform: **a row is visible/writable only to members
of its `household_id`**, checked via a `SECURITY DEFINER` helper function
`is_household_member(household_id)` so policies stay simple and avoid
recursive-policy pitfalls. `profiles` is visible to yourself and anyone who
shares a household with you. Full detail in
[`08-auth-households.md`](08-auth-households.md).
