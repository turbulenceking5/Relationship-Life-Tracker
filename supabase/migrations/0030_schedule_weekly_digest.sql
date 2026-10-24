-- Schedules the weekly-digest edge function (see
-- supabase/functions/weekly-digest/index.ts) once a week, Sunday 18:00
-- Australia/Brisbane (fixed UTC+10, no daylight saving -- hence the plain
-- 08:00 UTC cron time rather than an IANA-zone-aware schedule).
select cron.schedule(
  'weekly-digest',
  '0 8 * * 0',
  $$
  select net.http_post(
    url := 'https://crwsnztcnoyzviurkvbd.supabase.co/functions/v1/weekly-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
