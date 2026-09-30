-- Documents move from Supabase Storage to a shared Google Drive folder
-- (see docs/21-google-drive-documents.md). New uploads go to Drive;
-- existing rows keep working against Supabase Storage exactly as before,
-- distinguished by the new storage_provider column.

alter table public.documents
  alter column file_path drop not null,
  add column storage_provider text not null default 'supabase'
    check (storage_provider in ('supabase', 'drive')),
  add column drive_file_id text,
  add column drive_web_view_link text;

-- One household-wide Drive folder: whoever connects first (the
-- ⚙️ account sheet) owns it in their own Drive and it's shared with the
-- rest of the household from there.
alter table public.households
  add column drive_folder_id text,
  add column drive_folder_name text,
  add column drive_connected_by uuid references auth.users(id);

-- households has never had an UPDATE policy (see 0001_init.sql: writes
-- deliberately go through SECURITY DEFINER RPCs, not direct client
-- writes) — 0016_household_members_split_update.sql hit the same gap for
-- household_members and fixed it the same way: grant UPDATE on only the
-- specific columns this feature needs, never a blanket grant, so this
-- can't be used to rewrite name/invite_code/default_currency/created_by
-- by hand-crafted requests.
grant update (drive_folder_id, drive_folder_name, drive_connected_by) on public.households to authenticated;

create policy "households: members can update their household's drive folder"
  on public.households for update
  using (public.is_household_member(id))
  with check (public.is_household_member(id));
