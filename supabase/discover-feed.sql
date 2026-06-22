-- Discover feed — a ranked feed of PUBLIC posts similar to what the caller tracks,
-- from accounts the caller does NOT already follow/befriend. All visibility is enforced
-- INSIDE the SECURITY DEFINER functions (the anon role is never granted execute), so the
-- anon key can never read private posts.
--
-- Idempotent and safe to re-run. Does NOT modify any existing .sql file. It depends on
-- objects created by the existing schema:
--   - public.community_entries, public.communities, public.community_members,
--     public.is_community_member(cid, uid)            [communities.sql]
--   - public.profiles (.visibility 'public'|'private') [signals.sql + search-onboarding.sql]
--   - public.entry_likes, public.entry_comments        [feed-social.sql]
--   - public.are_friends(a, b)                         [friends.sql]
--   - public.is_blocked_between(a, b)                  [messaging.sql]
--
-- The feed is backed by public.community_entries (one row per community/user/rule/day);
-- there is no separate posts table. A post's category is the category of its community.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Columns the client already reads/writes on community_entries (message, photo_path).
--    They are added here "if not exists" so this file is self-contained and discover_feed
--    can return a caption + photo regardless of whether they were added out-of-band.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.community_entries add column if not exists message text;
alter table public.community_entries add column if not exists photo_path text;

