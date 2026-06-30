-- Pointwell — Compete Phase 3: single-elimination TOURNAMENT matches.
-- Run ONCE in the Supabase SQL editor, AFTER compete-contests.sql. Idempotent: safe to re-run.
-- Does NOT modify existing .sql.
--
-- KEY SAFETY: a match is shared across a community's members. Same rules as contests (RLS, not the
-- browser): any community MEMBER reads it; the contest's CREATOR or the community OWNER manages it.
-- Reuses the can_read_contest / can_manage_contest SECURITY DEFINER helpers from compete-contests.sql,
-- so anon (null auth.uid()) is denied by every policy.
--
-- SCORES: each round has its own window (window_start..window_end). When a round's clock ends, the app
-- computes both players' scores from community_entries over that window and persists a_score/b_score/
-- winner_user here (owner/creator write), then advances the winner into the next round's match.

create table if not exists public.contest_matches (
  id           uuid primary key default gen_random_uuid(),
  contest_id   uuid not null references public.contests(id) on delete cascade,
  round        int  not null,                              -- 1 = first round
  slot         int  not null,                              -- position within the round (0-based)
  a_user       uuid references auth.users(id) on delete set null,  -- null = empty/bye seat
  b_user       uuid references auth.users(id) on delete set null,
  a_score      numeric,
  b_score      numeric,
  winner_user  uuid references auth.users(id) on delete set null,
  window_start timestamptz,
  window_end   timestamptz,
  status       text not null default 'pending'
                 check (status in ('pending', 'active', 'done')),
  created_at   timestamptz not null default now(),
  unique (contest_id, round, slot)                          -- one match per (contest, round, slot)
);
create index if not exists contest_matches_contest_idx on public.contest_matches (contest_id, round, slot);

-- ───────────────────────────────────────────────────────────────────────────
-- RLS — read = any community member (can_read_contest); write = creator/owner (can_manage_contest).
-- anon has no auth.uid(), so every policy denies it.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.contest_matches enable row level security;

drop policy if exists "matches read members" on public.contest_matches;
create policy "matches read members" on public.contest_matches
  for select using (public.can_read_contest(contest_id));

drop policy if exists "matches insert by manager" on public.contest_matches;
create policy "matches insert by manager" on public.contest_matches
  for insert with check (public.can_manage_contest(contest_id));

drop policy if exists "matches update by manager" on public.contest_matches;
create policy "matches update by manager" on public.contest_matches
  for update using (public.can_manage_contest(contest_id)) with check (public.can_manage_contest(contest_id));

drop policy if exists "matches delete by manager" on public.contest_matches;
create policy "matches delete by manager" on public.contest_matches
  for delete using (public.can_manage_contest(contest_id));

-- ───────────────────────────────────────────────────────────────────────────
-- VERIFY (run after applying):
--   select policyname, cmd from pg_policies where schemaname='public'
--    and tablename='contest_matches' order by cmd;   -- expect 1 SELECT / 1 INSERT / 1 UPDATE / 1 DELETE
--   -- anon check (signed-out): select * from contest_matches;  -> 0 rows.
-- ───────────────────────────────────────────────────────────────────────────
