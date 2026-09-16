-- Lock down function search_path (avoids the "mutable search_path"
-- advisory) and restrict who can call our SECURITY DEFINER functions
-- directly via PostgREST RPC.
--
-- is_household_member / shares_household keep EXECUTE for `authenticated`
-- because Postgres requires the querying role to hold EXECUTE on any
-- function referenced inside an RLS policy, even though these are meant
-- to be used from policies rather than called directly. anon (not signed
-- in) has no legitimate use for any of these, so it loses EXECUTE
-- entirely.
alter function public.generate_invite_code() set search_path = public;
alter function public.set_updated_at() set search_path = public;

revoke execute on function public.create_household(text) from public, anon;
grant execute on function public.create_household(text) to authenticated;

revoke execute on function public.join_household(text) from public, anon;
grant execute on function public.join_household(text) to authenticated;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.is_household_member(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;

revoke execute on function public.shares_household(uuid) from public, anon;
grant execute on function public.shares_household(uuid) to authenticated;
