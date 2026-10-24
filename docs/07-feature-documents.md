# Feature: Documents

## Purpose
A shared, private place for the paperwork you only need twice a year but
can never find: warranties, contracts, insurance policies, receipts for
big purchases, ID scans for reference.

## MVP (Phase 0, shipped)
- List documents with title, category, upload date, uploader.
- Upload a document: pick a file (any type — see "Storage" below), title,
  category, optional notes and expiry date.
- Download/view a document (Drive's view link for new uploads; a signed,
  time-limited Storage URL for documents uploaded before the Drive
  change — see below).
- Edit a document's title, category, and expiry date. The uploaded file
  itself isn't replaceable in place — delete and re-upload for that,
  since swapping a file is a different operation to updating a text
  field.
- Delete a document (removes both the DB row and the underlying file).
- Link a document to a goal (shipped, see below) via `related_type` +
  `related_id`.

## Storage: Google Drive (shipped)
New uploads are stored in a shared Google Drive folder rather than
Supabase Storage — connect it from `⚙️ Account & household → Documents
storage`. Documents uploaded before this change keep working exactly as
before against Supabase Storage; `documents.storage_provider`
distinguishes the two per row. See
[`21-google-drive-documents.md`](21-google-drive-documents.md) for the
full design (why `drive.file` OAuth scope, why the second partner needs
a one-time Google Picker step, and the dashboard-only Google Cloud setup
this depends on) and the fix for uploads previously being effectively
photo-only (an Android `capture` attribute on the file input, unrelated
to Drive, fixed in the same change).

## Linking to a goal (shipped)
Uploading from within a goal (see
[`12-feature-goals.md`](12-feature-goals.md)) sets `related_type = 'goal'`
and `related_id = <goal id>` on the same `documents` row an ordinary
upload creates — there's no separate table for "goal documents." The
upload sheet itself (`openUploadDocumentSheet()` in `documents.js`) is
shared between the top-level Docs tab and each goal, so both call sites
stay in sync automatically. A linked document still shows in the
top-level Docs tab, tagged "linked to `<goal title>`", so nothing
disappears by being attached somewhere else.

## Search (shipped)
A plain text filter above the list (`app/js/documents.js`) matches
title, category, notes, or linked-goal name, case-insensitive substring,
no fancy tokenizing — filters the already-fetched list client-side
rather than re-querying per keystroke. Hidden entirely when the
household has no documents yet, so there's nothing to search.
Category-only filter chips (Phase 1's original plan) weren't added on
top of this — a search box already covers "find the boiler warranty" as
well as a chip row would, without another row of UI.

## Notes (shipped)
Each document can carry a free-text note (`documents.notes`, a column
that existed in the schema from early on but wasn't surfaced in the UI
until this) — a "Notes (optional)" textarea in both the upload sheet and
the edit sheet in `app/js/documents.js`. Shown on the document's card
only when set (no empty "Notes:" line otherwise), and included in the
search filter above, so "find the boiler warranty" also works via a
detail only written down in the note rather than the title — e.g. a
serial number or a broker's name. No tagging/full-text-search beyond
this plain substring match — see Phase 4 below.

## Expiry status (shipped)
A document with `expiry_date` set shows a status pill (`Expires in Nd` /
`Expired Nd ago`) once it's within 14 days of expiring or already past
it — same overdue/due-soon/ok thresholds as rent/mortgage due dates
(`dueStatus()` in `format.js`), via a parallel `expiryStatus()` exported
from `documents.js` with expiry-appropriate wording. An expiring/expired
document also surfaces on the home dashboard's "What's due" feed,
merged and sorted by date alongside rent and mortgage — see
[`13-feature-money-tab.md`](13-feature-money-tab.md).

A document past its `expiry_date` also triggers a push notification via
`notify-due-items` (on the day it expires, escalating daily while it
stays expired) — see [`19-notification-sources.md`](19-notification-sources.md).
Unlike the 14-day "due soon" visual pill above, the push only fires once
actually expired, not ahead of time — the pill already gives advance
warning when the app is opened.

## Phase 4
- Thumbnail previews for images/PDFs in the list.
- Link a document to an expense or event too, the same way goals work
  now (`related_type`/`related_id` already support any string).
- Bulk export/download as a zip for personal backup.

## Data
See `documents` table in [`02-data-model.md`](02-data-model.md). New
uploads (`storage_provider = 'drive'`) live in the household's Google
Drive folder (`drive_file_id`/`drive_web_view_link`). Documents uploaded
before the Drive change (`storage_provider = 'supabase'`) still live in
the private Supabase Storage bucket `documents`, at path
`{household_id}/{uuid}-{original filename}`; Storage RLS policies mirror
the table policies, and access is always via a short-lived signed URL —
that bucket itself is never public. See
[`21-google-drive-documents.md`](21-google-drive-documents.md).

## UI notes
- The file input accepts any file type, with no `capture` attribute —
  see [`21-google-drive-documents.md`](21-google-drive-documents.md) for
  why that attribute previously made PDFs/files effectively unreachable
  on Android.
