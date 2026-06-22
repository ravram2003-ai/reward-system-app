-- Notification routing — the "bell" source of truth.
--
-- The bell fires for activity ABOUT you: likes/comments on YOUR posts, friend requests
-- (received) + accepts (of requests you sent), plus existing cheers/kudos. Direct
-- messages (signals.type = 'text') are deliberately EXCLUDED here — they belong only in
-- Chats and never touch the bell.
--
-- All visibility is enforced in SQL: every function is SECURITY DEFINER but filters to
-- auth.uid(), and RLS restricts the table to its owner. The anon role is never granted
-- execute, so the anon key can never read another user's notifications.
--
-- Idempotent and safe to re-run. Does NOT modify existing .sql. Depends on:
--   public.community_entries (communities.sql), public.entry_likes / public.entry_comments
--   (feed-social.sql), public.friend_requests (friends.sql), public.signals (signals.sql),
--   public.profiles (signals.sql + search-onboarding.sql + profile-pictures.sql).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table + indexes + RLS (own rows only; rows are created ONLY by the triggers
--    below, so there is no INSERT/DELETE policy).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id             uuid primary key default gen_random_uuid(),
  recipient_user uuid not null references auth.users(id) on delete cascade,
  type           text not null check (type in ('like','comment','friend_request','friend_accept')),
  actor_user     uuid not null references auth.users(id) on delete cascade,
  entry_id       uuid references public.community_entries(id) on delete cascade,  -- set for like/comment (the post); null otherwise
  created_at     timestamptz not null default now(),
  read_at        timestamptz,                                                     -- null = unread
  constraint notifications_no_self check (recipient_user <> actor_user)
);
create index if not exists notifications_recipient_idx
  on public.notifications (recipient_user, created_at desc);
create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_user) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "notifications read own" on public.notifications;
create policy "notifications read own" on public.notifications
  for select using (recipient_user = auth.uid());

