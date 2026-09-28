# Feature: Documents

## Purpose
A shared, private place for the paperwork you only need twice a year but
can never find: warranties, contracts, insurance policies, receipts for
big purchases, ID scans for reference.

## MVP (Phase 0, shipped)
- List documents with title, category, upload date, uploader.
- Upload a document: pick a file (PDF/image), title, category, optional
  notes and expiry date.
- Download/view a document (signed, time-limited URL from private
  Storage).
- Edit a document's title, category, and expiry date. The uploaded file
  itself isn't replaceable in place — delete and re-upload for that,
  since swapping a file (and generating its Storage path) is a different
  operation to updating a text field.
- Delete a document (removes both the DB row and the Storage object).
- Link a document to a goal (shipped, see below) via `related_type` +
  `related_id`.

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
title, category, or linked-goal name, case-insensitive substring, no
fancy tokenizing — filters the already-fetched list client-side rather
than re-querying per keystroke. Hidden entirely when the household has
no documents yet, so there's nothing to search. Category-only filter
chips (Phase 1's original plan) weren't added on top of this — a search
box already covers "find the boiler warranty" as well as a chip row
would, without another row of UI.

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
See `documents` table in [`02-data-model.md`](02-data-model.md). Files
live in the private Supabase Storage bucket `documents`, at path
`{household_id}/{uuid}-{original filename}`. Storage RLS policies mirror
the table policies: only members of that household can read/write objects
under their household's folder. Access from the app is always via a
short-lived signed URL — the bucket itself is never public.

## UI notes
- Uploading should support both "pick a file" and, on iOS, "take a photo"
  directly (the file input's `capture` attribute) — most receipts/
  warranty cards will be photographed on the spot, not scanned.
