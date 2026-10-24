-- Lets a household member leave by hand ("Leave household" on their own
-- row) or, if they're the owner, remove the other member ("Remove") --
-- see docs/08-auth-households.md. Until this, a household that splits
-- up had no way to cut off an ex-partner's access short of the project
-- owner hand-running SQL in the dashboard; they'd remain a full member
-- (shared data, Realtime, push notifications) indefinitely.
--
-- A single SQL-language DELETE with a subquery, not plpgsql with a
-- separate SELECT INTO a variable -- both are logically equivalent, but
-- that shape is what the authorization check compiles down to:
--   - Deletes the row for p_user_id only within a household p_user_id
--     and the caller (auth.uid()) actually share.
--   - Allowed unconditionally when removing yourself
--     (p_user_id = auth.uid()); otherwise only when the caller's own
--     role in that shared household is 'owner'.
-- If neither condition holds, the subquery matches no household_id and
-- the DELETE affects zero rows -- same "no matching row, nothing
-- happens" shape RLS itself uses, rather than a raised exception.
--
-- Deliberately doesn't also clean up push_subscriptions in the same
-- statement: an orphaned subscription is harmless and self-heals the
-- next time a push to it 404s/410s (both notify-due-items and
-- remind-partner already delete on that response) -- see
-- docs/24-live-sync-and-nudges.md.
create or replace function public.remove_household_member(p_user_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  delete from public.household_members
  where user_id = p_user_id
    and household_id in (
      select hm1.household_id
      from public.household_members hm1
      join public.household_members hm2 on hm1.household_id = hm2.household_id
      where hm1.user_id = auth.uid()
        and hm2.user_id = p_user_id
        and (p_user_id = auth.uid() or hm1.role = 'owner')
    );
$$;

revoke all on function public.remove_household_member(uuid) from public;
grant execute on function public.remove_household_member(uuid) to authenticated;
