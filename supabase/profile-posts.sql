-- Pointwell — Profile posts (personal posts on your profile + your followers' feed).
--
-- A profile_post is a personal post (photo and/or caption) authored on your OWN profile,
-- independent of any community. It mirrors how community_entries carry feed posts, but its
-- visibility follows the PROFILE gate, not community membership:
--   • PUBLIC author  → readable by anyone, INCLUDING signed-out (the Discover feed).
--   • PRIVATE author → readable only by the author + APPROVED followers. In this app,
--     "approved follower of a private profile" == are_friends (the friend-request approval
--     flow) — exactly the gate profile-view.sql / can_view_profile already use. The public
--     `follows` table is the feed "Follow" and does NOT grant viewing (see profile-view.sql).
-- The anon key can NEVER read a private author's posts.
--
-- LIKES / COMMENTS — DESIGN CHOICE: PARALLEL tables, not a polymorphic target.
--   The existing entry_likes / entry_comments (feed-social.sql) FK to community_entries(id)
--   ON DELETE CASCADE, are PK'd on (entry_id, user_id), and their RLS + read RPCs
--   (can_see_entry / get_entries_social / get_entry_comments) are hard-wired to community
--   MEMBERSHIP and are authenticated-only. Generalizing them to a polymorphic
--   (target_type, target_id) would require DROPping those FKs/PKs and REWRITING the live RLS
--   + RPCs on tables that already hold production data — risky, and the visibility model is
--   fundamentally different (community membership vs profile visibility, and profile posts
--   additionally need ANON reads for public authors). So we add PARALLEL
--   profile_post_likes / profile_post_comments with the SAME shape; the client reuses the same
--   like/comment UI, just pointed at these tables (a future app diff). The existing community
--   likes/comments are left completely untouched and keep working.
--
-- Idempotent / safe to re-run: create-if-not-exists tables, drop-then-create policies,
-- create-or-replace functions, idempotent grants. Does NOT modify any existing .sql.
-- Depends on: profiles (signals.sql), auth.users, and the profile gate from profile-view.sql
--   (can_view_profile) + friends.sql (profile_is_public / are_friends) + messaging.sql
--   (is_blocked_between). Run AFTER #13 profile-view.sql.
--
-- WHAT YOU MUST DO: run this whole file in the Supabase SQL editor. Profile-post photos reuse
-- the EXISTING entry-photo storage bucket (no new bucket).

-- ───────────────────────────────────────────────────────────────────────────
-- 1. profile_posts — one row per personal post. A row needs a photo OR a message.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.profile_posts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  photo_path text,
  message    text,
  created_at timestamptz not null default now(),
  -- Lenient: just require at least one of photo/message to be present (app enforces non-empty).
  constraint profile_posts_has_content check (photo_path is not null or message is not null)
);
create index if not exists profile_posts_user_idx    on public.profile_posts (user_id, created_at desc);
create index if not exists profile_posts_created_idx  on public.profile_posts (created_at desc);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. profile_posts RLS — write own; read follow-gated. PUBLIC author → anyone (incl. anon);
--    PRIVATE author → author + approved followers (are_friends). Reuses the canonical gate.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.profile_posts enable row level security;

-- Authenticated read: the canonical gate (self OR public OR friends, never across a block).
drop policy if exists "profile_posts read authed" on public.profile_posts;
create policy "profile_posts read authed" on public.profile_posts
  for select to authenticated
  using (public.can_view_profile(user_id));

-- Signed-out (anon) read: PUBLIC authors only — for the Discover feed. Private authors stay
-- invisible to anon. profile_is_public is granted to anon at the bottom of this section.
drop policy if exists "profile_posts read public anon" on public.profile_posts;
create policy "profile_posts read public anon" on public.profile_posts
  for select to anon
  using (public.profile_is_public(user_id));

drop policy if exists "profile_posts insert own" on public.profile_posts;
create policy "profile_posts insert own" on public.profile_posts
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "profile_posts update own" on public.profile_posts;
create policy "profile_posts update own" on public.profile_posts
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "profile_posts delete own" on public.profile_posts;
create policy "profile_posts delete own" on public.profile_posts
  for delete to authenticated
  using (user_id = auth.uid());

-- Let the anon role EVALUATE the public-ness predicate used by the anon read policies. Safe:
-- profile_is_public(uid) only reports WHETHER a profile is public (non-sensitive) and is
-- SECURITY DEFINER, so it never exposes the profiles table to anon. ⚠ Re-running friends.sql
-- (#5) re-REVOKES anon on this function — re-run THIS migration afterward to restore anon reads.
grant execute on function public.profile_is_public(uuid) to anon;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Likes + comments on profile posts (parallel to entry_likes/entry_comments).
--    FK to profile_posts(id) — the stable surrogate uuid PK — cascade-delete with the post
--    (or its author). Same shape as the community tables so the UI can be reused as-is.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.profile_post_likes (
  post_id    uuid not null references public.profile_posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)            -- one like per user per post
);
create index if not exists profile_post_likes_post_idx on public.profile_post_likes (post_id);

