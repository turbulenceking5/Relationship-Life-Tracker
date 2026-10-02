// On-demand (not cron-scheduled) push: either partner can tap "🔔
// Remind" on an overdue item on the home dashboard to nudge the other
// one, instead of texting them separately. See docs/11-push-notifications.md
// and docs/24-live-sync-and-nudges.md.
//
// Auth: unlike notify-due-items (cron-only, shared-secret auth), this is
// called directly by a logged-in user via supabase.functions.invoke(),
// so it's deployed with the default JWT verification (verify_jwt =
// true) -- the platform rejects the request before this code runs if
// the Authorization header isn't a valid session JWT.
//
// It still does its own authorization check beyond "is logged in":
// membership in the household being nudged is confirmed with a client
// scoped to the caller's own JWT (so household_members' RLS -- "members
// can view roster" -- does the actual gatekeeping, not application
// code guessing at it), before an admin (service-role) client is used
// to read the partner's push subscriptions and the VAPID secret, the
// same two things notify-due-items needs service-role access for.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

Deno.serve(async (req: Request) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let body: { householdId?: string; label?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400 });
  }
  const { householdId, label } = body;
  if (!householdId || typeof label !== "string" || !label.trim()) {
    return new Response(JSON.stringify({ error: "householdId and label are required" }), { status: 400 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  // RLS-scoped to the caller's own JWT: this only succeeds in returning
  // rows for a household they're actually a member of, so there's no
  // separate "are they allowed to see this household" check needed --
  // an empty/forbidden result below naturally falls out of a household
  // they don't belong to.
  const { data: members, error: membersError } = await userClient
    .from("household_members")
    .select("user_id")
    .eq("household_id", householdId);
  if (membersError) {
    return new Response(JSON.stringify({ error: membersError.message }), { status: 500 });
  }
  const isMember = (members ?? []).some((m) => m.user_id === userData.user.id);
  if (!isMember) {
    return new Response(JSON.stringify({ error: "Not a member of this household" }), { status: 403 });
  }
  const partnerIds = (members ?? []).map((m) => m.user_id).filter((id) => id !== userData.user.id);
  if (!partnerIds.length) {
    return new Response(JSON.stringify({ sent: 0, reason: "no partner in household" }), { status: 200 });
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: secretRows, error: secretError } = await admin.rpc("get_edge_secrets");
  const secrets = secretRows?.[0];
  if (secretError || !secrets?.vapid_private_key) {
    return new Response(JSON.stringify({ error: "Server not configured" }), { status: 500 });
  }
  webpush.setVapidDetails(secrets.vapid_subject, secrets.vapid_public_key, secrets.vapid_private_key);

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth_key")
    .in("user_id", partnerIds);

  let sent = 0;
  let failed = 0;
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        JSON.stringify({ title: "A nudge from your partner", body: label.trim() }),
      );
      sent++;
    } catch (err) {
      failed++;
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      }
    }
  }

  return new Response(JSON.stringify({ sent, failed }), {
    headers: { "Content-Type": "application/json" },
  });
});
