-- Runs the notify-due-items edge function once a day. The cron job
-- fetches the shared secret from Vault at execution time rather than
-- having it baked into this file, so nothing sensitive is committed here.
select cron.schedule(
  'notify-due-items-daily',
  '0 8 * * *',
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
