-- Pointwell — Share to Feed: the main Feed becomes deliberate posts only (#33).
--
-- A log lives in its world's Activity. A Feed post is a deliberate SHARE: from an Activity item or the
-- finished tile ("Share to Feed"), or the + composer with "Also share to Feed" on. A Feed post needs
-- words and/or a photo — a stat card alone, or a bare log, can never be shared. Sharing creates a NEW
-- post with its own like/comment thread, so comments made inside the world never leak out.
--
--   posts.shared_from  — the Activity post (day anchor or in-world message) a Feed post was made from.
--                        ONE share per source per author (unique partial index); deleting the source
--                        leaves the Feed post (on delete set null); deleting the Feed post leaves the day.
--   share_to_feed()    — SECURITY DEFINER: author-only, requires caption and/or photo, inserts the new
--                        kind = 'post' row with ONE target (the author's profile — never a community
--                        target, so it does not duplicate inside Activity) and returns its id; a repeat
--                        share returns the existing post.
--   discover_posts()   — Discover = public SHARED posts from accounts you don't follow (a post with a
--                        profile target by a public profile, not me / friends / followed / blocked),
--                        ranked like discover_feed (category overlap · recency · has photo · engagement,
--                        ~2 per author). Replaces the entries-based Discover once this file is live —
--                        a bare log never reaches the Feed, Discover included.
--   storage            — a Feed post's photo is a COPY (made by the client into "personal/<uid>/…")
--                        of the members-only Activity original. Feed viewers read that copy through a
--                        new row-based policy: an object referenced by a post the caller can_view_post.
--                        The original stays members-only (its path policy; the anchor is members-only).
--
-- Idempotent / safe to re-run. Does NOT modify any existing .sql.
-- Depends on: post-first-feed.sql (#26: posts, post_targets, can_view_post), community-activity.sql
--   (#32: posts.kind — run it first), the entry-photos bucket.
--
-- WHAT YOU MUST DO: run community-activity.sql (#32) if you haven't, then this whole file, in the
-- Supabase SQL editor. No new bucket.
-- UNTIL IT RUNS: "Share to Feed" shows "Sharing needs a database update"; the Feed's new rules
-- (shared posts only) apply regardless; nothing else changes.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. posts.shared_from + one share per source per author
-- ───────────────────────────────────────────────────────────────────────────
alter table public.posts add column if not exists shared_from uuid references public.posts(id) on delete set null;
create unique index if not exists posts_shared_from_uidx
  on public.posts (author_user, shared_from) where shared_from is not null;
-- The storage read policy below looks posts up by photo path.
create index if not exists posts_photo_path_idx on public.posts (photo_path) where photo_path is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. share_to_feed — a NEW post from an Activity post of mine. p_snapshot = the stat-card data
--    { world, worldId, date, done, total, pct, streak, rank, size, items: [{ruleLabel, amount, unit}] }.
--    activity = the source's items (the client's labeled chips when given, else the source's own
--    activity list) + the snapshot (tagged kind 'statcard' so the Feed card can draw it).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.share_to_feed(p_src uuid, p_caption text, p_photo_path text, p_snapshot jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       uuid := auth.uid();
  v_src      public.posts%rowtype;
  v_id       uuid;
  v_caption  text;
  v_photo    text;
  v_items    jsonb;
  v_activity jsonb;
begin
  if v_me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select * into v_src from public.posts p where p.id = p_src;
  if v_src.id is null or v_src.author_user <> v_me then
    raise exception 'Only the author can share this' using errcode = '42501';
  end if;
  -- the source must be an Activity post: a day anchor, an in-world message, or a plain post that
  -- is not on the Feed yet — never a Feed post or a share itself (no duplicates, no share chains)
  if v_src.shared_from is not null
     or exists (select 1 from public.post_targets t where t.post_id = v_src.id and t.target_type = 'profile') then
    raise exception 'That post is already on the Feed' using errcode = '22023';
  end if;
  v_caption := nullif(btrim(coalesce(p_caption, ''), E' \t\r\n'), '');
  v_photo   := nullif(btrim(coalesce(p_photo_path, '')), '');
  if v_caption is null and v_photo is null then
    raise exception 'Add a caption or a photo. A stat card alone isn''t a post.' using errcode = '22023';
  end if;
  -- the Feed post's photo is the author's OWN copy under personal/<me>/ — never the members-only
  -- world original (that path would be unlocked for every Feed viewer by the read-via-post policy)
  if v_photo is not null and position('personal/' || v_me::text || '/' in v_photo) <> 1 then
    raise exception 'Share a copy of the photo (personal/<you>/…), not the world original' using errcode = '22023';
  end if;
  if p_snapshot is not null and jsonb_typeof(p_snapshot) <> 'object' then
    p_snapshot := null;   -- only an object snapshot is a stat card
  end if;

  -- already shared → the existing Feed post
  select p.id into v_id from public.posts p where p.author_user = v_me and p.shared_from = p_src;
  if v_id is not null then
    return v_id;
  end if;

  v_items := case
    when p_snapshot is not null and jsonb_typeof(p_snapshot -> 'items') = 'array' then p_snapshot -> 'items'
    else coalesce(v_src.activity, '[]'::jsonb)
  end;
  v_activity := v_items || case
    when p_snapshot is null then '[]'::jsonb
    else jsonb_build_array((p_snapshot - 'items') || jsonb_build_object('kind', 'statcard'))
  end;

  insert into public.posts (author_user, kind, caption, photo_path, activity, is_shared, shared_from)
  values (v_me, 'post', v_caption, v_photo, v_activity, true, p_src)
  on conflict (author_user, shared_from) where shared_from is not null do nothing
  returning id into v_id;
  if v_id is null then   -- lost a race with a second tap: return the one that won
    select p.id into v_id from public.posts p where p.author_user = v_me and p.shared_from = p_src;
    return v_id;
  end if;

  -- exactly ONE target: my profile. No community target (the day already lives in Activity).
  insert into public.post_targets (post_id, target_type, target_id, points)
  values (v_id, 'profile', v_me, 0)
  on conflict (post_id, target_type, target_id) do nothing;

  return v_id;
end;
$$;
revoke all on function public.share_to_feed(uuid, text, text, jsonb) from public, anon;
grant execute on function public.share_to_feed(uuid, text, text, jsonb) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2b. A profile target (= the Feed) needs a caption and/or a photo — enforced in the database, so an
--     activity-only post can never be put on the Feed by any client. (The + composer already refuses
--     it; this makes it a rule, not a courtesy.)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.post_targets_guard_feed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_caption text; v_photo text;
begin
  if NEW.target_type = 'profile' then
    select p.caption, p.photo_path into v_caption, v_photo from public.posts p where p.id = NEW.post_id;
    if nullif(btrim(coalesce(v_caption, ''), E' \t\r\n'), '') is null and nullif(btrim(coalesce(v_photo, '')), '') is null then
      raise exception 'A Feed post needs a caption or a photo' using errcode = '23514';
    end if;
  end if;
  return NEW;
end;
$$;
drop trigger if exists post_targets_guard_feed_trg on public.post_targets;
create trigger post_targets_guard_feed_trg
  before insert or update on public.post_targets
  for each row execute function public.post_targets_guard_feed();

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Storage — Feed viewers read a post's photo when they can see the post.
--    The client copies the Activity original ("<world>/<uid>/…", members-only) to a new object under
--    "personal/<uid>/…" and the Feed post references the COPY. The personal-folder path policy keeps
--    that copy owner-only, so this policy opens it exactly to the people who can view a post that
--    carries it (author / followers / public, via can_view_post) — the same gate the post itself has.
--    Only an object the post's AUTHOR uploaded (path "<x>/<author>/…") can be unlocked this way, so a
--    forged photo_path can never expose someone else's object.
--    The original is still referenced only by the day anchor (members-only), so it stays private.
--    (This also fixes "+" composer photos, which already went to personal/<uid> and were unreadable by
--    followers.) Policies are OR'ed, so the existing path policies keep working unchanged.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.can_read_photo_via_post(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.posts p
    where p.photo_path = object_name
      and (storage.foldername(object_name))[2] = p.author_user::text   -- only the author's OWN upload: a post can't point at someone else's object
      and public.can_view_post(p.id)
  );
$$;
revoke all on function public.can_read_photo_via_post(text) from public, anon;
grant execute on function public.can_read_photo_via_post(text) to authenticated;

drop policy if exists "entry photos read via post" on storage.objects;
create policy "entry photos read via post" on storage.objects
  for select to authenticated
  using (bucket_id = 'entry-photos' and public.can_read_photo_via_post(name));

-- ───────────────────────────────────────────────────────────────────────────
-- 4. discover_posts — Discover reads shared posts. Same gates and ranking shape as discover_feed
--    (discover-feed.sql), over posts with a PROFILE target instead of community_entries.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.discover_posts(categories text[], since timestamptz, max_rows int)
returns table (
  post_id           uuid,
  author_user       uuid,
  caption           text,
  photo_path        text,
  activity          jsonb,
  created_at        timestamptz,
  author_name       text,
  author_handle     text,
  author_avatar_url text,
  like_count        bigint,
  comment_count     bigint,
  matched_category  text,
  score             double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      p.id              as post_id,
      p.author_user     as author_user,
      p.caption         as caption,
      p.photo_path      as photo_path,
      p.activity        as activity,
      p.created_at      as created_at,
      pr.display_name   as author_name,
      pr.handle         as author_handle,
      pr.avatar_url     as author_avatar_url,
      (select count(*) from public.post_likes l    where l.post_id = p.id) as like_count,
      (select count(*) from public.post_comments c where c.post_id = p.id) as comment_count,
      (
        select a ->> 'ruleLabel'
        from jsonb_array_elements(case when jsonb_typeof(p.activity) = 'array' then p.activity else '[]'::jsonb end) a
        where lower(coalesce(a ->> 'ruleLabel', '')) in (select lower(x) from unnest(coalesce(categories, '{}'::text[])) x)
        limit 1
      ) as matched_category
    from public.posts p
      join public.post_targets t on t.post_id = p.id and t.target_type = 'profile'
      join public.profiles pr on pr.id = p.author_user
    where p.is_shared
      and p.kind = 'post'                                          -- never a day anchor / in-world message
      and (p.caption is not null or p.photo_path is not null)      -- a deliberate post: words and/or a photo
      and coalesce(pr.visibility, 'public') = 'public'            -- only public-profile authors
      and p.author_user <> auth.uid()                              -- not my own posts
      and not public.are_friends(auth.uid(), p.author_user)        -- not someone I'm already friends with
      and not exists (
        select 1 from public.follows f
        where f.follower_user = auth.uid() and f.followed_user = p.author_user
      )                                                            -- not someone I already follow
      and not public.is_blocked_between(auth.uid(), p.author_user) -- not across a block
      and p.created_at >= coalesce(since, now() - interval '30 days')
  ),
  ranked as (
    select
      b.*,
      (
          (case when b.matched_category is not null then 5.0 else 0 end)
        + (3.0 / (1.0 + extract(epoch from (now() - b.created_at)) / 86400.0))
        + (case when b.photo_path is not null then 0.5 else 0 end)
        + least(b.like_count, 20) * 0.25
        + least(b.comment_count, 20) * 0.4
      )::double precision as score,
      row_number() over (partition by b.author_user order by b.created_at desc) as author_rank
    from base b
  )
  select
    post_id, author_user, caption, photo_path, activity, created_at, author_name, author_handle,
    author_avatar_url, like_count, comment_count, matched_category, score
  from ranked
  where author_rank <= 2
  order by score desc, created_at desc
  limit greatest(coalesce(max_rows, 50), 1);
$$;
revoke all on function public.discover_posts(text[], timestamptz, int) from public, anon;
grant execute on function public.discover_posts(text[], timestamptz, int) to authenticated;
