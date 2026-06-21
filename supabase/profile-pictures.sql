-- Pointwell — Profile pictures.
-- Adds an optional uploaded avatar that replaces the initials circle EVERYWHERE an
-- avatar shows, with the initials as the fallback when none is set.
--
-- Safe to re-run (idempotent): the column ALTER is "if not exists"; every function
-- is drop+recreate (a changed RETURNS TABLE signature can't be CREATE OR REPLACE'd);
-- the bucket insert upserts; policies are drop-if-exists then create.
--
-- WHAT YOU MUST DO: run this whole file in the Supabase SQL editor (or via the CLI).
-- It (1) adds profiles.avatar_url, (2) creates a PUBLIC "avatars" Storage bucket +
-- policies, and (3) teaches the existing "definer" functions to also return each
-- person's avatar_url so other users' photos can render (profiles RLS is self-only,
-- so these SECURITY DEFINER functions are the only way another user's profile
-- fields are exposed — each keeps its existing membership/friendship/public gate).

-- ───────────────────────────────────────────────────────────────────────────
-- 1. The column. Nullable, no default → existing rows + the sign-up trigger are
--    untouched (avatar_url stays NULL → initials fallback). The existing
--    "profiles self update" RLS policy already lets a user write their own row.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists avatar_url text;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. PUBLIC "avatars" Storage bucket. Unlike the private "entry-photos" bucket
--    (which uses short-lived signed URLs + self-only reads), avatars must be
--    readable by ANYONE who can see the profile, so the bucket is public-read and
--    we store the stable public URL. Writes are restricted to the owner's own
--    "<uid>/..." folder (same user-id-prefix convention as entry-photos).
-- ───────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- Anyone (even signed-out) may READ avatar objects (they're public images).
drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects
  for select using (bucket_id = 'avatars');

-- A signed-in user may write/replace/delete ONLY files under their own <uid>/ folder.
drop policy if exists "avatars owner insert" on storage.objects;
create policy "avatars owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars owner update" on storage.objects;
create policy "avatars owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars owner delete" on storage.objects;
create policy "avatars owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Teach the existing definer functions to ALSO return avatar_url. Each one is
--    unchanged except for the added column in the RETURNS TABLE + SELECT; every
--    authorization gate (membership / friendship-or-public / addressee / owner)
--    is preserved, so avatar_url is exposed only to callers already allowed to see
--    that person's name.
-- ───────────────────────────────────────────────────────────────────────────

-- 3a. Community members → standings, leaderboards, member activity, clusters, detail.
drop function if exists public.get_community_members(uuid);
create function public.get_community_members(cid uuid)
returns table (user_id uuid, display_name text, handle text, avatar_url text, role text, joined_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select m.user_id, p.display_name, p.handle, p.avatar_url, m.role, m.joined_at
  from public.community_members m
  join public.profiles p on p.id = m.user_id
  where m.community_id = cid
    and public.is_community_member(cid, auth.uid())
  order by m.joined_at;
$$;
revoke all on function public.get_community_members(uuid) from public, anon;
grant execute on function public.get_community_members(uuid) to authenticated;

-- 3b. Friend list → Friends view + "active today" rows.
drop function if exists public.get_friends();
create function public.get_friends()
returns table (user_id uuid, display_name text, handle text, avatar_url text, since timestamptz)
language sql stable security definer set search_path = public
as $$
  select (case when fr.requester_user = auth.uid() then fr.addressee_user else fr.requester_user end) as user_id,
         p.display_name, p.handle, p.avatar_url, fr.responded_at as since
  from public.friend_requests fr
  join public.profiles p
    on p.id = (case when fr.requester_user = auth.uid() then fr.addressee_user else fr.requester_user end)
  where fr.status = 'accepted' and (fr.requester_user = auth.uid() or fr.addressee_user = auth.uid());
$$;
revoke all on function public.get_friends() from public, anon;
grant execute on function public.get_friends() to authenticated;

-- 3c. "New message" people picker (messageable: public OR friends, not blocked).
drop function if exists public.search_messageable_profiles(text);
create function public.search_messageable_profiles(q text)
returns table (id uuid, display_name text, handle text, avatar_url text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.display_name, p.handle, p.avatar_url
  from public.profiles p
  where p.id <> auth.uid()
    and length(btrim(coalesce(q, ''))) >= 2
    and (p.display_name ilike '%' || q || '%' or p.handle ilike '%' || q || '%')
    and (public.profile_is_public(p.id) or public.are_friends(auth.uid(), p.id))
    and not public.is_blocked_between(auth.uid(), p.id)
  order by p.display_name
  limit 20;
$$;
revoke all on function public.search_messageable_profiles(text) from public, anon;
grant execute on function public.search_messageable_profiles(text) to authenticated;

-- 3d. People search (Add friend / Build → Search "People") + person detail.
drop function if exists public.search_profiles(text);
create function public.search_profiles(q text)
returns table (id uuid, display_name text, handle text, avatar_url text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.display_name, p.handle, p.avatar_url
  from public.profiles p
  where p.id <> auth.uid()
    and length(btrim(coalesce(q, ''))) >= 2
    and (p.display_name ilike '%' || q || '%' or p.handle ilike '%' || q || '%')
    and (
      coalesce(p.visibility, 'public') = 'public'
      or exists (
        select 1 from public.signals s
        where (s.from_user = auth.uid() and s.to_user = p.id)
           or (s.from_user = p.id and s.to_user = auth.uid())
      )
    )
  order by p.display_name
  limit 20;
$$;
revoke all on function public.search_profiles(text) from public, anon;
grant execute on function public.search_profiles(text) to authenticated;

-- 3e. Incoming friend requests inbox (requester identity).
drop function if exists public.get_incoming_friend_requests();
create function public.get_incoming_friend_requests()
returns table (request_id uuid, requester_user uuid, requester_name text, requester_handle text, requester_avatar_url text, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select fr.id, fr.requester_user, p.display_name, p.handle, p.avatar_url, fr.created_at
  from public.friend_requests fr
  join public.profiles p on p.id = fr.requester_user
  where fr.addressee_user = auth.uid() and fr.status = 'pending'
  order by fr.created_at;
$$;
revoke all on function public.get_incoming_friend_requests() from public, anon;
grant execute on function public.get_incoming_friend_requests() to authenticated;

-- 3f. Owner's pending join-requests inbox (requester identity).
drop function if exists public.get_owner_join_requests();
create function public.get_owner_join_requests()
returns table (
  request_id uuid, community_id uuid, community_name text,
  requester_user uuid, requester_name text, requester_handle text,
  requester_avatar_url text, created_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select jr.id, jr.community_id, c.name, jr.requester_user, p.display_name, p.handle, p.avatar_url, jr.created_at
  from public.join_requests jr
  join public.communities c on c.id = jr.community_id
  join public.profiles p on p.id = jr.requester_user
  where c.owner_user = auth.uid() and jr.status = 'pending'
  order by jr.created_at;
$$;
revoke all on function public.get_owner_join_requests() from public, anon;
grant execute on function public.get_owner_join_requests() to authenticated;

-- 3g. NEW: resolve display cards (name, handle, avatar) for a set of user ids the
--     caller is ALREADY allowed to see — public profiles, accepted friends, or
--     anyone the caller already has a message/signal thread with. The Chats list is
--     built straight from the signals table (no definer to extend), so this lets the
--     chat rows + open-thread header show the peer's avatar. Same self-only-RLS
--     bypass discipline as the others: gated, definer, safe columns only.
drop function if exists public.get_profile_cards(uuid[]);
create function public.get_profile_cards(uids uuid[])
returns table (id uuid, display_name text, handle text, avatar_url text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.display_name, p.handle, p.avatar_url
  from public.profiles p
  where p.id = any(uids)
    and p.id <> auth.uid()
    and (
      coalesce(p.visibility, 'public') = 'public'
      or public.are_friends(auth.uid(), p.id)
      or exists (
        select 1 from public.signals s
        where (s.from_user = auth.uid() and s.to_user = p.id)
           or (s.from_user = p.id and s.to_user = auth.uid())
      )
    );
$$;
revoke all on function public.get_profile_cards(uuid[]) from public, anon;
grant execute on function public.get_profile_cards(uuid[]) to authenticated;
