-- Pointwell — Profile redesign: a privacy-gated read for another profile's bio. Run ONCE in the
-- Supabase SQL editor, AFTER profile-bio-connections.sql (#18) and profile-view.sql. Idempotent.
-- Does NOT modify any existing .sql.
--
-- SECURITY: gated by the SAME predicate as the rest of the profile (can_view_profile): a PUBLIC
-- profile's bio is readable by anyone (incl. anon, for discovery); a PRIVATE profile that the caller
-- can't view returns NULL (the header then shows only name/avatar, per the "fully locked" rule).
-- SECURITY DEFINER (profiles RLS is self-only) + pinned search_path; granted anon + authenticated.
-- Own bio is also editable via the existing self-update policy on profiles (updateProfile path).
--
-- Depends on: profile-bio-connections.sql (profiles.bio), profile-view.sql (can_view_profile).

create or replace function public.profile_bio(target uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when public.can_view_profile(target) then p.bio else null end
  from public.profiles p
  where p.id = target;
$$;
revoke all on function public.profile_bio(uuid) from public;
grant execute on function public.profile_bio(uuid) to anon, authenticated;

-- VERIFY: a PUBLIC profile → bio returned to anon; a PRIVATE profile you don't follow → NULL.