drop policy if exists "notifications update own" on public.notifications;
create policy "notifications update own" on public.notifications
  for update using (recipient_user = auth.uid()) with check (recipient_user = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Triggers — insert a notification for the recipient when an event happens.
--    SECURITY DEFINER so the trigger can resolve the post author across the
--    membership-gated community_entries RLS and insert past the table's RLS. Each
--    guards with NOT EXISTS so re-likes / re-runs / multiple comments per post never
--    spam duplicate notifications, and self-actions are skipped.
-- ─────────────────────────────────────────────────────────────────────────────

-- LIKE: someone liked a post whose author is the recipient.
create or replace function public.notify_on_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_author uuid;
begin
  select user_id into v_author from public.community_entries where id = NEW.entry_id;
  if v_author is not null and v_author <> NEW.user_id
     and not exists (
       select 1 from public.notifications n
       where n.type = 'like' and n.actor_user = NEW.user_id
         and n.recipient_user = v_author and n.entry_id is not distinct from NEW.entry_id
     ) then
    insert into public.notifications (recipient_user, type, actor_user, entry_id)
    values (v_author, 'like', NEW.user_id, NEW.entry_id);
  end if;
  return NEW;
end; $$;
drop trigger if exists notify_on_like_trg on public.entry_likes;
create trigger notify_on_like_trg after insert on public.entry_likes
  for each row execute function public.notify_on_like();

-- COMMENT: someone commented on a post whose author is the recipient (one per author).
create or replace function public.notify_on_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_author uuid;
begin
  select user_id into v_author from public.community_entries where id = NEW.entry_id;
  if v_author is not null and v_author <> NEW.user_id
     and not exists (
       select 1 from public.notifications n
       where n.type = 'comment' and n.actor_user = NEW.user_id
         and n.recipient_user = v_author and n.entry_id is not distinct from NEW.entry_id
     ) then
    insert into public.notifications (recipient_user, type, actor_user, entry_id)
    values (v_author, 'comment', NEW.user_id, NEW.entry_id);
  end if;
  return NEW;
end; $$;
drop trigger if exists notify_on_comment_trg on public.entry_comments;
create trigger notify_on_comment_trg after insert on public.entry_comments
  for each row execute function public.notify_on_comment();

-- FRIEND REQUEST received: notify the addressee when a pending request is created.
create or replace function public.notify_on_friend_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.status = 'pending'
     and not exists (
       select 1 from public.notifications n
       where n.type = 'friend_request' and n.actor_user = NEW.requester_user
         and n.recipient_user = NEW.addressee_user and n.entry_id is null
     ) then
    insert into public.notifications (recipient_user, type, actor_user)
    values (NEW.addressee_user, 'friend_request', NEW.requester_user);
  end if;
  return NEW;
end; $$;
drop trigger if exists notify_on_friend_request_trg on public.friend_requests;
create trigger notify_on_friend_request_trg after insert on public.friend_requests
  for each row execute function public.notify_on_friend_request();

-- FRIEND REQUEST accepted: notify the ORIGINAL requester. Fires from inside
-- respond_to_friend_request's UPDATE (that function is SECURITY DEFINER), exactly once
-- on the pending -> accepted transition.
create or replace function public.notify_on_friend_accept()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.status = 'accepted' and OLD.status is distinct from 'accepted'
     and not exists (
       select 1 from public.notifications n
       where n.type = 'friend_accept' and n.actor_user = NEW.addressee_user
         and n.recipient_user = NEW.requester_user and n.entry_id is null
     ) then
    insert into public.notifications (recipient_user, type, actor_user)
    values (NEW.requester_user, 'friend_accept', NEW.addressee_user);
  end if;
  return NEW;
end; $$;
drop trigger if exists notify_on_friend_accept_trg on public.friend_requests;
create trigger notify_on_friend_accept_trg after update on public.friend_requests
  for each row execute function public.notify_on_friend_accept();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. get_notifications() — the unified bell list (newest first). UNIONs the
--    notifications table (likes/comments/friend_request/friend_accept) with the
--    existing cheer/kudos signals, EXCLUDING type 'text' DMs. Joined to profiles for
--    the actor's display_name/handle/avatar + a short summary. The caller derives the
--    unread count from the `read` flag (rows with read = false). Drop-then-create
--    because the RETURNS TABLE signature is new.
-- ─────────────────────────────────────────────────────────────────────────────
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
  entry_id         uuid,        -- the post, for like/comment (tap to open in feed)
  action_id        uuid,        -- the pending friend_requests.id, for inline Approve/Decline
  body             text,        -- the kudos/motivation message
  summary          text,
  created_at       timestamptz,
  read             boolean
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
    null::text as body,
    coalesce(p.display_name, p.handle, 'Someone') ||
      case n.type
        when 'like'           then ' liked your post'
        when 'comment'        then ' commented on your post'
        when 'friend_request' then ' sent you a friend request'
        when 'friend_accept'  then ' accepted your friend request'
        else ''
      end as summary,
    n.created_at,
    (n.read_at is not null) as read
  from public.notifications n
    left join public.profiles p on p.id = n.actor_user
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
    s.read as read
  from public.signals s
    left join public.profiles p on p.id = s.from_user
  where s.to_user = auth.uid()
    and s.type in ('kudos', 'motivation')   -- EXCLUDE 'text' DMs (Chats only)

  order by created_at desc
  limit 40;
$$;
revoke all on function public.get_notifications() from public, anon;
grant execute on function public.get_notifications() to authenticated;

-- Mark specific notification rows read (own rows only — the auth.uid() guard holds even
-- though the function is DEFINER). Cheer/kudos signals keep their own read flag and are
-- marked via the existing signals mark-read path.
create or replace function public.mark_notifications_read(ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
    set read_at = now()
    where id = any(ids) and recipient_user = auth.uid() and read_at is null;
end; $$;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Backfill — surface pre-existing activity in the bell immediately after this file
--    runs (the triggers only fire on NEW events). Idempotent via NOT EXISTS guards, so
--    re-running never duplicates. Covers pending friend requests + likes/comments on
--    posts you authored. (friend_accept is transient and not backfilled.)
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.notifications (recipient_user, type, actor_user)
select fr.addressee_user, 'friend_request', fr.requester_user
from public.friend_requests fr
where fr.status = 'pending'
  and not exists (
    select 1 from public.notifications n
    where n.type = 'friend_request' and n.actor_user = fr.requester_user
      and n.recipient_user = fr.addressee_user and n.entry_id is null
  );

insert into public.notifications (recipient_user, type, actor_user, entry_id, created_at)
select e.user_id, 'like', l.user_id, l.entry_id, l.created_at
from public.entry_likes l
  join public.community_entries e on e.id = l.entry_id
where e.user_id <> l.user_id
  and not exists (
    select 1 from public.notifications n
    where n.type = 'like' and n.actor_user = l.user_id
      and n.recipient_user = e.user_id and n.entry_id is not distinct from l.entry_id
  );

insert into public.notifications (recipient_user, type, actor_user, entry_id, created_at)
select distinct on (e.user_id, c.user_id, c.entry_id)
  e.user_id, 'comment', c.user_id, c.entry_id, c.created_at
from public.entry_comments c
  join public.community_entries e on e.id = c.entry_id
where e.user_id <> c.user_id
  and not exists (
    select 1 from public.notifications n
    where n.type = 'comment' and n.actor_user = c.user_id
      and n.recipient_user = e.user_id and n.entry_id is not distinct from c.entry_id
  )
order by e.user_id, c.user_id, c.entry_id, c.created_at;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Realtime — publish notifications so the bell updates live; replica identity full
--    so mark-read UPDATEs carry recipient_user for per-subscriber filtering (RLS still
--    limits each subscriber to their own rows).
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
alter table public.notifications replica identity full;
