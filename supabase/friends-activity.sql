-- Pointwell — Friends activity ("what a friend logged today", visibility-gated).
-- Run ONCE in the Supabase SQL editor, AFTER communities.sql + search-onboarding.sql + friends.sql.
-- Idempotent (create or replace).
--
-- KEY SAFETY: every visibility rule is enforced HERE (SECURITY DEFINER), not the UI.
--   * Only ACCEPTED friends can read another user's activity through these functions.
--   * PUBLIC friend  -> all of their TODAY community entries (every community they're in).
--   * PRIVATE friend -> only TODAY entries in a community the VIEWER also belongs to.
--   * A block stops everything; non-friends get nothing.
--   * Personal (non-community) activity is not stored in the DB at all, so it is never exposed.
--
-- These reuse the existing definer predicates: public.are_friends(a,b),
-- public.profile_is_public(uid), public.is_community_member(cid,uid),
-- public.is_blocked_between(a,b). The base "entries read in my communities" SELECT
-- policy on community_entries is left UNTOUCHED, so leaderboards keep working.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. get_friend_today_activity(target, for_date): one row per (community, rule) the
--    VIEWER is allowed to see for `target` on `for_date` (the viewer's local "today").
--    Rule:
--      a. PUBLIC target  -> any accepted friend sees ALL their communities' entries.
--      b. PRIVATE target -> only entries whose community the viewer also belongs to.
--      c. Non-friend / blocked / self -> no rows.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.get_friend_today_activity(target uuid, for_date date)
returns table (community_id uuid, community_name text, rule_id text, amount numeric, entry_date date)
language sql stable security definer set search_path = public
as $$
  select e.community_id, c.name, e.rule_id, e.amount, e.entry_date
  from public.community_entries e
  join public.communities c on c.id = e.community_id
  where e.user_id = target
    and e.entry_date = for_date
    and target <> auth.uid()
    and public.are_friends(auth.uid(), target)                   -- (c) friends only
    and not public.is_blocked_between(auth.uid(), target)        -- a block stops everything
    and (
      public.profile_is_public(target)                           -- (a) public -> all communities
      or public.is_community_member(e.community_id, auth.uid())  -- (b) private -> shared communities only
    )
  order by c.name, e.rule_id;
$$;
revoke all on function public.get_friend_today_activity(uuid, date) from public, anon;
grant execute on function public.get_friend_today_activity(uuid, date) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. friends_active_today(for_date): which of MY accepted friends have any activity
--    TODAY that I'm allowed to see — drives the "active today" dot on the friends list.
--    Same visibility gate as above, returned as a set of user ids (no detail leaked).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.friends_active_today(for_date date)
returns table (user_id uuid)
language sql stable security definer set search_path = public
as $$
  select f.user_id
  from public.get_friends() f
  where not public.is_blocked_between(auth.uid(), f.user_id)
    and exists (
      select 1
      from public.community_entries e
      where e.user_id = f.user_id
        and e.entry_date = for_date
        and (
          public.profile_is_public(f.user_id)
          or public.is_community_member(e.community_id, auth.uid())
        )
    );
$$;
revoke all on function public.friends_active_today(date) from public, anon;
grant execute on function public.friends_active_today(date) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- VERIFY (optional, accounts A=viewer, B=target):
--   -- A & B accepted friends (friends.sql). Pass A's local date as for_date.
--   -- B PUBLIC:  select * from public.get_friend_today_activity('<B>', current_date);  -- all B's today entries
--   -- B PRIVATE, share community X: returns only B's rows in X; nothing from B's other communities.
--   -- B PRIVATE, share NO community: returns 0 rows (clean empty state).
--   -- A & B NOT friends: returns 0 rows even with a direct call.
--   -- Dot set:   select * from public.friends_active_today(current_date);
-- ───────────────────────────────────────────────────────────────────────────