create table if not exists public.profile_post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.profile_posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists profile_post_comments_post_idx on public.profile_post_comments (post_id, created_at);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Likes/comments RLS — read iff you can read the post; like/comment as yourself on a post
--    you can read; delete only your OWN row. The post-visibility check is inlined via EXISTS
--    (authenticated → can_view_profile; anon → profile_is_public), matching §2.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.profile_post_likes    enable row level security;
alter table public.profile_post_comments enable row level security;

drop policy if exists "pp_likes read authed" on public.profile_post_likes;
create policy "pp_likes read authed" on public.profile_post_likes
  for select to authenticated
  using (exists (select 1 from public.profile_posts pp where pp.id = post_id and public.can_view_profile(pp.user_id)));

drop policy if exists "pp_likes read public anon" on public.profile_post_likes;
create policy "pp_likes read public anon" on public.profile_post_likes
  for select to anon
  using (exists (select 1 from public.profile_posts pp where pp.id = post_id and public.profile_is_public(pp.user_id)));

drop policy if exists "pp_likes insert own visible" on public.profile_post_likes;
create policy "pp_likes insert own visible" on public.profile_post_likes
  for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.profile_posts pp where pp.id = post_id and public.can_view_profile(pp.user_id)));

drop policy if exists "pp_likes delete own" on public.profile_post_likes;
create policy "pp_likes delete own" on public.profile_post_likes
  for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "pp_comments read authed" on public.profile_post_comments;
create policy "pp_comments read authed" on public.profile_post_comments
  for select to authenticated
  using (exists (select 1 from public.profile_posts pp where pp.id = post_id and public.can_view_profile(pp.user_id)));

drop policy if exists "pp_comments read public anon" on public.profile_post_comments;
create policy "pp_comments read public anon" on public.profile_post_comments
  for select to anon
  using (exists (select 1 from public.profile_posts pp where pp.id = post_id and public.profile_is_public(pp.user_id)));

drop policy if exists "pp_comments insert own visible" on public.profile_post_comments;
create policy "pp_comments insert own visible" on public.profile_post_comments
  for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.profile_posts pp where pp.id = post_id and public.can_view_profile(pp.user_id)));

drop policy if exists "pp_comments delete own" on public.profile_post_comments;
create policy "pp_comments delete own" on public.profile_post_comments
  for delete to authenticated
  using (user_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Reads. profiles RLS is self-only, so batched counts + comment-author names need
--    SECURITY DEFINER functions that re-assert the post's visibility. can_view_profile
--    resolves to public-only for the anon role (auth.uid() is null → no self/friends), so a
--    single gate serves both signed-in and signed-out callers. Granted to anon + authenticated
--    so the SAME feed UI works signed-out on public posts. Mirrors feed-social.sql §4.
-- ───────────────────────────────────────────────────────────────────────────

-- Batch social state for a set of profile posts: counts, whether I liked it, last comment.
create or replace function public.get_profile_posts_social(pids uuid[])
returns table (
  post_id           uuid,
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
    pp.id,
    (select count(*) from public.profile_post_likes l    where l.post_id = pp.id),
    (select count(*) from public.profile_post_comments c where c.post_id = pp.id),
    exists (select 1 from public.profile_post_likes l where l.post_id = pp.id and l.user_id = auth.uid()),
    lc.name,
    lc.body
  from public.profile_posts pp
  left join lateral (
    select p.display_name as name, c.body
    from public.profile_post_comments c
    join public.profiles p on p.id = c.user_id
    where c.post_id = pp.id
    order by c.created_at desc
    limit 1
  ) lc on true
  where pp.id = any(pids)
    and public.can_view_profile(pp.user_id);
$$;
revoke all on function public.get_profile_posts_social(uuid[]) from public;
grant execute on function public.get_profile_posts_social(uuid[]) to anon, authenticated;

-- Full comment thread for one profile post, with each author's name/handle/avatar.
create or replace function public.get_profile_post_comments(pid uuid)
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
  from public.profile_post_comments c
  join public.profiles p on p.id = c.user_id
  join public.profile_posts pp on pp.id = c.post_id
  where c.post_id = pid
    and public.can_view_profile(pp.user_id)
  order by c.created_at;
$$;
revoke all on function public.get_profile_post_comments(uuid) from public;
grant execute on function public.get_profile_post_comments(uuid) to anon, authenticated;
