# Push notifications (Phase 2, shipped)

Due-date reminders for replacement items and active repayments, delivered
as a real push notification — not just something you'd see if you happened
to open the app.

## Why this exists

A replacement/repayment tracker that requires you to remember to open it
defeats its own purpose (see [`10-suggestions.md`](10-suggestions.md), #2).
iOS 16.4+ supports Web Push for home-screen-installed PWAs, so this is
achievable without a native app.

## How it works

```
pg_cron (daily, 08:00 UTC)
   │  net.http_post, with a shared secret header pulled from Vault
   ▼
Edge Function: notify-due-items
   │  1. Reads its own VAPID keys + the shared secret from Vault
   │     (via the SECURITY DEFINER function get_edge_secrets(), which
   │     only service_role may call)
   │  2. Finds replacement_items / active repayments due today or overdue
   │     that haven't been notified about yet today
   │  3. Looks up push_subscriptions for each affected household
   │  4. Sends a Web Push message to each subscription (npm:web-push)
   │  5. Marks last_notified_date and drops dead subscriptions (410/404)
   ▼
Service worker (app/service-worker.js)
   │  'push' event → shows a native notification
   │  'notificationclick' → focuses or opens the app
```

## Pieces, file by file

| Piece | Where |
|---|---|
| `push_subscriptions` table, `last_notified_date` columns, `get_edge_secrets()` | `supabase/migrations/0003_push_notifications.sql` |
| Daily cron schedule | `supabase/migrations/0004_schedule_notifications.sql` |
| The actual send/scan logic | `supabase/functions/notify-due-items/index.ts` |
| Subscribe/unsubscribe from the browser | `app/js/notifications.js` |
| Notification permission UI | Account sheet in `app/js/app.js` |
| Showing the notification, handling taps | `app/service-worker.js` (`push`, `notificationclick`) |
| Public VAPID key (safe to ship) | `app/js/config.js` |

## Why secrets live in Vault, not in this repo or as plain edge function env vars

The function needs three things no client should ever see: the VAPID
**private** key (can forge push messages if leaked), and a shared secret
the cron job uses to authenticate itself to the function. None of these
are committed anywhere in this repo — they're stored encrypted in
Supabase Vault (`supabase_vault` extension) and fetched at request time by
`get_edge_secrets()`, a function restricted to the `service_role` role. The
edge function's own service-role key is never handled by us at all — it's
auto-injected into every Edge Function's environment by Supabase
(`SUPABASE_SERVICE_ROLE_KEY`).

The cron job authenticates to the edge function with a custom
`x-webhook-secret` header (checked against the same Vault-stored secret)
rather than Supabase JWT verification, because its only caller is
`pg_cron`, not a logged-in user — see the comment at the top of
`notify-due-items/index.ts`.

## Notification behavior

- Checked once a day (08:00 UTC). An item due today or overdue triggers a
  notification; `last_notified_date` prevents sending more than once per
  calendar day for the same item, but an item that's still overdue
  tomorrow notifies again — a simple daily "escalation" while overdue,
  matching the Phase 2 roadmap item.
- Notifications are sent per household, to every subscribed device of
  every member.
- A subscription that the push service reports as gone (HTTP 404/410,
  e.g. uninstalled app, cleared browser data) is deleted automatically.

## Setting this up on your own fork

If you point the app at your own Supabase project (see
[`09-setup-supabase.md`](09-setup-supabase.md)), push notifications need
one-time setup that isn't part of the SQL migrations, since it involves
generating your own keys:

1. Generate a VAPID keypair (e.g. `npx web-push generate-vapid-keys`).
2. Put the public key in `app/js/config.js` as `VAPID_PUBLIC_KEY`.
3. Store the keypair + a contact subject + a random shared secret in Vault:
   ```sql
   select vault.create_secret('<public key>', 'vapid_public_key');
   select vault.create_secret('<private key>', 'vapid_private_key');
   select vault.create_secret('mailto:you@example.com', 'vapid_subject');
   select vault.create_secret('<random hex string>', 'cron_secret');
   ```
4. Deploy `supabase/functions/notify-due-items` with `verify_jwt = false`.
5. Run `0003_push_notifications.sql` then `0004_schedule_notifications.sql`
   (the latter references your project's own function URL — update it if
   you copy the file).

## Limitations / known gaps

- **Not testable end-to-end outside a real iPhone.** iOS only delivers Web
  Push to a PWA that's been added to the Home Screen; there's no way to
  verify actual delivery from a development sandbox. Everything up to
  "the edge function successfully sends to the push service" has been
  verified (see the function's own logs / the `sent`/`failed` counts it
  returns); the last mile (does it actually pop up on the lock screen) can
  only be confirmed by installing the app on a phone and trying it.
- Only replacement items and repayments trigger notifications, matching
  the roadmap's Phase 2 scope — events don't (see
  [`03-feature-events.md`](03-feature-events.md), listed as a possible
  later addition once there's a home dashboard to centralize "coming up"
  logic).
- No user-facing digest/quiet-hours settings yet (roadmap Phase 2 also
  lists a digest option as a nice-to-have, not yet built).
