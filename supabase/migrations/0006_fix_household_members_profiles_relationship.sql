-- household_members.user_id and profiles.id both reference auth.users(id)
-- independently, but PostgREST needs a direct foreign key between two
-- tables in the exposed (public) schema to support embedding one inside
-- the other (e.g. `.select('user_id, profiles ( display_name )')`, used
-- by getHouseholdMembers() in app/js/household.js). auth.users isn't
-- exposed to PostgREST at all, so without this there was no usable
-- relationship for it to find, and the query failed with
-- "Could not find a relationship between 'household_members' and
-- 'profiles' in the schema cache".
alter table public.household_members
  add constraint household_members_user_id_profiles_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;
