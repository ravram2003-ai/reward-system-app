-- Pointwell — Head-to-head (1v1) community challenges.
-- Run ONCE in the Supabase SQL editor. Idempotent: safe to re-run.
--
-- KEY SAFETY: a challenge is ONE shared row between two members of a community. Who can
-- create / see / accept / finalize a challenge is enforced HERE (RLS), never in the browser
-- — the anon key can query directly, so the rules live in Postgres. Mirrors the community_entries
-- RLS patterns (member-gated writes via the SECURITY DEFINER is_community_member helper).
--
-- SCORES ARE NOT STORED: each side's score is computed in the app from community_entries over the
-- challenge window (start_at..end_at). Only the outcome (winner_user / forfeit / status) is persisted.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Owner helper (SECURITY DEFINER) — lets a policy ask "is the caller this
--    community's owner?" without re-triggering RLS on communities. Mirrors
--    is_community_member (communities.sql).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.is_community_owner(cid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.communities c
    where c.id = cid and c.owner_user = uid
  );
$$;
revoke all on function public.is_community_owner(uuid, uuid) from public, anon;
grant execute on function public.is_community_owner(uuid, uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Table
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.challenges (
  id              uuid primary key default gen_random_uuid(),
  community_id    uuid not null references public.communities(id) on delete cascade,
  challenger_user uuid not null references auth.users(id) on delete cascade,
  opponent_user   uuid not null references auth.users(id) on delete cascade,
  metric          text not null default 'points',           -- 'points' or a rule id/label
  duration        text,                                       -- optional human label, e.g. '7 days'
  start_at        timestamptz,                                -- scoring window start (set on accept)
  end_at          timestamptz,                                -- scoring window end
  status          text not null default 'pending'
                    check (status in ('pending', 'active', 'declined', 'done')),
  winner_user     uuid references auth.users(id) on delete set null,
  forfeit         text,                                       -- note when a side forfeits, else null
  created_at      timestamptz not null default now(),
  constraint challenges_distinct_users check (challenger_user <> opponent_user)
);
create index if not exists challenges_community_idx on public.challenges (community_id);
create index if not exists challenges_challenger_idx on public.challenges (challenger_user);
create index if not exists challenges_opponent_idx on public.challenges (opponent_user);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RLS — one plain-English line per policy. anon has no auth.uid(), so every
--    policy below denies it (no anon read or write).
-- ───────────────────────────────────────────────────────────────────────────
alter table public.challenges enable row level security;

-- CREATE: a member may start a challenge in a community they belong to, only as themselves.
drop policy if exists "challenges insert as challenger member" on public.challenges;
create policy "challenges insert as challenger member" on public.challenges
  for insert
  with check (
    challenger_user = auth.uid()
    and public.is_community_member(community_id, auth.uid())
  );

-- READ: the two participants see their own challenges; the community owner can see them too
-- (needed to finalize / manage). No other member or the anon key can read them.
drop policy if exists "challenges read participants or owner" on public.challenges;
create policy "challenges read participants or owner" on public.challenges
  for select
  using (
    challenger_user = auth.uid()
    or opponent_user = auth.uid()
    or public.is_community_owner(community_id, auth.uid())
  );

-- ACCEPT / DECLINE: only the OPPONENT, and only while it's still pending, may move it to
-- 'active' or 'declined'. They cannot set a winner here (finalizing is the owner's job).
drop policy if exists "challenges accept or decline by opponent" on public.challenges;
create policy "challenges accept or decline by opponent" on public.challenges
  for update
  using (opponent_user = auth.uid() and status = 'pending')
  with check (
    opponent_user = auth.uid()
    and status in ('active', 'declined')
    and winner_user is null
  );

-- FINALIZE: the community OWNER records the outcome (status -> 'done', winner_user / forfeit).
-- The service-role key (server/edge function) bypasses RLS and can also finalize.
drop policy if exists "challenges finalize by owner" on public.challenges;
create policy "challenges finalize by owner" on public.challenges
  for update
  using (public.is_community_owner(community_id, auth.uid()))
  with check (public.is_community_owner(community_id, auth.uid()));

-- (No DELETE policy → with RLS on, nobody can delete a challenge; they end as 'done'/'declined'.)

-- ───────────────────────────────────────────────────────────────────────────
-- VERIFY (run after applying):
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema = 'public' and table_name = 'challenges' order by ordinal_position;
--   select policyname, cmd, qual, with_check from pg_policies
--    where schemaname = 'public' and tablename = 'challenges' order by cmd, policyname;
--   -- expect 4 policies: 1 INSERT, 1 SELECT, 2 UPDATE.
-- ───────────────────────────────────────────────────────────────────────────
