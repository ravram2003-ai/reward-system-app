-- Pointwell — Real shared communities + membership.
-- Run ONCE in the Supabase SQL editor. Idempotent: safe to re-run.
--
-- KEY SAFETY: a community is ONE shared row; membership is a real relationship
-- table; every access rule is enforced HERE (RLS), not in the browser. The anon
-- key lets anyone query directly, so "who can read / who can join" lives in
-- Postgres. Membership-gated reads use a SECURITY DEFINER helper to avoid the
-- self-referential-RLS recursion that a membership table otherwise triggers.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.communities (
  id          uuid primary key default gen_random_uuid(),
  owner_user  uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  category    text,
  description text,
  visibility  text not null default 'private' check (visibility in ('public', 'private')),
  invite_code text not null unique,
  system      jsonb not null default '{}'::jsonb,  -- scoring rules, so all members score the same
  created_at  timestamptz not null default now()
);

create table if not exists public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'member')),
  joined_at    timestamptz not null default now(),
  primary key (community_id, user_id)
);
create index if not exists community_members_user_idx on public.community_members (user_id);

-- Shared check-in values so the leaderboard is the SAME for every member.
create table if not exists public.community_entries (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  rule_id      text not null,
  amount       numeric not null default 0,
  entry_date   date not null,
  updated_at   timestamptz not null default now(),
  unique (community_id, user_id, rule_id, entry_date)
);
create index if not exists community_entries_community_idx on public.community_entries (community_id, entry_date);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Membership helper (SECURITY DEFINER) — used by the read policies below so a
--    policy ON community_members can ask "is the caller a member?" WITHOUT
--    re-triggering RLS on community_members (which would recurse infinitely).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.is_community_member(cid uuid, uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.community_members m
    where m.community_id = cid and m.user_id = uid
  );
$$;
revoke all on function public.is_community_member(uuid, uuid) from public, anon;
grant execute on function public.is_community_member(uuid, uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RLS — one plain-English line per policy.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.community_entries enable row level security;

-- communities: you can READ a community you belong to (or that you own).
drop policy if exists "communities read for members" on public.communities;
create policy "communities read for members" on public.communities
  for select using (owner_user = auth.uid() or public.is_community_member(id, auth.uid()));

-- communities: you can CREATE a community only as its owner (yourself).
drop policy if exists "communities insert as owner" on public.communities;
create policy "communities insert as owner" on public.communities
  for insert with check (owner_user = auth.uid());

-- communities: only the owner can EDIT the community.
drop policy if exists "communities update by owner" on public.communities;
create policy "communities update by owner" on public.communities
  for update using (owner_user = auth.uid()) with check (owner_user = auth.uid());

-- community_members: you can SEE the members of any community you belong to.
drop policy if exists "members read in my communities" on public.community_members;
create policy "members read in my communities" on public.community_members
  for select using (public.is_community_member(community_id, auth.uid()));

-- community_members: you can ADD only YOURSELF (join) — never anyone else.
drop policy if exists "members join as self" on public.community_members;
create policy "members join as self" on public.community_members
  for insert with check (user_id = auth.uid());

-- community_members: you can REMOVE only yourself (leave).
drop policy if exists "members leave self" on public.community_members;
create policy "members leave self" on public.community_members
  for delete using (user_id = auth.uid());

-- community_entries: you can READ entries for communities you belong to.
drop policy if exists "entries read in my communities" on public.community_entries;
create policy "entries read in my communities" on public.community_entries
  for select using (public.is_community_member(community_id, auth.uid()));

-- community_entries: you can WRITE only YOUR OWN entries, only in a community you joined.
drop policy if exists "entries upsert own" on public.community_entries;
create policy "entries upsert own" on public.community_entries
  for insert with check (user_id = auth.uid() and public.is_community_member(community_id, auth.uid()));
drop policy if exists "entries update own" on public.community_entries;
create policy "entries update own" on public.community_entries
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────────────
-- 4. find_community_by_code — lets someone who is NOT yet a member look up a
--    community by its invite code so they can join. SECURITY DEFINER returns only
--    safe, public-facing fields (never another community's private internals
--    beyond what an invitee needs). Returns 0 rows for an unknown code.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.find_community_by_code(code text)
returns table (id uuid, name text, category text, description text, member_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.category, c.description,
         (select count(*) from public.community_members m where m.community_id = c.id) as member_count
  from public.communities c
  where upper(btrim(c.invite_code)) = upper(btrim(code))
  limit 1;
$$;
revoke all on function public.find_community_by_code(text) from public, anon;
grant execute on function public.find_community_by_code(text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. get_community_members — list a community's members WITH their names. Profiles
--    RLS is self-read-only, so members can't read each other's profile rows
--    directly; this SECURITY DEFINER function returns names ONLY to a caller who is
--    already a member of that community.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.get_community_members(cid uuid)
returns table (user_id uuid, display_name text, handle text, role text, joined_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, p.display_name, p.handle, m.role, m.joined_at
  from public.community_members m
  join public.profiles p on p.id = m.user_id
  where m.community_id = cid
    and public.is_community_member(cid, auth.uid())
  order by m.joined_at;
$$;
revoke all on function public.get_community_members(uuid) from public, anon;
grant execute on function public.get_community_members(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- VERIFY (optional, two real accounts A and B):
--   -- A creates a community (done via the app). Note its invite_code, e.g. GEN-703.
--   -- As B, look it up:  select * from public.find_community_by_code('GEN-703');
--   -- As B, join:        insert into public.community_members (community_id, user_id)
--   --                    values ('<community id>', auth.uid());
--   -- Now BOTH see 2 rows: select * from public.community_members where community_id = '<id>';
-- ───────────────────────────────────────────────────────────────────────────
