-- Pointwell — Community Activity: the members-only world feed (#32).
--
-- Inside a world, the Activity tab holds everything: every member's logs merged per person per day,
-- plus messages / photos / notes, with likes and comments. Only members of that world can see any of
-- it, and THIS file is where that is enforced. Nothing in Activity ever reaches the main Feed.
--
-- Reuses post-first-feed.sql (#26): a post whose ONLY target is a community is visible to that
-- community's members (+ its author) and never to anon — that IS Activity's privacy, so there is no
-- parallel table. What this file adds:
--   1. posts.kind ('post' | 'activity' | 'message') + activity_community / activity_date. A kind =
--      'activity' row is a person's "day anchor": ONE per author, per world, per day (unique partial
--      index). It is created on demand (never by logging) so any member can like or comment on
--      someone's bare-log day without that person ever writing a post. Its caption/photo are the
--      author's note for the day. A kind = 'message' row is a standalone note posted inside a world
--      (the message box with "Attach today's logs" OFF). Both live ONLY in that world's Activity.
--   2. ensure_activity_post(p_community, p_author, p_date) → the anchor's id (existing or new).
--   3. Guards: an activity/message post can never get a 'profile' target (so it can never reach a
--      profile, the Feed, or anon), a post can never change kind, and community_entries.post_id can
--      never point at an anchor (that FK cascades — deleting an anchor must never delete points).
--   4. Bell: likes/comments on POSTS notify the author (post_likes / post_comments had no triggers;
--      only entry_likes / entry_comments did). notifications.post_id + get_notifications() gains
--      post_id / post_kind / world_id / world_name (+ the comment body).
--   5. Storage: the entry-photos read policies, declared here so the repo owns them (they only existed
--      in the dashboard). Semantics kept: a photo under "<community>/<uid>/…" is readable by that
--      world's current members — plus, new, always by its uploader.
--
-- Idempotent / safe to re-run: add-column-if-not-exists, guarded constraints, create-or-replace
-- functions, drop-then-create triggers/policies. Does NOT modify any existing .sql.
-- Depends on: communities.sql (communities, community_members, community_entries, is_community_member),
--   post-first-feed.sql (posts, post_targets, post_likes, post_comments, can_view_post),
--   notifications.sql (notifications, get_notifications), feed-social.sql (entry_comments),
--   signals.sql / profile-pictures.sql (profiles), friends.sql (friend_requests), the entry-photos bucket.
--
-- WHAT YOU MUST DO: run this whole file in the Supabase SQL editor. No new bucket.
-- UNTIL IT RUNS: logging is untouched (quiet logs never touch posts); the Activity tab still lists
-- everyone's logs from community_entries and shows one notice — "Comments and photos need a database
-- update" — instead of the message box; likes/comments/photos on activity are disabled, never silent.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. posts: kind + the day-anchor columns
-- ───────────────────────────────────────────────────────────────────────────
alter table public.posts add column if not exists kind text not null default 'post';
alter table public.posts add column if not exists activity_community uuid references public.communities(id) on delete cascade;
alter table public.posts add column if not exists activity_date date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'posts_kind_check' and conrelid = 'public.posts'::regclass) then
    alter table public.posts add constraint posts_kind_check check (kind in ('post', 'activity', 'message'));
  end if;
  -- an anchor always knows its world and its day; a plain post never carries them
  if not exists (select 1 from pg_constraint where conname = 'posts_activity_shape' and conrelid = 'public.posts'::regclass) then
    alter table public.posts add constraint posts_activity_shape check (
      (kind = 'activity' and activity_community is not null and activity_date is not null)
      or (kind <> 'activity' and activity_community is null and activity_date is null)
    );
  end if;
end $$;

-- One day anchor per person, per world, per day.
create unique index if not exists posts_activity_anchor_uidx
  on public.posts (author_user, activity_community, activity_date) where kind = 'activity';

