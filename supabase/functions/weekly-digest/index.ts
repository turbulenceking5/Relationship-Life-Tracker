// Scheduled by pg_cron, once a week (see
// supabase/migrations/0030_schedule_weekly_digest.sql) -- a single,
// low-key "here's your week" push per household, not another per-item
// nag. Deliberately light: total spent together and total saved toward
// goals in the last 7 days, plus how many events are coming up in the
// next 7 -- no scorekeeping between partners (who spent/saved more),
// same "non-anxious" framing as the on-time streak badge on Rent/Mortgage
// (see docs/23-feature-rent-mortgage.md).
//
// Auth: same shared-secret pattern as notify-due-items (cron-only caller,
// verify_jwt = false) -- see docs/11-push-notifications.md.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

function brisbaneTodayStr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane" }).format(new Date());
}

function addDaysUTC(dateStr: string, n: number): string {
  return new Date(new Date(dateStr + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);
}

// Mirrors currentOccurrence() in app/js/format.js (also duplicated in
// notify-due-items) -- see that function's comment for why
// weekly/fortnightly roll from the event's own anchor date rather than a
// calendar boundary.
function currentOccurrence(dateStr: string, recurring: boolean, interval: string, today: string): string {
  if (!recurring) return dateStr;

  if (interval === "monthly") {
    const [, , day] = dateStr.split("-");
    const [ty, tm] = today.split("-");
    const daysInMonth = new Date(Date.UTC(Number(ty), Number(tm), 0)).getUTCDate();
    const clampedDay = Math.min(Number(day), daysInMonth);
    return `${ty}-${tm}-${String(clampedDay).padStart(2, "0")}`;
  }

  if (interval === "weekly" || interval === "fortnightly") {
    const stepDays = interval === "weekly" ? 7 : 14;
    const anchor = new Date(dateStr + "T00:00:00Z").getTime();
    const t = new Date(today + "T00:00:00Z").getTime();
    const diffDays = Math.round((t - anchor) / 86400000);
    if (diffDays < 0) return dateStr;
    const cycles = Math.floor(diffDays / stepDays);
    return new Date(anchor + cycles * stepDays * 86400000).toISOString().slice(0, 10);
  }

  const [, month, day] = dateStr.split("-");
  return `${today.slice(0, 4)}-${month}-${day}`;
}

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

  const today = brisbaneTodayStr();
  const weekAgo = addDaysUTC(today, -7);
  const weekAhead = addDaysUTC(today, 7);

  const [{ data: households }, { data: expenses }, { data: savedTxns }, { data: events }] = await Promise.all([
    admin.from("households").select("id"),
    admin.from("expenses").select("household_id, amount").gte("expense_date", weekAgo).lte("expense_date", today),
    admin.from("goal_transactions").select("household_id, amount").eq("type", "saved").gte("transaction_date", weekAgo).lte("transaction_date", today),
    admin.from("events").select("household_id, event_date, recurring, recurring_interval, completed_occurrence"),
  ]);

  const spentByHousehold = new Map<string, number>();
  for (const e of expenses ?? []) {
    spentByHousehold.set(e.household_id, (spentByHousehold.get(e.household_id) || 0) + Number(e.amount));
  }
  const savedByHousehold = new Map<string, number>();
  for (const t of savedTxns ?? []) {
    savedByHousehold.set(t.household_id, (savedByHousehold.get(t.household_id) || 0) + Number(t.amount));
  }
  const upcomingByHousehold = new Map<string, number>();
  for (const e of events ?? []) {
    const occurrence = currentOccurrence(e.event_date, e.recurring, e.recurring_interval, today);
    if (occurrence < today || occurrence > weekAhead) continue;
    if (e.completed_occurrence === occurrence) continue;
    upcomingByHousehold.set(e.household_id, (upcomingByHousehold.get(e.household_id) || 0) + 1);
  }

  let sent = 0;
  let failed = 0;

  for (const h of households ?? []) {
    const spent = spentByHousehold.get(h.id) || 0;
    const saved = savedByHousehold.get(h.id) || 0;
    const upcoming = upcomingByHousehold.get(h.id) || 0;

    const parts: string[] = [];
    parts.push(spent > 0 ? `$${spent.toFixed(2)} spent together` : "nothing logged on Expenses");
    if (saved > 0) parts.push(`$${saved.toFixed(2)} saved toward your goals`);
    if (upcoming > 0) parts.push(`${upcoming} event${upcoming === 1 ? "" : "s"} coming up`);
    const body = parts.join(" · ");

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth_key")
      .eq("household_id", h.id);

    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          JSON.stringify({ title: "Your week together", body }),
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
  }

  return new Response(JSON.stringify({ households: (households ?? []).length, sent, failed }), {
    headers: { "Content-Type": "application/json" },
  });
});
