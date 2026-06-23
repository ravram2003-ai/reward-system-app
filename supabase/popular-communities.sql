-- Pointwell — popular_communities(): the onboarding "Communities to join" discovery
-- fallback. Run ONCE in the Supabase SQL editor, AFTER community-discovery.sql.
-- Idempotent (create or replace). Does NOT modify any existing .sql.
--
-- WHY THIS FILE EXISTS: popular_communities is also defined in community-discovery.sql,
-- but the live database was built from an earlier apply of that file that predates its §3b
-- block — so production has search_communities + join_requests yet NOT popular_communities.
-- The client (outputs/signals.js → sb.rpc("popular_communities", { lim })) therefore errors
-- on every call, and onboarding's "Communities to join" fallback silently renders empty.
-- This recreates the function standalone, with the SAME row shape (and column types/order)
-- as search_communities, so the existing onboarding renderer (onboardingCommunityRow) and
-- the addRow visibility/membership filter keep working unchanged.
--
-- KEY SAFETY (enforced in the DB, never the UI):
--   • PUBLIC communities ONLY. 'private' and 'request_to_join' are filtered out at the DB
--     level and are NEVER returned — onboarding's "Join" does an instant member-join, which
--     is valid only for public communities. (search_communities also returns
--     request_to_join; popular does NOT, by design — see community-discovery.sql §3b: a
--     non-joinable row would waste the lim budget and under-fill the section.)
--   • SECURITY DEFINER + a pinned search_path so the member-count subquery and per-caller
--     membership/request status resolve regardless of the caller's RLS, with no search_path
--     hijack. READ-ONLY: it only SELECTs — it never writes.
--   • Returns only non-sensitive discovery fields of PUBLIC communities (id / name /
--     category / description / visibility / member_count) plus the CALLER'S OWN
--     is_member / request_status. No private data is exposed, so it is safe to grant anon
--     (signed-out discovery during onboarding). For anon, auth.uid() is NULL → is_member is
--     false and request_status is null.
--   • lim is clamped to [1, 50] so a caller can't ask for an unbounded scan.
--
-- Depends on: communities.sql (communities, community_members, is_community_member),
-- community-discovery.sql (join_requests).

create or replace function public.popular_communities(lim integer default 12)
returns table (
  id uuid,
  name text,
  category text,
  description text,
  visibility text,
  member_count bigint,
  is_member boolean,
  request_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.category, c.description, c.visibility,
         (select count(*) from public.community_members m where m.community_id = c.id) as member_count,
         public.is_community_member(c.id, auth.uid()) as is_member,
         (select jr.status from public.join_requests jr
           where jr.community_id = c.id and jr.requester_user = auth.uid()
           order by jr.created_at desc limit 1) as request_status
  from public.communities c
  where c.visibility = 'public'
  order by member_count desc, c.created_at desc
  limit greatest(1, least(coalesce(lim, 12), 50));
$$;

-- Used during onboarding, possibly before any community membership → grant anon too.
-- Revoke the implicit PUBLIC grant first, then grant only the two app roles (least privilege).
revoke all on function public.popular_communities(integer) from public;
grant execute on function public.popular_communities(integer) to anon, authenticated;

-- ⚠ RE-RUN ORDER: community-discovery.sql §3b also defines this same function but grants
-- EXECUTE to authenticated ONLY (it revokes anon). Both files create-or-replace the same
-- object, so the LAST one run wins the grant. If you ever re-run community-discovery.sql
-- after this file, it will silently revoke anon and signed-out onboarding discovery breaks
-- again — re-run THIS file afterward to restore the anon grant. (We can't reconcile the two
-- in community-discovery.sql: the house rule forbids modifying an existing .sql.)

-- ───────────────────────────────────────────────────────────────────────────
-- VERIFY (after running):
--   -- 1) Function now exists:
--   select 1 from pg_proc where proname = 'popular_communities'
--     and pronamespace = 'public'::regnamespace;                              -- 1 row
--   -- 2) Returns PUBLIC communities ranked by member count (THE BOYS is the only public one):
--   select id, name, visibility, member_count from public.popular_communities(12);
--   --                                              -- THE BOYS, visibility 'public', 5 members
--   -- 3) Private / request_to_join NEVER appear:
--   select count(*) from public.popular_communities(50) where visibility <> 'public';  -- 0
-- ───────────────────────────────────────────────────────────────────────────
