-- Make Statement overview private per-user, like personal_todos, instead
-- of shared across the household: each partner should only ever see
-- their own uploaded statements and transactions, not their partner's.
-- bank_statements already has an `uploaded_by` column (added in
-- 0037_bank_statements.sql) that makes this a direct ownership check, no
-- new column needed; bank_transactions has no user column of its own, so
-- ownership is checked via its statement's uploaded_by. See
-- docs/27-feature-bank-statements.md.
--
-- Still also gated on household membership in the WITH CHECK clauses,
-- same as personal_todos -- purely so a household_id/statement_id can't
-- be forged to point at a household the user isn't actually in. The
-- actual privacy boundary is uploaded_by/the statement ownership check.
drop policy "bank_statements: household members" on public.bank_statements;
drop policy "bank_transactions: household members" on public.bank_transactions;

create policy "bank_statements: owner only"
  on public.bank_statements for all
  using (uploaded_by = auth.uid())
  with check (uploaded_by = auth.uid() and public.is_household_member(household_id));

create policy "bank_transactions: owner only"
  on public.bank_transactions for all
  using (exists (
    select 1 from public.bank_statements s
    where s.id = bank_transactions.statement_id and s.uploaded_by = auth.uid()
  ))
  with check (
    public.is_household_member(household_id)
    and exists (
      select 1 from public.bank_statements s
      where s.id = bank_transactions.statement_id and s.uploaded_by = auth.uid()
    )
  );

-- Private-per-user data has no partner to sync live to -- drop both
-- tables from the realtime publication, matching personal_todos' own
-- exclusion from it.
alter publication supabase_realtime drop table
  public.bank_statements,
  public.bank_transactions;
