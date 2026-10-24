// Automatic backup of household data to its connected Google Drive
// folder — see docs/25-feature-backup.md for why this is "automatic" in
// an opportunistic, not a server-scheduled, sense: the app's Drive
// access (googleDrive.js) is deliberately client-only, drive.file-scoped,
// with no refresh token ever persisted anywhere — there's no server-side
// credential a pg_cron job or edge function could use to reach Drive on
// its own. Instead, this runs client-side whenever the app opens with
// Drive already connected and joined, but only actually uploads once the
// last backup is overdue, so most opens do nothing.
import { fetchRows, updateRow } from './crud.js';
import { isDriveConnected, hasLocalDriveAccess, uploadFileToDrive, listFilesInFolder, deleteDriveFile } from './googleDrive.js';
import { todayStr } from './format.js';

const BACKUP_INTERVAL_DAYS = 7;
const BACKUP_FILE_PREFIX = 'Backup ';
// Keeps the Drive folder from accumulating an ever-growing trail of
// dated backup files (harmless in storage terms — these are small JSON
// files, see docs/25-feature-backup.md — but real clutter next to the
// documents that actually live in that folder). 10 backups at the
// current ~weekly cadence is roughly 2-3 months of point-in-time
// history, which comfortably covers "I need to undo something I noticed
// a few weeks late" without the folder filling up with files from years
// ago nobody will ever open.
const KEEP_BACKUPS = 10;
const BACKED_UP_TABLES = [
  'events', 'expenses', 'recurring_expenses', 'custom_goals',
  'goal_transactions', 'goal_tasks', 'rent_payments', 'mortgage_payments',
  'settlements', 'grocery_items', 'recipes', 'documents', 'item_comments',
];

function daysSince(isoStr) {
  if (!isoStr) return Infinity;
  return (Date.now() - new Date(isoStr).getTime()) / 86400000;
}

async function buildBackupPayload(ctx) {
  const tables = {};
  await Promise.all(BACKED_UP_TABLES.map(async (table) => {
    tables[table] = await fetchRows(table, ctx.household.id, 'created_at', true).catch(() => []);
  }));
  return {
    household_id: ctx.household.id,
    household_name: ctx.household.name,
    generated_at: new Date().toISOString(),
    tables,
  };
}

// Fire-and-forget from app.js on every app open — silent on failure
// (console.warn only) since there's no user-initiated action here to
// show an error for; a failed opportunistic backup just gets retried
// next time the app opens.
export async function backupHouseholdIfDue(ctx) {
  try {
    if (!isDriveConnected(ctx.household) || !hasLocalDriveAccess(ctx)) return;
    if (daysSince(ctx.household.last_backup_at) < BACKUP_INTERVAL_DAYS) return;
    await backupHouseholdNow(ctx);
  } catch (err) {
    console.warn('Opportunistic household backup failed:', err.message);
  }
}

// Deletes everything past the KEEP_BACKUPS most recent backup files.
// Best-effort: a failure here (e.g. a Drive hiccup right after a
// successful upload) is logged and swallowed rather than thrown, since
// the backup itself already succeeded by this point — not worth turning
// a successful backup into a reported failure over cleanup.
async function pruneOldBackups(ctx) {
  try {
    const files = await listFilesInFolder(ctx, BACKUP_FILE_PREFIX);
    const stale = files.slice(KEEP_BACKUPS); // already newest-first (orderBy=name desc)
    await Promise.all(stale.map((f) => deleteDriveFile(f.id)));
  } catch (err) {
    console.warn('Could not prune old backups:', err.message);
  }
}

// Also used by the ⚙️ account sheet's "Back up now" button, so a backup
// doesn't have to wait for the 7-day interval to actually prove it works.
export async function backupHouseholdNow(ctx) {
  const payload = await buildBackupPayload(ctx);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  await uploadFileToDrive(ctx, blob, `${BACKUP_FILE_PREFIX}${todayStr()}.json`);
  const updated = await updateRow('households', ctx.household.id, { last_backup_at: new Date().toISOString() });
  Object.assign(ctx.household, updated);
  await pruneOldBackups(ctx);
}
