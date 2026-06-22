-- Tappable user profiles — server-side visibility gate + a single overview call.
--
-- A profile is viewable when the viewer is the owner, the profile is public, or the
-- viewer is an approved follower/friend. "Approved follower of a private profile" reuses
-- the existing FRIENDSHIP approval flow (friend_requests + the bell) — the same
-- `profile_is_public OR are_friends` gate the rest of the app already uses
-- (friends.sql / profile-pictures.sql). The public-only `follows` table (discover-feed.sql)
-- stays as the feed "Follow" and does NOT gate viewing.
--
-- All activity (communities, posts, goals) is gated INSIDE the SECURITY DEFINER functions;
-- the anon role is never granted execute, so the anon key can never read a private
-- profile's activity. Idempotent / safe to re-run. Does NOT modify existing .sql.
-- Depends on: profiles, communities, community_members, community_entries, entry_likes,
-- entry_comments, follows, join_requests + helpers profile_is_public / are_friends /
-- is_blocked_between / is_community_member / get_friendship_status.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. can_view_profile — the gate. Public OR self OR friends, never across a block.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.can_view_profile(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target is not null
    and not public.is_blocked_between(auth.uid(), target)
    and (
      target = auth.uid()
      or public.profile_is_public(target)
      or public.are_friends(auth.uid(), target)
    );
$$;
revoke all on function public.can_view_profile(uuid) from public, anon;
grant execute on function public.can_view_profile(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. get_profile_overview — ONE call returning the header + relationship state, and
--    (ONLY when can_view_profile is true) the person's PUBLIC + request-to-join
--    communities, a count of their private communities, and recent PUBLIC posts.
--    The header (name/handle/avatar/visibility) is returned so a locked private
--    profile can still show its header; it is withheld entirely across a block.
--    Activity arrays are empty when the viewer can't view — enforced here, not the client.
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.get_profile_overview(uuid);
create function public.get_profile_overview(target uuid)
returns table (
  can_view      boolean,
  display_name  text,
  handle        text,
  avatar_url    text,
  visibility    text,
  is_following  boolean,
  friend_status text,
  communities   jsonb,
  private_count integer,
  posts         jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with blk as (
    select public.is_blocked_between(auth.uid(), target) as blocked
  ),
  cv as (
    select public.can_view_profile(target) as ok
  ),
  prof as (
    select p.id, p.display_name, p.handle, p.avatar_url, coalesce(p.visibility, 'public') as visibility
    from public.profiles p
    where p.id = target
  ),
  comms as (
    select
      c.id, c.name, c.category, c.description, c.visibility, c.system,
      (select count(*) from public.community_members m2 where m2.community_id = c.id) as member_count,
      public.is_community_member(c.id, auth.uid()) as is_member,
      (select jr.status from public.join_requests jr
         where jr.community_id = c.id and jr.requester_user = auth.uid()
         order by jr.created_at desc limit 1) as request_status
    from public.community_members m
      join public.communities c on c.id = m.community_id
    where m.user_id = target
      and c.visibility in ('public', 'request_to_join')   -- never reveal private communities
      and (select ok from cv)
  ),
  recent as (
    select
      e.id as entry_id, e.community_id, c.name as community_name, e.rule_id, e.amount,
      e.message, e.photo_path, e.entry_date, e.updated_at,
      (select count(*) from public.entry_likes l    where l.entry_id = e.id) as like_count,
      (select count(*) from public.entry_comments k where k.entry_id = e.id) as comment_count
    from public.community_entries e
      join public.communities c on c.id = e.community_id
    where e.user_id = target
      and c.visibility = 'public'                          -- a post's visibility = its community's
      and (select ok from cv)
    order by e.updated_at desc
    limit 20
  )
  select
    coalesce((select ok from cv), false) as can_view,
    case when (select blocked from blk) then null else (select display_name from prof) end as display_name,
    case when (select blocked from blk) then null else (select handle from prof) end as handle,
    case when (select blocked from blk) then null else (select avatar_url from prof) end as avatar_url,
    case when (select blocked from blk) then null else (select visibility from prof) end as visibility,
    exists (
      select 1 from public.follows f
      where f.follower_user = auth.uid() and f.followed_user = target
    ) as is_following,
    public.get_friendship_status(target) as friend_status,
    coalesce((select jsonb_agg(to_jsonb(cc) order by cc.name) from comms cc), '[]'::jsonb) as communities,
    coalesce((
      select count(*)::int
      from public.community_members m
        join public.communities c on c.id = m.community_id
      where m.user_id = target and c.visibility = 'private' and (select ok from cv)
    ), 0) as private_count,
    coalesce((select jsonb_agg(to_jsonb(rr) order by rr.updated_at desc) from recent rr), '[]'::jsonb) as posts;
$$;
revoke all on function public.get_profile_overview(uuid) from public, anon;
grant execute on function public.get_profile_overview(uuid) to authenticated;
