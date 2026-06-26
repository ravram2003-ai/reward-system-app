-- Pointwell — author-only DELETE on community_entries (post ⋯ menu → "Delete post").
--
-- community_entries already has read / insert / update policies (communities.sql) but NO delete
-- policy, so with RLS on, NOBODY can delete a row. This adds the missing one: a member may delete
-- ONLY their own entry/post. anon + non-authors are blocked because auth.uid() never equals their
-- user_id. Mirrors the existing "members leave self" delete policy.
--
-- Additive + idempotent (drop-if-exists then create); no schema change.
--
-- WHAT YOU MUST DO: run this whole file in the Supabase SQL editor.

alter table public.community_entries enable row level security;  -- already on; harmless to re-assert

-- community_entries: you can DELETE only YOUR OWN entries (author-only post delete).
drop policy if exists "entries delete own" on public.community_entries;
create policy "entries delete own" on public.community_entries
  for delete using (user_id = auth.uid());

-- VERIFY (run after applying):
--   select policyname, cmd, qual from pg_policies
--    where schemaname = 'public' and tablename = 'community_entries' and cmd = 'DELETE';
--   -- expect one row: "entries delete own" | DELETE | (user_id = auth.uid())
