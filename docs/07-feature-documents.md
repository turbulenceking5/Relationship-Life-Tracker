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

## Phase 1
- Filter by category; search by title/notes.

## Phase 2
- Expiry alerts: push notification ahead of `expiry_date` (insurance
  renewals, warranty end dates).

## Phase 4
- Thumbnail previews for images/PDFs in the list.
- Link a document to a specific replacement item / repayment / expense /
  event via `related_type` + `related_id` (columns already exist in the
  schema, unused until this ships).
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
