-- Pointwell — Post-first feed: ONE post fans out to many feeds (Phase 1: schema + RLS).
--
-- "Logging IS posting." A post = caption + photo + the activity the AI parsed, published to any mix
-- of the author's PROFILE and the COMMUNITIES whose rules it matches. ONE post object, many feeds;
-- likes/comments live on the POST so the thread is shared wherever it appears. Per-rule scoring stays
-- in community_entries (leaderboards still sum those) — now optionally LINKED to their post.
--
--   posts          — one row per published post (caption/photo/activity/is_shared).
--   post_targets   — which feeds it goes to (profile = author id, or a community id) + per-target points.
--   post_likes     — like on the POST (shared across every feed it appears in).
--   post_comments  — comment on the POST (shared thread).
--   community_entries.post_id (nullable) — links the per-rule scoring rows to their social post.
--
-- VISIBILITY (enforced in the DB; the anon key must NEVER read a private/community post):
--   • A post is visible to the AUTHOR always; otherwise only when it's SHARED and has a target the
--     viewer may see — a COMMUNITY target they're a member of, OR a PROFILE target they may view
--     (public / self / approved-follower, via the existing can_view_profile gate).
--   • ANON (signed-out, for Discover) may read a SHARED post ONLY through a PUBLIC profile target —
--     never a community target (those need membership) and never a private/unshared post.
--   This reuses the helpers + the anon-grant pattern from profile-posts.sql (#24).
--
-- Idempotent / safe to re-run (create-if-not-exists, add-column-if-not-exists, drop-then-create
-- policies, create-or-replace functions). Does NOT modify any existing .sql.
-- Depends on: communities.sql (is_community_member), profile-view.sql (can_view_profile),
--   friends.sql (profile_is_public / are_friends), community_entries, auth.users, profiles.
--
-- WHAT YOU MUST DO: run this whole file in the Supabase SQL editor. Post photos reuse the EXISTING
-- entry-photo storage bucket (no new bucket).

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Tables
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  author_user uuid not null references auth.users(id) on delete cascade,
  caption     text,
  photo_path  text,
  activity    jsonb not null default '[]'::jsonb,   -- [{ ruleLabel, emoji, amount, unit }]
  is_shared   boolean not null default true,        -- false = "just log it": counts, appears in no feed
  created_at  timestamptz not null default now(),
  constraint posts_has_content check (caption is not null or photo_path is not null or activity <> '[]'::jsonb)
);
create index if not exists posts_author_idx  on public.posts (author_user, created_at desc);
create index if not exists posts_created_idx on public.posts (created_at desc);

create table if not exists public.post_targets (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  target_type text not null check (target_type in ('profile', 'community')),
  target_id   uuid not null,                        -- a community id, or the author's user id for 'profile'
  points      numeric not null default 0,           -- per-target point rollup (community = sum of its matched rules)
  created_at  timestamptz not null default now(),
  unique (post_id, target_type, target_id)          -- one row per (post, feed)
);
create index if not exists post_targets_post_idx   on public.post_targets (post_id);
create index if not exists post_targets_target_idx on public.post_targets (target_type, target_id, created_at desc);

create table if not exists public.post_likes (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)                    -- one like per user per post
);
create index if not exists post_likes_post_idx on public.post_likes (post_id);

create table if not exists public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);

