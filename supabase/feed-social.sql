-- Pointwell — Feed social (likes + comments on community feed entries).
-- The activity feed is built from public.community_entries (one row per
-- community/user/rule/day). This adds Instagram-style likes + comments on those
-- entries, with RLS so a user may only like/comment on entries they can SEE — i.e.
-- entries in a community they belong to — read only those, and delete only their own.
--
-- Safe to re-run (idempotent): create-if-not-exists tables, drop-then-create policies,
-- create-or-replace functions.
--
-- WHAT YOU MUST DO: run this whole file in the Supabase SQL editor (or via the CLI).
-- It depends on public.community_entries + public.is_community_member (communities.sql)
-- and public.profiles (signals.sql / profile-pictures.sql).

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Tables. Both FK to community_entries(id) — the stable surrogate uuid PK — and
--    cascade-delete with the entry (or its community/owner). Never FK to the natural
--    (community_id,user_id,rule_id,entry_date) key.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.entry_likes (
  entry_id   uuid not null references public.community_entries(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, user_id)          -- one like per user per entry (also the uniqueness)
);
create index if not exists entry_likes_entry_idx on public.entry_likes (entry_id);

create table if not exists public.entry_comments (
  id         uuid primary key default gen_random_uuid(),
  entry_id   uuid not null references public.community_entries(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists entry_comments_entry_idx on public.entry_comments (entry_id, created_at);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Visibility helper (SECURITY DEFINER) — "can the caller see this entry?" = is a
--    member of the entry's community. Definer so the membership lookup bypasses
--    community_entries' own RLS (no recursion), mirroring is_community_member.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.can_see_entry(eid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.community_entries e
    where e.id = eid and public.is_community_member(e.community_id, auth.uid())
  );
$$;
revoke all on function public.can_see_entry(uuid) from public, anon;
grant execute on function public.can_see_entry(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RLS. Read likes/comments only on entries you can see; like/comment only on
--    those entries and only as yourself; delete only your own rows.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.entry_likes enable row level security;
alter table public.entry_comments enable row level security;

drop policy if exists "likes read visible" on public.entry_likes;
create policy "likes read visible" on public.entry_likes
  for select using (public.can_see_entry(entry_id));

drop policy if exists "likes insert own visible" on public.entry_likes;
create policy "likes insert own visible" on public.entry_likes
  for insert with check (user_id = auth.uid() and public.can_see_entry(entry_id));

drop policy if exists "likes delete own" on public.entry_likes;
create policy "likes delete own" on public.entry_likes
  for delete using (user_id = auth.uid());

drop policy if exists "comments read visible" on public.entry_comments;
create policy "comments read visible" on public.entry_comments
  for select using (public.can_see_entry(entry_id));

drop policy if exists "comments insert own visible" on public.entry_comments;
create policy "comments insert own visible" on public.entry_comments
  for insert with check (user_id = auth.uid() and public.can_see_entry(entry_id));

drop policy if exists "comments delete own" on public.entry_comments;
create policy "comments delete own" on public.entry_comments
  for delete using (user_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Reads. profiles RLS is self-only, so listing a comment's author name/avatar (and
--    batching counts) needs SECURITY DEFINER functions that re-assert membership.
-- ───────────────────────────────────────────────────────────────────────────

-- Batch social state for a set of feed entries: like/comment counts, whether I liked
-- it, and a preview of the most-recent comment (name + body). One call per feed render.
create or replace function public.get_entries_social(eids uuid[])
returns table (
  entry_id          uuid,
  like_count        bigint,
  comment_count     bigint,
  liked_by_me       boolean,
  last_comment_name text,
  last_comment_body text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    (select count(*) from public.entry_likes l where l.entry_id = e.id),
    (select count(*) from public.entry_comments c where c.entry_id = e.id),
    exists (select 1 from public.entry_likes l where l.entry_id = e.id and l.user_id = auth.uid()),
    lc.name,
    lc.body
  from public.community_entries e
  left join lateral (
    select p.display_name as name, c.body
    from public.entry_comments c
    join public.profiles p on p.id = c.user_id
    where c.entry_id = e.id
    order by c.created_at desc
    limit 1
  ) lc on true
  where e.id = any(eids)
    and public.is_community_member(e.community_id, auth.uid());
$$;
revoke all on function public.get_entries_social(uuid[]) from public, anon;
grant execute on function public.get_entries_social(uuid[]) to authenticated;

-- Full comment thread for one entry, with each author's name/handle/avatar.
create or replace function public.get_entry_comments(eid uuid)
returns table (
  id           uuid,
  user_id      uuid,
  body         text,
  created_at   timestamptz,
  display_name text,
  handle       text,
  avatar_url   text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.user_id, c.body, c.created_at, p.display_name, p.handle, p.avatar_url
  from public.entry_comments c
  join public.profiles p on p.id = c.user_id
  join public.community_entries e on e.id = c.entry_id
  where c.entry_id = eid
    and public.is_community_member(e.community_id, auth.uid())
  order by c.created_at;
$$;
revoke all on function public.get_entry_comments(uuid) from public, anon;
grant execute on function public.get_entry_comments(uuid) to authenticated;
