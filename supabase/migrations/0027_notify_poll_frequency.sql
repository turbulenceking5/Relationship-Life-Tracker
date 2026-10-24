-- Personal to-dos' own remind_time was never actually honored: the
-- notify-due-items check only ran once a day, at 08:00 Australia/Brisbane,
-- so a reminder set for 6:30am still fired at 8am along with everything
-- else (a known, documented limitation -- see
-- docs/20-feature-personal-todos.md). Polling every 15 minutes instead of
-- once a day lets the edge function check each reminder against its own
-- remind_time; every other source (rent/mortgage/events/goals/documents)
-- still only fires once a day, via a DAILY_CHECK_TIME gate added in the
-- function itself, so this change is specific to personal_todos.
--
-- Re-scheduling with the same job name (from 0004_schedule_notifications.sql,
-- retimed in 0005_localize_australia.sql) updates the existing cron job in
-- place rather than creating a duplicate.
select cron.schedule(
  'notify-due-items-daily',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://crwsnztcnoyzviurkvbd.supabase.co/functions/v1/notify-due-items',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