-- A fresh anchor may be EMPTY (no note yet, no logs yet when the author opens their own day): relax
-- posts_has_content for kind = 'activity' only. Re-declared idempotently; every existing row already
-- satisfies the stricter original, so the swap validates. Plain posts keep the original rule.
alter table public.posts drop constraint if exists posts_has_content;
alter table public.posts add constraint posts_has_content check (
  kind = 'activity' or caption is not null or photo_path is not null or activity <> '[]'::jsonb
);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. ensure_activity_post — the anchor for (world, author, day), created on first use.
--    SECURITY DEFINER: it writes posts + post_targets past RLS, so it re-checks everything itself:
--    the caller AND the author must be members; a member may open ANOTHER member's day only if that
--    person logged something that day; anyone may open their own day. Race-safe via ON CONFLICT on
--    the partial unique index (two members liking the same day at once get the same id).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.ensure_activity_post(p_community uuid, p_author uuid, p_date date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_snapshot jsonb;
begin
  if v_me is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_community is null or p_author is null or p_date is null then
    raise exception 'ensure_activity_post needs a world, an author and a day' using errcode = '22023';
  end if;
  if not public.is_community_member(p_community, v_me) then
    raise exception 'Only members of this world can do that' using errcode = '42501';
  end if;
  if not public.is_community_member(p_community, p_author) then
    raise exception 'That person is not a member of this world' using errcode = '42501';
  end if;
  if p_author <> v_me and not exists (
    select 1 from public.community_entries e
    where e.community_id = p_community and e.user_id = p_author and e.entry_date = p_date
  ) then
    raise exception 'Nothing was logged that day' using errcode = '42501';
  end if;

  select p.id into v_id from public.posts p
  where p.kind = 'activity' and p.author_user = p_author
    and p.activity_community = p_community and p.activity_date = p_date;
  if v_id is not null then
    return v_id;
  end if;

  -- a snapshot of that day's logs (the live chips come from community_entries; this is provenance)
  select coalesce(jsonb_agg(jsonb_build_object('ruleId', e.rule_id, 'amount', e.amount) order by e.updated_at), '[]'::jsonb)
    into v_snapshot
  from public.community_entries e
  where e.community_id = p_community and e.user_id = p_author and e.entry_date = p_date;

  insert into public.posts (author_user, kind, activity_community, activity_date, activity, is_shared)
  values (p_author, 'activity', p_community, p_date, v_snapshot, true)
  on conflict (author_user, activity_community, activity_date) where kind = 'activity' do nothing
  returning id into v_id;

  if v_id is null then   -- lost the race: the other insert won; read it
    select p.id into v_id from public.posts p
    where p.kind = 'activity' and p.author_user = p_author
      and p.activity_community = p_community and p.activity_date = p_date;
  end if;

  -- exactly ONE target: this community. (Never a profile target — see the guard below.)
  insert into public.post_targets (post_id, target_type, target_id, points)
  values (v_id, 'community', p_community, 0)
  on conflict (post_id, target_type, target_id) do nothing;

  return v_id;
end;
$$;
revoke all on function public.ensure_activity_post(uuid, uuid, date) from public, anon;
grant execute on function public.ensure_activity_post(uuid, uuid, date) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Guards (BEFORE triggers — they run for every role, including the author's own client writes).
-- ───────────────────────────────────────────────────────────────────────────
-- 3a. post_targets: an activity or message post can never be targeted at a profile (so it can never
--     reach a profile page, the Friends feed, or anon via post_is_public_anon); an anchor's only
--     community is the one it belongs to.
create or replace function public.post_targets_guard_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_kind text; v_comm uuid;
begin
  select p.kind, p.activity_community into v_kind, v_comm from public.posts p where p.id = NEW.post_id;
  if v_kind in ('activity', 'message') and NEW.target_type <> 'community' then
    raise exception 'An activity post stays inside its world (no profile target)' using errcode = '23514';
  end if;
  if v_kind = 'activity' and NEW.target_id <> v_comm then
    raise exception 'An activity post belongs to one world' using errcode = '23514';
  end if;
  return NEW;
end;
$$;
drop trigger if exists post_targets_guard_activity_trg on public.post_targets;
create trigger post_targets_guard_activity_trg
  before insert or update on public.post_targets
  for each row execute function public.post_targets_guard_activity();

-- 3b. posts: kind is set at creation and never changes (a plain post with a profile target could
--     otherwise be flipped into an "anchor", or an anchor laundered into a Feed post).
create or replace function public.posts_guard_kind()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.kind is distinct from OLD.kind
     or NEW.activity_community is distinct from OLD.activity_community
     or NEW.activity_date is distinct from OLD.activity_date then
    raise exception 'A post''s kind, world and day are fixed at creation' using errcode = '23514';
  end if;
  return NEW;
end;
$$;
drop trigger if exists posts_guard_kind_trg on public.posts;
create trigger posts_guard_kind_trg
  before update on public.posts
  for each row execute function public.posts_guard_kind();

-- 3c. community_entries: never link a scoring row to an anchor. community_entries.post_id cascades
--     on delete, and deleting a note must never delete points.
create or replace function public.community_entries_guard_anchor_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.post_id is not null and exists (select 1 from public.posts p where p.id = NEW.post_id and p.kind = 'activity') then
    raise exception 'A log can never be linked to an activity anchor' using errcode = '23514';
  end if;
  return NEW;
end;
$$;
drop trigger if exists community_entries_guard_anchor_link_trg on public.community_entries;
create trigger community_entries_guard_anchor_link_trg
  before insert or update of post_id on public.community_entries
  for each row execute function public.community_entries_guard_anchor_link();

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Bell — likes/comments on POSTS notify the post's author (anchors included: a like or comment
--    on your activity day is social activity ABOUT you). Mirrors notify_on_like / notify_on_comment
--    (notifications.sql): SECURITY DEFINER, self-actions skipped, one row per (actor, post, type).
--    notifications.entry_id is an FK to community_entries, so posts get their own nullable column.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.notifications add column if not exists post_id uuid references public.posts(id) on delete cascade;
create index if not exists notifications_post_idx on public.notifications (post_id);

create or replace function public.notify_on_post_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_author uuid; v_comm uuid;
begin
  select author_user, activity_community into v_author, v_comm from public.posts where id = NEW.post_id;
  if v_author is not null and v_author <> NEW.user_id
     and (v_comm is null or public.is_community_member(v_comm, v_author))   -- an author who left the world is not told
     and not exists (
       select 1 from public.notifications n
       where n.type = 'like' and n.actor_user = NEW.user_id
         and n.recipient_user = v_author and n.post_id is not distinct from NEW.post_id
     ) then
    insert into public.notifications (recipient_user, type, actor_user, post_id)
    values (v_author, 'like', NEW.user_id, NEW.post_id);
  end if;
  return NEW;
end; $$;
drop trigger if exists notify_on_post_like_trg on public.post_likes;
create trigger notify_on_post_like_trg after insert on public.post_likes
  for each row execute function public.notify_on_post_like();

create or replace function public.notify_on_post_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_author uuid; v_comm uuid;
begin
  select author_user, activity_community into v_author, v_comm from public.posts where id = NEW.post_id;
  if v_author is not null and v_author <> NEW.user_id
     and (v_comm is null or public.is_community_member(v_comm, v_author))   -- an author who left the world is not told
     and not exists (
       select 1 from public.notifications n
       where n.type = 'comment' and n.actor_user = NEW.user_id
         and n.recipient_user = v_author and n.post_id is not distinct from NEW.post_id
     ) then
    insert into public.notifications (recipient_user, type, actor_user, post_id)
    values (v_author, 'comment', NEW.user_id, NEW.post_id);
  end if;
  return NEW;
end; $$;
drop trigger if exists notify_on_post_comment_trg on public.post_comments;
create trigger notify_on_post_comment_trg after insert on public.post_comments
  for each row execute function public.notify_on_post_comment();

-- get_notifications: same rows + post_id / post_kind / world_id / world_name, and the comment's body
-- (for both post and entry comments) so the bell can say "commented: …" and open the right place:
-- an activity anchor opens that world's Activity tab; a plain post opens the post. Drop-then-create
-- because the RETURNS TABLE signature grows. Same grants as before (authenticated only).
drop function if exists public.get_notifications();
create function public.get_notifications()
returns table (
  row_id           uuid,
  source           text,        -- 'notification' | 'signal'
  kind             text,        -- like | comment | friend_request | friend_accept | kudos | motivation
  actor_user       uuid,
  actor_name       text,
  actor_handle     text,
  actor_avatar_url text,
  entry_id         uuid,        -- a community_entries id, for legacy entry likes/comments
  action_id        uuid,        -- the pending friend_requests.id, for inline Approve/Decline
  body             text,        -- the kudos/motivation message, or the comment's text
  summary          text,
  created_at       timestamptz,
  read             boolean,
  post_id          uuid,        -- the post, for post likes/comments
  post_kind        text,        -- 'post' | 'activity'
  world_id         uuid,        -- an activity anchor's world
  world_name       text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    n.id as row_id,
    'notification'::text as source,
    n.type as kind,
    n.actor_user,
    p.display_name as actor_name,
    p.handle as actor_handle,
    p.avatar_url as actor_avatar_url,
    n.entry_id,
    case when n.type = 'friend_request' then fr.id else null end as action_id,
    case when n.type = 'comment' then coalesce(
      (select c.body from public.post_comments c where c.post_id = n.post_id and c.user_id = n.actor_user order by c.created_at desc limit 1),
      (select c.body from public.entry_comments c where c.entry_id = n.entry_id and c.user_id = n.actor_user order by c.created_at desc limit 1)
    ) else null end as body,
    coalesce(p.display_name, p.handle, 'Someone') ||
      case n.type
        when 'like'           then case when po.kind = 'activity' then ' liked your activity in ' || coalesce(co.name, 'a world') else ' liked your post' end
        when 'comment'        then case when po.kind = 'activity' then ' commented on your activity in ' || coalesce(co.name, 'a world') else ' commented on your post' end
        when 'friend_request' then ' sent you a friend request'
        when 'friend_accept'  then ' accepted your friend request'
        else ''
      end as summary,
    n.created_at,
    (n.read_at is not null) as read,
    n.post_id,
    po.kind as post_kind,
    po.activity_community as world_id,
    co.name as world_name
  from public.notifications n
    left join public.profiles p on p.id = n.actor_user
    left join public.posts po on po.id = n.post_id
    left join public.communities co on co.id = po.activity_community
    left join public.friend_requests fr
      on n.type = 'friend_request'
         and fr.requester_user = n.actor_user
         and fr.addressee_user = n.recipient_user
         and fr.status = 'pending'
  where n.recipient_user = auth.uid()

  union all

  select
    s.id as row_id,
    'signal'::text as source,
    s.type as kind,                       -- 'kudos' | 'motivation'
    s.from_user as actor_user,
    p.display_name as actor_name,
    p.handle as actor_handle,
    p.avatar_url as actor_avatar_url,
    null::uuid as entry_id,
    null::uuid as action_id,
    s.body as body,
    coalesce(p.display_name, s.from_name, 'Someone') ||
      case s.type when 'motivation' then ' sent you motivation' else ' sent you kudos' end as summary,
    s.created_at,
    s.read as read,
    null::uuid as post_id,
    null::text as post_kind,
    null::uuid as world_id,
    null::text as world_name
  from public.signals s
    left join public.profiles p on p.id = s.from_user
  where s.to_user = auth.uid()
    and s.type in ('kudos', 'motivation')   -- EXCLUDE 'text' DMs (Chats only)

  order by created_at desc
  limit 40;
$$;
revoke all on function public.get_notifications() from public, anon;
grant execute on function public.get_notifications() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Storage — the private "entry-photos" bucket, declared in the repo.
--    FOUND (live, dashboard-made, in no .sql file): READ "<community_id>/<uid>/…" = any current member
--    of that community (is_community_member on the first path segment); READ "personal/<uid>/…" =
--    that uid only; INSERT only into your own "<x>/<auth.uid()>/…" (+ membership for a community
--    folder); DELETE own; no UPDATE; no anon policy at all. So an Activity photo (uploaded to
--    "<world>/<me>/…") is already readable ONLY by that world's members — not broader. Two fixes:
--    (a) the uploader can always read their own photo (today they lose it on leaving the world —
--    the SPEC's "+ the author"); (b) the live policies cast path segments with ::uuid, which THROWS
--    on a non-uuid path instead of denying — compare as text / regex-guard the cast.
--    Membership is re-checked on every signed-URL request, so leaving a world cuts access at once
--    (already-minted signed URLs stay valid until they expire, 1h).
-- ───────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('entry-photos', 'entry-photos', false)
on conflict (id) do update set public = false;

drop policy if exists "entry photos read personal" on storage.objects;
create policy "entry photos read personal" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'entry-photos'
    and (storage.foldername(name))[1] = 'personal'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "entry photos read communities" on storage.objects;
create policy "entry photos read communities" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'entry-photos'
    and (storage.foldername(name))[1] <> 'personal'
    and (
      (storage.foldername(name))[2] = auth.uid()::text                       -- the uploader, always
      -- a current member of that world (the CASE keeps the ::uuid cast off non-uuid segments —
      -- SQL does not promise AND short-circuits; a null world is simply "not a member")
      or public.is_community_member(
        (case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((storage.foldername(name))[1])::uuid else null end),
        auth.uid())
    )
  );

drop policy if exists "entry photos write personal" on storage.objects;
create policy "entry photos write personal" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'entry-photos'
    and (storage.foldername(name))[1] = 'personal'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "entry photos write communities" on storage.objects;
create policy "entry photos write communities" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'entry-photos'
    and (storage.foldername(name))[1] <> 'personal'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_community_member(
      (case when (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then ((storage.foldername(name))[1])::uuid else null end),
      auth.uid())
  );

drop policy if exists "entry photos delete own" on storage.objects;
create policy "entry photos delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'entry-photos'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