-- Link the per-rule scoring rows to their social post. Nullable → existing entries + the leaderboard
-- sum are unchanged. ON DELETE CASCADE so deleting a post removes the points it logged (per spec).
alter table public.community_entries add column if not exists post_id uuid references public.posts(id) on delete cascade;
create index if not exists community_entries_post_idx on public.community_entries (post_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Visibility helpers (SECURITY DEFINER — read posts/targets without recursing through RLS).
-- ───────────────────────────────────────────────────────────────────────────
-- Can the (authenticated) caller see this post? Author always; else shared + a target they may see.
create or replace function public.can_view_post(p_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_id
      and (
        p.author_user = auth.uid()
        or (p.is_shared and exists (
          select 1 from public.post_targets t
          where t.post_id = p.id
            and (
              (t.target_type = 'community' and public.is_community_member(t.target_id, auth.uid()))
              or (t.target_type = 'profile' and public.can_view_profile(t.target_id))
            )
        ))
      )
  );
$$;
revoke all on function public.can_view_post(uuid) from public, anon;
grant execute on function public.can_view_post(uuid) to authenticated;

-- Anon-readable predicate: a SHARED post that fans out to a PUBLIC profile (the only thing the anon
-- key may read — never a community target, never a private post). Used by the anon SELECT policies.
create or replace function public.post_is_public_anon(p_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.posts p
    join public.post_targets t on t.post_id = p.id
    where p.id = p_id
      and p.is_shared
      and t.target_type = 'profile'
      and public.profile_is_public(t.target_id)
  );
$$;
revoke all on function public.post_is_public_anon(uuid) from public;
grant execute on function public.post_is_public_anon(uuid) to anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RLS — posts
-- ───────────────────────────────────────────────────────────────────────────
alter table public.posts enable row level security;

drop policy if exists "posts insert own" on public.posts;
create policy "posts insert own" on public.posts
  for insert to authenticated with check (author_user = auth.uid());

drop policy if exists "posts update own" on public.posts;
create policy "posts update own" on public.posts
  for update to authenticated using (author_user = auth.uid()) with check (author_user = auth.uid());

drop policy if exists "posts delete own" on public.posts;
create policy "posts delete own" on public.posts
  for delete to authenticated using (author_user = auth.uid());

drop policy if exists "posts read authed" on public.posts;
create policy "posts read authed" on public.posts
  for select to authenticated using (public.can_view_post(id));

drop policy if exists "posts read public anon" on public.posts;
create policy "posts read public anon" on public.posts
  for select to anon using (public.post_is_public_anon(id));

-- ───────────────────────────────────────────────────────────────────────────
-- 4. RLS — post_targets (read follows the post; the author may add a target only for a community
--    they belong to or their own profile; anon sees ONLY the public-profile target row, never the
--    community rows — so signed-out reads can't enumerate which (private) communities a post is in).
-- ───────────────────────────────────────────────────────────────────────────
alter table public.post_targets enable row level security;

drop policy if exists "ptargets read authed" on public.post_targets;
create policy "ptargets read authed" on public.post_targets
  for select to authenticated using (public.can_view_post(post_id));

-- Anon sees ONLY the profile-target row of a publicly-shared post (never the community-target rows,
-- so signed-out reads can't enumerate which private communities a post is in). Uses the SECURITY
-- DEFINER post_is_public_anon helper so anon never needs a direct grant on profile_is_public.
drop policy if exists "ptargets read public anon" on public.post_targets;
create policy "ptargets read public anon" on public.post_targets
  for select to anon
  using (target_type = 'profile' and public.post_is_public_anon(post_id));

drop policy if exists "ptargets insert own" on public.post_targets;
create policy "ptargets insert own" on public.post_targets
  for insert to authenticated
  with check (
    exists (select 1 from public.posts p where p.id = post_id and p.author_user = auth.uid())
    and (
      (target_type = 'profile'   and target_id = auth.uid())
      or (target_type = 'community' and public.is_community_member(target_id, auth.uid()))
    )
  );

drop policy if exists "ptargets delete own" on public.post_targets;
create policy "ptargets delete own" on public.post_targets
  for delete to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.author_user = auth.uid()));

-- ───────────────────────────────────────────────────────────────────────────
-- 5. RLS — post_likes + post_comments (read/like/comment only on a post you can see; delete your
--    own; a post's AUTHOR may also delete comments on their post).
-- ───────────────────────────────────────────────────────────────────────────
alter table public.post_likes    enable row level security;
alter table public.post_comments enable row level security;

drop policy if exists "plikes read authed" on public.post_likes;
create policy "plikes read authed" on public.post_likes
  for select to authenticated using (public.can_view_post(post_id));
drop policy if exists "plikes read public anon" on public.post_likes;
create policy "plikes read public anon" on public.post_likes
  for select to anon using (public.post_is_public_anon(post_id));
drop policy if exists "plikes insert own visible" on public.post_likes;
create policy "plikes insert own visible" on public.post_likes
  for insert to authenticated with check (user_id = auth.uid() and public.can_view_post(post_id));
drop policy if exists "plikes delete own" on public.post_likes;
create policy "plikes delete own" on public.post_likes
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "pcomments read authed" on public.post_comments;
create policy "pcomments read authed" on public.post_comments
  for select to authenticated using (public.can_view_post(post_id));
drop policy if exists "pcomments read public anon" on public.post_comments;
create policy "pcomments read public anon" on public.post_comments
  for select to anon using (public.post_is_public_anon(post_id));
drop policy if exists "pcomments insert own visible" on public.post_comments;
create policy "pcomments insert own visible" on public.post_comments
  for insert to authenticated with check (user_id = auth.uid() and public.can_view_post(post_id));
drop policy if exists "pcomments delete own or postauthor" on public.post_comments;
create policy "pcomments delete own or postauthor" on public.post_comments
  for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.posts p where p.id = post_id and p.author_user = auth.uid())
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Reads. profiles RLS is self-only, so batched counts + comment-author names need SECURITY
--    DEFINER functions that re-assert the post's visibility (can_view_post resolves to public-only
--    for the anon role — auth.uid() is null). Granted anon + authenticated so the SAME feed UI works
--    signed-out on public posts. Mirrors feed-social.sql / profile-posts.sql.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.get_posts_social(pids uuid[])
returns table (
  post_id           uuid,
  like_count        bigint,
  comment_count     bigint,
  liked_by_me       boolean,
  last_comment_name text,
  last_comment_body text
)
language sql stable security definer set search_path = public
as $$
  select
    p.id,
    (select count(*) from public.post_likes l    where l.post_id = p.id),
    (select count(*) from public.post_comments c where c.post_id = p.id),
    exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    lc.name,
    lc.body
  from public.posts p
  left join lateral (
    select pr.display_name as name, c.body
    from public.post_comments c
    join public.profiles pr on pr.id = c.user_id
    where c.post_id = p.id
    order by c.created_at desc
    limit 1
  ) lc on true
  where p.id = any(pids)
    and public.can_view_post(p.id);
$$;
revoke all on function public.get_posts_social(uuid[]) from public;
grant execute on function public.get_posts_social(uuid[]) to anon, authenticated;

create or replace function public.get_post_comments(pid uuid)
returns table (
  id           uuid,
  user_id      uuid,
  body         text,
  created_at   timestamptz,
  display_name text,
  handle       text,
  avatar_url   text
)
language sql stable security definer set search_path = public
as $$
  select c.id, c.user_id, c.body, c.created_at, pr.display_name, pr.handle, pr.avatar_url
  from public.post_comments c
  join public.profiles pr on pr.id = c.user_id
  where c.post_id = pid
    and public.can_view_post(pid)
  order by c.created_at;
$$;
revoke all on function public.get_post_comments(uuid) from public;
grant execute on function public.get_post_comments(uuid) to anon, authenticated;
