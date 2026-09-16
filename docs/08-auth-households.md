# Auth & Households

## Accounts
Email + password via Supabase Auth. Each partner has their own login —
there's no shared device password, which matters once push notifications
and "who added this" attribution exist.

A `profiles` row is auto-created for every new user (via an
`on auth.users insert` trigger) so the rest of the app has a display name
to show without extra signup steps.

## Households
A **household** is the sharing boundary. Every feature row (`events`,
`expenses`, `replacement_items`, `repayments`, `documents`, `rent_payments`,
`wedding_fund`, `wedding_transactions`) belongs to exactly one household,
and a user can see/edit a row only if they're a member of that household.

### Who can actually see what you add

Nobody outside your household — this is enforced by the database itself
(Postgres Row Level Security), not just by the app's UI, so it holds even
if someone queries the API directly rather than going through the app.
Concretely:

- Adding an event/expense/document/etc. makes it visible only to the
  other member(s) of *your* household.
- Anyone else who opens the app link and signs up creates their own,
  separate, empty household — they don't land in yours, and they can't
  see or guess their way into it.
- The only way another person joins *your* household is by entering the
  invite code shown in the ⚙️ account sheet, which only your household's
  own members can see. There's no way to join by guessing a household ID.

So in practice: this app being "shared" means shared with whoever you've
handed that invite code to — not shared with every user of the deployed
app.

### Creating a household
First-time users create a household (e.g. "Alex & Sam") via the
`create_household(name)` RPC, which:
1. Inserts the `households` row with a freshly generated 8-character
   invite code.
2. Adds the creator as a `household_members` row with `role = 'owner'`.

### Joining a household
The partner enters the invite code shown in-app, via the
`join_household(invite_code)` RPC, which validates the code and adds them
as a `household_members` row with `role = 'member'`.

Both RPCs are `SECURITY DEFINER` Postgres functions — this is deliberate:
`household_members` has **no** direct INSERT policy for regular clients,
so the only way to become a member is through code that enforces the
invite-code check. A client can't just `insert` itself into an arbitrary
household's membership list by guessing a UUID.

### Why an invite code instead of email invites
Simpler to implement, no email-sending infra needed, and for a
two-person household sharing a code once by text/in person is more than
enough. Email invites are a reasonable Phase 1+ addition if this app ever
grows past household-of-two use.

## Permissions model
Deliberately flat for v1: every member of a household has full read/write
access to all of that household's data. There's no "read-only" or
"admin-only" role distinction — `role` on `household_members` currently
only distinguishes `owner` (the creator) for potential future use (e.g.
only the owner can rename/delete the household), and isn't otherwise
enforced yet.

## Multiple households (future)
The schema already supports a user belonging to multiple households (it's
a proper many-to-many join table) — the UI just doesn't expose switching
between them yet. That's listed as a Phase 5 stretch goal (e.g. a separate
household for tracking things with extended family).
