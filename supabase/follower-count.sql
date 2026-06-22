-- Pointwell — Follower / following counts for any profile.
--
-- The `follows` table (discover-feed.sql) is readable only by the two participants of a
-- row under its RLS ("follows read own"), so a viewer can't COUNT another user's
-- followers directly. This SECURITY DEFINER helper returns the aggregate counts for any
-- user id — just two integers, safe to show on public AND private (locked) profiles.
--
-- `follows` is an instant, one-directional follow with no status column (following is
-- never pending), so every row counts. Idempotent / safe to re-run. Does NOT modify any
-- existing .sql. Depends on: public.follows (discover-feed.sql).

create or replace function public.get_follow_counts(target uuid)
returns table (
  follower_count  bigint,   -- people who follow `target`  (followed_user = target)
  following_count bigint    -- people `target` follows      (follower_user = target)
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.follows f where f.followed_user = target) as follower_count,
    (select count(*) from public.follows f where f.follower_user = target) as following_count;
$$;
revoke all on function public.get_follow_counts(uuid) from public, anon;
grant execute on function public.get_follow_counts(uuid) to authenticated;

-- VERIFY (optional):
--   select * from public.get_follow_counts('<user id>');  -- → followers, following
