-- Tracks when the household's data was last backed up to its connected
-- Google Drive folder -- see app/js/backup.js and
-- docs/25-feature-backup.md for why this is opportunistic (triggered on
-- app open), not a real pg_cron-scheduled job.
alter table public.households add column last_backup_at timestamptz;

-- Written directly by the client (app/js/backup.js), not a
-- SECURITY DEFINER RPC or an edge function with the service role key —
-- same reasoning and same column-scoped-grant pattern as
-- drive_folder_id/drive_folder_name/drive_connected_by in
-- 0024_google_drive_documents.sql: households has no blanket UPDATE
-- policy, so this grants just the one new column rather than widening
-- that gap. The existing "households: members can update their
-- household's drive folder" policy's USING/WITH CHECK already covers
-- any UPDATE from a household member regardless of which granted column
-- it touches, so no new policy is needed here.
grant update (last_backup_at) on public.households to authenticated;
