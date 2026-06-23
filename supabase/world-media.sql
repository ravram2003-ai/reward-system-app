-- Pointwell — World media (cover photo + app icon for a "world").
-- A "world" is either a COMMUNITY (public.communities) or a PERSONAL reward system
-- (local-first; its shared/published form is a row in public.public_systems). This migration
-- lets the OWNER attach a cover photo + an app icon to a world, stored in a private
-- "world-media" Storage bucket, with read access following the world's existing visibility.
--
-- SECURITY (all enforced in the DB, never the client):
--   • Only the OWNER can write a world's media. Storage writes are scoped to the uploader's
--     own "<uid>/…" folder (the proven avatars/entry-photos convention → the anon key, having
--     no auth.uid(), can never write); and binding a media path to a SHARED community/
--     public_systems row requires owning that row (those tables' existing owner-only
--     UPDATE/ALL policies). Defense in depth: a non-owner can neither create objects outside
--     their own namespace nor attach a path to a world they don't own.
--   • READ follows the world's visibility, enforced by a SECURITY DEFINER predicate the SELECT
--     policy calls: a PUBLIC (or request-to-join, i.e. discoverable) community / a public
--     profile's published system is readable by anyone (even signed-out, for discovery cards);
--     a PRIVATE community only by its members/owner; and the owner can always read their own
--     folder (covers local-only personal systems that have no shared row yet).
--   • The bucket is PRIVATE (public=false) so reads go through signed URLs gated by that
--     policy — a leaked URL alone can't bypass the visibility check (unlike a public bucket).
--
-- Idempotent / safe to re-run. Does NOT modify any existing .sql.
-- Depends on: communities.sql (communities, community_members, is_community_member),
-- community-discovery.sql (the 'request_to_join' visibility), public-systems.sql
-- (public_systems), friends.sql (profile_is_public).
--
-- AFTER RUNNING THIS FILE you must also confirm the "world-media" bucket exists (this file
-- creates it via storage.buckets, but verify it in Storage). The columns hold the storage
-- OBJECT PATH ("<uid>/<world_id>/<file>"), resolved to a short-lived signed URL on read.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Columns. Nullable, no default → existing rows + sync untouched (NULL → the app's
--    default gradient). The owner-only write of these columns is already enforced by each
--    table's existing policy: communities "update own" and public_systems "write own".
-- ───────────────────────────────────────────────────────────────────────────
alter table public.communities
  add column if not exists cover_url text,
  add column if not exists icon_url  text;

alter table public.public_systems
  add column if not exists cover_url text,
  add column if not exists icon_url  text;

-- Bound the stored path length so a row can't be bloated (idempotent — only added once).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'communities_media_len') then
    alter table public.communities add constraint communities_media_len check (
      length(coalesce(cover_url, '')) <= 400 and length(coalesce(icon_url, '')) <= 400
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'public_systems_media_len') then
    alter table public.public_systems add constraint public_systems_media_len check (
      length(coalesce(cover_url, '')) <= 400 and length(coalesce(icon_url, '')) <= 400
    );
  end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. PRIVATE "world-media" Storage bucket (5MB image cap). Private so the SELECT policy
--    below — not the URL — decides who can read each object.
-- ───────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('world-media', 'world-media', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Read predicate (SECURITY DEFINER so it can evaluate visibility across the
--    membership/profile gates the calling role can't read directly). Path layout is
--    "<owner_uid>/<world_id>/<file>": foldername()[1] = uid, [2] = world id (a community
--    uuid, or a personal system's local client id). Granted to anon too, so signed-out
--    users can read PUBLIC worlds' media (discovery).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.can_read_world_media(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- The owner can always read their own "<uid>/…" folder (incl. local-only personal worlds).
    (auth.uid() is not null and (storage.foldername(object_name))[1] = auth.uid()::text)
    -- Community world: discoverable (public / request_to_join) → anyone; private → members/owner.
    or exists (
      select 1 from public.communities c
      where c.id::text = (storage.foldername(object_name))[2]
        and (
          coalesce(c.visibility, 'private') in ('public', 'request_to_join')
          or (auth.uid() is not null and (
            c.owner_user = auth.uid()
            or exists (
              select 1 from public.community_members m
              where m.community_id = c.id and m.user_id = auth.uid()
            )
          ))
        )
    )
    -- Personal world published as a public system: readable while the owner's profile is public.
    or exists (
      select 1 from public.public_systems s
      where s.client_system_id = (storage.foldername(object_name))[2]
        and s.owner_user::text = (storage.foldername(object_name))[1]
        and (public.profile_is_public(s.owner_user) or s.owner_user = auth.uid())
    );
$$;
revoke all on function public.can_read_world_media(text) from public;
grant execute on function public.can_read_world_media(text) to anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Storage policies on the world-media bucket.
--    READ: any role, gated by the predicate above.
--    WRITE/REPLACE/DELETE: an authenticated user, ONLY inside their own "<uid>/…" folder
--    (the anon role has no auth.uid() → no write).
-- ───────────────────────────────────────────────────────────────────────────
drop policy if exists "world-media visible read" on storage.objects;
create policy "world-media visible read" on storage.objects
  for select
  using (bucket_id = 'world-media' and public.can_read_world_media(name));

drop policy if exists "world-media owner insert" on storage.objects;
create policy "world-media owner insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'world-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "world-media owner update" on storage.objects;
create policy "world-media owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'world-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'world-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "world-media owner delete" on storage.objects;
create policy "world-media owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'world-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ───────────────────────────────────────────────────────────────────────────
-- VERIFY (optional — accounts A=owner of a PRIVATE community + a public system, B=non-member
-- with a public profile, anon=signed-out):
--   -- A uploads to "<A_uid>/<community_id>/cover.jpg" → allowed; sets communities.cover_url.
--   -- B / anon reading that PRIVATE community's object → can_read_world_media = false (denied).
--   -- A flips the community to 'public' → B / anon can now read it.
--   -- anon attempting any insert into world-media → blocked (policy is TO authenticated).
--   -- B attempting to write "<A_uid>/…" → blocked (foldername[1] <> B's uid).
--   -- B attempting to write "<B_uid>/<A's community_id>/x.jpg" → allowed into B's OWN folder,
--   --   but useless: B cannot set that community's cover_url (communities "update own" RLS).
