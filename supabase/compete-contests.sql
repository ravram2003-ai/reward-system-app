-- Pointwell — Compete: generalized contests (Phase 2: TEAM battles; Phase 3 adds tournaments).
-- Run ONCE in the Supabase SQL editor. Idempotent: safe to re-run. Does NOT modify existing .sql.
--
-- KEY SAFETY: a contest is shared across a community's members. WHO may read / create / manage it is
-- enforced HERE (RLS), never in the browser — the anon key can query directly, so the rules live in
-- Postgres. Mirrors challenges.sql (is_community_member / is_community_owner, both SECURITY DEFINER,
-- granted to `authenticated` only → the anon role, with a null auth.uid(), is denied by every policy).
--
-- SCORES ARE NOT STORED: each team's score is computed in the app by summing its members'
-- community_entries over the contest window (start_at..end_at). Only structure + status are persisted.
-- 1v1 duels keep using `challenges`; the Compete hub shows both uniformly.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.contests (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  creator_user uuid not null references auth.users(id) on delete cascade,
  format       text not null check (format in ('tournament', 'team')),
  metric       text not null default 'points',                 -- 'points' or a rule id
  scoring_mode text not null default 'total'
                 check (scoring_mode in ('total', 'avg_active')), -- avg_active = avg over members who logged
  start_at     timestamptz,                                     -- scoring window (set on create/start)
  end_at       timestamptz,
  status       text not null default 'pending'
                 check (status in ('pending', 'active', 'done')),
  created_at   timestamptz not null default now()
);
create index if not exists contests_community_idx on public.contests (community_id, created_at desc);
create index if not exists contests_creator_idx   on public.contests (creator_user);

create table if not exists public.contest_teams (
  id         uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  name       text not null,
  color      text
);
create index if not exists contest_teams_contest_idx on public.contest_teams (contest_id);

create table if not exists public.contest_participants (
  id         uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  team_id    uuid references public.contest_teams(id) on delete set null,
  seed       int,                                               -- tournament seed (Phase 3)
  eliminated boolean not null default false,
  unique (contest_id, user_id)                                  -- one row per (contest, member)
);
create index if not exists contest_participants_contest_idx on public.contest_participants (contest_id);
create index if not exists contest_participants_user_idx    on public.contest_participants (user_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Visibility helpers (SECURITY DEFINER — resolve a child row's contest → community without
--    recursing through RLS). Granted to authenticated only; anon (null auth.uid()) gets false.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.can_read_contest(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.contests c
    where c.id = p_id and public.is_community_member(c.community_id, auth.uid())
  );
$$;
revoke all on function public.can_read_contest(uuid) from public, anon;
grant execute on function public.can_read_contest(uuid) to authenticated;

create or replace function public.can_manage_contest(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.contests c
    where c.id = p_id
      and (c.creator_user = auth.uid() or public.is_community_owner(c.community_id, auth.uid()))
  );
$$;
revoke all on function public.can_manage_contest(uuid) from public, anon;
grant execute on function public.can_manage_contest(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RLS — contests. anon has no auth.uid(), so every policy denies it.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.contests enable row level security;

-- READ: any member of the contest's community can see it.
drop policy if exists "contests read members" on public.contests;
create policy "contests read members" on public.contests
  for select using (public.is_community_member(community_id, auth.uid()));

-- CREATE: a member starts a contest in a community they belong to, only as themselves.
drop policy if exists "contests insert by member" on public.contests;
create policy "contests insert by member" on public.contests
  for insert with check (
    creator_user = auth.uid() and public.is_community_member(community_id, auth.uid())
  );

-- MANAGE (status/window edits): the creator or the community owner.
drop policy if exists "contests update by manager" on public.contests;
create policy "contests update by manager" on public.contests
  for update
  using (creator_user = auth.uid() or public.is_community_owner(community_id, auth.uid()))
  with check (creator_user = auth.uid() or public.is_community_owner(community_id, auth.uid()));

-- CANCEL: the creator or owner may delete it (cascades teams + participants).
drop policy if exists "contests delete by manager" on public.contests;
create policy "contests delete by manager" on public.contests
  for delete using (creator_user = auth.uid() or public.is_community_owner(community_id, auth.uid()));

-- ───────────────────────────────────────────────────────────────────────────
-- 4. RLS — contest_teams (read follows the contest; write = creator/owner).
-- ───────────────────────────────────────────────────────────────────────────
alter table public.contest_teams enable row level security;

drop policy if exists "teams read members" on public.contest_teams;
create policy "teams read members" on public.contest_teams
  for select using (public.can_read_contest(contest_id));

drop policy if exists "teams insert by manager" on public.contest_teams;
create policy "teams insert by manager" on public.contest_teams
  for insert with check (public.can_manage_contest(contest_id));

drop policy if exists "teams update by manager" on public.contest_teams;
create policy "teams update by manager" on public.contest_teams
  for update using (public.can_manage_contest(contest_id)) with check (public.can_manage_contest(contest_id));

drop policy if exists "teams delete by manager" on public.contest_teams;
create policy "teams delete by manager" on public.contest_teams
  for delete using (public.can_manage_contest(contest_id));

-- ───────────────────────────────────────────────────────────────────────────
-- 5. RLS — contest_participants (read follows the contest; write = creator/owner, and an inserted
--    participant must be a MEMBER of the contest's community — only members can be participants).
-- ───────────────────────────────────────────────────────────────────────────
alter table public.contest_participants enable row level security;

drop policy if exists "participants read members" on public.contest_participants;
create policy "participants read members" on public.contest_participants
  for select using (public.can_read_contest(contest_id));

drop policy if exists "participants insert by manager" on public.contest_participants;
create policy "participants insert by manager" on public.contest_participants
  for insert with check (
    public.can_manage_contest(contest_id)
    and exists (
      select 1 from public.contests c
      where c.id = contest_id and public.is_community_member(c.community_id, user_id)
    )
  );

drop policy if exists "participants update by manager" on public.contest_participants;
create policy "participants update by manager" on public.contest_participants
  for update using (public.can_manage_contest(contest_id)) with check (public.can_manage_contest(contest_id));

drop policy if exists "participants delete by manager" on public.contest_participants;
create policy "participants delete by manager" on public.contest_participants
  for delete using (public.can_manage_contest(contest_id));

-- ───────────────────────────────────────────────────────────────────────────
-- VERIFY (run after applying):
--   select policyname, cmd from pg_policies where schemaname='public'
--    and tablename in ('contests','contest_teams','contest_participants') order by tablename, cmd;
--   -- expect contests: 1 SELECT/1 INSERT/1 UPDATE/1 DELETE; teams + participants: 1 of each.
--   -- anon check (signed-out): select * from contests;  -> 0 rows.
-- ───────────────────────────────────────────────────────────────────────────
