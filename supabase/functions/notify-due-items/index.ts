// Scheduled by pg_cron (see supabase/migrations/0004_schedule_notifications.sql,
// retimed in 0005_localize_australia.sql) once a day at 08:00 Australia/
// Brisbane. Scans every live due-date source and pushes one notification per
// due/overdue item, per household. See docs/11-push-notifications.md for the
// overall design and docs/19-notification-sources.md for exactly what's
// scanned and why.
//
// Auth: this function does NOT use Supabase JWT verification (it's
// deployed with verify_jwt = false) because its only caller is the
// pg_cron job, not a logged-in user. Instead it checks a shared secret
// header against a value stored in Supabase Vault — see
// docs/11-push-notifications.md for the full design and why.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// Brisbane (Australia/Queensland) never observes daylight saving, but this
// still uses the IANA zone rather than a hardcoded +10 offset so it stays
// correct if that ever changes.
function brisbaneTodayStr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane" }).format(new Date());
}

function daysUntil(dateStr: string, today: string): number {
  const t = new Date(today + "T00:00:00Z").getTime();
  const d = new Date(dateStr + "T00:00:00Z").getTime();
  return Math.round((d - t) / 86400000);
}

// Mirrors currentOccurrence() in app/js/format.js: a recurring event maps
// onto its occurrence within the CURRENT cycle for the given interval,
// never rolling forward once that occurrence has passed. See that
// function's comment for why weekly/fortnightly roll from the event's own
// anchor date instead of a calendar boundary.
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

