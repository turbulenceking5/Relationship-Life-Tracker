// Google Drive document storage — see docs/21-google-drive-documents.md
// for the full design (why drive.file scope, why a Picker-based join
// flow for the second partner, and the exact Google Cloud Console setup
// this depends on).
import { GOOGLE_CLIENT_ID, GOOGLE_API_KEY } from './config.js';
import { updateRow } from './crud.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME = 'Relationship Life Tracker';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export function isConfigured() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_API_KEY);
}

export function isDriveConnected(household) {
  return Boolean(household.drive_folder_id);
}

export function folderUrl(household) {
  return `https://drive.google.com/drive/folders/${household.drive_folder_id}`;
}

// drive.file access, once granted (by creating the folder, or by picking
// it via the Picker join flow below), sticks to the (app, user, file)
// triple on Google's side permanently — but the app itself has no server
// to remember "has this user done that," so it tracks it per browser.
// Worst case if this is missing/cleared: the connect button re-runs the
// (harmless, idempotent) join flow.
function localAccessKey(ctx) {
  return `driveAccess:${ctx.household.id}:${ctx.user.id}`;
}

export function hasLocalDriveAccess(ctx) {
  try { return localStorage.getItem(localAccessKey(ctx)) === '1'; } catch { return false; }
}

export function markLocalDriveAccess(ctx) {
  try { localStorage.setItem(localAccessKey(ctx), '1'); } catch { /* best-effort */ }
}

// In-memory only, never persisted — a fresh access token is requested
// each browser session (and re-requested on expiry). Storing it would
// mean storing a bearer credential in localStorage for no real benefit,
// since GIS can silently reissue one once consent has already been
// granted.
let cachedToken = null; // { accessToken, expiresAt }
let tokenClient = null;

function waitFor(check, { timeout = 10000, interval = 100 } = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (check()) return resolve();
      if (Date.now() - start > timeout) return reject(new Error('Google scripts did not load in time.'));
      setTimeout(tick, interval);
    };
    tick();
  });
}

async function ensureGisLoaded() {
  await waitFor(() => window.google?.accounts?.oauth2);
}

async function ensureGapiPickerLoaded() {
  await waitFor(() => window.gapi);
  if (window.google?.picker) return;
  await new Promise((resolve, reject) => {
    window.gapi.load('picker', { callback: resolve, onerror: () => reject(new Error('Could not load the Google Picker.')) });
  });
}

function getTokenClient() {
  if (tokenClient) return tokenClient;
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPE,
    callback: () => {}, // overridden per-call below
  });
  return tokenClient;
}

// Resolves with a valid access token, prompting the user for consent
// (a Google popup) only if there's no cached token or it's expired.
// `prompt: ''` lets GIS skip the consent screen entirely when this
// browser already granted it this session.
export async function requestAccessToken({ interactive = true } = {}) {
  if (!isConfigured()) throw new Error('Google Drive isn’t set up for this deployment yet — see docs/21-google-drive-documents.md.');
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30000) return cachedToken.accessToken;

  await ensureGisLoaded();
  const client = getTokenClient();
  return new Promise((resolve, reject) => {
    client.callback = (resp) => {
      if (resp.error) { reject(new Error(resp.error_description || resp.error)); return; }
      cachedToken = { accessToken: resp.access_token, expiresAt: Date.now() + Number(resp.expires_in || 3600) * 1000 };
      resolve(cachedToken.accessToken);
    };
    client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
  });
}

async function driveFetch(path, accessToken, options = {}) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}`, ...(options.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message || `Google Drive error (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

async function findOrCreateFolder(accessToken) {
  const q = encodeURIComponent(`name='${FOLDER_NAME.replace(/'/g, "\\'")}' and mimeType='${FOLDER_MIME}' and trashed=false`);
  const found = await driveFetch(`files?q=${q}&fields=files(id,name)`, accessToken);
  if (found.files?.length) return found.files[0];
  return driveFetch('files?fields=id,name', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
  });
}

// First partner to connect: create (or find) the app folder in their own
// Drive and remember it on the household row. onSaved lets the caller
// refresh ctx.household without a full reload.
export async function connectAsFirstPartner(ctx) {
  const accessToken = await requestAccessToken();
  const folder = await findOrCreateFolder(accessToken);
  const updated = await updateRow('households', ctx.household.id, {
    drive_folder_id: folder.id,
    drive_folder_name: folder.name,
    drive_connected_by: ctx.user.id,
  });
  Object.assign(ctx.household, updated);
  markLocalDriveAccess(ctx);
  return updated;
}

// Second partner joining a household whose folder was already created by
// the first: drive.file scope only grants this user's token access to
// files they created, opened, or explicitly picked — a folder merely
// shared with their Google account (see docs/21-google-drive-documents.md
// for why) isn't reachable via the API until they select it once through
// the Picker. That one click is what this function does.
export async function connectAsSecondPartner(ctx) {
  const accessToken = await requestAccessToken();
  await ensureGapiPickerLoaded();
  return new Promise((resolve, reject) => {
    const picker = new window.google.picker.PickerBuilder()
      .addView(new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS)
        .setSelectFolderEnabled(true)
        .setIncludeFolders(true))
      .setOAuthToken(accessToken)
      .setDeveloperKey(GOOGLE_API_KEY)
      .setTitle(`Select "${ctx.household.drive_folder_name || FOLDER_NAME}" to grant access`)
      .setCallback((data) => {
        if (data.action === window.google.picker.Action.PICKED) {
          markLocalDriveAccess(ctx);
          resolve(data.docs[0]);
        } else if (data.action === window.google.picker.Action.CANCEL) {
          reject(new Error('Cancelled.'));
        }
      })
      .build();
    picker.setVisible(true);
  });
}

// Shares the household's Drive folder with a partner's Google account so
// they can at least see/open it in Drive directly even before they've
// run the Picker join flow above (which is what grants API upload access
// for them specifically).
export async function shareFolderWithEmail(ctx, email) {
  const accessToken = await requestAccessToken({ interactive: false }).catch(() => requestAccessToken());
  await driveFetch(`files/${ctx.household.drive_folder_id}/permissions`, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'user', role: 'writer', emailAddress: email }),
  }).catch(() => {}); // best-effort — not sharing doesn't block the folder itself existing
}

// driveFileName lets the caller prefix the name shown in Drive (e.g.
// "[Warranty] Boiler warranty.pdf") without touching the app's own
// documents.file_name column — see documents.js. Real Drive subfolders
// per category aren't used for this: drive.file scope only grants a
// given user's token access to folders *that user's own token* created,
// opened, or picked, so a category folder the other partner creates
// would be invisible to your uploads (and vice versa), silently forking
// into duplicate folders — the same reason the shared root folder needs
// its one-time Picker join step, just per category instead of once.
export async function uploadFileToDrive(ctx, file, driveFileName = file.name) {
  const accessToken = await requestAccessToken({ interactive: false }).catch(() => requestAccessToken());
  const metadata = { name: driveFileName, parents: [ctx.household.drive_folder_id] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message || `Upload failed (${res.status})`);
  }
  return res.json(); // { id, webViewLink }
}

export async function deleteDriveFile(fileId) {
  const accessToken = await requestAccessToken({ interactive: false }).catch(() => requestAccessToken());
  await driveFetch(`files/${fileId}`, accessToken, { method: 'DELETE' });
}
