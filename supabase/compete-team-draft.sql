-- Pointwell — Compete: captains draft (a third way to form team-battle teams). Phase 1.
-- Run ONCE in the Supabase SQL editor, AFTER compete-contests.sql. Idempotent: safe to re-run.
-- Does NOT modify existing .sql.
--
-- Auto-draft (balanced snake) and Pick-myself (the creator assigns everyone) need NO SQL — they just
-- write contest_participants.team_id at creation. This file powers the CAPTAINS DRAFT: a live phase where
-- two captains take turns picking players. Because a pick is a shared, turn-based mutation, WHO may pick
-- and WHEN is enforced HERE (SECURITY DEFINER), never in the browser:
--   • the contest sits in status 'drafting'; the two captains are contest_participants with is_captain=true,
--     each already on their own team (seeded via contest_teams as usual);
--   • the remaining players are participants with team_id = NULL (the draft pool);
--   • draft_pick(contest, player): the CAPTAIN ON THE CLOCK (snake order) assigns an available pool player
--     to THEIR team. Server validates: drafting status, caller is a member + a captain, it's the caller's
--     turn, the player is unassigned. Sets seed = pick order; when the pool empties → status 'active'.
--   • draft_autopick(contest): once the per-pick clock (contests.draft_deadline) passes, ANY member may
--     flush a timeout pick (the top available player to the on-clock team) so an idle captain can't stall
--     the draft. Both functions lock the contest row so concurrent calls can't double-pick.
-- Reuses is_community_member (communities.sql). anon (null auth.uid()) is denied by every function.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Schema (additive)
-- ───────────────────────────────────────────────────────────────────────────
-- Allow the new 'drafting' status (idempotent constraint swap; 'scheduled' arrives in Phase 2).
alter table public.contests drop constraint if exists contests_status_check;
alter table public.contests add constraint contests_status_check
  check (status in ('pending', 'drafting', 'active', 'done'));

-- Which participants are captains (seed their own team + take draft turns).
alter table public.contest_participants add column if not exists is_captain boolean not null default false;

-- Per-pick clock: when it passes, a timeout auto-pick may be flushed by any member.
alter table public.contests add column if not exists draft_deadline timestamptz;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Snake helper — the team_id "on the clock" for the current pick (2 captains).
--    pick index = number of NON-captain players already assigned. Snake over the two captain teams,
--    ordered by their seed: pick 0→teamA, 1→teamB, 2→teamB, 3→teamA, 4→teamA, 5→teamB, …
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.contest_on_clock_team(p_contest uuid)
returns uuid language sql stable security definer set search_path = public as $$
  with caps as (
    select team_id, row_number() over (order by seed) - 1 as ord
    from public.contest_participants
    where contest_id = p_contest and is_captain and team_id is not null
  ),
  n as (
    select count(*) as assigned from public.contest_participants
    where contest_id = p_contest and not is_captain and team_id is not null
  )
  select c.team_id from caps c, n
  where c.ord = case when (n.assigned / 2) % 2 = 0 then n.assigned % 2 else 1 - (n.assigned % 2) end;