function addDaysUTC(dateStr: string, n: number): string {
  return new Date(new Date(dateStr + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);
}

function addOneMonthUTC(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const daysInMonth = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, daysInMonth)).padStart(2, "0")}`;
}

type Notification = { household_id: string; title: string; body: string; table: string; id: string; user_id?: string };

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
  const notifications: Notification[] = [];

  // Rent/mortgage: due today or overdue, not already notified today. Stays
  // "overdue" (and keeps notifying daily) until marked paid, same as the
  // in-app "Overdue" pill (dueStatus() in format.js).
  const [{ data: rent }, { data: mortgage }, { data: events }, { data: goals }, { data: documents }, { data: todos }] =
    await Promise.all([
      admin.from("rent_payments").select("id, household_id, due_date, property_label, last_notified_date").eq("paid", false),
      admin.from("mortgage_payments").select("id, household_id, due_date, property_label, last_notified_date").eq("paid", false),
      admin.from("events").select("id, household_id, title, event_date, recurring, recurring_interval, last_notified_date"),
      admin.from("custom_goals").select("id, household_id, title, target_date, target_amount, last_notified_date").not("target_date", "is", null),
      admin.from("documents").select("id, household_id, title, expiry_date, last_notified_date").not("expiry_date", "is", null),
      admin.from("personal_todos").select("id, household_id, user_id, prompt, remind_date, repeat_frequency, last_notified_date").eq("is_done", false),
    ]);

  for (const r of rent ?? []) {
    if (r.last_notified_date === today) continue;
    if (daysUntil(r.due_date, today) > 0) continue;
    notifications.push({
      household_id: r.household_id,
      title: "Rent due",
      body: `${r.property_label || "BrackenRidge"} rent was due ${r.due_date === today ? "today" : "on " + r.due_date}.`,
      table: "rent_payments",
      id: r.id,
    });
  }

  for (const m of mortgage ?? []) {
    if (m.last_notified_date === today) continue;
    if (daysUntil(m.due_date, today) > 0) continue;
    notifications.push({
      household_id: m.household_id,
      title: "Mortgage due",
      body: `${m.property_label || "BrackenRidge"} mortgage was due ${m.due_date === today ? "today" : "on " + m.due_date}.`,
      table: "mortgage_payments",
      id: m.id,
    });
  }

  // Events (birthdays/anniversaries and one-off dates alike): only on the
  // day itself — unlike a bill, a past event date isn't something to keep
  // chasing, so this doesn't escalate like rent/mortgage/goals do.
  for (const e of events ?? []) {
    if (e.last_notified_date === today) continue;
    const occurrence = currentOccurrence(e.event_date, e.recurring, e.recurring_interval, today);
    if (occurrence !== today) continue;
    notifications.push({
      household_id: e.household_id,
      title: "Event today",
      body: `${e.title} is today.`,
      table: "events",
      id: e.id,
    });
  }

  // Goals: due today or overdue by target_date, same escalation as
  // rent/mortgage, but skipped once the goal is already fully funded
  // (remaining <= 0) — matches the "Saved so far" progress shown in the
  // Goals tab (goals.js), so a goal that's met before its date stops
  // nagging instead of notifying forever.
  const goalIds = (goals ?? []).map((g) => g.id);
  const savedByGoal = new Map<string, number>();
  if (goalIds.length) {
    const { data: txns } = await admin
      .from("goal_transactions")
      .select("goal_id, amount")
      .eq("type", "saved")
      .in("goal_id", goalIds);
    for (const t of txns ?? []) {
      savedByGoal.set(t.goal_id, (savedByGoal.get(t.goal_id) || 0) + Number(t.amount));
    }
  }

  for (const g of goals ?? []) {
    if (g.last_notified_date === today) continue;
    if (daysUntil(g.target_date, today) > 0) continue;
    if (g.target_amount != null) {
      const saved = savedByGoal.get(g.id) || 0;
      if (saved >= Number(g.target_amount)) continue;
    }
    notifications.push({
      household_id: g.household_id,
      title: "Goal date due",
      body: `"${g.title}" was due ${g.target_date === today ? "today" : "on " + g.target_date}.`,
      table: "custom_goals",
      id: g.id,
    });
  }

  // Documents: expiry treated the same as a bill's due date (due
  // today/overdue, escalating daily) rather than the 14-day "due soon"
  // window the in-app status pill shows — the pill already gives advance
  // warning when the app is opened; the push notification is the "this
  // has actually lapsed" nudge.
  for (const d of documents ?? []) {
    if (d.last_notified_date === today) continue;
    if (daysUntil(d.expiry_date, today) > 0) continue;
    notifications.push({
      household_id: d.household_id,
      title: "Document expired",
      body: `"${d.title}" ${d.expiry_date === today ? "expires today" : "expired on " + d.expiry_date}.`,
      table: "documents",
      id: d.id,
    });
  }

  // Personal to-dos: due today or overdue, private to their own user_id —
  // unlike every other source, the push must go only to that one person's
  // own devices, not the whole household (see push_subscriptions lookup
  // below). A one-off reminder (repeat_frequency 'none') is marked done
  // once it fires, same as ticking it off by hand; a repeating one instead
  // advances remind_date to its next occurrence and stays active. There's
  // no way to honor the row's own remind_time precisely — this daily
  // check only runs once, at 08:00 Australia/Brisbane — see
  // docs/20-feature-personal-todos.md for that limitation.
  const todoUpdates: { id: string; patch: Record<string, unknown> }[] = [];
  for (const t of todos ?? []) {
    if (t.last_notified_date === today) continue;
    if (daysUntil(t.remind_date, today) > 0) continue;
    notifications.push({
      household_id: t.household_id,
      user_id: t.user_id,
      title: "Reminder",
      body: t.prompt,
      table: "personal_todos",
      id: t.id,
    });
    const patch: Record<string, unknown> = { last_notified_date: today };
    if (t.repeat_frequency === "none") {
      patch.is_done = true;
    } else if (t.repeat_frequency === "daily") {
      patch.remind_date = addDaysUTC(t.remind_date, 1);
    } else if (t.repeat_frequency === "weekly") {
      patch.remind_date = addDaysUTC(t.remind_date, 7);
    } else if (t.repeat_frequency === "monthly") {
      patch.remind_date = addOneMonthUTC(t.remind_date);
    }
    todoUpdates.push({ id: t.id, patch });
  }

  // Mark every notified row before sending — a household with no active
  // subscriptions yet still shouldn't be re-notified tomorrow for the same
  // item, since "notified" here means "the daily check surfaced it," not
  // "a push was successfully delivered."
  const idsByTable = new Map<string, string[]>();
  for (const n of notifications) {
    if (n.table === "personal_todos") continue;
    idsByTable.set(n.table, [...(idsByTable.get(n.table) ?? []), n.id]);
  }
  for (const [table, ids] of idsByTable) {
    await admin.from(table).update({ last_notified_date: today }).in("id", ids);
  }
  for (const u of todoUpdates) {
    await admin.from("personal_todos").update(u.patch).eq("id", u.id);
  }

  let sent = 0;
  let failed = 0;

  for (const note of notifications) {
    let subsQuery = admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth_key")
      .eq("household_id", note.household_id);
    // Personal to-dos are private — only push to the owning user's own
    // devices, not every device in the household.
    if (note.user_id) subsQuery = subsQuery.eq("user_id", note.user_id);
    const { data: subs } = await subsQuery;

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
