# Feature: Google Drive document storage

## Why
Documents used to live in a private Supabase Storage bucket. Two problems
prompted moving new uploads to Google Drive instead:

1. The upload `<input type="file">` had `accept="application/pdf,image/*"`
   **and** `capture="environment"` set. On Android, the `capture`
   attribute makes the browser jump straight into the camera app instead
   of showing a file picker — so PDFs and any other non-image file were
   effectively unreachable, even though `accept` already allowed them.
   The fix (drop `capture`, drop the `accept` restriction entirely) is
   independent of Drive and would have been worth doing either way.
2. The household wanted documents to actually live in Google Drive, not
   on Supabase's server.

## Design decisions
Two questions had to be settled before writing any code, both driven by
constraints that aren't obvious from the feature request alone:

- **New uploads go to Drive only, going forward.** Existing documents
  already in Supabase Storage keep working unchanged (View/Edit/Delete),
  distinguished by the new `documents.storage_provider` column
  (`'supabase'` | `'drive'`). No dual-backend toggle — one storage path
  per document, decided at upload time, keeps `view`/`removeDocument`
  simple branches instead of two parallel implementations to maintain
  forever.
- **One shared household folder**, owned by whichever partner connects
  first. The alternative (each partner's own Drive, cross-shared) needs
  no less OAuth complexity and adds a second "whose file is this"
  question on top — not worth it for a two-person household.

## Why `drive.file` scope, and why the second partner needs a Picker step
The app requests `https://www.googleapis.com/auth/drive.file`, not the
full `drive` scope. `drive.file` only grants the app access to files a
given user's own token **created**, **opened**, or **explicitly picked**
via the Google Picker — it deliberately doesn't grant access to files
merely shared with that user by someone else's Drive ACL. This matters
because:

- The full `drive` scope is Google's "restricted" tier, which normally
  requires a security assessment (CASA) to use in production — a
  non-starter for a two-person household app.
- `drive.file` is enough for one user (whoever creates the folder), but
  the *second* partner's token has no API access to a folder they didn't
  create, even after the first partner shares it with their Google
  account in Drive's UI — sharing alone doesn't satisfy `drive.file`.

So the flow is:
1. **First partner** (⚙️ Account & household → Documents storage →
   "Connect Google Drive"): OAuth consent, then
   `findOrCreateFolder()` creates (or finds) a folder named
   "Relationship Life Tracker" in their own Drive. Its id/name and who
   connected it are stored on `households`. An optional "partner's email"
   field shares the folder (Editor) with the other account via
   `permissions.create`, so it's visible in their Drive immediately (but
   not yet API-accessible to them — see below).
2. **Second partner** (same section, now showing "Grant my account
   access"): OAuth consent, then the Google **Picker** opens, scoped to
   folders, and they select the already-shared folder (it should appear
   under "Shared with me"). That act of picking is what grants their own
   `drive.file` token access to it going forward — a one-time step, not
   needed again each session.

Both `app/js/googleDrive.js` functions (`connectAsFirstPartner`,
`connectAsSecondPartner`) are thin wrappers around this; see that file
for the actual API calls.

## What "connected" means, client-side
Google's own OAuth consent grant persists across sessions once approved
(GIS can silently reissue an access token, `prompt: ''`, until it's
revoked). But whether *this browser* has already run the one-time Picker
join step isn't something the API exposes, so it's tracked locally:
`localStorage['driveAccess:{householdId}:{userId}']`. Worst case if it's
missing or cleared (private browsing, cleared site data): the connect
button re-runs the Picker step, which is harmless and idempotent — it's
not a security boundary, just a UI nicety to skip an unnecessary prompt.
The access token itself is **never** persisted — only kept in memory for
the current page load — since GIS can reissue one on demand and there's
no benefit to a long-lived bearer credential sitting in `localStorage`.

## Data
- `documents.storage_provider` (`'supabase'` | `'drive'`, default
  `'supabase'` for existing rows), `drive_file_id`, `drive_web_view_link`
  — new columns; `file_path` is now nullable (only used by `'supabase'`
  rows). See migration `0024_google_drive_documents.sql`.
- `households.drive_folder_id`, `drive_folder_name`, `drive_connected_by`
  — same migration. `households` never had an `UPDATE` policy before
  this (writes went through `SECURITY DEFINER` RPCs only — see
  `0001_init.sql`); rather than add a blanket one, the grant is
  column-scoped to just these three columns, mirroring the fix in
  `0016_household_members_split_update.sql` for the identical gap on
  `household_members`.

## Required setup (dashboard-only, repo owner)
This can't be done by any tool on the owner's behalf — see the setup
steps documented directly in `app/js/config.js` above
`GOOGLE_CLIENT_ID`/`GOOGLE_API_KEY`. In short: a Google Cloud project,
the Drive API and Picker API enabled, an OAuth consent screen in
"Testing" mode with both partners added as test users (no Google
verification review needed at this size), an OAuth client ID scoped to
the deployed origin, and a Picker-restricted API key. Until both config
values are filled in, `isConfigured()` returns false and the Docs tab
shows a setup-needed message instead of a confusing failure deep in the
OAuth flow.

## UI
- `⚙️ Account & household → Documents storage` (`app/js/app.js`,
  `renderDriveSection`) — the connect/join flow above.
- Docs tab's "+ Add document" (`app/js/documents.js`,
  `openUploadDocumentSheet`) — shows a "connect first" message if Drive
  isn't connected/joined yet, otherwise a plain file input (any type) plus
  title/category/expiry, same shape as before.
