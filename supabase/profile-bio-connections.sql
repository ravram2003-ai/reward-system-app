-- Pointwell — Profile redesign foundation: a profile bio + privacy-gated followers/following lists.
-- Run ONCE in the Supabase SQL editor, AFTER profile-view.sql (and its deps). Idempotent / safe to
-- re-run. Does NOT modify any existing .sql file.
--
-- SECURITY (enforced in the DB, never the client):
--   • The followers/following lists are gated by the SAME predicate that already locks a private
--     profile everywhere else — public.can_view_profile(target): viewable when the target is PUBLIC,
--     is the caller themselves, or the caller is an APPROVED follower (are_friends), and NEVER across
--     a block. A PRIVATE profile therefore returns ZERO rows to anyone who isn't the owner or an
--     approved follower, so the anon key can never enumerate a private profile's connections.
--   • Both functions are SECURITY DEFINER (they read public.profiles — whose RLS is self-only — and
--     public.follows across the gate) with a pinned search_path, and are granted to anon +
--     authenticated so signed-out users can read PUBLIC profiles' lists for discovery.
--   • viewer_follows reflects the CALLER's own follow edge (auth.uid() → listed account), so the UI
--     can render Follow/Following per row. For anon, auth.uid() is NULL → viewer_follows is false.
--
-- Depends on: signals.sql + search-onboarding.sql (profiles, .visibility), friends.sql
-- (profile_is_public, are_friends), messaging.sql (is_blocked_between), discover-feed.sql (follows),
-- profile-view.sql (can_view_profile).

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Bio. Nullable; a 280-char cap enforced in the DB (idempotent constraint add). No default →
--    existing rows untouched. The owner-only write is already covered by profiles' existing
--    "update own profile" policy; reads go through the SECURITY DEFINER profile functions.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists bio text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_bio_len') then
    alter table public.profiles
      add constraint profiles_bio_len check (char_length(coalesce(bio, '')) <= 280);
  end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Followers of `target` — accounts that follow them. Gated by can_view_profile(target):
--    private profile → 0 rows unless the caller is the owner or an approved follower.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.profile_followers(target uuid)
returns table (
  id uuid,
  display_name text,
  handle text,
  avatar_url text,
  viewer_follows boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.display_name, p.handle, p.avatar_url,
    exists (
      select 1 from public.follows vf
      where vf.follower_user = auth.uid() and vf.followed_user = p.id
    ) as viewer_follows
  from public.follows f
    join public.profiles p on p.id = f.follower_user
  where f.followed_user = target
    and public.can_view_profile(target)   -- private → 0 rows unless owner/approved follower
  order by p.display_name nulls last, p.id;
$$;
revoke all on function public.profile_followers(uuid) from public;
grant execute on function public.profile_followers(uuid) to anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Following of `target` — accounts they follow. Same gate.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.profile_following(target uuid)
returns table (
  id uuid,
  display_name text,
  handle text,
  avatar_url text,
  viewer_follows boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.display_name, p.handle, p.avatar_url,
    exists (
      select 1 from public.follows vf
      where vf.follower_user = auth.uid() and vf.followed_user = p.id
    ) as viewer_follows
  from public.follows f
    join public.profiles p on p.id = f.followed_user
  where f.follower_user = target
    and public.can_view_profile(target)
  order by p.display_name nulls last, p.id;
$$;
revoke all on function public.profile_following(uuid) from public;
grant execute on function public.profile_following(uuid) to anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- VERIFY (optional — accounts A=owner of a PRIVATE profile, B=approved follower/friend of A,
-- C=signed-in non-follower, anon=signed-out):
--   -- A makes their profile private:  update public.profiles set visibility='private' where id=auth.uid();
--   -- A:    select * from public.profile_followers('<A>');   -- their followers (rows)
--   -- B:    select * from public.profile_followers('<A>');   -- approved follower → rows
--   -- C:    select * from public.profile_followers('<A>');   -- 0 rows (locked)
--   -- anon: select * from public.profile_followers('<A>');   -- 0 rows (locked; anon can't enumerate)
--   -- Flip A back to public → C and anon now see the lists.
--   -- bio cap:  update public.profiles set bio = repeat('x', 281) where id = auth.uid();  -- rejected
-- ───────────────────────────────────────────────────────────────────────────
