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
     │        ──1:N── expenses ─────────── paid_by ───┘
     │        ──1:N── replacement_items
     │        ──1:N── repayments
     │        ──1:N── documents
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
| `default_currency` | text | e.g. `GBP`, prefills new entries |
| `created_by` | uuid → auth.users | |
| `created_at` | timestamptz | |

### `household_members`
| column | type | notes |
|---|---|---|
| `household_id` | uuid → households | PK part 1 |
| `user_id` | uuid → auth.users | PK part 2 |
| `role` | text | `owner` \| `member` |
| `joined_at` | timestamptz | |

### `events`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `household_id` | uuid → households | |
| `title` | text | required |
| `description` | text | optional |
| `category` | text | e.g. `birthday`, `anniversary`, `appointment` |
| `event_date` | date | required |
| `created_by` | uuid → auth.users | |
| `created_at` / `updated_at` | timestamptz | |

### `expenses`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `household_id` | uuid → households | |
| `title` | text | required |
| `amount` | numeric(12,2) | required |
| `currency` | text | default `GBP` |
| `category` | text | e.g. `groceries`, `bills`, `rent` |
| `paid_by` | uuid → auth.users | who paid |
| `expense_date` | date | required |
| `notes` | text | optional |
| `created_by` | uuid → auth.users | |
| `created_at` / `updated_at` | timestamptz | |

### `replacement_items`
The "tap filter" use case — physical things replaced on a cadence.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `household_id` | uuid → households | |
| `name` | text | e.g. "Tap water filter" |
| `category` | text | e.g. `kitchen`, `safety`, `car` |
| `last_replaced_date` | date | default today |
| `interval_days` | integer | required, e.g. 90 |
| `next_due_date` | date | **generated column** = `last_replaced_date + interval_days` |
| `last_notified_date` | date | set by the push-notification job, see below |
| `notes` | text | optional |
| `created_by` | uuid → auth.users | |
| `created_at` / `updated_at` | timestamptz | |

`next_due_date` is computed by Postgres automatically — the app only ever
writes `last_replaced_date` and `interval_days`. `last_notified_date` is
written only by the `notify-due-items` edge function
([`11-push-notifications.md`](11-push-notifications.md)), never by the app.

### `repayments`
| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `household_id` | uuid → households | |
| `title` | text | e.g. "Car loan", "Owed to Mum" |
| `direction` | text | `owed_by_us` \| `owed_to_us` |
| `counterparty` | text | who the money is between |
| `total_amount` | numeric(12,2) | |
| `remaining_amount` | numeric(12,2) | |
| `currency` | text | default `GBP` |
| `due_date` | date | optional |
| `recurring` | boolean | default false |
| `frequency` | text | e.g. `monthly`, only if recurring |
| `status` | text | `active` \| `paid` \| `overdue` \| `cancelled` |
| `notes` | text | optional |
| `last_notified_date` | date | set by the push-notification job |
| `created_by` | uuid → auth.users | |
| `created_at` / `updated_at` | timestamptz | |

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
| `related_type` | text | optional: `replacement_item` \| `repayment` \| `expense` \| `event` |
| `related_id` | uuid | optional FK-by-convention to the row above |
| `expiry_date` | date | optional, for things like insurance |
| `notes` | text | optional |
| `uploaded_by` | uuid → auth.users | |
| `created_at` | timestamptz | |

`related_type`/`related_id` are a loose polymorphic reference (Phase 4
feature — "attach this warranty to this replacement item"). It's nullable
and unused until that UI ships, so it costs nothing to have now.

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

## Row Level Security summary

Every table above (except `auth.users`, which Supabase manages) has RLS
enabled. The rule is uniform: **a row is visible/writable only to members
of its `household_id`**, checked via a `SECURITY DEFINER` helper function
`is_household_member(household_id)` so policies stay simple and avoid
recursive-policy pitfalls. `profiles` is visible to yourself and anyone who
shares a household with you. Full detail in
[`08-auth-households.md`](08-auth-households.md).