-- Recency window is the hot path of discover_feed — back it with an index.
create index if not exists community_entries_updated_idx on public.community_entries (updated_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. follows — a one-directional, instant "follow" (distinct from the symmetric
--    friend_requests graph). Following a public account is allowed without approval.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.follows (
  follower_user uuid not null references auth.users(id) on delete cascade,
  followed_user uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (follower_user, followed_user),
  constraint follows_no_self check (follower_user <> followed_user)
);
create index if not exists follows_follower_idx on public.follows (follower_user);
create index if not exists follows_followed_idx on public.follows (followed_user);

alter table public.follows enable row level security;

drop policy if exists "follows read own" on public.follows;
create policy "follows read own" on public.follows
  for select using (follower_user = auth.uid() or followed_user = auth.uid());

drop policy if exists "follows insert own" on public.follows;
create policy "follows insert own" on public.follows
  for insert with check (follower_user = auth.uid());

drop policy if exists "follows delete own" on public.follows;
create policy "follows delete own" on public.follows
  for delete using (follower_user = auth.uid());

-- Follow a PUBLIC account. Idempotent; silently no-ops on self / non-public / blocked.
create or replace function public.follow_user(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target is null or target = auth.uid() then
    return;
  end if;
  -- Only public profiles can be followed instantly, and never across a block.
  if not exists (
    select 1 from public.profiles p
    where p.id = target and coalesce(p.visibility, 'public') = 'public'
  ) then
    return;
  end if;
  if public.is_blocked_between(auth.uid(), target) then
    return;
  end if;
  insert into public.follows (follower_user, followed_user)
  values (auth.uid(), target)
  on conflict do nothing;
end;
$$;
revoke all on function public.follow_user(uuid) from public, anon;
grant execute on function public.follow_user(uuid) to authenticated;

create or replace function public.unfollow_user(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.follows
  where follower_user = auth.uid() and followed_user = target;
end;
$$;
revoke all on function public.unfollow_user(uuid) from public, anon;
grant execute on function public.unfollow_user(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. discover_feed — V1 rule-based ranking.
--    Returns recent PUBLIC community_entries whose author has a PUBLIC profile,
--    excluding the caller, the caller's friends, the caller's follows, blocked
--    relationships, and communities the caller is already in (those already show in
--    the Friends feed). Ranked by category overlap + rule-label match + recency +
--    engagement, capped at ~2 posts per author for diversity.
--    A `drop function` precedes `create` because the RETURNS TABLE signature is new.
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.discover_feed(text[], timestamptz, int);
create function public.discover_feed(categories text[], since timestamptz, max_rows int)
returns table (
  entry_id           uuid,
  community_id       uuid,
  community_name     text,
  community_category text,
  author_id          uuid,
  author_name        text,
  author_handle      text,
  author_avatar_url  text,
  rule_id            text,
  amount             numeric,
  message            text,
  photo_path         text,
  entry_date         date,
  updated_at         timestamptz,
  like_count         bigint,
  comment_count      bigint,
  matched_category   text,
  score              double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      e.id            as entry_id,
      e.community_id  as community_id,
      c.name          as community_name,
      c.category      as community_category,
      e.user_id       as author_id,
      p.display_name  as author_name,
      p.handle        as author_handle,
      p.avatar_url    as author_avatar_url,
      e.rule_id       as rule_id,
      e.amount        as amount,
      e.message       as message,
      e.photo_path    as photo_path,
      e.entry_date    as entry_date,
      e.updated_at    as updated_at,
      (select count(*) from public.entry_likes l    where l.entry_id = e.id) as like_count,
      (select count(*) from public.entry_comments k where k.entry_id = e.id) as comment_count,
      case
        when c.category is not null and c.category = any(coalesce(categories, '{}'::text[]))
        then c.category else null
      end as matched_category
    from public.community_entries e
      join public.communities c on c.id = e.community_id
      join public.profiles    p on p.id = e.user_id
    where c.visibility = 'public'                              -- only posts in public communities
      and coalesce(p.visibility, 'public') = 'public'          -- only public-profile authors
      and e.user_id <> auth.uid()                              -- not my own posts
      and not public.are_friends(auth.uid(), e.user_id)        -- not someone I'm already friends with
      and not exists (
        select 1 from public.follows f
        where f.follower_user = auth.uid() and f.followed_user = e.user_id
      )                                                        -- not someone I already follow
      and not public.is_blocked_between(auth.uid(), e.user_id) -- not across a block (either direction)
      and not public.is_community_member(e.community_id, auth.uid()) -- not a community I'm in (those are in Friends)
      and e.updated_at >= coalesce(since, now() - interval '30 days')
  ),
  ranked as (
    select
      b.*,
      (
          (case when b.matched_category is not null then 5.0 else 0 end)                 -- category overlap (strong)
        + (case when b.rule_id = any(coalesce(categories, '{}'::text[])) then 1.5 else 0 end) -- rule-label match (smaller)
        + (3.0 / (1.0 + extract(epoch from (now() - b.updated_at)) / 86400.0))          -- recency decay (per day)
        + (case when coalesce(b.message, '') <> '' or coalesce(b.photo_path, '') <> '' then 0.5 else 0 end) -- has caption/photo
        + least(b.like_count, 20) * 0.25                                                -- engagement: likes
        + least(b.comment_count, 20) * 0.4                                              -- engagement: comments
      )::double precision as score,
      row_number() over (
        partition by b.author_id
        order by (3.0 / (1.0 + extract(epoch from (now() - b.updated_at)) / 86400.0)) desc, b.updated_at desc
      ) as author_rank
    from base b
  )
  select
    entry_id, community_id, community_name, community_category, author_id, author_name,
    author_handle, author_avatar_url, rule_id, amount, message, photo_path, entry_date,
    updated_at, like_count, comment_count, matched_category, score
  from ranked
  where author_rank <= 2                                       -- diversity: ~2 posts per author
  order by score desc, updated_at desc
  limit greatest(coalesce(max_rows, 50), 1);
$$;
revoke all on function public.discover_feed(text[], timestamptz, int) from public, anon;
grant execute on function public.discover_feed(text[], timestamptz, int) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- PHASE 2 (SCAFFOLD ONLY) — AI semantic matching.
-- Goal: surface niche/custom goals that exact category strings miss (e.g. "bouldering"
-- ~ climbing/fitness, "tempo run" ~ running) by cosine similarity of an author-interest
-- embedding to the caller's. Everything below is ADDITIVE and NULL-safe: until embeddings
-- are backfilled the column is all-NULL, semantic similarity is treated as 0, and the
-- feed degrades to pure recency/v1 ranking. This must NOT block v1.
-- ═════════════════════════════════════════════════════════════════════════════

-- (a) pgvector. Ships with Supabase; enable once.
create extension if not exists vector;

-- (b) Per-author interest embedding. Personal reward systems are NOT in the DB (they live
--     in the client's localStorage), so the embedding's natural home is the per-user
--     profiles row. 1024 dims = Voyage voyage-3 (Anthropic's recommended embeddings
--     provider). CHANGE the dimension to match the model you backfill with (OpenAI
--     text-embedding-3-small = 1536, voyage-3-large = up to 2048). Nullable on purpose.
alter table public.profiles add column if not exists profile_embedding vector(1024);
alter table public.profiles add column if not exists embedding_updated_at timestamptz;

-- (c) ANN index. hnsw needs no training rows and tolerates an all-NULL column, so it's the
--     cleanest idempotent scaffold. Cosine ops to match the <=> operator below.
create index if not exists profiles_embedding_hnsw_idx
  on public.profiles using hnsw (profile_embedding vector_cosine_ops);

-- discover_feed_semantic — ranks public posts by cosine similarity of the AUTHOR's
-- profile_embedding to a caller-supplied query_embedding, blended with a v1-style score.
-- The query embedding is computed ONCE by the caller (off the hot path) and passed in —
-- this function does NO LLM/HTTP work. NULL embeddings coalesce to 0 similarity (LEFT JOIN
-- keeps the row) so it never errors and never hides posts before a backfill.
drop function if exists public.discover_feed_semantic(vector, text[], timestamptz, int);
create function public.discover_feed_semantic(
  query_embedding vector(1024),               -- caller-supplied; dim MUST match profiles.profile_embedding
  categories      text[]        default '{}',
  since           timestamptz   default null,
  max_rows        int           default 50
)
returns table (
  entry_id     uuid,
  community_id uuid,
  author_id    uuid,
  rule_id      text,
  entry_date   date,
  updated_at   timestamptz,
  semantic_sim double precision,  -- 0..1 (0 when the author has no embedding yet)
  v1_score     double precision,
  blended      double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select e.id as entry_id, e.community_id, e.user_id as author_id, e.rule_id,
           e.entry_date, e.updated_at
    from public.community_entries e
      join public.communities c on c.id = e.community_id
      join public.profiles    p on p.id = e.user_id
    where c.visibility = 'public'
      and coalesce(p.visibility, 'public') = 'public'
      and e.user_id <> auth.uid()
      and not public.are_friends(auth.uid(), e.user_id)
      and not exists (
        select 1 from public.follows f
        where f.follower_user = auth.uid() and f.followed_user = e.user_id
      )
      and not public.is_blocked_between(auth.uid(), e.user_id)
      and not public.is_community_member(e.community_id, auth.uid())
      and (since is null or e.updated_at >= since)
      and (
        cardinality(coalesce(categories, '{}'::text[])) = 0
        or exists (
          select 1 from public.communities c2
          where c2.id = e.community_id and c2.category = any(categories)
        )
      )
  ),
  scored as (
    select
      b.entry_id, b.community_id, b.author_id, b.rule_id, b.entry_date, b.updated_at,
      -- NULL-safe cosine similarity: 1 - distance; NULL (no embedding) -> 0.
      coalesce(1 - (p.profile_embedding <=> query_embedding), 0)::double precision as semantic_sim,
      -- TODO(phase-2): replace this recency placeholder with the real discover_feed v1
      -- score (category overlap + engagement + recency). Kept simple so the scaffold
      -- ranks sensibly before the blend is finalized.
      (3.0 / (1.0 + extract(epoch from (now() - b.updated_at)) / 86400.0))::double precision as v1_score
    from base b
      left join public.profiles p on p.id = b.author_id   -- LEFT JOIN: keep authors with no embedding
  )
  select
    entry_id, community_id, author_id, rule_id, entry_date, updated_at,
    semantic_sim, v1_score,
    (0.5 * semantic_sim + 0.5 * v1_score) as blended   -- blend weights are a tuning knob
  from scored
  order by blended desc, updated_at desc
  limit greatest(coalesce(max_rows, 50), 1);
$$;
revoke all on function public.discover_feed_semantic(vector, text[], timestamptz, int) from public, anon;
grant execute on function public.discover_feed_semantic(vector, text[], timestamptz, int) to authenticated;

-- ─── EMBEDDING-GENERATION TODO (phase 2, not wired yet) ──────────────────────────────
-- Compute embeddings ONCE on personal-system / community-system create+edit, NOT per feed
-- load. Pipeline:
--   1. Build a short interest blob from the user's rule categories/labels (the client
--      already derives these in callerDiscoverCategories() in outputs/app.js).
--   2. Embed it via a NEW Supabase Edge Function that MIRRORS the pattern of
--      supabase/functions/generate-rules/index.ts (Deno.serve + CORS + Deno.env.get so the
--      key never reaches the client) — BUT generate-rules uses "claude-haiku-4-5" on
--      /v1/messages with ANTHROPIC_API_KEY, which is a GENERATION model with NO embeddings
--      endpoint. Use an embeddings model instead (e.g. Voyage voyage-3, 1024-dim, with its
--      own VOYAGE_API_KEY; or OpenAI text-embedding-3-small, 1536-dim). The vector(N) dim
--      above MUST equal the model's output dim.
--   3. Write the vector to public.profiles.profile_embedding and stamp embedding_updated_at.
--   4. At feed time embed the *query* once (same model, server-side) and pass it in as
--      discover_feed_semantic(query_embedding, ...). NEVER embed per row; NEVER call an LLM
--      inside this function.
