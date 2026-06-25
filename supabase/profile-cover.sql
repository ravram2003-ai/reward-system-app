-- Pointwell — Profile cover banners.
-- Adds an optional uploaded cover/banner image at the top of a profile (like a world's
-- cover strip). Falls back to a default gradient when unset.
--
-- Safe to re-run (idempotent): the column ALTER is "if not exists"; no functions, no
-- bucket, no policy changes.
--
-- WHAT YOU MUST DO: run this whole file in the Supabase SQL editor (or via the CLI).
--
-- STORAGE: the cover image REUSES the existing PUBLIC "avatars" bucket and its policies
-- (created by profile-pictures.sql). Those policies are PATH-based — a signed-in user may
-- only write/replace/delete objects under their own "<uid>/..." folder, and anyone may
-- read (public images). The client uploads the banner via the SAME uploadAvatar() path
-- (avatars bucket, "<uid>/<timestamp>-<rand>.<ext>"), so no new bucket and NO policy
-- change is needed — and none is made here. Security stays in the DB (owner-only write).
--
-- VISIBILITY: cover_url is an OWN-profile field. Like every other profiles column, it is
-- governed by the existing self-only "profiles" RLS (a user reads/writes only their own
-- row). It is intentionally NOT added to the get_profile_overview() SECURITY DEFINER read,
-- so other viewers see the default gradient (no extra exposure surface). If covers should
-- later show on others' profiles, expose cover_url through that gated definer in a new file.

-- ───────────────────────────────────────────────────────────────────────────
-- The column. Nullable, no default → existing rows + the sign-up trigger are
-- untouched (cover_url stays NULL → default gradient). The existing "profiles self
-- update" RLS policy already lets a user write their own row (updateProfile path).
-- ───────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists cover_url text;

-- VERIFY (run after applying):
--   -- column exists, text, nullable:
--   select column_name, data_type, is_nullable from information_schema.columns
--     where table_schema = 'public' and table_name = 'profiles' and column_name = 'cover_url';
--   -- banner reuses the public avatars bucket with owner-only write (path-based):
--   select id, public from storage.buckets where id = 'avatars';
--   select policyname, cmd from pg_policies
--     where schemaname = 'storage' and tablename = 'objects' and policyname like 'avatars%';
