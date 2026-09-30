-- Localize new households to Australia: default currency AUD, and the
-- daily due-item notification check now runs at 08:00 Australia/Brisbane
-- time. Queensland does not observe daylight saving, so Brisbane is a
-- fixed UTC+10 offset year-round -- 08:00 AEST is always 22:00 UTC the
-- previous day, with no DST transitions to account for.
alter table public.households alter column default_currency set default 'AUD';
alter table public.expenses alter column currency set default 'AUD';
alter table public.repayments alter column currency set default 'AUD';

-- Re-scheduling with the same job name (from 0004_schedule_notifications.sql)
-- updates the existing cron job in place rather than creating a duplicate.
select cron.schedule(
  'notify-due-items-daily',
  '0 22 * * *',
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
