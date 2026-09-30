-- household_members has always had a SELECT policy only (see 0001_init.sql
-- comment: joining/creating deliberately goes through SECURITY DEFINER
-- RPCs, not direct client writes). But updateSplitPercents() in
-- app/js/household.js has always tried to UPDATE split_percent directly —
-- with no UPDATE policy, RLS silently drops those writes (0 rows affected,
-- no error from PostgREST), so the ⚙️ account sheet's "Split saved"
-- message was never true and every balance calculation kept using the
-- schema default of 50/50 no matter what was entered.
--
-- Restrict the grant to the split_percent column itself (rather than a
-- blanket UPDATE policy) so this can't be used to rewrite role/user_id/
-- household_id by hand-crafted requests — those still have no write path
-- outside the create_household/join_household RPCs.
revoke update on public.household_members from authenticated;
grant update (split_percent) on public.household_members to authenticated;

create policy "household_members: members can update their household's split"
  on public.household_members for update
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
