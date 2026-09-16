// Scheduled by pg_cron (see supabase/migrations/0004_schedule_notifications.sql)
// once a day. Currently has no active trigger table to scan (Replacements
// and Repayments — the two features that used to feed this — have both
// been removed); it still runs daily and sends nothing. See
// docs/11-push-notifications.md for how to wire a new due-date source
// (rent_payments, custom_goals.target_date) back into it.
//
// Auth: this function does NOT use Supabase JWT verification (it's
// deployed with verify_jwt = false) because its only caller is the
// pg_cron job, not a logged-in user. Instead it checks a shared secret
// header against a value stored in Supabase Vault — see
// docs/11-push-notifications.md for the full design and why.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

Deno.serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: secretRows, error: secretError } = await admin.rpc("get_edge_secrets");
  const secrets = secretRows?.[0];
  if (secretError || !secrets?.cron_secret || !secrets?.vapid_private_key) {
    return new Response(JSON.stringify({ error: "Server not configured" }), { status: 500 });
  }

  if (req.headers.get("x-webhook-secret") !== secrets.cron_secret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  webpush.setVapidDetails(secrets.vapid_subject, secrets.vapid_public_key, secrets.vapid_private_key);

  const notifications: { household_id: string; title: string; body: string }[] = [];

  // No due-date source is currently wired up — see the file header comment.

  let sent = 0;
  let failed = 0;

  for (const note of notifications) {
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth_key")
      .eq("household_id", note.household_id);

    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          JSON.stringify({ title: note.title, body: note.body }),
        );
        sent++;
      } catch (err) {
        failed++;
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription is gone (browser data cleared, app uninstalled, etc).
          await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
      }
    }
  }

  return new Response(
    JSON.stringify({ notifications: notifications.length, sent, failed }),
    { headers: { "Content-Type": "application/json" } },
  );
});