- Docs tab: category filter chips (`All`/`Warranty`/`Contract`/`Receipt`/
  `ID`/`Other`) above the search box, same `.segmented` control money.js
  uses for its own sub-nav. Combines with the text search rather than
  replacing it; resets to "All" on every re-render, same as the search
  box's typed text not persisting across an add/edit/delete.

## Why category organization is filename-prefix, not real Drive subfolders
A category subfolder per type (e.g. a "Warranties" folder) sounds like
the obvious way to organize the shared Drive folder, but it collides with
`drive.file`'s access model (see above): whichever partner's token
creates a given category folder is the only one whose token can write
into it. The other partner's next upload of that category wouldn't find
it (their token has no access to a folder it didn't create/open/pick)
and would silently create a *second*, duplicate folder with the same
name — fragmenting exactly what this was supposed to prevent. Fixing that
properly would mean a Picker-based "join" step per category, repeated
indefinitely as new categories come up — too much friction for what this
buys.

Instead, `uploadFileToDrive()` (`app/js/googleDrive.js`) takes an
optional `driveFileName` override; `documents.js` prefixes it with the
category in brackets (e.g. `[Warranty] Boiler warranty.pdf`) before
upload. Everything stays in the one root folder both partners already
have access to (no new access-propagation problem), while sorting by
name in Drive's own UI naturally clusters same-category files together.
The app's own category filter chips (above) are the more useful way to
browse by category day-to-day; the filename prefix is mainly for anyone
who opens the folder directly in Drive.

## Known failure mode: "Google scripts did not load in time"
`requestAccessToken()` in `app/js/googleDrive.js` throws this
(`ensureGisLoaded()`'s `waitFor()` helper) if `window.google.accounts.oauth2`
never shows up within 10 seconds of the first Drive action — i.e. the
`<script src="https://accounts.google.com/gsi/client" defer>` tag in
`index.html` genuinely never finished loading. Every Drive-dependent
feature (connect, upload, and backup — see
[`25-feature-backup.md`](25-feature-backup.md)) shares this one
dependency, so this error surfaces identically across all of them.

One real cause, found and fixed: `service-worker.js`'s fetch handler
used to only bypass its own cache-first pipeline for `*.supabase.co`
requests — every other request, including these two Google script tags
(neither same-origin nor Supabase), got routed through the service
worker's own `fetch()`/`cache.match()` instead of the browser's normal
script-loading path, which is a known source of a cross-origin
`<script>` load silently failing or hanging on some engines. Fixed by
generalizing the bypass to any non-same-origin request — a service
worker has no business mediating a third-party script load it was never
going to cache anyway (the `cache.put()` was already origin-gated to
same-origin responses only, so routing these through it never bought
anything).

If this still happens after that fix, it's no longer something the
app's own code controls — same category as the dashboard-only settings
elsewhere in this project: a content blocker, restrictive DNS/firewall,
or network policy blocking `accounts.google.com`/`apis.google.com`
outright. There's no client-side workaround for that; the person hitting
it needs to try a different network or disable whatever's blocking
those domains.

## Not done (possible follow-ups)
- No UI to disconnect/switch the household's Drive folder once set.
- Automatic backup of the app's *own* data (expenses, events, goals,
  etc. — not the documents already stored here) to this same folder is
  now covered separately, see [`25-feature-backup.md`](25-feature-backup.md)
  — it reuses `uploadFileToDrive()` but is otherwise a distinct feature.
- No re-share retry if the optional "partner's email" share fails or is
  skipped — the second partner would need the folder shared with them
  some other way before the Picker step can find it under "Shared with
  me" (they can also search for it by name in the Picker directly).
- Thumbnail previews for Drive-hosted files (Phase 4 in `ROADMAP.md`,
  pre-dates this change, still open).