$$;
revoke all on function public.contest_on_clock_team(uuid) from public, anon;
grant execute on function public.contest_on_clock_team(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. draft_pick — the on-clock captain drafts an available player to their team.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.draft_pick(p_contest uuid, p_player uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_status text; v_community uuid; v_my_team uuid; v_on_clock uuid; v_assigned int; v_left int;
begin
  if v_caller is null then raise exception 'not signed in' using errcode = '42501'; end if;
  -- lock the contest row so concurrent picks serialize (no double-pick / seed clash)
  select status, community_id into v_status, v_community from public.contests where id = p_contest for update;
  if v_status is null then raise exception 'contest not found'; end if;
  if v_status <> 'drafting' then raise exception 'draft is not active'; end if;
  if not public.is_community_member(v_community, v_caller) then raise exception 'not a community member' using errcode = '42501'; end if;
  select team_id into v_my_team from public.contest_participants
    where contest_id = p_contest and user_id = v_caller and is_captain and team_id is not null;
  if v_my_team is null then raise exception 'only a captain can draft' using errcode = '42501'; end if;
  v_on_clock := public.contest_on_clock_team(p_contest);
  if v_on_clock is null or v_on_clock <> v_my_team then raise exception 'not your turn' using errcode = '42501'; end if;
  select count(*) into v_assigned from public.contest_participants
    where contest_id = p_contest and not is_captain and team_id is not null;
  update public.contest_participants set team_id = v_my_team, seed = 2 + v_assigned
    where contest_id = p_contest and user_id = p_player and not is_captain and team_id is null;
  if not found then raise exception 'player not available'; end if;
  select count(*) into v_left from public.contest_participants where contest_id = p_contest and team_id is null;
  if v_left = 0 then
    update public.contests set status = 'active', draft_deadline = null where id = p_contest;
    return 'active';
  end if;
  update public.contests set draft_deadline = now() + interval '45 seconds' where id = p_contest;
  return 'drafting';
end $$;
revoke all on function public.draft_pick(uuid, uuid) from public, anon;
grant execute on function public.draft_pick(uuid, uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. draft_autopick — any member may flush a TIMEOUT pick once draft_deadline passes (the top available
--    player, by name, to the on-clock team). Keeps a live draft moving if the on-clock captain is idle.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.draft_autopick(p_contest uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_caller uuid := auth.uid();
  v_status text; v_community uuid; v_deadline timestamptz; v_on_clock uuid; v_player uuid; v_assigned int; v_left int;
begin
  if v_caller is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select status, community_id, draft_deadline into v_status, v_community, v_deadline
    from public.contests where id = p_contest for update;
  if v_status is null then raise exception 'contest not found'; end if;
  if not public.is_community_member(v_community, v_caller) then raise exception 'not a community member' using errcode = '42501'; end if;
  if v_status <> 'drafting' then return v_status; end if;                 -- nothing to do
  if v_deadline is null or now() < v_deadline then return 'drafting'; end if; -- clock not up → no-op
  v_on_clock := public.contest_on_clock_team(p_contest);
  if v_on_clock is null then return 'drafting'; end if;
  select cp.user_id into v_player
    from public.contest_participants cp
    left join public.profiles pr on pr.id = cp.user_id
    where cp.contest_id = p_contest and not cp.is_captain and cp.team_id is null
    order by coalesce(pr.display_name, cp.user_id::text) asc
    limit 1;
  if v_player is null then return 'drafting'; end if;
  select count(*) into v_assigned from public.contest_participants
    where contest_id = p_contest and not is_captain and team_id is not null;
  update public.contest_participants set team_id = v_on_clock, seed = 2 + v_assigned
    where contest_id = p_contest and user_id = v_player and team_id is null;
  if not found then return 'drafting'; end if;                            -- someone else just picked
  select count(*) into v_left from public.contest_participants where contest_id = p_contest and team_id is null;
  if v_left = 0 then
    update public.contests set status = 'active', draft_deadline = null where id = p_contest;
    return 'active';
  end if;
  update public.contests set draft_deadline = now() + interval '45 seconds' where id = p_contest;
  return 'drafting';
end $$;
revoke all on function public.draft_autopick(uuid) from public, anon;
grant execute on function public.draft_autopick(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- VERIFY (run after applying):
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conname='contests_status_check';
--     -- expect the CHECK to include 'drafting'.
--   select column_name from information_schema.columns
--    where table_name='contest_participants' and column_name='is_captain';   -- expect 1 row.
--   select proname from pg_proc where proname in ('draft_pick','draft_autopick','contest_on_clock_team'); -- 3 rows.
-- ───────────────────────────────────────────────────────────────────────────
