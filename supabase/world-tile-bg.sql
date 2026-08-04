-- world-tile-bg.sql — per-world tile background (feat/world-backgrounds)
--
-- Adds ONE nullable jsonb column to `communities` holding how that world's tile paints its
-- background on the Worlds page:
--
--   { "kind": "photo" | "preset", "preset": "<preset id>", "opacity": 0.0..1.0 }
--
-- The PHOTO itself is NOT stored here. A photo background reuses the world's existing
-- `cover_url` (a path in the private `world-media` bucket, see world-media.sql) — so picking a
-- background is the same upload + signed-URL read the cover already uses, and a world that
-- already has a cover gets a background for free. This column only records which of the two
-- sources to paint and how strongly.
--
-- Additive + idempotent: safe to re-run, changes no existing object, and every row keeps
-- working with the column NULL (the client falls back to "cover photo at the default strength",
-- i.e. exactly today's look).
--
-- SECURITY — no new policy is needed, and none is added.
--   `communities` already has RLS enabled with "communities update by owner":
--       USING (owner_user = auth.uid()) WITH CHECK (owner_user = auth.uid())
--   so only the owner can write ANY column on the row, including this one. A member — or the
--   anon key — updating someone else's world matches no row and changes nothing. Reads are
--   governed by the existing "communities read for members" policy, so the background is
--   visible to exactly the people who can already see the world.
--   (Personal systems are local to their owner's own device state and never touch this table.)
--
-- Run this in the Supabase SQL editor.

alter table public.communities
  add column if not exists tile_bg jsonb;

comment on column public.communities.tile_bg is
  'Worlds-page tile background: {kind:"photo"|"preset", preset:text, opacity:numeric 0-1}. '
  'Photo source is cover_url (world-media bucket). NULL = default (cover photo if present, else plain).';
