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
import { isDriveConnected, hasLocalDriveAccess, uploadFileToDrive } from './googleDrive.js';
import { todayStr } from './format.js';

const BACKUP_INTERVAL_DAYS = 7;
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

// Also used by the ⚙️ account sheet's "Back up now" button, so a backup
// doesn't have to wait for the 7-day interval to actually prove it works.
export async function backupHouseholdNow(ctx) {
  const payload = await buildBackupPayload(ctx);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  await uploadFileToDrive(ctx, blob, `Backup ${todayStr()}.json`);
  const updated = await updateRow('households', ctx.household.id, { last_backup_at: new Date().toISOString() });
  Object.assign(ctx.household, updated);
}
