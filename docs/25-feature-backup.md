# Feature: Automatic backup to Google Drive

## Purpose
A JSON export of the household's own data (expenses, events, goals,
documents metadata, etc.), uploaded to the same Google Drive folder
documents already live in, so there's a personal backup outside Supabase
without anyone needing to run an export by hand.

## Why this is "automatic" in an opportunistic sense, not a scheduled job
Every other recurring job in this app (`notify-due-items`,
`process_recurring_expenses()`, `weekly-digest`) runs server-side via
`pg_cron`, with no browser involved. A Drive backup can't work that way
here, because of a deliberate design decision already made for Google
Drive document storage (see
[`21-google-drive-documents.md`](21-google-drive-documents.md)): the
app's Drive access is **client-only**, using the `drive.file` OAuth
scope via Google Identity Services, and **no refresh token is ever
persisted anywhere** — only an in-memory access token, re-issued silently
per browser session. That was a deliberate security/scope tradeoff (the
full `drive` scope needed for server-side access is Google's "restricted"
tier, normally requiring a CASA security assessment — a non-starter for
a two-person household app), not an oversight, and backup inherits the
same constraint: there is no server-side credential a `pg_cron` job or
edge function could use to reach Drive on its own.

So instead, `backupHouseholdIfDue()` (`app/js/backup.js`) runs
client-side, fired once (fire-and-forget, not awaited) every time either
partner opens the app with Drive already connected and joined on that
browser (`isDriveConnected()` + `hasLocalDriveAccess()`). It checks
`households.last_backup_at` and only actually uploads once 7 days have
passed, so most app opens do nothing — in practice, "automatic" means "it
happens within about a week of normal use, without anyone pressing a
button," not "at a fixed time of day." A "Back up now" button in
⚙️ Account & household → Documents storage (same section the Drive
connect flow lives in) runs the same `backupHouseholdNow()` immediately,
for testing it or for peace of mind.

## What's backed up
One JSON file per backup, named `Backup YYYY-MM-DD.json`, uploaded via
the same `uploadFileToDrive()` used for document uploads
(`app/js/googleDrive.js`) — no new upload path. Contains every row in
every shared-household table except `households` and
`household_members` themselves (not worth re-backing-up the container)
and `personal_todos` (private per-user, out of scope for a
household-wide backup): `events`, `expenses`, `recurring_expenses`,
`custom_goals`, `goal_transactions`, `goal_tasks`, `rent_payments`,
`mortgage_payments`, `settlements`, `grocery_items`, `recipes`,
`documents` (metadata only — titles/categories/Drive file links, not the
files themselves, which already live in Drive), and `item_comments`.

Every backed-up table is small text rows — no file blobs (uploaded
documents already live in Drive as their own files; this only backs up
their metadata). Even after a couple of years of regular use, a backup
file lands somewhere in the tens of KB up to maybe one or two MB at the
high end — nowhere near a size that matters to anyone, or to Drive's
quota.

## Rolling retention: last 10 backups, not every backup ever made
File *size* was never the concern (see above) — file *count* was: one
new dated file every ~week, forever, would eventually clutter the same
folder the household's actual documents live in. `pruneOldBackups()` in
`app/js/backup.js` runs after every successful backup (both the
opportunistic one and "Back up now"): it lists this household's own
`Backup *.json` files (`listFilesInFolder()` in `googleDrive.js`,
scoped to the household's folder and that name prefix so it only ever
touches files this app itself created), keeps the `KEEP_BACKUPS` (10)
most recent by name — `Backup YYYY-MM-DD.json` sorts chronologically as
a plain string, so no date-parsing is needed — and deletes the rest.
Ten backups at the current ~weekly cadence is roughly 2-3 months of
point-in-time history. Pruning failure is swallowed (logged, not
thrown): the backup itself already succeeded by that point, and a
missed prune just gets caught up next time.

## Data
`households.last_backup_at` (migration `0036_household_last_backup_at.sql`)
— same column-scoped `grant update` pattern as `drive_folder_id` etc. in
`0024_google_drive_documents.sql`, since `households` has no blanket
`UPDATE` policy and this is written directly by the client, not a
`SECURITY DEFINER` RPC.

## Not done (possible follow-ups)
- No restore flow — this is backup-only. Restoring would mean trusting a
  JSON file's shape against the live schema, which is a bigger feature
  than a one-way export.
- No way to back up before Drive is connected (nowhere to put the file).
- If this app's Drive access model ever grows a server-side credential
  (e.g. for some other feature that genuinely needs one), a real
  `pg_cron`-scheduled backup could replace this opportunistic trigger —
  but that's a meaningful OAuth/architecture change on its own, not a
  small addition to this feature.
