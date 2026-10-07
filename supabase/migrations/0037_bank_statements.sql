-- Statement overview (Money tab): upload a bank statement (CSV or PDF),
-- store it in the household's existing shared Google Drive folder (same
-- one Documents/backups already use -- see the note below on why this
-- is NOT a new "Bank Statements" subfolder), parse it client-side into
-- individual transactions, and auto-categorize what it can. Anything it
-- can't confidently categorize lands with status='unknown' for a partner
-- to assign a category to by hand -- see app/js/statements.js and
-- docs/27-feature-bank-statements.md.
--
-- Why one shared root folder, not a new "Bank Statements (current
-- year)" subfolder: this app's Google Drive access uses the narrow
-- `drive.file` OAuth scope (see docs/21-google-drive-documents.md) --
-- whichever partner's token creates a given folder is the only one
-- whose token can write into it, so a second, dedicated subfolder would
-- hit the exact same fork-into-duplicates problem already documented
-- for Documents' category folders. Statements get the same treatment:
-- uploaded into the one root folder both partners already have access
-- to, named for their period and prefixed "[Bank Statement]" so they
-- still sort/group together if a partner opens the folder directly in
-- Drive (see categoryLabel()-style prefixing in documents.js).
create table public.bank_statements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  period_month smallint not null check (period_month between 1 and 12),
  period_year smallint not null check (period_year between 2000 and 2100),
  label text not null,
  original_filename text not null,
  drive_file_id text not null,
  drive_web_view_link text,
  file_name text not null,
  mime_type text,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- One row per parsed (or manually added) transaction. `category` is
-- null until categorized (either by the auto-categorizer's keyword
-- match, or by a partner picking one in the "Needs review" list);
-- `status` tracks that explicitly rather than inferring it from
-- `category is null` so a transaction can be deliberately recategorized
-- later without the two ever disagreeing.
create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  statement_id uuid not null references public.bank_statements(id) on delete cascade,
  txn_date date,
  description text not null,
  amount numeric not null,
  category text,
  status text not null default 'unknown' check (status in ('categorized', 'unknown')),
  categorized_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.bank_statements enable row level security;
alter table public.bank_transactions enable row level security;

create index bank_transactions_statement_idx on public.bank_transactions (statement_id);

create policy "bank_statements: household members"
  on public.bank_statements for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "bank_transactions: household members"
  on public.bank_transactions for all
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- Realtime, same as every other shared-list table (see
-- 0029_enable_realtime_publication.sql) -- a partner categorizing a
-- transaction or uploading a new statement should show up live on the
-- other phone, same as everything else in the Money tab.
alter publication supabase_realtime add table
  public.bank_statements,
  public.bank_transactions;
